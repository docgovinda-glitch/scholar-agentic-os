-- Scholar AI Engine schema — provider/model registry, credential storage for
-- Scholar's OWN (Premium-pool) provider keys, hardware profiles, admin
-- authorization, entitlements, quotas, credits, usage ledger, provider
-- health, platform budget, and the AI Opportunity Agent's findings.
--
-- Separate, independent file from schema.sql / schema_store.sql /
-- schema_user_settings.sql, matching their own convention: nothing here
-- references them by foreign key except auth.users(id), and running this
-- file does not require running the others first (beyond auth.users
-- existing, which Supabase always provides).
--
-- ============================================================================
-- WHY THIS FILE DOES NOT STORE USER BYOK API KEYS
-- ============================================================================
--
-- docs/04-architecture/46-SECURITY-ARCHITECTURE.md §5.3 and §18 name
-- server-side custody of a USER's own provider keys as "the single clearest
-- violation of the target posture" and record that the prior implementation
-- of exactly that (`resolveApiKey`/`decryptServerKey`) was deliberately
-- retired. schema_user_settings.sql already made the same call for Desk's
-- current BYOK flow: keys live in the browser's local storage on the device
-- that entered them, never on the server.
--
-- This file keeps that boundary. `user_ai_connections` below records THAT a
-- user has connected a Free/BYOK provider (for the AI Access dashboard and
-- for Omni Router's eligibility checks) — never the credential itself.
--
-- `platform_provider_credentials` is a different thing entirely: Scholar's
-- OWN provider keys, funding the Premium pool (Section 10 of the AI Access
-- architecture). Encrypting those server-side is correct and required —
-- they are the operator's credentials, not a user's — so it uses
-- src/services/crypto's real AES-256-GCM envelope encryption against the
-- server-held MASTER_KEY, and is never readable by any client role.
--
-- ============================================================================
-- REGISTRY: providers and models
-- ============================================================================

create table if not exists public.ai_providers (
  -- Matches src/config/providerCatalog.ts's CloudProviderSpec.id for cloud
  -- providers, and the local runner catalog's id for local ones, so the
  -- registry and the existing static catalogs describe the same providers
  -- under the same key.
  id text primary key,
  name text not null,
  category text not null check (category in ('local', 'free', 'byok', 'premium_pool')),
  api_style text not null,
  base_url text,
  docs_url text,
  -- Null for local providers, which have no tier concept.
  free_tier_kind text check (free_tier_kind in ('free', 'freemium', 'trial-credits', 'paid')),
  free_tier_note text,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_models (
  -- "<provider_id>:<model_id>", stable and human-readable in logs/ledgers.
  id text primary key,
  provider_id text not null references public.ai_providers(id) on delete cascade,
  model_id text not null,
  display_name text not null,
  context_window integer,
  -- {vision, audio, tool_calling, reasoning, coding}: bool per key. Kept as
  -- jsonb rather than one column per capability so a new capability doesn't
  -- need a migration to record.
  capabilities jsonb not null default '{}'::jsonb,
  modalities text[] not null default array['text'],
  speed_class text check (speed_class in ('fast', 'balanced', 'slow')),
  cost_class text check (cost_class in ('free', 'low', 'medium', 'high')),
  premium_eligible boolean not null default false,
  free_eligible boolean not null default false,
  enabled boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_models_provider_id_idx on public.ai_models(provider_id);

-- Public catalog: every signed-in and anonymous visitor can read what
-- providers/models exist (needed to render the AI Access page and setup
-- guide before sign-in). Writes are admin-only, done through server routes
-- with the service-role key, so no insert/update/delete policy exists here.
alter table public.ai_providers enable row level security;
alter table public.ai_models enable row level security;

drop policy if exists ai_providers_select_all on public.ai_providers;
create policy ai_providers_select_all on public.ai_providers for select using (true);

drop policy if exists ai_models_select_all on public.ai_models;
create policy ai_models_select_all on public.ai_models for select using (true);

-- ============================================================================
-- USER CONNECTIONS (metadata only — never a credential)
-- ============================================================================

create table if not exists public.user_ai_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null references public.ai_providers(id) on delete cascade,
  tier text not null check (tier in ('local', 'free', 'byok')),
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  -- Always 'device' today — see the file header. Kept as a column (not a
  -- constant) so a future real cross-device vault is a data migration, not a
  -- schema one.
  storage_mode text not null default 'device' check (storage_mode in ('device')),
  last_verified_at timestamptz,
  models_detected integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider_id)
);

alter table public.user_ai_connections enable row level security;

drop policy if exists user_ai_connections_all_own on public.user_ai_connections;
create policy user_ai_connections_all_own
  on public.user_ai_connections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- HARDWARE PROFILES
-- ============================================================================

create table if not exists public.hardware_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  os text,
  cpu_cores integer,
  architecture text,
  ram_gb numeric,
  gpu_info text,
  vram_gb numeric,
  storage_free_gb numeric,
  detected_runtimes jsonb not null default '[]'::jsonb,
  detected_models jsonb not null default '[]'::jsonb,
  -- What actually produced these numbers — browser APIs are estimates, not
  -- guarantees (navigator.deviceMemory in particular is capped/bucketed by
  -- browsers for fingerprinting resistance), and the UI must say so.
  detection_method text not null default 'browser-api' check (detection_method in ('browser-api', 'manual')),
  detected_at timestamptz not null default now()
);

alter table public.hardware_profiles enable row level security;

drop policy if exists hardware_profiles_all_own on public.hardware_profiles;
create policy hardware_profiles_all_own
  on public.hardware_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- ADMIN AUTHORIZATION
-- ============================================================================
--
-- No admin concept existed anywhere in this codebase before this file —
-- server/routes/admin.ts was an empty placeholder. This table is the entire
-- authorization source of truth: server/src/middleware/requireAdmin.ts
-- queries it with the service-role client (RLS-bypassing) and denies by
-- default. No client-side flag is ever trusted for this decision.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  note text
);

-- Zero policies, deliberately: this table must be unreadable and unwritable
-- through the anon/authenticated roles the browser holds, at any privilege
-- level, full stop. Only service_role (server-side only) and postgres can
-- touch it. Same pattern as schema_store.sql's projects table.
alter table public.admin_users enable row level security;

-- ============================================================================
-- PREMIUM: plans, entitlements, quota overrides
-- ============================================================================

create table if not exists public.premium_plans (
  id text primary key,
  name text not null,
  monthly_credits integer not null,
  daily_credits integer,
  per_task_max_credits integer,
  concurrency_limit integer not null default 1,
  -- Empty array = no restriction (every eligible model/provider allowed).
  model_restrictions jsonb not null default '[]'::jsonb,
  provider_restrictions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Plans are public read (a signed-out visitor comparing Premium tiers on the
-- AI Access page needs this), admin-only write.
alter table public.premium_plans enable row level security;
drop policy if exists premium_plans_select_all on public.premium_plans;
create policy premium_plans_select_all on public.premium_plans for select using (true);

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text references public.premium_plans(id),
  status text not null default 'none' check (status in ('none', 'active', 'expired', 'revoked')),
  start_date timestamptz,
  expiry timestamptz,
  granted_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Users may read their own entitlement (Section 19/20: "Premium: Active /
-- Not subscribed" on their own dashboard) but never write it — granting
-- Premium is exclusively an admin server-route action.
alter table public.user_entitlements enable row level security;
drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own
  on public.user_entitlements for select using (auth.uid() = user_id);

create table if not exists public.user_quota_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_credits integer,
  daily_credits integer,
  per_task_max_credits integer,
  concurrency_limit integer,
  reason text,
  set_by uuid references auth.users(id),
  set_at timestamptz not null default now()
);

-- Same shape as entitlements: readable by the user it belongs to (so the
-- quota display Section 19 requires is accurate), writable only by admin
-- server routes.
alter table public.user_quota_overrides enable row level security;
drop policy if exists user_quota_overrides_select_own on public.user_quota_overrides;
create policy user_quota_overrides_select_own
  on public.user_quota_overrides for select using (auth.uid() = user_id);

-- ============================================================================
-- CREDITS
-- ============================================================================

create table if not exists public.credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric not null default 0,
  daily_used numeric not null default 0,
  daily_reset_at timestamptz not null default now(),
  monthly_used numeric not null default 0,
  monthly_reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Read-only to the owning user (Section 15/19: quota/usage transparency).
-- All writes go through the credit-ledger service (server-side, service
-- role) so a balance can never drift from the ledger that justifies it.
alter table public.credit_balances enable row level security;
drop policy if exists credit_balances_select_own on public.credit_balances;
create policy credit_balances_select_own
  on public.credit_balances for select using (auth.uid() = user_id);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Negative = charge, positive = grant/bonus/refund/plan allocation.
  delta numeric not null,
  reason text not null check (reason in ('usage', 'admin_grant', 'bonus', 'refund', 'expiry', 'plan_allocation')),
  request_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_id_created_at_idx on public.credit_ledger(user_id, created_at desc);

-- Immutable: select-own only. No update/delete policy exists for ANY role
-- that isn't service_role — a correction is a new offsetting row, never an
-- edit to history, so the ledger stays trustworthy as an audit trail.
alter table public.credit_ledger enable row level security;
drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own
  on public.credit_ledger for select using (auth.uid() = user_id);

-- ============================================================================
-- USAGE LEDGER (every AI request, all four tiers)
-- ============================================================================

create table if not exists public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_id text references public.ai_providers(id),
  model_id text,
  tier text not null check (tier in ('local', 'free', 'byok', 'premium')),
  task_type text,
  input_tokens integer,
  output_tokens integer,
  provider_cost_usd numeric,
  scholar_credits_charged numeric,
  request_id uuid not null,
  status text not null check (status in ('success', 'error', 'rate_limited', 'quota_exhausted')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_ledger_user_id_created_at_idx on public.ai_usage_ledger(user_id, created_at desc);

alter table public.ai_usage_ledger enable row level security;
drop policy if exists ai_usage_ledger_select_own on public.ai_usage_ledger;
create policy ai_usage_ledger_select_own
  on public.ai_usage_ledger for select using (auth.uid() = user_id);

-- ============================================================================
-- PROVIDER HEALTH
-- ============================================================================

create table if not exists public.provider_health (
  provider_id text primary key references public.ai_providers(id) on delete cascade,
  status text not null default 'unknown' check (status in ('healthy', 'degraded', 'down', 'unknown')),
  latency_ms integer,
  last_checked_at timestamptz,
  last_error text
);

-- Public read: Omni Router's client-visible reasoning and the AI Access page
-- both want to show "Gemini: healthy" honestly. Writes are server-only
-- (the health monitor runs with the service-role key).
alter table public.provider_health enable row level security;
drop policy if exists provider_health_select_all on public.provider_health;
create policy provider_health_select_all on public.provider_health for select using (true);

-- ============================================================================
-- PLATFORM BUDGET (singleton row)
-- ============================================================================

create table if not exists public.platform_budgets (
  id integer primary key default 1 check (id = 1),
  monthly_budget_usd numeric not null default 0,
  warn_threshold_pct integer not null default 80,
  prefer_cheap_threshold_pct integer not null default 90,
  restrict_threshold_pct integer not null default 95,
  stop_threshold_pct integer not null default 100,
  current_month_spend_usd numeric not null default 0,
  month_start timestamptz not null default date_trunc('month', now()),
  updated_at timestamptz not null default now()
);

-- Admin/server-only in full — even the current spend figure is not exposed
-- directly to users (the Admin Dashboard, Section 16, is the intended
-- consumer). Zero policies.
alter table public.platform_budgets enable row level security;

-- ============================================================================
-- PLATFORM (PREMIUM-POOL) PROVIDER CREDENTIALS — server-side encrypted
-- ============================================================================
--
-- See the file header for why this table exists and user BYOK keys do not.
-- encrypted_cek / encrypted_credential are src/services/crypto's
-- EncryptedPayload shape ({ciphertext, iv, authTag}, all base64) — the CEK
-- wraps the actual credential, and MASTER_KEY (server env var) wraps the
-- CEK. Neither the plaintext credential nor the plaintext CEK is ever
-- written anywhere; decryption happens in server memory only, on demand,
-- inside the AI Engine's provider adapter layer.

create table if not exists public.platform_provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.ai_providers(id) on delete cascade,
  label text not null default 'default',
  encrypted_cek jsonb not null,
  encrypted_credential jsonb not null,
  -- Last four characters, set once at write time — never derived by
  -- decrypting on a list request. The Admin AI Infrastructure panel reads
  -- only this column to render "••••" + last 4; the encrypted columns are
  -- touched exclusively by the AI Gateway's provider adapter layer at
  -- request time.
  masked_preview text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  last_verified_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Zero policies. This is the highest-sensitivity table in this file — it
-- funds every Premium request — and must be reachable only through
-- server/routes/admin.ts's requireAdmin-gated routes, using the
-- service-role client.
alter table public.platform_provider_credentials enable row level security;

-- ============================================================================
-- AI OPPORTUNITY AGENT
-- ============================================================================

create table if not exists public.ai_opportunities (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  opportunity_name text not null,
  official_url text not null,
  discovered_at timestamptz not null default now(),
  value_estimate text,
  eligibility text,
  geo_restrictions text,
  application_required boolean,
  expiration timestamptz,
  usage_restrictions text,
  credits_transferable boolean,
  multi_user_allowed text check (multi_user_allowed in ('allowed', 'not_allowed', 'unclear')),
  confidence text check (confidence in ('low', 'medium', 'high')),
  risk text check (risk in ('low', 'medium', 'high')),
  last_verified_at timestamptz,
  status text not null default 'new' check (status in ('new', 'reviewed', 'approved', 'rejected', 'ignored')),
  source_notes text,
  created_at timestamptz not null default now()
);

alter table public.ai_opportunities enable row level security;

create table if not exists public.opportunity_reviews (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.ai_opportunities(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected', 'ignored')),
  notes text,
  reviewed_at timestamptz not null default now()
);

alter table public.opportunity_reviews enable row level security;

-- ============================================================================
-- ADMIN AUDIT LOG
-- ============================================================================

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log(created_at desc);

-- Zero policies, immutable, admin/server-only — same reasoning as
-- credit_ledger, applied to operator actions instead of user spend.
alter table public.admin_audit_log enable row level security;

-- ============================================================================
-- CREDIT ENGINE: atomic deduct/grant functions
-- ============================================================================
--
-- Why these are Postgres functions, not read-then-write calls from the
-- server: PostgREST (the Data API this app's server-side code otherwise uses
-- — see server/src/supabaseRest.ts) has no multi-statement transactions, so
-- a naive "read balance, check, write balance, write ledger" from the
-- server has a real race: two concurrent requests for the same user can
-- both read the same balance, both pass the check, and both deduct — a
-- double-spend against the platform's own AI budget. Wrapping the whole
-- operation in one function makes it one transaction, and `for update` locks
-- the user's balance row for that transaction's duration, so a second
-- concurrent call waits rather than racing.
--
-- SECURITY DEFINER + explicit grants: these functions write credit_ledger
-- and credit_balances, both zero-policy/read-only-to-owner tables that
-- anon/authenticated must never be able to mutate directly. Postgres grants
-- EXECUTE on new functions to PUBLIC by default, which would otherwise let
-- any authenticated user call deduct_credits or grant_credits directly over
-- PostgREST's /rpc/ endpoint and manufacture their own credits — the grants
-- below close that.

create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount numeric,
  p_daily_limit numeric,
  p_monthly_limit numeric,
  p_reason text,
  p_request_id uuid,
  p_note text default null
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_daily_used numeric;
  v_monthly_used numeric;
  v_daily_reset timestamptz;
  v_monthly_reset timestamptz;
begin
  insert into public.credit_balances (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select balance, daily_used, monthly_used, daily_reset_at, monthly_reset_at
    into v_balance, v_daily_used, v_monthly_used, v_daily_reset, v_monthly_reset
    from public.credit_balances where user_id = p_user_id for update;

  -- Lazy reset: a counter whose window has elapsed is zeroed the first time
  -- it's touched after the window passes, rather than needing a cron job.
  if v_daily_reset < date_trunc('day', now()) then
    v_daily_used := 0;
    v_daily_reset := date_trunc('day', now());
  end if;
  if v_monthly_reset < date_trunc('month', now()) then
    v_monthly_used := 0;
    v_monthly_reset := date_trunc('month', now());
  end if;

  if p_daily_limit is not null and v_daily_used + p_amount > p_daily_limit then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'daily_limit_exceeded';
  end if;
  if p_monthly_limit is not null and v_monthly_used + p_amount > p_monthly_limit then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'monthly_limit_exceeded';
  end if;
  if v_balance < p_amount then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'insufficient_balance';
  end if;

  update public.credit_balances
    set balance = v_balance - p_amount,
        daily_used = v_daily_used + p_amount,
        monthly_used = v_monthly_used + p_amount,
        daily_reset_at = v_daily_reset,
        monthly_reset_at = v_monthly_reset,
        updated_at = now()
    where user_id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, request_id, note)
    values (p_user_id, -p_amount, p_reason, p_request_id, p_note);

  return 'ok';
end;
$$;

revoke execute on function public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text) to service_role;

create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_note text default null
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.credit_balances (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  update public.credit_balances
    set balance = balance + p_amount, updated_at = now()
    where user_id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, note)
    values (p_user_id, p_amount, p_reason, p_note);
end;
$$;

revoke execute on function public.grant_credits(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, numeric, text, text) to service_role;

-- ============================================================================
-- ADMIN ROSTER v2: per-admin permission scopes, and a weekly quota window
-- ============================================================================
--
-- Idempotent additions on top of the tables/function above — safe to run
-- against a database that already has this file applied. Adds two things:
--
-- 1. admin_users.scopes: until now every admin_users row meant "full access
--    to everything requireAdmin gates" (a flat boolean). This adds named
--    permission scopes so the hardcoded main admin (identified by
--    MAIN_ADMIN_EMAIL, server/src/middleware/requireAdmin.ts — never a row
--    in this table, so it can never be revoked by anyone including itself)
--    can grant another admin a SUBSET of capabilities rather than all of
--    them. The valid scope names are enforced in application code
--    (server/src/middleware/requireAdmin.ts's SCOPES), not a DB check
--    constraint, so adding a new scope later never requires a migration.
--
-- 2. A weekly credit window, alongside the existing daily/monthly ones —
--    same lazy-reset pattern (a counter whose window has elapsed is zeroed
--    the first time it's touched after the window passes), using
--    date_trunc('week', now()) (ISO week, Monday start) for the boundary.

alter table public.admin_users add column if not exists scopes text[] not null default '{}';

alter table public.user_quota_overrides add column if not exists weekly_credits integer;
alter table public.premium_plans add column if not exists weekly_credits integer;

alter table public.credit_balances add column if not exists weekly_used numeric not null default 0;
alter table public.credit_balances add column if not exists weekly_reset_at timestamptz not null default now();

-- Adding a parameter changes the function's identity (Postgres identifies a
-- function by name + full parameter TYPE list, not a prefix of it) — even
-- with a default, `create or replace function` on a new signature creates a
-- SECOND overload rather than replacing the seven-argument original
-- (confirmed against production: both existed simultaneously, correctly
-- locked down, until the explicit drop below). The drop first makes this
-- file's re-application idempotent and converges to one function, matching
-- what every other statement in this section already does with
-- `if not exists`. Both the drop and the create are safe to run against a
-- database that already applied only the seven-argument version, or one
-- that's already been through this exact drop-then-create once before.
drop function if exists public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text);

-- The revoke/grant below re-states the same lockdown this function has
-- always had (§ "CREDIT ENGINE" above) against its new signature.
create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount numeric,
  p_daily_limit numeric,
  p_monthly_limit numeric,
  p_reason text,
  p_request_id uuid,
  p_note text default null,
  p_weekly_limit numeric default null
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_daily_used numeric;
  v_weekly_used numeric;
  v_monthly_used numeric;
  v_daily_reset timestamptz;
  v_weekly_reset timestamptz;
  v_monthly_reset timestamptz;
begin
  insert into public.credit_balances (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select balance, daily_used, weekly_used, monthly_used, daily_reset_at, weekly_reset_at, monthly_reset_at
    into v_balance, v_daily_used, v_weekly_used, v_monthly_used, v_daily_reset, v_weekly_reset, v_monthly_reset
    from public.credit_balances where user_id = p_user_id for update;

  if v_daily_reset < date_trunc('day', now()) then
    v_daily_used := 0;
    v_daily_reset := date_trunc('day', now());
  end if;
  if v_weekly_reset < date_trunc('week', now()) then
    v_weekly_used := 0;
    v_weekly_reset := date_trunc('week', now());
  end if;
  if v_monthly_reset < date_trunc('month', now()) then
    v_monthly_used := 0;
    v_monthly_reset := date_trunc('month', now());
  end if;

  if p_daily_limit is not null and v_daily_used + p_amount > p_daily_limit then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      weekly_used = v_weekly_used, weekly_reset_at = v_weekly_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'daily_limit_exceeded';
  end if;
  if p_weekly_limit is not null and v_weekly_used + p_amount > p_weekly_limit then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      weekly_used = v_weekly_used, weekly_reset_at = v_weekly_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'weekly_limit_exceeded';
  end if;
  if p_monthly_limit is not null and v_monthly_used + p_amount > p_monthly_limit then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      weekly_used = v_weekly_used, weekly_reset_at = v_weekly_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'monthly_limit_exceeded';
  end if;
  if v_balance < p_amount then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      weekly_used = v_weekly_used, weekly_reset_at = v_weekly_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'insufficient_balance';
  end if;

  update public.credit_balances
    set balance = v_balance - p_amount,
        daily_used = v_daily_used + p_amount,
        weekly_used = v_weekly_used + p_amount,
        monthly_used = v_monthly_used + p_amount,
        daily_reset_at = v_daily_reset,
        weekly_reset_at = v_weekly_reset,
        monthly_reset_at = v_monthly_reset,
        updated_at = now()
    where user_id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, request_id, note)
    values (p_user_id, -p_amount, p_reason, p_request_id, p_note);

  return 'ok';
end;
$$;

revoke execute on function public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text, numeric) to service_role;

-- ============================================================================
-- CREDENTIAL ROTATION: one credential row per (provider, label)
-- ============================================================================
--
-- credentialVault.storeCredential() upserts, but this table's only unique
-- constraint was its `id` primary key and the payload carried a freshly
-- generated `id` every call — so PostgREST's merge-duplicates resolution had
-- nothing that could ever collide, and every rotation INSERTED another row
-- instead of replacing the previous one. Both rows then carried
-- status='active' for the same (provider_id, label), and
-- getDecryptedCredential's `limit=1` has no ORDER BY, so PostgREST could
-- return either one: rotating away from a leaked or expired key was not
-- guaranteed to take effect.
--
-- Collapse any duplicates that already exist down to the newest row per
-- (provider_id, label), then add the unique constraint that gives the upsert
-- a real conflict target. storeCredential() no longer sends `id` at all, so
-- an insert takes the column default and an update keeps the existing id.
--
-- Idempotent: the delete is a no-op once there are no duplicates, and the
-- drop-then-add converges to exactly one constraint however many times it
-- runs.

delete from public.platform_provider_credentials a
  using public.platform_provider_credentials b
  where a.provider_id = b.provider_id
    and a.label = b.label
    and (a.created_at, a.id) < (b.created_at, b.id);

alter table public.platform_provider_credentials
  drop constraint if exists platform_provider_credentials_provider_label_key;
alter table public.platform_provider_credentials
  add constraint platform_provider_credentials_provider_label_key unique (provider_id, label);
