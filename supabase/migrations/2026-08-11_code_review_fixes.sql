-- ============================================================================
-- Migration: code-review fixes (PR #54)
-- ============================================================================
--
-- The database half of PR #54. Everything here also exists inside
-- supabase/schema.sql and supabase/schema_ai_engine.sql, which remain the
-- canonical full-schema files; this is the same change extracted so an
-- already-deployed project can apply just the delta instead of re-running
-- seven hundred lines that touch every table.
--
-- Safe to run against:
--   * a project still on the pre-account_status profiles table (is_approved),
--   * a project that already has account_status,
--   * a project that has already run this migration once.
-- Every statement is idempotent and the whole file is wrapped in a single
-- transaction, so a failure anywhere leaves the database untouched.
--
-- ORDER MATTERS: apply this BEFORE deploying the PR's application code.
-- credentialVault.storeCredential() now upserts with
-- `on_conflict=provider_id,label`, which PostgreSQL rejects with 42P10
-- ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") until section 3 below has created that constraint.

begin;

-- ----------------------------------------------------------------------------
-- 1. profiles.account_status must actually exist
-- ----------------------------------------------------------------------------
-- The column was only ever declared inside `create table if not exists`, so a
-- project whose profiles table predates it never received the column — while
-- handle_new_user() INSERTs into it and signIn() SELECTs it. The symptom is
-- total: every new signup fails inside the trigger, and every existing user is
-- rejected at login with "Scholar profile not found".
--
-- `add column if not exists` skips the entire statement, check constraint
-- included, when the column is already present.

alter table public.profiles
  add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'restricted', 'suspended', 'deleted'));

-- Carry forward any project still on the old boolean: an account that was
-- never approved becomes 'restricted' rather than silently 'active'. Runs only
-- where is_approved still exists, and only over rows left at the 'active'
-- default, so re-running it cannot overwrite an admin's later decision.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_approved'
  ) then
    execute $sql$
      update public.profiles
        set account_status = 'restricted'
        where is_approved = false and account_status = 'active'
    $sql$;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. account_status must be admin-only, enforced rather than asserted
-- ----------------------------------------------------------------------------
-- RLS decides which ROWS a role may update, never which COLUMNS. The
-- profiles_update_own policy therefore let a suspended user run
--     update public.profiles set account_status = 'active' where id = auth.uid();
-- and lift their own suspension — the exact opposite of what the schema's own
-- comment claimed. Two independent controls now enforce it:
--
--   a. Column-level UPDATE privileges. `authenticated` may write only the
--      self-service profile fields, so the statement above is rejected before
--      RLS is consulted. The one client-side writer is saveModelPreferences()
--      (src/services/supabaseAuthService.ts), which touches model_preferences
--      and updated_at — both granted.
--   b. A trigger, as a backstop for any later `grant` that widens (a) again.
--      Deliberately NOT security definer: current_user has to resolve to the
--      role that issued the UPDATE (PostgREST does `set local role`), which a
--      definer-rights function would mask with the function owner.
--
-- The service-role key used by server/ bypasses RLS and passes both, which is
-- the intended admin path.

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "api_credentials_all_own" on public.api_credentials;
create policy "api_credentials_all_own" on public.api_credentials
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke update on public.profiles from anon, authenticated;
grant update (username, full_name, phone, affiliation, authentic_id, model_preferences, updated_at)
  on public.profiles to authenticated;

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

-- ----------------------------------------------------------------------------
-- 3. One credential row per (provider, label), so rotation actually rotates
-- ----------------------------------------------------------------------------
-- credentialVault.storeCredential() upserts, but this table's only unique
-- constraint was its `id` primary key and the payload carried a freshly
-- generated id every call — so PostgREST's merge-duplicates resolution had
-- nothing that could ever collide, and every rotation INSERTED another row
-- rather than replacing the previous one. Both rows then carried
-- status='active' for the same (provider_id, label), and
-- getDecryptedCredential's `limit=1` has no ORDER BY, so PostgREST could
-- return either: rotating away from a leaked or expired key was not
-- guaranteed to take effect.
--
-- Collapse any duplicates that already exist down to the newest row per
-- (provider_id, label), then add the constraint that gives the upsert a real
-- conflict target.

delete from public.platform_provider_credentials a
  using public.platform_provider_credentials b
  where a.provider_id = b.provider_id
    and a.label = b.label
    and (a.created_at, a.id) < (b.created_at, b.id);

alter table public.platform_provider_credentials
  drop constraint if exists platform_provider_credentials_provider_label_key;
alter table public.platform_provider_credentials
  add constraint platform_provider_credentials_provider_label_key unique (provider_id, label);

commit;

-- ============================================================================
-- Verification — run separately after the transaction commits.
-- ============================================================================
-- Expect: account_status present; exactly one unique constraint on
-- (provider_id, label); the guard trigger installed; and `authenticated`
-- holding UPDATE on the self-service columns but NOT on account_status.
--
--   select column_name from information_schema.columns
--     where table_name = 'profiles' and column_name = 'account_status';
--
--   select conname from pg_constraint
--     where conrelid = 'public.platform_provider_credentials'::regclass
--       and contype = 'u';
--
--   select tgname from pg_trigger
--     where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
--   select column_name, privilege_type from information_schema.column_privileges
--     where table_name = 'profiles' and grantee = 'authenticated'
--       and privilege_type = 'UPDATE' order by column_name;
