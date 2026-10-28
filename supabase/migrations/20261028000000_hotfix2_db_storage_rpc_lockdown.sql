-- ============================================================================
-- Hotfix 2: Database, Storage, and RPC Lockdown (F-02, F-03, F-14)
-- ============================================================================
-- 1. F-02: Enable Row Level Security on project_research_gaps, project_titles,
--    and project_journal_candidates, and revoke direct anon/authenticated
--    table privileges (all backend access uses service_role).
-- 2. F-03: Make ALL storage buckets (including project-files and id-documents)
--    private (public = false) and drop all anonymous/direct-client policies on
--    storage.objects. All file uploads and short-lived signed URL downloads are
--    served exclusively through Express after project/user ownership checks.
-- 3. F-14: Revoke PUBLIC, anon, and authenticated EXECUTE privileges on the 6
--    account-lookup and availability SECURITY DEFINER RPCs (email_for_username,
--    email_for_phone_e164, email_for_identifier, check_username_available,
--    check_email_available, check_phone_available) and submit_id_document,
--    restricting them strictly to service_role.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Enable RLS on the 3 unprotected agentic pipeline tables (F-02)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.project_research_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_journal_candidates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_research_gaps') THEN
    REVOKE ALL ON TABLE public.project_research_gaps FROM PUBLIC, anon, authenticated;
    GRANT ALL ON TABLE public.project_research_gaps TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_titles') THEN
    REVOKE ALL ON TABLE public.project_titles FROM PUBLIC, anon, authenticated;
    GRANT ALL ON TABLE public.project_titles TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_journal_candidates') THEN
    REVOKE ALL ON TABLE public.project_journal_candidates FROM PUBLIC, anon, authenticated;
    GRANT ALL ON TABLE public.project_journal_candidates TO service_role;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Storage Lockdown: make all buckets private & drop client policies (F-03)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    UPDATE storage.buckets
    SET public = false
    WHERE public = true OR id IN ('project-files', 'id-documents');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    -- Drop unrestricted policies on project-files (20260820130000_project_files_bucket.sql)
    DROP POLICY IF EXISTS "project_files_insert" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_select" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_update" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_delete" ON storage.objects;

    -- Drop direct client policies on id-documents (20260813000000_unified_account_profile.sql)
    DROP POLICY IF EXISTS "id_documents_insert_own" ON storage.objects;
    DROP POLICY IF EXISTS "id_documents_select_own" ON storage.objects;
    DROP POLICY IF EXISTS "id_documents_update_own" ON storage.objects;
    DROP POLICY IF EXISTS "id_documents_delete_own" ON storage.objects;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Ensure RPCs exist for service_role and revoke anon/authenticated (F-14)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_for_username(lookup_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT au.email
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.username = lookup_username
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.email_for_phone_e164(lookup_phone_e164 text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT au.email
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE p.phone_e164 = lookup_phone_e164
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.email_for_identifier(lookup_identifier text)
RETURNS TABLE(email text, found_by text)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  (SELECT au.email, 'username'::text AS found_by
   FROM public.profiles p
   JOIN auth.users au ON au.id = p.id
   WHERE p.username = lookup_identifier
   LIMIT 1)
  UNION ALL
  (SELECT au.email, 'email'::text AS found_by
   FROM auth.users au
   WHERE au.email = lookup_identifier
   LIMIT 1)
  UNION ALL
  (SELECT au.email, 'phone'::text AS found_by
   FROM public.profiles p
   JOIN auth.users au ON au.id = p.id
   WHERE p.phone_e164 = lookup_identifier
     AND lookup_identifier LIKE '+%'
   LIMIT 1);
$$;

CREATE OR REPLACE FUNCTION public.check_username_available(lookup_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username = lookup_username
  );
$$;

CREATE OR REPLACE FUNCTION public.check_email_available(lookup_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE email = lookup_email
  );
$$;

CREATE OR REPLACE FUNCTION public.check_phone_available(lookup_phone_e164 text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE phone_e164 = lookup_phone_e164
      AND phone_e164 IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.email_for_username(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_username(text) TO service_role;

REVOKE ALL ON FUNCTION public.email_for_phone_e164(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_phone_e164(text) TO service_role;

REVOKE ALL ON FUNCTION public.email_for_identifier(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_for_identifier(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_username_available(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_email_available(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_available(text) TO service_role;

REVOKE ALL ON FUNCTION public.check_phone_available(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_phone_available(text) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_id_document'
  ) THEN
    REVOKE ALL ON FUNCTION public.submit_id_document(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.submit_id_document(text) TO service_role;
  END IF;
END $$;

COMMIT;
