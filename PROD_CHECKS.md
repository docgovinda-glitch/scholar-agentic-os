# Read-Only Production Verification Runbook (`PROD_CHECKS.md`)

**Target Production Project**: `gfjhsijrwodjvkisouzw` (Supabase) & `srv-d9lgbn710e5c73dl8sk0` (Render)  
**Safety Guarantee**: Every SQL query in this document is strictly **`SELECT`-only** against `pg_catalog` / `information_schema` / `supabase_migrations` / `storage`, and every CLI command is **read-only**. All SQL queries have been verified locally against `@electric-sql/pglite`. Do **not** run any `ALTER`, `DROP`, `INSERT`, `UPDATE`, or `DELETE` until the results below are reviewed.

---

## 1. Schema, RLS, and Migration Drift Checks (Run in Supabase SQL Editor)

Copy and run each block in the Supabase Dashboard → **SQL Editor** for project `gfjhsijrwodjvkisouzw` and paste the JSON/table output back.

### Check 1.1 — Applied Migrations Tracking Table
Verifies whether Supabase CLI migration tracking (`supabase_migrations.schema_migrations`) exists and which of the repo migrations were recorded vs. applied manually.
```sql
SELECT
  version,
  name,
  statements
FROM supabase_migrations.schema_migrations
ORDER BY version ASC;
```
*(If this errors with `relation "supabase_migrations.schema_migrations" does not exist`, migrations were applied manually via the SQL Editor.)*

### Check 1.2 — Tables With Row-Level Security (RLS) Disabled (`F-02` Verification)
Identifies every table in `public` where RLS is currently `false` (expected to flag `project_research_gaps`, `project_titles`, `project_journal_candidates`, and checks whether `projects` has RLS enabled in production).
```sql
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  c.reltuples::bigint AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname ASC;
```

### Check 1.3 — Complete Active RLS Policy Inventory (`F-03` & `F-15` Verification)
Lists every active RLS policy across `public` and `storage` schemas, specifically checking:
- Whether `storage.objects` has the unrestricted `project_files_*` policies (`USING (bucket_id = 'project-files')`).
- Whether any policy still hardcodes `'docgovinda@gmail.com'`.
- Which policy version is active on `premium_requests` (`20260812120000` vs `20260812180000`).
```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expr,
  with_check AS with_check_expr
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY schemaname, tablename, policyname;
```

### Check 1.4 — Column Type Conflict Check on `project_sources` and `project_evidence` (Section 2.1 Drift)
Determines which of the conflicting migrations (`20260817000000` `text` vs. `20260818162000` `uuid` vs. `20261009103516` `text`) won in production for `project_sources`, `project_evidence`, and `projects`.
```sql
SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('projects', 'project_sources', 'project_evidence', 'project_evidence_items', 'project_claims')
ORDER BY table_name, ordinal_position;
```

### Check 1.5 — `SECURITY DEFINER` Functions & Role Execute Grants (`F-14` Verification)
Lists all `SECURITY DEFINER` functions in `public` and whether `anon` or `authenticated` currently hold `EXECUTE` privileges on them.
```sql
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS is_security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.prosecdef DESC, p.proname ASC;
```

### Check 1.6 — Storage Bucket Visibility, Size & `id-documents` Inventory (`F-03` & `F-18` Verification)
Checks whether `project-files` and `id-documents` are marked `public = true`, how much of the storage limit is consumed, and whether any identity document objects (`id-documents`) remain stored in production (`20260814000000_account_system_repair.sql` stopped collecting ID documents, so `object_count` on `id-documents` determines whether `USER_NOTICE.md` needs to mention identity documents).
```sql
SELECT
  b.id AS bucket_id,
  b.name,
  b.public AS is_public,
  b.file_size_limit,
  b.allowed_mime_types,
  COUNT(o.id) AS object_count,
  pg_size_pretty(COALESCE(SUM((o.metadata->>'size')::bigint), 0)) AS total_bytes
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types
ORDER BY b.id;
```

---

## 2. Forensic Checks for Past Exploitation (Read-Only SQL)

### Check 2.1 — Pending or Suspicious Profile Email Updates (`F-04` `verificationKey` Leak)
Checks whether any account has a pending or recently completed profile update triggered via `request-profile-update` (uses `to_jsonb(p)` so the query succeeds whether or not `pending_profile_update` or `role` exist as columns on `public.profiles`).
```sql
SELECT
  p.id,
  p.account_status,
  p.user_type,
  to_jsonb(p)->>'role' AS legacy_role,
  (to_jsonb(p)->'pending_profile_update' IS NOT NULL AND to_jsonb(p)->>'pending_profile_update' <> 'null') AS has_pending_update,
  to_jsonb(p)->'pending_profile_update'->>'requested_at' AS requested_at,
  to_jsonb(p)->'pending_profile_update'->>'expires_at' AS expires_at,
  p.updated_at
FROM public.profiles p
WHERE (to_jsonb(p)->'pending_profile_update' IS NOT NULL AND to_jsonb(p)->>'pending_profile_update' <> 'null')
   OR p.updated_at > NOW() - INTERVAL '30 days'
ORDER BY p.updated_at DESC
LIMIT 50;
```

### Check 2.2 — Orphaned or Cross-User `project_files`, `project_evidence`, and `peer_review_critiques` (`F-06` IDOR Check)
Checks for any waived critiques or uploaded files/evidence targeting non-existent projects or anomalous activity in the last 30 days (verified against `20260728000000_relational_project_store.sql`: columns `id, project_id, filename, storage_path, size_bytes, mime_type, uploaded_at`).
```sql
SELECT
  pf.id,
  pf.project_id,
  pf.filename,
  pf.size_bytes,
  pf.mime_type,
  pf.uploaded_at,
  p.owner_id AS project_owner_id
FROM public.project_files pf
LEFT JOIN public.projects p ON p.project_id = pf.project_id
ORDER BY pf.uploaded_at DESC
LIMIT 50;
```

```sql
SELECT
  id,
  project_id,
  lens,
  severity,
  waived,
  created_at
FROM public.peer_review_critiques
WHERE waived = true
ORDER BY created_at DESC
LIMIT 50;
```

### Check 2.3 — Plaintext Credentials Stored in `api_credentials` and `user_cloud_integrations` (`F-07` / `F-08` Count Only — Never Select Secret Values)
Counts how many rows exist in `api_credentials` and `user_cloud_integrations` without printing any key or token material.
```sql
SELECT
  'api_credentials' AS table_name,
  COUNT(*) AS row_count,
  COUNT(DISTINCT user_id) AS distinct_users,
  COALESCE(BOOL_OR(encrypted_api_key NOT LIKE 'enc:v1:%' AND encrypted_api_key NOT LIKE '{"ciphertext"%'), false) AS has_unencrypted_plaintext_rows
FROM public.api_credentials
UNION ALL
SELECT
  'user_cloud_integrations' AS table_name,
  COUNT(*) AS row_count,
  COUNT(DISTINCT user_id) AS distinct_users,
  COALESCE(BOOL_OR(access_token NOT LIKE 'enc:v1:%'), false) AS has_unencrypted_plaintext_rows
FROM public.user_cloud_integrations;
```

---

## 3. Read-Only CLI Checks (Edge Functions & Render Environment)

### Check 3.1 — List Deployed Supabase Edge Functions (Read-Only CLI)
Verifies which of the 5 Edge Functions in `supabase/functions/` (`arxiv-proxy`, `imf-proxy`, `request-profile-update`, `search-proxy`, `who-proxy`) are currently deployed in production, whether `--no-verify-jwt` is set, and whether any legacy/removed Edge Functions still referenced in code comments (`send-verification-email`, `approve-profile-update`, `request-password-reset`, `approve-password-reset`) remain deployed as orphaned functions in production:
```bash
npx supabase functions list --project-ref gfjhsijrwodjvkisouzw
```

### Check 3.2 — Verify Render Environment Variable Names Only (Never Print Values)
In the Render Dashboard for `scholar-agentic-os` (`srv-d9lgbn710e5c73dl8sk0`) → **Environment**, confirm which of the following keys are set (report **only** `SET` / `NOT SET` for each name):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `DATABASE_URL`
- `MAIN_ADMIN_EMAIL` (vs. `ADMIN_EMAIL`)
- `MASTER_KEY` (vs. `ENCRYPTION_KEY`)
- `LLM_CHALLENGE_SECRET`
- `CLOUDFLARE_TURNSTILE_SECRET_KEY`
- `RESEND_API_KEY`
- `TAVILY_API_KEY`
- `MAX_UPLOAD_MB`
