# Post-Exposure Compromise & Persistence Audit (`COMPROMISE_CHECKS.md`)

**Purpose**: Read-only forensic checks to detect any unauthorized access, backdoor persistence, privilege escalation, or quota abuse since **2026-08-04** (when commits `01f851f` and `28cfaa5` committed live credentials to the repository).  
**Safety Guarantee**: Every SQL query below is strictly `SELECT`-only. No secret values are selected or printed.

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
- **What normal looks like**: Standard managed Supabase roles only (`postgres`, `authenticator`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `supabase_replication_admin`, `supabase_read_only_user`, `service_role`, `dashboard_user`, `pgbouncer`). Zero unfamiliar custom login roles.
- **What to paste back**: The complete output table.

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
- **What to paste back**: The extension list (and `cron.job` rows if `pg_cron` is installed).

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
- **What normal looks like**: Either `0` rows or only built-in Supabase system triggers owned by `supabase_admin` (such as `issue_pg_cron_access`, `issue_pg_graphql_access`, `issue_pg_net_access`, `pgrst_ddl_watch`, `pgrst_drop_watch`).
- **What to paste back**: All rows returned.

---

### Check 1.4 — Non-Repo Triggers & Functions (Concrete Exclusion List Generated from Repo SQL)
Scanning all 4 base schemas (`supabase/*.sql`) and all 28 migration files (`supabase/migrations/*.sql`) yields the complete exclusion list of legitimate repo-defined objects:
- **14 Repo Functions**: `check_email_available`, `check_phone_available`, `check_username_available`, `deduct_credits`, `email_for_identifier`, `email_for_phone_e164`, `email_for_username`, `enforce_account_status_admin_only`, `grant_credits`, `handle_new_user`, `handle_project_delete_cascade`, `match_project_evidence`, `submit_id_document`, `update_modified_column` *(plus `deduct_scholar_credits` referenced in `server/src/aiEngine/creditEngine.ts`)*.
- **4 Repo Triggers**: `on_auth_user_created`, `profiles_account_status_guard`, `tr_project_delete_cascade`, `update_manuscript_sections_modtime`.

Run both queries below to list any **unknown** triggers or functions in `public` (or on `auth.users` / `storage.objects`) and to inspect the body hash/source of `SECURITY DEFINER` functions:

```sql
-- 1.4a: Triggers NOT in the repo SQL exclusion list
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
    'on_auth_user_created',
    'profiles_account_status_guard',
    'tr_project_delete_cascade',
    'update_manuscript_sections_modtime',
    'update_objects_updated_at'
  )
ORDER BY n.nspname, c.relname, t.tgname;
```

```sql
-- 1.4b: Functions in public schema NOT in the repo SQL exclusion list, plus all SECURITY DEFINER functions in public
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
  - `1.4b`: `is_unrecognized_function = false` for all rows, and `source_preview` of `handle_new_user`, `deduct_credits`, `grant_credits`, `submit_id_document`, `email_for_*`, `check_*_available` matches repo SQL with no outbound HTTP calls or backdoor grants.
- **What to paste back**: Full output of `1.4a` and `1.4b`.

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
- **What to paste back**: All rows returned (or confirm `0` rows).

---

### Check 1.6 — `public.admin_users` Rows & `public.admin_audit_log`
Lists every user granted administrative privileges in `public.admin_users` and recent admin audit entries.

```sql
SELECT
  au.user_id,
  u.email,
  au.scopes,
  au.is_active,
  au.granted_by,
  au.notes,
  au.created_at,
  au.updated_at
FROM public.admin_users au
LEFT JOIN auth.users u ON u.id = au.user_id
ORDER BY au.created_at DESC;
```
- **What normal looks like**: Only admin accounts explicitly added by the project owner (or `0` rows if only `MAIN_ADMIN_EMAIL` is used).
- **What to paste back**: All rows returned.

---

### Check 1.7 — `auth.users` Created or Modified Since `2026-08-04`
Lists user accounts created since `2026-08-04`, highlighting any super-admin flags or suspicious metadata.

```sql
SELECT
  u.id,
  u.email,
  u.phone,
  u.is_sso_user,
  u.is_super_admin,
  u.role,
  u.created_at,
  u.email_confirmed_at,
  u.last_sign_in_at,
  u.raw_app_meta_data
FROM auth.users u
WHERE u.created_at >= '2026-08-04T00:00:00Z'
   OR u.updated_at >= '2026-08-04T00:00:00Z'
   OR u.is_super_admin = true
ORDER BY u.created_at DESC
LIMIT 200;
```
- **What normal looks like**: `is_super_admin` is `false` (or `null`) on every row; `role` is `'authenticated'`; email addresses match legitimate registered users.
- **What to paste back**: Row count and any unrecognized accounts or rows where `is_super_admin = true` or `role <> 'authenticated'`.

---

### Check 1.8 — `public.profiles` Role, Status, or Pending Profile Update Anomalies
Checks for unauthorized `role` values (if column exists), non-active `account_status` overrides, or active `pending_profile_update` email-change hijack payloads (`F-04`).

```sql
SELECT
  p.id,
  u.email AS auth_email,
  p.username,
  p.account_status,
  p.pending_profile_update,
  p.created_at,
  p.updated_at
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.pending_profile_update IS NOT NULL
   OR p.account_status <> 'active'
ORDER BY p.updated_at DESC;
```
- **What normal looks like**: `pending_profile_update IS NULL` on all rows (unless a known user currently has a legitimate pending request), and `account_status` matches expected moderation actions.
- **What to paste back**: All rows returned.

---

### Check 1.9 — Unbacked `credit_balances` or `user_entitlements` Grants
Detects any `credit_balances` row whose current balance or lifetime total exceeds the sum of `credit_ledger` entries, or any `user_entitlements` premium grant with no corresponding `admin_audit_log` / `premium_requests` record.

```sql
-- 1.9a: Credit balances with no matching credit_ledger sum
SELECT
  cb.user_id,
  u.email,
  cb.balance_credits,
  cb.lifetime_granted_credits,
  cb.lifetime_used_credits,
  COALESCE(SUM(cl.delta_credits), 0) AS ledger_net_sum,
  COUNT(cl.id) AS ledger_entry_count,
  cb.updated_at
FROM public.credit_balances cb
LEFT JOIN public.credit_ledger cl ON cl.user_id = cb.user_id
LEFT JOIN auth.users u ON u.id = cb.user_id
GROUP BY cb.user_id, u.email, cb.balance_credits, cb.lifetime_granted_credits, cb.lifetime_used_credits, cb.updated_at
HAVING cb.balance_credits <> COALESCE(SUM(cl.delta_credits), 0)
    OR (cb.balance_credits > 0 AND COUNT(cl.id) = 0);
```

```sql
-- 1.9b: Active premium user_entitlements vs. admin_audit_log and premium_requests
SELECT
  ue.user_id,
  u.email,
  ue.plan_id,
  ue.status,
  ue.granted_by,
  ue.grant_reason,
  ue.starts_at,
  ue.expires_at,
  (SELECT COUNT(*) FROM public.admin_audit_log a WHERE a.target_id = ue.user_id::text) AS audit_log_matches,
  (SELECT COUNT(*) FROM public.premium_requests pr WHERE pr.user_id = ue.user_id AND pr.status = 'approved') AS approved_request_matches
FROM public.user_entitlements ue
LEFT JOIN auth.users u ON u.id = ue.user_id
WHERE ue.plan_id <> 'free' OR ue.status = 'active'
ORDER BY ue.updated_at DESC;
```
- **What normal looks like**: `1.9a` returns `0` rows (every credit balance matches the sum of `credit_ledger` deltas). `1.9b` shows only entitlements granted to known users by the owner.
- **What to paste back**: All rows returned by `1.9a` and `1.9b`.

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
- **What to paste back**: The summary table above.

---

## 2. GitHub Repository & PAT Compromise Checks

### Check 2.1 — Completed Local Git History Audit (Executed by Agent)
We audited all commits across `--all` refs since `2026-08-04T00:00:00Z` (`602` total commits) and every modification to `.github/`:
- **Commit Authors & Committers Since `2026-08-04`**:
  1. `Govinda Shah <doc.govinda@gmail.com>` (`280` commits)
  2. `Aaditya Sah <aadityasah@Aadityas-MacBook-Air.local>` (`173` commits)
  3. `Claude <noreply@anthropic.com>` (`105` commits)
  4. `docgovinda-glitch <doc.govinda@gmail.com>` / `GitHub <noreply@github.com>` (`44` merge commits)
  - **Verdict**: Zero unrecognized commit authors or committers in the git object database.
- **Workflow File (`.github/workflows/*`) Changes Since `2026-08-04`**:
  - `01f851f` (`2026-08-04`): Initial `.github/workflows/deploy.yml` created by Claude.
  - `fdc87ce` (`2026-08-04`): Updated `deploy.yml` to gate deploy on `verify` job.
  - `6c5943a` (`2026-08-10`): Removed `deploy.yml` in favor of Render native auto-deploy.
  - `f5d8457` (`2026-10-27`): Re-added `.github/workflows/deploy.yml` and `.github/workflows/ci.yml` (`Aaditya Sah`).
  - `3763211` (`2026-10-27`): Set `continue-on-error: true` on test step (`Aaditya Sah`).
  - `a9fdbca` (`2026-10-28`): Deleted 1 blank line in `deploy.yml` (`Govinda Shah`).
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
  - **Actions secrets**: Only expected secret names (`RENDER_DEPLOY_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DATABASE_URL`) with `UPDATED` timestamps matching your setup dates (`2026-08-04` or `2026-10-27`).
- **What to paste back**: The output of those 5 commands.

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
  - `scholar.gkshah.com.np` is a `CNAME` pointing to `scholar-agentic-os.onrender.com` ( plus Resend `TXT`/`MX` DKIM records and verification `TXT` records).
  - Zero Cloudflare Workers bound to `*gkshah.com.np/*` and zero unauthorized Redirect/Transform rules.
  - Audit log shows only changes made on `2026-08-04` during initial setup.
- **What to paste back**: Confirmation of DNS target for `scholar`, Worker/Redirect count (`0`), and any Audit Log entries after `2026-08-04`.

### Check 3.2 — Render (`srv-d9lgbn710e5c73dl8sk0`)
In the Render Dashboard:
1. **Dashboard → Services**: Confirm no extra background workers, cron jobs, or databases were created under the account.
2. **`scholar-agentic-os` → Events / Deploys**: Compare every deploy since `2026-08-04` against `git log main` commit SHAs, and check for `Environment updated` events at unexpected times.
3. **Account Settings → API Keys**: Check if any personal Render API keys exist.
- **What normal looks like**: Every deploy references a commit SHA present on `origin/main` (or `claude/*` during Aug 2026), and all `Environment updated` timestamps match your own administrative sessions.
- **What to paste back**: Any deploy SHA or `Environment updated` timestamp you do not recognize.

### Check 3.3 — Resend (Email Sending & Domains)
In the Resend Dashboard (`https://resend.com`):
1. **Emails (Logs)**: Filter sent emails from `2026-08-04` to present. Look for bulk phishing/spam sends or `UP-XXXXXX` profile-update verification emails you did not trigger.
2. **Domains**: Verify only your authorized domain (`gkshah.com.np`) is registered.
3. **API Keys**: Check the list of API keys and their `Last Used` timestamps.
- **What normal looks like**: Only transactional emails triggered by your own testing/users (`UP-XXXXXX` admin verification emails), zero unfamiliar recipient bursts, and no additional sending domains or API keys created after `2026-08-04`.
- **What to paste back**: Total email count sent since `2026-08-04` and whether any unrecognized recipients or domains exist.

### Check 3.4 — Upstream LLM Providers & Tavily Usage (`2026-08-04` – Present)
Even though upstream LLM keys were wrapped in `platform_provider_credentials` (or stored in `api_credentials` / `user_cloud_integrations`), the leaked `SUPABASE_SERVICE_ROLE_KEY` + `ENCRYPTION_KEY` (and unauthenticated `/api/search/live` / `/api/ai/*` endpoints) could allow an attacker to consume quota or decrypt stored keys:
1. **Supabase SQL Check on Internal AI Usage Ledger**:
   ```sql
   SELECT
     provider_id,
     model_id,
     funding_source,
     COUNT(*) AS call_count,
     SUM(prompt_tokens + completion_tokens) AS total_tokens,
     SUM(estimated_cost_usd) AS total_estimated_cost_usd,
     MIN(created_at) AS first_call,
     MAX(created_at) AS last_call
   FROM public.ai_usage_ledger
   WHERE created_at >= '2026-08-04T00:00:00Z'
   GROUP BY provider_id, model_id, funding_source
   ORDER BY total_estimated_cost_usd DESC NULLS LAST;
   ```
2. **Provider Dashboards (Gemini / Google AI Studio, OpenAI, Anthropic, OpenRouter, Groq, Tavily)**: Check billing/usage graphs since `2026-08-04` for unexpected spikes.
- **What normal looks like**: Usage in provider dashboards matches `public.ai_usage_ledger` and your own test/user activity.
- **What to paste back**: Output of the `ai_usage_ledger` query above and whether any provider dashboard shows unexplained spend.
