-- Supabase schema for Scholar Agentic OS
-- Phase 1 (docs/planning/hosting-and-topology.md) — replaces server.ts's
-- users.json + inline AES-256-CBC encryption with Supabase Auth + Postgres.
--
-- Modeled on the ACTUAL runtime shape in server.ts's UserRecord interface and
-- users.json (verified against the running code), not the older, stale
-- database_schema.sql (which predates this migration and was never wired
-- into the live app — it omits tempPasscodeHash/resetApproved, and folds
-- model preferences and per-provider API keys into a single table in a way
-- that doesn't match how server.ts actually stores them).
--
-- Run this in the Supabase SQL Editor once a project exists. Requires no
-- extensions beyond what a default Supabase project already has (auth.users
-- is built in).

-- ============================================================================
-- profiles: one row per Supabase Auth user, mirrors UserRecord's
-- non-credential fields. Auth itself (email/password) is owned by
-- Supabase's built-in auth.users — we never store or compare passwords here.
-- ============================================================================
-- Institutional ID (2026-08-14: removed completely — see
-- supabase/migrations/2026-08-14_account_system_repair.sql's header for
-- why) is not a column here. affiliation (Institution) is nullable: not
-- every user belongs to one. phone_country_code + phone_e164 (generated)
-- carry the country-code selector's structured phone; user_type/
-- education_level are the two role/level dropdowns, each backed by a CHECK
-- constraint naming the exact same values as src/config/accountSchema.ts.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  phone text default '',
  phone_country_code text not null default '',
  phone_e164 text generated always as (
    case
      when phone_country_code <> '' and phone <> ''
        then phone_country_code || regexp_replace(phone, '\D', '', 'g')
      else null
    end
  ) stored,
  affiliation text,
  user_type text check (user_type is null or user_type in (
    'student', 'teacher_faculty', 'administrator', 'freelance_researcher'
  )),
  education_level text check (education_level is null or education_level in (
    'secondary', 'undergraduate', 'masters', 'mphil', 'phd',
    'postdoctoral', 'faculty_academic', 'other'
  )),
  account_status text not null default 'active' check (account_status in ('active', 'restricted', 'suspended', 'deleted')),
  model_preferences jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles(username);

-- account_status was added to the create-table above only AFTER this file's
-- first deployments, so on any database that already has a profiles table
-- the `create table if not exists` is a no-op and the column would never
-- appear — while handle_new_user() below INSERTs into it and signIn()
-- (src/services/supabaseAuthService.ts) SELECTs it. Without this backfill
-- every new signup fails inside the trigger and every existing user gets
-- "Scholar profile not found" at login. Idempotent: when the column is
-- already present the whole statement, check constraint included, is
-- skipped, so this is safe to re-run alongside the rest of the file.
--
-- The same "an existing deployment won't pick up a bare CREATE TABLE
-- change" problem applies to every column added since — see
-- supabase/migrations/2026-08-14_account_system_repair.sql for the
-- idempotent ALTER TABLE statements an already-deployed project needs to
-- run to reach this same shape (that migration is also what fixed the
-- production "column profiles.phone_country_code does not exist" error:
-- an earlier migration adding these columns was written and verified
-- locally but never actually applied to the live database).
alter table public.profiles
  add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'restricted', 'suspended', 'deleted'));

-- ============================================================================
-- api_credentials: normalizes UserRecord.encryptedApiKeys / apiKeyHashes
-- (previously two parallel {[provider]: string} maps) into one row per
-- (user, provider). The encrypted value stored here is still
-- application-encrypted client-side (src/utils/crypto.ts's AES-GCM,
-- documented in ai-gateway.md) before it reaches Supabase — Supabase is not
-- relied on as the only layer of protection for these keys.
-- ============================================================================
create table if not exists public.api_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  encrypted_api_key text not null,
  api_key_hash text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);


-- ============================================================================
-- Auto-create a profile row when a new Supabase Auth user signs up.
-- AUTOMATIC ACCOUNT ACTIVATION: account_status defaults to 'active' (no manual
-- admin approval required). Accounts are immediately usable after email
-- verification. Automated abuse protection (CAPTCHA, rate limiting, email
-- verification) provides security without manual intervention.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, username, full_name, phone, phone_country_code, affiliation,
    user_type, education_level, account_status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', new.email),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'phone_country_code', ''),
    nullif(new.raw_user_meta_data->>'affiliation', ''),
    nullif(new.raw_user_meta_data->>'user_type', ''),
    nullif(new.raw_user_meta_data->>'education_level', ''),
    'active'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Username -> email lookup for login. The app's UI logs users in by
-- username (server.ts's /api/verify-and-sync-profile), but Supabase Auth's
-- signInWithPassword requires an email. RLS intentionally blocks anonymous
-- SELECTs on profiles (see below), so this narrowly-scoped, security-definer
-- function is the one sanctioned way to do that lookup pre-authentication —
-- it returns only an email (never password/approval/other profile fields),
-- keeping the rest of RLS tight everywhere else.
-- ============================================================================
create or replace function public.email_for_username(lookup_username text)
returns text
language sql
security definer set search_path = public
stable
as $$
  select au.email
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.username = lookup_username
  limit 1;
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;


-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.api_credentials enable row level security;

-- Users can read/update only their own profile. `drop policy if exists`
-- before each create keeps this section re-runnable against a database that
-- already has an earlier version of these policies.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "api_credentials_all_own" on public.api_credentials;
create policy "api_credentials_all_own" on public.api_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- account_status is admin-only, enforced for real.
-- ----------------------------------------------------------------------------
-- RLS decides which ROWS a role may update, never which COLUMNS. So
-- profiles_update_own above — on its own, as this file previously shipped —
-- let a suspended user run
--     update public.profiles set account_status = 'active' where id = auth.uid();
-- and lift their own suspension, even though the comment here claimed
-- otherwise. Two independent controls now enforce the claim:
--
-- 1. Column-level UPDATE privileges. `authenticated` may write only the
--    self-service profile fields; account_status is simply not among them,
--    so the update above is rejected before RLS is even consulted. The one
--    client-side writer is saveModelPreferences()
--    (src/services/supabaseAuthService.ts), which touches model_preferences
--    and updated_at — both granted below.
-- 2. A trigger, as a backstop, in case a later `grant` widens (1) again.
--    Deliberately NOT `security definer`: current_user must resolve to the
--    role that actually issued the UPDATE (PostgREST does `set local role`),
--    which a definer-rights function would mask with the function owner.
--
-- The service-role key used by server/ (admin suspension, requireAdmin-gated)
-- bypasses RLS and passes both checks, which is exactly the intended path.

revoke update on public.profiles from anon, authenticated;
grant update (
  username, full_name, phone, phone_country_code, affiliation,
  user_type, education_level, model_preferences, updated_at
) on public.profiles to authenticated;

create or replace function public.enforce_account_status_admin_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_status is distinct from old.account_status
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'account_status can only be changed by an administrator'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_account_status_guard on public.profiles;
create trigger profiles_account_status_guard
  before update on public.profiles
  for each row execute procedure public.enforce_account_status_admin_only();
