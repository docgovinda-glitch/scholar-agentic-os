-- Account system repair.
--
-- ROOT CAUSE this migration fixes: the previous migration
-- (2026-08-13_unified_account_profile.sql) was written and verified against
-- a local scratch Postgres instance, but was NEVER ACTUALLY APPLIED to the
-- production database. Confirmed directly against production before writing
-- this file: `information_schema.columns` for public.profiles has no
-- phone_country_code/phone_e164/user_type/education_level columns at all,
-- and public.handle_new_user()'s live definition is still an EARLIER
-- version than what is even in supabase/schema.sql — it still inserts a
-- legacy `is_approved` column and has never referenced `account_status`,
-- `phone_country_code`, `user_type`, or `education_level`. This is exactly
-- what produced the "column profiles.phone_country_code does not exist"
-- error: the application code (already updated to expect the new schema)
-- was reading and writing columns the live database genuinely never had.
--
-- This migration is written directly against that CONFIRMED PRODUCTION
-- STATE (not against supabase/schema.sql's aspirational one) and is
-- idempotent throughout, so it is safe to run regardless of which pieces of
-- prior migrations did or did not actually land.
--
-- Also implements the account-system product changes in this pass:
--   - Institutional ID removed completely: authentic_id column dropped.
--   - Institution (affiliation) made optional: NOT NULL constraint dropped.
--   - user_type narrowed to exactly the four roles requested (previously
--     unset in production; no existing data to migrate).
--   - No institutional-ID-document/verification-state columns are created —
--     that whole feature was removed, not merely never-applied.

-- ============================================================================
-- 1. account_status — confirmed present in production already, but this
--    stays here, idempotent, so this file is a complete, standalone repair
--    regardless of what already landed.
-- ============================================================================
alter table public.profiles
  add column if not exists account_status text not null default 'active'
  check (account_status in ('active', 'restricted', 'suspended', 'deleted'));

-- ============================================================================
-- 2. New profile columns — confirmed ABSENT in production; this is the
--    actual fix for the reported error.
-- ============================================================================
alter table public.profiles
  add column if not exists phone_country_code text not null default '';

alter table public.profiles
  add column if not exists user_type text;

alter table public.profiles
  add column if not exists education_level text;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_user_type_check') then
    alter table public.profiles drop constraint profiles_user_type_check;
  end if;
  alter table public.profiles
    add constraint profiles_user_type_check
    check (user_type is null or user_type in (
      'student', 'teacher_faculty', 'administrator', 'freelance_researcher'
    ));
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_education_level_check'
  ) then
    alter table public.profiles
      add constraint profiles_education_level_check
      check (education_level is null or education_level in (
        'secondary', 'undergraduate', 'masters', 'mphil', 'phd',
        'postdoctoral', 'faculty_academic', 'other'
      ));
  end if;
end $$;

-- E.164 form of phone_country_code + phone, generated so the two parts can
-- never drift from the composite. NULL until both halves are present.
alter table public.profiles drop column if exists phone_e164;
alter table public.profiles
  add column phone_e164 text generated always as (
    case
      when phone_country_code <> '' and phone <> ''
        then phone_country_code || regexp_replace(phone, '\D', '', 'g')
      else null
    end
  ) stored;

-- ============================================================================
-- 3. Institution (affiliation) becomes optional — not every user belongs to
--    one. Confirmed NOT NULL in production; drop it. Existing rows already
--    satisfy NOT NULL (they have a value or the '' the old trigger wrote),
--    so this is a pure widening, never a data problem.
-- ============================================================================
alter table public.profiles alter column affiliation drop not null;

-- ============================================================================
-- 4. Institutional ID removed completely — drop the column. Confirmed
--    present in production (nullable, default 'None', no self-service
--    write path anywhere in the app after this pass) with no other table
--    referencing it; dropping it also removes its column-level grants
--    automatically, and its former document-upload/verification-state
--    counterparts (id_verification_status, id_document_path,
--    id_document_uploaded_at, the id-documents storage bucket,
--    submit_id_document()) were never created in production in the first
--    place, per the root-cause note above, so there is nothing to clean up
--    for those — this migration simply never creates them.
-- ============================================================================
alter table public.profiles drop column if exists authentic_id;

-- ============================================================================
-- 5. handle_new_user() — rewritten to match BOTH the current application
--    code and the confirmed production schema. The live version in
--    production before this migration still referenced the legacy
--    `is_approved` column and never wrote account_status/phone_country_code/
--    user_type/education_level at all; this replaces it outright.
--    `is_approved` is left alone (not referenced here, satisfied by its own
--    column default) — it is unused by the app but out of scope to remove
--    in this pass, and omitting it from the INSERT list is exactly what
--    lets its own DEFAULT satisfy its NOT NULL constraint.
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
-- 6. account_status admin-only guard — re-asserted idempotently in case it
--    did not fully land either; harmless to re-run if it already did.
-- ============================================================================
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

-- ============================================================================
-- 7. RLS policies — re-asserted idempotently to guarantee the exact shape
--    the application relies on (own-row-only select/update).
-- ============================================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ============================================================================
-- 8. Column grants — the authoritative, final list of what a signed-in user
--    may write on their own row. Replaces whatever grant set predates this
--    migration outright (revoke-then-grant, not additive), so a stale grant
--    on a column the app no longer uses (e.g. authentic_id, already gone
--    with the column anyway) can never linger. account_status is
--    deliberately absent — see enforce_account_status_admin_only() above.
-- ============================================================================
revoke update on public.profiles from anon, authenticated;
grant update (
  username, full_name, phone, phone_country_code, affiliation,
  user_type, education_level, model_preferences, updated_at
) on public.profiles to authenticated;
