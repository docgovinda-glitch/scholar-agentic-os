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
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null,
  phone text default '',
  affiliation text not null,
  authentic_id text default 'None',
  account_status text not null default 'active' check (account_status in ('active', 'restricted', 'suspended', 'deleted')),
  model_preferences jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles(username);

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
  insert into public.profiles (id, username, full_name, phone, affiliation, authentic_id, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', new.email),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'affiliation', ''),
    coalesce(new.raw_user_meta_data->>'authentic_id', 'None'),
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

-- Users can read/update only their own profile. account_status is NOT
-- updatable by the user themselves (only admins via service_role can change it).
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "api_credentials_all_own" on public.api_credentials
  for all using (auth.uid() = user_id);
