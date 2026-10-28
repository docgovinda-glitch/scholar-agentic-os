-- ============================================================================
-- Hotfix 2: Database, Storage, and RPC Lockdown (F-02, F-03, F-14)
-- ============================================================================
-- 1. F-02: Enable Row Level Security on project_research_gaps, project_titles,
--    and project_journal_candidates, and revoke direct anon/authenticated
--    table privileges (all backend access uses service_role).
-- 2. F-03: Make ALL storage buckets (including project-files, id-documents,
--    and vault-files) private (public = false) and drop the unrestricted
--    project_files_* policies on storage.objects. Keep id_documents_*_own
--    folder-scoped policies ((storage.foldername(name))[1] = auth.uid()::text)
--    intact on the now-private id-documents bucket.
-- 3. F-14: Revoke PUBLIC, anon, and authenticated EXECUTE privileges on the 6
--    account-lookup and availability SECURITY DEFINER RPCs (email_for_username,
--    email_for_phone_e164, email_for_identifier, check_username_available,
--    check_email_available, check_phone_available) and submit_id_document,
--    restricting them strictly to service_role. Only REVOKE and GRANT are
--    executed; existing function definitions remain untouched.
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
-- 2. Storage Lockdown: make all buckets private & drop open project-files policies (F-03)
--    Note: id_documents_*_own policies (scoped to (storage.foldername(name))[1] = auth.uid()::text)
--    are intentionally retained on the now-private id-documents bucket.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'buckets') THEN
    UPDATE storage.buckets
    SET public = false
    WHERE public = true OR id IN ('project-files', 'id-documents', 'vault-files');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    -- Drop unrestricted policies on project-files (20260820130000_project_files_bucket.sql)
    DROP POLICY IF EXISTS "project_files_insert" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_select" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_update" ON storage.objects;
    DROP POLICY IF EXISTS "project_files_delete" ON storage.objects;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Revoke PUBLIC, anon, and authenticated EXECUTE on account RPCs (F-14)
--    Only REVOKE / GRANT is performed; no function bodies are replaced.
-- ----------------------------------------------------------------------------
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
