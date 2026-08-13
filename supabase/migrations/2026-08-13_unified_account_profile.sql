-- Unified Account Registration & Settings — Single Source of Truth.
--
-- Extends public.profiles with the fields Create Account and Account
-- Settings now share (src/config/accountSchema.ts, src/config/countries.ts):
-- structured phone (country code + local number + a DB-generated E.164
-- form), user_type, education_level, and institutional-ID verification
-- state. Every enum here names the exact same values as its client-side
-- counterpart in accountSchema.ts — that pairing IS the single source of
-- truth; a client validator alone would only stop this app's own UI from
-- submitting a bad value, not a direct PostgREST call.
--
-- All new columns are nullable / defaulted, never `not null` outright: this
-- runs against a database that already has real rows (see schema.sql's own
-- account_status backfill comment for why that constraint matters here too).
--
-- Run this after supabase/schema.sql. Idempotent — safe to re-run.

-- ============================================================================
-- Columns
-- ============================================================================
alter table public.profiles
  add column if not exists phone_country_code text not null default '';

alter table public.profiles
  add column if not exists user_type text;

alter table public.profiles
  add column if not exists education_level text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_user_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_user_type_check
      check (user_type is null or user_type in (
        'student', 'teacher_faculty', 'administrator', 'freelance_researcher',
        'independent_researcher', 'research_professional', 'other'
      ));
  end if;
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

-- Institutional ID verification (src/config/accountSchema.ts's
-- VERIFICATION_STATUSES). System-controlled: see the grant section below —
-- authenticated users get no column privilege on this at all, only the
-- submit_id_document() function can move it, and only to
-- 'pending_verification'.
alter table public.profiles
  add column if not exists id_verification_status text not null default 'verification_required';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_id_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_id_verification_status_check
      check (id_verification_status in (
        'verification_required', 'pending_verification', 'verified', 'rejected'
      ));
  end if;
end $$;

alter table public.profiles
  add column if not exists id_document_path text;

alter table public.profiles
  add column if not exists id_document_uploaded_at timestamptz;

-- E.164 form of phone_country_code + phone, generated so the two parts can
-- never drift from the composite the way two independently-written columns
-- could. NULL until both halves are present.
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
-- handle_new_user(): read the new fields out of raw_user_meta_data too.
-- id_verification_status is deliberately NOT set from client metadata here —
-- it always starts at the column default ('verification_required'); the
-- document itself can only be attached after email verification (no session
-- exists between signUp() and the confirmation email being clicked — see
-- submit_id_document() below), so a brand-new row can never claim otherwise.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
    id, username, full_name, phone, phone_country_code, affiliation,
    authentic_id, user_type, education_level, account_status
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', new.email),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'phone_country_code', ''),
    coalesce(new.raw_user_meta_data->>'affiliation', ''),
    coalesce(new.raw_user_meta_data->>'authentic_id', 'None'),
    nullif(new.raw_user_meta_data->>'user_type', ''),
    nullif(new.raw_user_meta_data->>'education_level', ''),
    'active'
  );
  return new;
end;
$$;

-- ============================================================================
-- Column grants — extend the user-editable set with the new self-service
-- fields, same pattern as schema.sql's own "account_status is admin-only"
-- section. id_verification_status / id_document_path / id_document_uploaded_at
-- are intentionally absent: the only way a signed-in user can move them is
-- submit_id_document() below, never a direct UPDATE. phone_e164 is a
-- generated column and cannot be granted at all — Postgres computes it.
-- ============================================================================
revoke update on public.profiles from anon, authenticated;
grant update (
  username, full_name, phone, phone_country_code, affiliation, authentic_id,
  user_type, education_level, model_preferences, updated_at
) on public.profiles to authenticated;

-- ============================================================================
-- submit_id_document(): the one sanctioned way a signed-in user attaches an
-- institutional ID document to their own profile. SECURITY DEFINER because
-- the columns it writes are deliberately not in the grant above; scoped to
-- auth.uid() so it can only ever touch the caller's own row, and it only
-- ever lands on 'pending_verification' — 'verified'/'rejected' remain
-- reachable only via the service-role key (admin review), matching how
-- account_status's admin-only path already works.
-- ============================================================================
create or replace function public.submit_id_document(document_path text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;
  if document_path is null or length(trim(document_path)) = 0 then
    raise exception 'document_path is required' using errcode = 'invalid_parameter_value';
  end if;

  update public.profiles
  set id_document_path = document_path,
      id_document_uploaded_at = now(),
      id_verification_status = 'pending_verification',
      updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.submit_id_document(text) from public;
grant execute on function public.submit_id_document(text) to authenticated;

-- ============================================================================
-- Storage: private bucket for institutional ID documents. Objects are keyed
-- "{user_id}/{filename}" and RLS scopes every operation to that first path
-- segment matching the caller's own auth.uid() — the same "own row only"
-- shape as the profiles policies above. No public read: admin review and the
-- upload confirmation both go through signed URLs / server-side calls with
-- the service-role key, never a public bucket URL.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'id-documents', 'id-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "id_documents_insert_own" on storage.objects;
create policy "id_documents_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "id_documents_select_own" on storage.objects;
create policy "id_documents_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "id_documents_update_own" on storage.objects;
create policy "id_documents_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "id_documents_delete_own" on storage.objects;
create policy "id_documents_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'id-documents' and (storage.foldername(name))[1] = auth.uid()::text);
