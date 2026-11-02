-- T9: bring the repo's schema and production's into line.
--
-- Found by comparing production with a fresh replay of every migration
-- (scripts/db/schema-diff.sh, 2026-11-02):
--
-- 1. Five tables exist only in production, created outside the migration
--    history and used by no code: pending_password_resets (the removed
--    admin-approved password reset; it had a plain-text new_password column)
--    and pocket_approvals, pocket_chat_messages, pocket_comments,
--    pocket_push_subscriptions (the pocket tables let any signed-in user
--    insert rows). All five were empty when checked. They are dropped, but
--    only if still empty: this migration refuses to run if any has rows.
--
-- 2. The ID-document upload objects (profiles.id_verification_status,
--    id_document_path, id_document_uploaded_at, submit_id_document(), the
--    id-documents bucket and its storage policies) were never created in
--    production (see 20260814000000), but earlier migrations create them in
--    a fresh replay. They are removed where present, so a replay matches
--    production; in production this part changes nothing.
--
-- Not changed: profiles.is_approved (production-only legacy column, unused,
-- NOT NULL DEFAULT false) and is_username_approved() (production-only legacy
-- function, execute revoked from anon/authenticated in 20261029020000).

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['pending_password_resets', 'pocket_approvals', 'pocket_chat_messages', 'pocket_comments', 'pocket_push_subscriptions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'public.% has % row(s); not dropping it (never delete user data)', t, n;
      end if;
      execute format('drop table public.%I', t);
    end if;
  end loop;
end $$;

drop function if exists public.submit_id_document(text);

alter table public.profiles drop constraint if exists profiles_id_verification_status_check;
alter table public.profiles drop column if exists id_verification_status;
alter table public.profiles drop column if exists id_document_path;
alter table public.profiles drop column if exists id_document_uploaded_at;

drop policy if exists "id_documents_select_own" on storage.objects;
drop policy if exists "id_documents_insert_own" on storage.objects;
drop policy if exists "id_documents_update_own" on storage.objects;
drop policy if exists "id_documents_delete_own" on storage.objects;

do $$
begin
  -- Only when the bucket exists and is empty (storage refuses deletes otherwise).
  if exists (select 1 from storage.buckets where id = 'id-documents')
     and not exists (select 1 from storage.objects where bucket_id = 'id-documents') then
    -- Supabase's storage.protect_delete() refuses direct deletes unless this
    -- is set; it is set for this transaction only, for an empty bucket.
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.buckets where id = 'id-documents';
  end if;
end $$;
