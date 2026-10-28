# Hotfix 2 — Database, Storage, RPC & Edge Function Lockdown (`HOTFIX2_DEPLOY.md`)

**Scope**: Remediates `F-02` (missing RLS on 3 tables), `F-03` (`project-files` & `id-documents` bucket privacy and Express-mediated signed URLs), `F-04` (`request-profile-update` `verificationKey` leak & fail-closed email check), and `F-14` (`anon`/`authenticated` `EXECUTE` revocation on 6 `SECURITY DEFINER` account-enumeration RPCs + Turnstile/rate-limited Express login & availability endpoints).

---

## 1. Mandatory Deploy Order (`App → Migration → Edge Function`)

To guarantee **zero login or signup downtime**, execute the deployment in this exact order:

1. **Step 1 — Deploy the Express + Frontend App (`Render`) FIRST**:
   - The updated frontend (`src/services/supabaseAuthService.ts`) switches `signIn()` to `POST /api/auth/login` and availability checks to `POST /api/auth/check-availability`, which execute the RPCs server-side using `SUPABASE_SERVICE_ROLE_KEY`.
   - Until Step 2 runs, both the old and new paths work; once Step 1 is live on `https://scholar.gkshah.com.np`, no legitimate client calls the RPCs with the `anon` key anymore.
2. **Step 2 — Take a Manual Database Backup (`pg_dump`) & Apply the SQL Migration (`Supabase SQL Editor`)**:
   - Enables RLS on the 3 unprotected tables, makes all storage buckets private (`public = false`) and removes direct client policies, and revokes `PUBLIC, anon, authenticated` `EXECUTE` on the 6 RPCs (`service_role` retains `EXECUTE`, so Step 1's `/api/auth/login` continues working uninterrupted).
3. **Step 3 — Deploy the Updated `request-profile-update` Edge Function**:
   - Redeploys `supabase/functions/request-profile-update/index.ts` so `verificationKey` is never returned in HTTP responses and email failures return HTTP `503`.

---

## 2. Pre-Migration Backup Command (`pg_dump`)

Before running the migration in production, take a full logical dump (schema + data, including `auth`, `storage`, and `public`) from your operator machine using the direct/session pooler connection string (never commit the `.dump` file to git):

```bash
# Replace <DB_PASSWORD> in your shell environment (never inline in history)
export PGPASSWORD="<DB_PASSWORD>"

pg_dump \
  --host="aws-0-ap-south-1.pooler.supabase.com" \
  --port=5432 \
  --username="postgres.gfjhsijrwodjvkisouzw" \
  --dbname="postgres" \
  --format=custom \
  --no-owner \
  --no-acl \
  --schema=public \
  --schema=auth \
  --schema=storage \
  --file="$HOME/scholar-prod-pre-hotfix2-$(date -u +%Y%m%dT%H%M%SZ).dump"

unset PGPASSWORD
```

---

## 3. Single-Transaction Apply Script (Paste into Production Supabase SQL Editor)

File in repo: [`supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql)

```sql
BEGIN;

-- 1. Enable RLS on the 3 unprotected agentic pipeline tables (F-02)
ALTER TABLE IF EXISTS public.project_research_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_journal_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_research_gaps') THEN
    REVOKE ALL ON TABLE public.project_research_gaps FROM PUBLIC, anon, authenticated;
    GRANT ALL ON TABLE public.project_research_gaps TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_titles') THEN
    REVOKE ALL ON TABLE public.project_titles FROM PUBLIC, anon, authenticated;
    GRANT ALL ON TABLE public.project_titles TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_journal_candidates') THEN
    REVOKE ALL ON TABLE public.project_journal_candidates FROM PUBLIC, anon, authenticated;
    GRANT ALL ON TABLE public.project_journal_candidates TO service_role;
  END IF;
END $$;

-- 2. Storage Lockdown: make all buckets private & drop client policies (F-03)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    UPDATE storage.buckets
    SET public = false
    WHERE public = true OR id IN ('project-files', 'id-documents');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "project_files_insert" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_select" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_update" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_delete" ON storage.objects;

    DROP POLICY IF EXISTS "id_documents_insert_own" ON storage.objects;
    DROP POLICY IF EXISTS "id_documents_select_own" ON storage.objects;
    DROP POLICY IF EXISTS "id_documents_update_own" ON storage.objects;
    DROP POLICY IF EXISTS "id_documents_delete_own" ON storage.objects;
  END IF;
END $$;

-- 3. Ensure RPCs exist for service_role and revoke anon/authenticated (F-14)
CREATE OR REPLACE FUNCTION public.email_for_username(lookup_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT au.email
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.username = lookup_username
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.email_for_phone_e164(lookup_phone_e164 text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT au.email
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.phone_e164 = lookup_phone_e164
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.email_for_identifier(lookup_identifier text)
RETURNS TABLE(email text, found_by text)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  (SELECT au.email, 'username'::text AS found_by
   FROM public.profiles p
   JOIN auth.users au ON au.id = p.id
   WHERE p.username = lookup_identifier
   LIMIT 1)
  UNION ALL
  (SELECT au.email, 'email'::text AS found_by
   FROM auth.users au
   WHERE au.email = lookup_identifier
   LIMIT 1)
  UNION ALL
  (SELECT au.email, 'phone'::text AS found_by
   FROM public.profiles p
   JOIN auth.users au ON au.id = p.id
   WHERE p.phone_e164 = lookup_identifier
     AND lookup_identifier LIKE '+%'
   LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION public.check_username_available(lookup_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username = lookup_username
  );
$$;

CREATE OR REPLACE FUNCTION public.check_email_available(lookup_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE email = lookup_email
  );
$$;

CREATE OR REPLACE FUNCTION public.check_phone_available(lookup_phone_e164 text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE phone_e164 = lookup_phone_e164
      AND phone_e164 IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.email_for_username(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO service_role;

REVOKE ALL ON FUNCTION public.email_for_phone_e164(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_phone_e164(text) TO service_role;

REVOKE ALL ON FUNCTION public.email_for_identifier(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_identifier(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_email_available(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_available(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_phone_available(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_phone_available(text) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_id_document'
  ) THEN
    REVOKE ALL ON FUNCTION public.submit_id_document(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.submit_id_document(text) TO service_role;
  END IF;
END $$;

COMMIT;
```

---

## 4. Edge Function Deploy Command (Step 3)

```bash
npx supabase functions deploy request-profile-update --project-ref gfjhsijrwodjvkisouzw
```

---

## 5. Verification `SELECT`s (Run After Step 2)

```sql
-- 1. Confirm RLS is enabled on all 3 tables (expected: rls_enabled = true for all 3)
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_can_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_can_select,
  has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_can_select
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('project_research_gaps', 'project_titles', 'project_journal_candidates')
ORDER BY c.relname;

-- 2. Confirm all storage buckets are private (expected: public = false on every row)
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 3. Confirm no anonymous/client policies remain on project-files or id-documents (expected: 0 rows)
SELECT policyname, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects';

-- 4. Confirm anon and authenticated cannot execute the 6 RPCs, while service_role can
SELECT
  p.proname AS function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_exec
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'email_for_username',
    'email_for_phone_e164',
    'email_for_identifier',
    'check_username_available',
    'check_email_available',
    'check_phone_available',
    'submit_id_document'
  )
ORDER BY p.proname;
```

---

## 6. Emergency Rollback SQL

> [!CAUTION]
> **WARNING — RUNNING THIS ROLLBACK RE-OPENS THE `F-02`, `F-03`, AND `F-14` SECURITY HOLES!**  
> Only run this if you must roll back the Express application on Render to a pre-Hotfix-2 commit where the browser still calls `email_for_*` and `check_*_available` directly with the `anon` key.

```sql
-- ============================================================================
-- EMERGENCY ROLLBACK ONLY — RE-OPENS ANONYMOUS RLS, STORAGE, AND RPC HOLES!
-- ============================================================================
BEGIN;

-- Re-grant RPC execute to anon and authenticated (RE-OPENS F-14 PII ENUMERATION)
GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_phone_e164(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_identifier(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_phone_available(text) TO anon, authenticated;

-- Restore id-documents authenticated policies (if needed)
CREATE POLICY "id_documents_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'id-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "id_documents_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'id-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "id_documents_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'id-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'id-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "id_documents_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'id-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- NOTE: Even in an emergency rollback of login RPCs, DO NOT disable RLS on
-- project_research_gaps / project_titles / project_journal_candidates and
-- DO NOT re-enable anonymous policies on project-files unless strictly required:
-- ALTER TABLE IF EXISTS public.project_research_gaps DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.project_titles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.project_journal_candidates DISABLE ROW LEVEL SECURITY;

COMMIT;
```
