# Hotfix 2 — Database, Storage, RPC & Edge Function Lockdown (`HOTFIX2_DEPLOY.md`)

> [!WARNING]
> **Verification Status: `UNVERIFIED AGAINST SUPABASE`**  
> Both [`supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql) and [`supabase/migrations/20261028010000_purge_plaintext_credentials.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20261028010000_purge_plaintext_credentials.sql) remain marked **`UNVERIFIED`** until all 4 local Docker/Supabase verification steps (migration replay, anon denial + user login/upload verification, `COMPROMISE_CHECKS.md`/`PROD_CHECKS.md` execution, and `pg_dump`/`pg_restore` round-trip) pass.

> [!IMPORTANT]
> **Explicit Prerequisite Dependencies (`MERGE_PLAN.md`)**:
> 1. **Deploy `#80a` (`deploy/80a-hardening-no-new-envs`)** — `proxy-addr` upgrade, `trust proxy = 1`, and Cloudflare CIDR IP rate-limiting — MUST be merged and live first.
> 2. **Deploy `#80b` (`deploy/80b-auth-failclosed-encryption`)** — hardened `POST /api/auth/login` (`5 req / 5 min` per IP, `Sb-Forwarded-For`, constant-path GoTrue timing), `/api/vault/cloud/connections`, and `CredentialResetNotice` — MUST be live on Render, and **Supabase Dashboard → Authentication → Rate Limits → Rate limit for sign-ups and sign-ins** raised from `30` to `300` per `5 minutes` on Pro, **before** running the SQL migrations below.

**Scope**:
- **`F-02`**: Enables Row Level Security (`ENABLE ROW LEVEL SECURITY`) and revokes `PUBLIC, anon, authenticated` privileges on `public.project_research_gaps`, `public.project_titles`, and `public.project_journal_candidates`.
- **`F-03`**: Sets `public = false` on both repo storage buckets (`project-files` and `id-documents`), drops the open `project_files_*` policies on `storage.objects`, **retains** the user-folder-scoped `id_documents_*_own` policies (`(storage.foldername(name))[1] = auth.uid()::text`) on `id-documents`, and serves `project-files` downloads via short-lived signed URLs from `GET /api/projects/:id/files/:fileId/signed-url` after verifying `ownerId === req.user.id`.
- **`F-04` (`TICKET-SEC-01` Known Breakage)**: Disables the unauthenticated `request-profile-update` Edge Function so it never generates or returns `verificationKey` and immediately returns `HTTP 410 Gone` (`code: "PROFILE_UPDATE_DISABLED"`), paired with an in-app notice in [`AccountSettingsScreen.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/desk/account/AccountSettingsScreen.tsx#L351-L356) explaining that admin-verified email/username change requests are paused during a security upgrade while Full Name, Phone, Institution, and Academic Profile remain directly editable.
- **`F-14`**: Revokes `PUBLIC, anon, authenticated` `EXECUTE` privileges (using **only `REVOKE`/`GRANT`**, zero `CREATE OR REPLACE FUNCTION`) on `email_for_username(text)`, `email_for_phone_e164(text)`, `email_for_identifier(text)`, `check_username_available(text)`, `check_email_available(text)`, `check_phone_available(text)`, and `submit_id_document(text)`. Moves login resolution and availability checks to `POST /api/auth/login` and `POST /api/auth/check-availability` with identical HTTP `401` messages and constant-path GoTrue round-trip timing.
  - **`submit_id_document(text)` Call-Site Audit**: Grepping `src/`, `server/`, and `supabase/functions/` confirms **0 callers** anywhere in the application (`submit_id_document` was defined in `supabase/migrations/20260813000000_unified_account_profile.sql:155` and superseded by `20260814000000_account_system_repair.sql`). Revoking `anon, authenticated` `EXECUTE` on it breaks nothing.

---

## 1. Mandatory Deploy Order (`App → Migration → Edge Function`)

To guarantee **zero login or signup downtime**, execute the deployment in this exact order:

1. **Step 1 — Deploy the Express + Frontend App (`Render`) FIRST**:
   - The updated frontend ([`src/services/supabaseAuthService.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/supabaseAuthService.ts)) switches `signIn()` to `POST /api/auth/login` and availability checks to `POST /api/auth/check-availability`, which execute the RPCs server-side using `SUPABASE_SERVICE_ROLE_KEY`.
   - Until Step 2 runs, both the old and new paths work; once Step 1 is live on `https://scholar.gkshah.com.np`, no legitimate client calls the RPCs with the `anon` key anymore.
2. **Step 2 — Take a Verified, Encrypted Database Backup (`pg_dump`) & Apply the SQL Migration (`Supabase SQL Editor`)**:
   - Enables RLS on the 3 unprotected tables, makes all storage buckets private (`public = false`), drops open `project_files_*` policies, and revokes `PUBLIC, anon, authenticated` `EXECUTE` on the 6 RPCs + `submit_id_document` (`service_role` retains `EXECUTE`, so Step 1's `/api/auth/login` continues working uninterrupted).
3. **Step 3 — Deploy the Updated `request-profile-update` Edge Function**:
   - Redeploys `supabase/functions/request-profile-update/index.ts` so it returns HTTP `410 Gone` (`PROFILE_UPDATE_DISABLED`) and never generates or returns `verificationKey`.

---

## 2. Pre-Migration Backup (`pg_dump`), Encryption & Restore Verification

### 2.1 `pg_dump` Version Requirement
Supabase Postgres runs **PostgreSQL 15.x / 17.x**. macOS ships without `pg_dump` or with an older libpq. Ensure your client `pg_dump` major version is `>=` the Supabase Postgres server version before dumping:
```bash
# Install latest libpq via Homebrew if needed:
brew install libpq
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
pg_dump --version
```

### 2.2 Dump & Encrypt at Rest
Never store an unencrypted production dump containing `auth.users` password hashes and user PII in a world-readable folder, cloud sync directory (iCloud/Dropbox/OneDrive), or git repository:

```bash
umask 077
mkdir -p "$HOME/.scholar-backups"
chmod 700 "$HOME/.scholar-backups"

export DUMP_TS="$(date -u +%Y%m%dT%H%M%SZ)"
export RAW_DUMP="$HOME/.scholar-backups/scholar-prod-pre-hotfix2-${DUMP_TS}.dump"

# Prompt interactively for DB password (avoids shell history exposure):
read -r -s -p "Supabase Postgres password: " PGPASSWORD
echo ""
export PGPASSWORD

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
  --file="${RAW_DUMP}"

unset PGPASSWORD
```

### 2.3 Verify Archive Integrity (`pg_restore --list`) & Encrypt with AES-256
Before running any migration, verify the custom dump archive table of contents is readable and non-empty, then encrypt it with GPG (`AES256`) and remove the plaintext `.dump`:
```bash
# 1. Verify archive header & object list (must list public.projects, public.profiles, auth.users, etc.):
pg_restore --list "${RAW_DUMP}" | head -n 40
pg_restore --list "${RAW_DUMP}" | grep -E "TABLE DATA public (projects|profiles|project_claims)"

# 2. Optional full restore test into a disposable local Postgres database:
# createdb scholar_restore_verify && pg_restore --no-owner --no-acl -d scholar_restore_verify "${RAW_DUMP}" && dropdb scholar_restore_verify

# 3. Encrypt the dump file with AES-256 and shred/remove the unencrypted file:
gpg --symmetric --cipher-algo AES256 --output "${RAW_DUMP}.gpg" "${RAW_DUMP}"
rm -P "${RAW_DUMP}" 2>/dev/null || rm -f "${RAW_DUMP}"
ls -lh "${RAW_DUMP}.gpg"
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

-- 2. Storage Lockdown: make all buckets private & drop open project-files policies (F-03)
--    Note: id_documents_*_own policies (scoped to (storage.foldername(name))[1] = auth.uid()::text)
--    are intentionally retained on the now-private id-documents bucket.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    UPDATE storage.buckets
    SET public = false
    WHERE public = true OR id IN ('project-files', 'id-documents', 'vault-files');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS "project_files_insert" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_select" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_update" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_delete" ON storage.objects;
  END IF;
END $$;

-- 3. Revoke PUBLIC, anon, and authenticated EXECUTE on account RPCs (F-14)
--    Only REVOKE / GRANT is performed; no function bodies are replaced.
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
-- 1. Confirm RLS is enabled on all 3 tables (expected: rls_enabled = true, anon_can_select = false, authenticated_can_select = false)
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

-- 3. Confirm project_files_* open policies are gone while id_documents_*_own policies remain intact
SELECT policyname, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;

-- 4. Confirm anon and authenticated cannot execute the 6 RPCs or submit_id_document, while service_role can
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

## 6. Known Intentional Breakage & Follow-Up Ticket (`TICKET-SEC-01`)

| Ticket ID | Feature Affected | Current Lockdown Behavior | Replacement Design Required to Re-Enable |
| :--- | :--- | :--- | :--- |
| **`TICKET-SEC-01`** | Admin-verified Email / Username update request (`request-profile-update` Edge Function) | Edge Function returns `HTTP 410 Gone` (`code: "PROFILE_UPDATE_DISABLED"`). [`AccountSettingsScreen.tsx`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/desk/account/AccountSettingsScreen.tsx#L351-L356) displays a clear notice explaining that email/username changes requiring administrator verification are paused during a security upgrade, while Full Name, Phone Number, Institution, User Type, and Education Level remain directly editable. | 1. Require a valid user Bearer JWT on `request-profile-update` (`supabase.auth.getUser(jwt)`), binding `username` to the authenticated caller's `profiles.id = user.id` rather than trusting `req.body.username`.<br>2. Store a cryptographic hash (`sha256(verificationKey)`) and expiry timestamp in a dedicated `public.profile_update_requests` table (`RLS` enabled, `service_role` only).<br>3. Never return `verificationKey` in the HTTP response; deliver it exclusively to `ADMIN_EMAIL` via Resend. |

---

## 7. Emergency Rollback SQL

> [!CAUTION]
> **WARNING — RUNNING THIS ROLLBACK RE-OPENS THE `F-14` PII ENUMERATION HOLE!**  
> Only run this if you must roll back the Express application on Render to a pre-Hotfix-2 commit where the browser still calls `email_for_*` and `check_*_available` directly with the `anon` key.

```sql
-- ============================================================================
-- EMERGENCY ROLLBACK ONLY — RE-OPENS ANONYMOUS RPC ENUMERATION (F-14)!
-- ============================================================================
BEGIN;

GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_phone_e164(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_identifier(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_phone_available(text) TO anon, authenticated;

-- NOTE: Even in an emergency rollback of login RPCs, DO NOT disable RLS on
-- project_research_gaps / project_titles / project_journal_candidates and
-- DO NOT re-enable anonymous policies on project-files.

COMMIT;
```
