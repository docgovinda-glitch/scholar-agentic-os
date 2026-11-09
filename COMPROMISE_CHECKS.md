# Post-Exposure Compromise & Persistence Audit (`COMPROMISE_CHECKS.md`)

> **Dated record.** This document captures a point in time (an incident, audit, plan or status ledger) and is not kept in sync with the code. For current behaviour read [`docs/README.md`](docs/README.md). Details here, such as `render.yaml` settings, file names, line numbers and counts, may no longer match `main`.

**Purpose**: Read-only forensic checks to detect any unauthorized access, backdoor persistence, privilege escalation, or quota abuse since **2026-08-04** (when commits `01f851f` and `28cfaa5` committed live credentials to the repository).  
**Safety & Privacy Guarantee**:
- Every SQL query below is strictly `SELECT`-only. Column names have been checked statically against repo SQL migrations (`sqlRunbooksVerification.test.ts`); live Postgres execution status is tracked in `STATUS.md`.
- **Do NOT paste raw user lists (emails, phone numbers, or full names) into chat.** Paste back **only** row counts and any unrecognized/anomalous rows.

---

## 1. Database Persistence & Abuse Checks (Run in Production Supabase SQL Editor)

### Check 1.1 — Login Roles & Role Memberships
Detects any rogue PostgreSQL roles granted `CANLOGIN`, `SUPERUSER`, `BYPASSRLS`, or membership in `postgres` / `service_role` / `supabase_admin`.

```sql
SELECT
  r.rolname,
  r.rolsuper,
  r.rolinherit,
  r.rolcreaterole,
  r.rolcreatedb,
  r.rolcanlogin,
  r.rolreplication,
  r.rolbypassrls,
  r.rolvaliduntil,
  ARRAY(
    SELECT b.rolname
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles b ON (m.roleid = b.oid)
    WHERE m.member = r.oid
  ) AS member_of
FROM pg_catalog.pg_roles r
WHERE r.rolcanlogin = true
   OR r.rolsuper = true
   OR r.rolbypassrls = true
ORDER BY r.rolname;
```
- **What normal looks like**: Standard managed Supabase roles only (`cli_login_postgres` — created by `supabase` CLI logins, `supabase_etl_admin`, `postgres`, `authenticator`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `supabase_replication_admin`, `supabase_read_only_user`, `service_role`, `dashboard_user`, `pgbouncer`). Zero unfamiliar custom login roles.
- **What to paste back**: Role count and any unfamiliar role names.

---

### Check 1.2 — Outbound Network Extensions (`dblink`, `pg_net`, `http`, `plv8`) & `pg_cron` Jobs
Checks whether any extension capable of outbound data exfiltration (`dblink`, `pg_net`, `http`) or scheduled persistence (`pg_cron`) is installed, and lists any scheduled `cron.job` rows.

```sql
SELECT
  e.extname,
  e.extversion,
  n.nspname AS schema_name,
  (e.extname IN ('dblink', 'pg_net', 'http', 'pg_cron', 'plv8', 'plpython3u')) AS is_high_risk_extension
FROM pg_catalog.pg_extension e
JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
ORDER BY is_high_risk_extension DESC, e.extname;
```

*(If `pg_cron` appears in the output above, run this follow-up query; if `pg_cron` is not installed, skip it):*
```sql
SELECT jobid, schedule, command, nodename, nodeport, database, username, active
FROM cron.job
ORDER BY jobid;
```
- **What normal looks like**: Standard Supabase extensions (`plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `pgjwt`, `supabase_vault`, `pg_graphql`, `vector`). Neither `dblink` nor `http` should be installed. If `pg_cron` is enabled, there should be `0` jobs (the repo defines no `pg_cron` jobs).
- **What to paste back**: The extension list (and `cron.job` count/rows if `pg_cron` is installed).

---

### Check 1.3 — Event Triggers (`pg_event_trigger`)
Detects DDL-level event triggers that could re-inject backdoors on `ddl_command_end` or `sql_drop`.

```sql
SELECT
  evtname,
  evtevent,
  evtowner::regrole AS owner,
  evtfoid::regproc AS function_name,
  evtenabled,
  evttags
FROM pg_catalog.pg_event_trigger
ORDER BY evtname;
```
- **What normal looks like**: Either `0` rows or only built-in Supabase system triggers owned by `supabase_admin` (`issue_graphql_placeholder`, `issue_pg_cron_access`, `issue_pg_graphql_access`, `issue_pg_net_access`, `pgrst_ddl_watch`, `pgrst_drop_watch`), plus `ensure_rls` (owner `postgres`, calls `public.rls_auto_enable()`), which Supabase creates when the dashboard's automatic-RLS option is on.
- **What to paste back**: Count and any non-`supabase_admin` rows.

---

### Check 1.4 — Non-Repo Triggers & Functions (Concrete Exclusion List Generated from Repo SQL)
Scanning all base schemas (`supabase/*.sql`) and all migration files (`supabase/migrations/*.sql`) yields the exact exclusion list of legitimate repo-defined objects:
- **14 Repo-Defined SQL Functions**:
  1. `check_email_available` (`supabase/migrations/20260815120000_duplicate_identifier_detection.sql:52`)
  2. `check_phone_available` (`supabase/migrations/20260815120000_duplicate_identifier_detection.sql:76`)
  3. `check_username_available` (`supabase/migrations/20260815120000_duplicate_identifier_detection.sql:24`)
  4. `deduct_credits` (`supabase/schema_ai_engine.sql:494`, `supabase/schema_ai_engine.sql:636`)
  5. `email_for_identifier` (`supabase/migrations/20260815180000_unified_login_functions.sql:53`)
  6. `email_for_phone_e164` (`supabase/migrations/20260815180000_unified_login_functions.sql:27`)
  7. `email_for_username` (`supabase/schema.sql:143`)
  8. `enforce_account_status_admin_only` (`supabase/schema.sql:210`, `supabase/migrations/20260811000000_code_review_fixes.sql:97`, `supabase/migrations/20260814000000_account_system_repair.sql:157`)
  9. `grant_credits` (`supabase/schema_ai_engine.sql:566`)
  10. `handle_new_user` (`supabase/schema.sql:104`, `supabase/migrations/20260813000000_unified_account_profile.sql:106`, `supabase/migrations/20260814000000_account_system_repair.sql:123`)
  11. `handle_project_delete_cascade` (`supabase/migrations/20260924180000_project_cascade_delete.sql:127`)
  12. `match_project_evidence` (`supabase/migrations/20260819160000_vector_rag.sql:11`)
  13. `submit_id_document` (`supabase/migrations/20260813000000_unified_account_profile.sql:155`)
  14. `update_modified_column` (`supabase/migrations/20260818162000_agentic_schema.sql:57`)
  *(Note: `deduct_scholar_credits` is also referenced in `server/src/aiEngine/creditEngine.ts` and is included in the SQL exclusion list below in case it was created manually in production.)*
- **4 Repo-Defined SQL Triggers**:
  1. `on_auth_user_created` (`supabase/schema.sql:130`, `supabase/migrations/20260814000000_account_system_repair.sql:149` — on `auth.users` → `public.handle_new_user()`)
  2. `profiles_account_status_guard` (`supabase/schema.sql:226`, `supabase/migrations/20260811000000_code_review_fixes.sql:113`, `supabase/migrations/20260814000000_account_system_repair.sql:173` — on `public.profiles` → `public.enforce_account_status_admin_only()`)
  3. `tr_project_delete_cascade` (`supabase/migrations/20260924180000_project_cascade_delete.sql:177` — on `public.projects` → `public.handle_project_delete_cascade()`)
  4. `update_manuscript_sections_modtime` (`supabase/migrations/20260818162000_agentic_schema.sql:65` — on `public.manuscript_sections` → `update_modified_column()`)
- **Expected Supabase-Managed Storage Triggers** (built into Supabase Storage on `storage.objects` and `storage.prefixes`; normal if present):
  - `update_objects_updated_at`
  - `objects_insert_create_prefix`, `objects_update_create_prefix`, `objects_delete_delete_prefix`
  - `prefixes_create_hierarchy`, `prefixes_delete_hierarchy`

```sql
-- 1.4a: Triggers NOT in the repo SQL exclusion list or standard Supabase Storage managed triggers
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  p.proname AS function_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND n.nspname IN ('public', 'auth', 'storage')
  AND t.tgname NOT IN (
    -- 4 repo-defined triggers:
    'on_auth_user_created',
    'profiles_account_status_guard',
    'tr_project_delete_cascade',
    'update_manuscript_sections_modtime',
    -- Expected Supabase-managed storage triggers:
    'update_objects_updated_at',
    'objects_insert_create_prefix',
    'objects_update_create_prefix',
    'objects_delete_delete_prefix',
    'prefixes_create_hierarchy',
    'prefixes_delete_hierarchy',
    -- Supabase-managed storage.buckets / storage.objects guards (seen in production 2026-10-29):
    'enforce_bucket_name_length_trigger',
    'protect_bucket_control_insert',
    'protect_bucket_control_update',
    'protect_bucket_control_update_role',
    'protect_buckets_delete',
    'protect_objects_delete'
  )
ORDER BY n.nspname, c.relname, t.tgname;
```

```sql
-- 1.4b: Functions in public schema NOT in the 14 repo SQL functions (+ deduct_scholar_credits), plus all SECURITY DEFINER functions in public
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS is_security_definer,
  r.rolname AS owner,
  (p.proname NOT IN (
    'check_email_available',
    'check_phone_available',
    'check_username_available',
    'deduct_credits',
    'deduct_scholar_credits',
    'email_for_identifier',
    'email_for_phone_e164',
    'email_for_username',
    'enforce_account_status_admin_only',
    'grant_credits',
    'handle_new_user',
    'handle_project_delete_cascade',
    'match_project_evidence',
    'submit_id_document',
    'update_modified_column'
  )) AS is_unrecognized_function,
  md5(p.prosrc) AS source_md5,
  LEFT(p.prosrc, 500) AS source_preview
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
LEFT JOIN pg_catalog.pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
WHERE n.nspname = 'public'
  AND d.objid IS NULL
  AND (
    p.prosecdef = true
    OR p.proname NOT IN (
      'check_email_available',
      'check_phone_available',
      'check_username_available',
      'deduct_credits',
      'deduct_scholar_credits',
      'email_for_identifier',
      'email_for_phone_e164',
      'email_for_username',
      'enforce_account_status_admin_only',
      'grant_credits',
      'handle_new_user',
      'handle_project_delete_cascade',
      'match_project_evidence',
      'submit_id_document',
      'update_modified_column'
    )
  )
ORDER BY is_unrecognized_function DESC, p.proname;
```
- **What normal looks like**:
  - `1.4a`: `0` rows.
  - `1.4b`: two known non-repo rows are expected: `rls_auto_enable` (Supabase automatic-RLS helper) and the legacy `is_username_approved(text)` (EXECUTE revoked from `anon`/`authenticated` by `20261029020000_revoke_legacy_is_username_approved.sql`). Otherwise `is_unrecognized_function = false` for all rows, and `source_preview` of `handle_new_user`, `deduct_credits`, `grant_credits`, `submit_id_document`, `email_for_*`, `check_*_available` matches repo SQL with no outbound HTTP calls or backdoor grants.
- **What to paste back**: Row count of `1.4a`, and `function_name`, `is_unrecognized_function`, `source_md5` from `1.4b` (plus full `source_preview` of any row where `is_unrecognized_function = true`).

---

### Check 1.5 — Database Webhooks (`supabase_functions` / HTTP Triggers)
Checks whether any trigger invokes `supabase_functions.http_request` or `net.http_post` to exfiltrate table rows to an external URL.

```sql
SELECT
  n.nspname AS table_schema,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND (
    pg_get_triggerdef(t.oid) ILIKE '%http_request%'
    OR pg_get_triggerdef(t.oid) ILIKE '%http_post%'
    OR pg_get_triggerdef(t.oid) ILIKE '%supabase_functions%'
    OR pg_get_triggerdef(t.oid) ILIKE '%net.%'
  );
```
- **What normal looks like**: `0` rows (the repository defines zero database webhooks).
- **What to paste back**: Confirm `0` rows (or paste any anomalous row).

---

### Check 1.6 — `public.admin_users` Rows & `public.admin_audit_log`
Lists administrative privileges in `public.admin_users` (verified against `supabase/migrations/20260809120000_admin_users.sql`: columns `user_id, scopes, granted_by, granted_at, note`) and recent admin actions in `public.admin_audit_log` (verified against `20260804000000_ai_access_and_Billing.sql`: columns `id, admin_id, action, target_type, target_id, details, created_at`).

```sql
-- 1.6a: All rows in public.admin_users
SELECT
  au.user_id,
  au.scopes,
  au.granted_by,
  au.granted_at,
  au.note
FROM public.admin_users au
ORDER BY au.granted_at DESC;
```

```sql
-- 1.6b: Recent entries in public.admin_audit_log
SELECT
  id,
  admin_id,
  action,
  target_type,
  target_id,
  details,
  created_at
FROM public.admin_audit_log
ORDER BY created_at DESC
LIMIT 50;
```
- **What normal looks like**: Only admin accounts explicitly added by the project owner (or `0` rows if only `MAIN_ADMIN_EMAIL` is used), and only recognized admin actions in `admin_audit_log`.
- **What to paste back**: Total row counts and any unrecognized `user_id` or `action` (do not paste personal emails).

---

### Check 1.7 — `auth.users` Aggregate Counts & Privilege Anomalies Since `2026-08-04`
Checks for `is_super_admin = true` or abnormal `role` values in `auth.users` without dumping a list of user email addresses or phone numbers.

```sql
-- 1.7a: Counts only (safe to paste directly)
SELECT
  COUNT(*) AS total_users,
  COUNT(*) FILTER (WHERE created_at >= '2026-08-04T00:00:00Z') AS created_since_exposure,
  COUNT(*) FILTER (WHERE updated_at >= '2026-08-04T00:00:00Z') AS updated_since_exposure,
  COUNT(*) FILTER (WHERE is_super_admin = true) AS super_admin_count,
  COUNT(*) FILTER (WHERE role IS DISTINCT FROM 'authenticated') AS non_authenticated_role_count
FROM auth.users;
```

```sql
-- 1.7b: Anomalous auth.users rows only (should return 0 rows)
SELECT
  u.id,
  u.role,
  u.is_super_admin,
  u.is_sso_user,
  u.created_at,
  u.last_sign_in_at,
  u.raw_app_meta_data
FROM auth.users u
WHERE u.is_super_admin = true
   OR u.role IS DISTINCT FROM 'authenticated'
ORDER BY u.created_at DESC;
```
- **What normal looks like**: `super_admin_count = 0`, `non_authenticated_role_count = 0`, and `1.7b` returns `0` rows.
- **What to paste back**: Only the counts from `1.7a` and the count/anomalies (without user PII) from `1.7b`.

---

### Check 1.8 — `public.profiles` Status & Legacy Column Anomalies
Checks `public.profiles` (verified against `supabase/schema.sql`) for non-active `account_status` or any legacy `role` / `pending_profile_update` JSON attributes (using `to_jsonb(p)` so the query succeeds whether or not those legacy columns exist on `public.profiles`).

```sql
-- 1.8a: Aggregate counts (safe to paste directly)
SELECT
  COUNT(*) AS total_profiles,
  COUNT(*) FILTER (WHERE account_status <> 'active') AS non_active_count,
  COUNT(*) FILTER (WHERE to_jsonb(p)->'pending_profile_update' IS NOT NULL AND to_jsonb(p)->>'pending_profile_update' <> 'null') AS pending_profile_update_count,
  COUNT(*) FILTER (WHERE to_jsonb(p)->>'role' IS NOT NULL AND to_jsonb(p)->>'role' NOT IN ('user', 'scholar', '')) AS elevated_legacy_role_count
FROM public.profiles p;
```

```sql
-- 1.8b: Anomalous rows only (excludes email/phone/full_name PII)
SELECT
  p.id,
  p.account_status,
  p.user_type,
  to_jsonb(p)->>'role' AS legacy_role,
  (to_jsonb(p)->'pending_profile_update' IS NOT NULL AND to_jsonb(p)->>'pending_profile_update' <> 'null') AS has_pending_update,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE p.account_status <> 'active'
   OR (to_jsonb(p)->'pending_profile_update' IS NOT NULL AND to_jsonb(p)->>'pending_profile_update' <> 'null')
   OR (to_jsonb(p)->>'role' IS NOT NULL AND to_jsonb(p)->>'role' NOT IN ('user', 'scholar', ''))
ORDER BY p.updated_at DESC;
```
- **What normal looks like**: `pending_profile_update_count = 0`, `elevated_legacy_role_count = 0`, and `non_active_count` matches your known moderation actions.
- **What to paste back**: Only the counts from `1.8a` and any unexpected anomaly counts from `1.8b` (no user lists).

---

### Check 1.9 — Unbacked `credit_balances`, `user_entitlements`, or `ai_usage_ledger` Anomalies
Verified against [`supabase/migrations/20260804000000_ai_access_and_Billing.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260804000000_ai_access_and_Billing.sql):
- `public.credit_balances` columns: `user_id, balance, daily_used, daily_reset_at, monthly_used, monthly_reset_at, updated_at`
- `public.credit_ledger` columns: `id, user_id, delta, reason, request_id, note, created_at`
- `public.user_entitlements` columns: `user_id, plan_id, status, start_date, expiry, granted_by, updated_at`
- `public.ai_usage_ledger` columns: `id, user_id, provider_id, model_id, tier, task_type, input_tokens, output_tokens, provider_cost_usd, scholar_credits_charged, request_id, status, created_at`

```sql
-- 1.9a: Credit balances where current balance exceeds the sum of credit_ledger deltas
SELECT
  cb.user_id,
  cb.balance,
  cb.daily_used,
  cb.monthly_used,
  COALESCE(SUM(cl.delta), 0) AS ledger_net_sum,
  COUNT(cl.id) AS ledger_entry_count,
  cb.updated_at
FROM public.credit_balances cb
LEFT JOIN public.credit_ledger cl ON cl.user_id = cb.user_id
GROUP BY cb.user_id, cb.balance, cb.daily_used, cb.monthly_used, cb.updated_at
HAVING cb.balance <> COALESCE(SUM(cl.delta), 0)
    OR (cb.balance > 0 AND COUNT(cl.id) = 0);
```

```sql
-- 1.9b: Active non-free user_entitlements vs. admin_audit_log and premium_requests
SELECT
  ue.user_id,
  ue.plan_id,
  ue.status,
  ue.granted_by,
  ue.start_date,
  ue.expiry,
  ue.updated_at,
  (SELECT COUNT(*) FROM public.admin_audit_log a WHERE a.target_id = ue.user_id::text) AS audit_log_matches,
  (SELECT COUNT(*) FROM public.premium_requests pr WHERE pr.user_id = ue.user_id AND pr.status = 'approved') AS approved_request_matches
FROM public.user_entitlements ue
WHERE ue.plan_id <> 'free' OR ue.status = 'active'
ORDER BY ue.updated_at DESC;
```

```sql
-- 1.9c: Aggregate AI usage & cost summary from public.ai_usage_ledger since 2026-08-04
SELECT
  provider_id,
  model_id,
  tier,
  status,
  COUNT(*) AS call_count,
  COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
  COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
  COALESCE(SUM(provider_cost_usd), 0) AS total_provider_cost_usd,
  COALESCE(SUM(scholar_credits_charged), 0) AS total_credits_charged
FROM public.ai_usage_ledger
WHERE created_at >= '2026-08-04T00:00:00Z'
GROUP BY provider_id, model_id, tier, status
ORDER BY total_provider_cost_usd DESC, call_count DESC;
```
- **What normal looks like**: `1.9a` returns `0` rows (every credit balance matches the sum of `credit_ledger.delta`). `1.9b` shows only entitlements granted by you (`audit_log_matches > 0` or `approved_request_matches > 0`). `1.9c` shows expected token/cost totals.
- **What to paste back**: Row counts and any anomalous rows from `1.9a`/`1.9b` (UUIDs only, no user emails) plus the aggregate table from `1.9c`.

---

### Check 1.10 — Supabase Auth Audit Log (`auth.audit_log_entries`) Since `2026-08-04`
Summarizes authentication and admin events recorded in `auth.audit_log_entries` since `2026-08-04`.

```sql
SELECT
  COALESCE(payload->>'action', payload->>'type', 'unknown') AS action_type,
  COUNT(*) AS event_count,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM auth.audit_log_entries
WHERE created_at >= '2026-08-04T00:00:00Z'
GROUP BY 1
ORDER BY event_count DESC;
```
- **What normal looks like**: Standard user actions (`login`, `logout`, `token_refreshed`, `user_signedup`, `user_recovery_requested`). Look closely for `user_modified`, `user_deleted`, or admin API invocations at unexpected timestamps.
- **What to paste back**: The aggregate summary table above.

---

## 2. GitHub Repository & PAT Compromise Checks

### Check 2.1 — Completed Local Git History Audit (Executed by Agent)
We audited all commits across `--all` refs since `2026-08-04T00:00:00Z` and every modification to `.github/`:
- **Commit Authors Since `2026-08-04` (`git log --all --since=2026-08-04 --format='%an <%ae>' | sort | uniq -c`)**:
  1. `Govinda Shah <doc.govinda@gmail.com>` (`289` commits)
  2. `Aaditya Sah <aadityasah@Aadityas-MacBook-Air.local>` (`173` commits)
  3. `Claude <noreply@anthropic.com>` (`67` commits)
  4. `docgovinda-glitch <doc.govinda@gmail.com>` (`36` commits)
  - **Verdict**: Zero unrecognized commit authors in the git object database.
- **Workflow File (`.github/workflows/*`) Changes (`git log --all --oneline -- .github/workflows/`)**:
  - `4afb6c8` / `1671980`: Initial `ci.yml` Node 20 workflow.
  - `01f851f` (`2026-08-04`): Initial `.github/workflows/deploy.yml` created by Claude.
  - `fdc87ce` (`2026-08-04`): Updated `deploy.yml` to gate deploy on `verify` job.
  - `6c5943a` (`2026-08-10`): Removed `deploy.yml` in favor of Render native auto-deploy.
  - `f5d8457` (`2026-10-27`): Re-added `.github/workflows/deploy.yml` and `.github/workflows/ci.yml` (`Aaditya Sah`).
  - `3763211` (`2026-10-27`): Set `continue-on-error: true` on test step (`Aaditya Sah`).
  - `a9fdbca` (`2026-10-28`): Deleted 1 blank line in `deploy.yml` (`Govinda Shah`).
  - `e0db4bd` / `2807e91` (`2026-10-28`): PR #72 (`fix/ci-blocking-and-node22-alignment`) aligning CI to Node 22 and removing `continue-on-error: true`.
  - **Verdict**: No malicious workflow injection, secret-exfiltrating steps, or unknown third-party actions exist in `.github/workflows/`.

### Check 2.2 — Remote GitHub Collaborators, Deploy Keys, Webhooks, Actions Secrets & Branch Protection
Run these read-only `gh` CLI commands from a terminal authenticated as `docgovinda-glitch`:

```bash
# 1. Collaborators (outside contributors with push/admin access)
gh api repos/docgovinda-glitch/scholar-agentic-os/collaborators --jq '.[] | {login, role_name, permissions}'

# 2. Deploy keys (SSH keys attached to the repo)
gh api repos/docgovinda-glitch/scholar-agentic-os/keys --jq '.[] | {id, title, read_only, created_at, last_used}'

# 3. Repository webhooks (external URLs receiving push/PR events)
gh api repos/docgovinda-glitch/scholar-agentic-os/hooks --jq '.[] | {id, name, active, config: {url: .config.url}, created_at}'

# 4. GitHub Actions secret NAMES only (values cannot be read via API)
gh secret list -R docgovinda-glitch/scholar-agentic-os

# 5. Branch protection on main
gh api repos/docgovinda-glitch/scholar-agentic-os/branches/main/protection
```
- **What normal looks like**:
  - **Collaborators**: Only `docgovinda-glitch` (and `Aaditya Sah` if authorized).
  - **Deploy keys**: `[]` (empty) or only Render's read-only deploy key.
  - **Webhooks**: Only Render's official GitHub App/webhook (`api.render.com`), zero unknown webhook URLs.
  - **Actions secrets**: Only `RENDER_DEPLOY_KEY` (or `RENDER_API_KEY` + `RENDER_SERVICE_ID`), `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY`.
    > [!WARNING]
    > **`DATABASE_URL` in GitHub Actions Secrets is NOT Normal**:
    > Neither `.github/workflows/ci.yml` nor `.github/workflows/deploy.yml` references `DATABASE_URL`. It was uploaded to GitHub Actions secrets on `2026-08-04` by `scripts/setup-infrastructure.md` (which leaked the production Postgres password in `F-01`). Storing the production database connection string in GitHub Actions unnecessarily exposes the DB password to every workflow run. **Delete it immediately** via:
    > ```bash
    > gh secret delete DATABASE_URL -R docgovinda-glitch/scholar-agentic-os
    > ```
- **What to paste back**: The output of those 5 commands (confirming `DATABASE_URL` is deleted if present).

### Check 2.3 — GitHub Personal Security Log (Leaked PAT Usage)
1. Open **GitHub Settings → Archives → Security log** (`https://github.com/settings/security-log`).
2. Search for `created_at:>=2026-08-04` and filter for `repo.access`, `oauth_authorization`, `personal_access_token`, `org.add_member`, or unfamiliar IP addresses / user-agents.
- **What normal looks like**: Only git pushes/fetches from your own IP addresses, Anthropic Claude Code sessions (`2026-08-04` to `2026-08-25`), and GitHub Actions runners.
- **What to paste back**: Confirm whether any unfamiliar IP address or unexpected PAT event appears.

---

## 3. External Services Compromise Checks

### Check 3.1 — Cloudflare (`gkshah.com.np` Zone)
In the Cloudflare Dashboard for `gkshah.com.np`:
1. **Manage Account → Audit Log**: Filter from `2026-08-04` to present.
2. **DNS → Records**: Inspect all `A`, `AAAA`, `CNAME`, `TXT`, and `MX` records.
3. **Workers & Pages** and **Rules → Redirect Rules / Transform Rules**: Check if any Worker route or redirect rule is intercepting `scholar.gkshah.com.np`.
4. **My Profile → API Tokens**: Check active tokens and Global API Key last-used metadata.
- **What normal looks like**:
  - `scholar.gkshah.com.np` points only to `scholar-agentic-os.onrender.com`.
  - No unrecognized `TXT` domain-verification records or `MX` changes.
  - Zero Workers or Redirect/Transform rules attached to `scholar.gkshah.com.np`.
- **What to paste back**: Confirmation that DNS records, Workers, and Audit Logs show no unauthorized edits.

### Check 3.2 — Render (`srv-d9lgbn710e5c73dl8sk0`)
In the Render Dashboard for `scholar-agentic-os`:
1. **Events / Deploys**: Review deploy history since `2026-08-04` and check for `Env vars updated`, `Shell session started`, or deploys from commits not on `main`.
2. **Settings → Custom Domains**: Confirm only `scholar.gkshah.com.np` is attached.
3. **Account Settings → API Keys**: Check active Render API keys (`rnd_...`) and last-used timestamps.
- **What normal looks like**: Every deploy corresponds to a known commit on `main`; zero unauthorized shell sessions or unknown custom domains.
- **What to paste back**: Confirmation from the Render Events feed.

### Check 3.3 — Resend (`re_...` API Key)
In the Resend Dashboard (`https://resend.com`):
1. **Emails (Logs)**: Filter sent emails from `2026-08-04` to present. Check recipient domains, subjects, and volume.
2. **Domains**: Check verified sending domains and ensure no unknown domain was added.
3. **API Keys**: Check if any additional API keys were created.
4. **Webhooks**: Confirm no webhook endpoints were registered to siphon email contents (which include verification keys).
- **What normal looks like**: Only transactional emails from your domain (`[Profile Update Request]`, verification emails) sent to `ADMIN_EMAIL` or registered scholars. Zero phishing bursts or unknown webhooks.
- **What to paste back**: Total emails sent since `2026-08-04` and confirmation that `0` webhooks exist.

### Check 3.4 — AI & Search Providers (Anthropic, OpenAI, Gemini, DeepSeek, Tavily)
1. **Anthropic Console (`console.anthropic.com`) → Usage / Cost & API Keys**: Check daily token spend since `2026-08-04` and compare against Check `1.9c` (`public.ai_usage_ledger`).
2. **OpenAI Platform (`platform.openai.com/usage`)**: Check daily spend and key activity.
3. **Google AI Studio / GCP Billing (`console.cloud.google.com/billing`)**: Check Gemini API request volume and cost.
4. **DeepSeek Platform (`platform.deepseek.com/usage`)**: Check balance deductions and API key usage logs.
5. **Tavily (`app.tavily.com`)**: Check search credit consumption against expected `search-proxy` Edge Function invocations (remember `search-proxy` had `--no-verify-jwt`).
- **What normal looks like**: Provider usage aligns with the token totals in `public.ai_usage_ledger` (Check `1.9c`). Any spike in provider billing that does **not** appear in `public.ai_usage_ledger` indicates external use of a leaked key.
- **What to paste back**: Whether provider usage matches Check `1.9c` (`public.ai_usage_ledger`).
