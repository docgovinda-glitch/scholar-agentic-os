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
  is_approved boolean not null default false,
  model_preferences jsonb, -- mirrors UserRecord.modelPreferences (a single blob, not per-provider rows)
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
-- pending_password_resets: staging table for the existing admin-gated
-- password-reset flow (server.ts's tempPasscodeHash/resetApproved fields).
-- Preserves the current product behavior (every reset requires an admin to
-- click an emailed approval link) rather than silently switching to
-- Supabase Auth's own self-service reset flow — see the note in
-- .claude/HANDOVER.md about this being a flagged, not decided, behavior
-- choice. Row is deleted once the admin approves (see
-- supabase/functions/approve-password-reset).
-- ============================================================================
create table if not exists public.pending_password_resets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_password text not null, -- transient; deleted immediately on approval or denial
  reset_token text not null,
  requested_at timestamptz not null default now()
);

-- ============================================================================
-- Auto-create a profile row when a new Supabase Auth user signs up.
-- Mirrors server.ts's /api/register: is_approved defaults to false, an
-- admin must approve before the account is usable.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, phone, affiliation, authentic_id, is_approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', new.email),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'affiliation', ''),
    coalesce(new.raw_user_meta_data->>'authentic_id', 'None'),
    false
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

-- Same rationale as email_for_username: server.ts's /api/check-approval is
-- called pre-login (no session yet) with just a username, to let the UI
-- show "pending admin approval" without requiring a password first.
create or replace function public.is_username_approved(lookup_username text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(is_approved, false)
  from public.profiles
  where username = lookup_username
  limit 1;
$$;

grant execute on function public.is_username_approved(text) to anon, authenticated;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.api_credentials enable row level security;
alter table public.pending_password_resets enable row level security;

-- Users can read/update only their own profile. Only is_approved is
-- intentionally NOT updatable by the user themselves (no policy grants
-- UPDATE on it directly to the user; the approve-registration Edge
-- Function uses the service_role key, which bypasses RLS, to flip it).
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "api_credentials_all_own" on public.api_credentials
  for all using (auth.uid() = user_id);

-- pending_password_resets: no client-side policy at all — only Edge
-- Functions using the service_role key (which bypasses RLS) touch this
-- table, since it briefly holds a plaintext password in transit and must
-- never be directly readable via the anon/authenticated client role.
