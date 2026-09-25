-- Migration: 20260924180000_project_cascade_delete.sql
-- Description: Enforce ON DELETE CASCADE across all child tables referencing public.projects
-- and add a BEFORE DELETE trigger on public.projects for atomic, bulletproof cascade cleanup.

-- 1. Ensure foreign key constraints on all child tables specify ON DELETE CASCADE
DO $$
BEGIN
  -- project_sources
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_sources') THEN
    ALTER TABLE public.project_sources DROP CONSTRAINT IF EXISTS project_sources_project_id_fkey;
    ALTER TABLE public.project_sources DROP CONSTRAINT IF EXISTS fk_project_sources_project_id;
    ALTER TABLE public.project_sources 
      ADD CONSTRAINT project_sources_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_evidence
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_evidence') THEN
    ALTER TABLE public.project_evidence DROP CONSTRAINT IF EXISTS project_evidence_project_id_fkey;
    ALTER TABLE public.project_evidence DROP CONSTRAINT IF EXISTS fk_project_evidence_project_id;
    ALTER TABLE public.project_evidence 
      ADD CONSTRAINT project_evidence_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_evidence_items
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_evidence_items') THEN
    ALTER TABLE public.project_evidence_items DROP CONSTRAINT IF EXISTS project_evidence_items_project_id_fkey;
    ALTER TABLE public.project_evidence_items DROP CONSTRAINT IF EXISTS fk_project_evidence_items_project_id;
    ALTER TABLE public.project_evidence_items 
      ADD CONSTRAINT project_evidence_items_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_claims
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_claims') THEN
    ALTER TABLE public.project_claims DROP CONSTRAINT IF EXISTS project_claims_project_id_fkey;
    ALTER TABLE public.project_claims DROP CONSTRAINT IF EXISTS fk_project_claims_project_id;
    ALTER TABLE public.project_claims 
      ADD CONSTRAINT project_claims_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_claim_bindings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_claim_bindings') THEN
    ALTER TABLE public.project_claim_bindings DROP CONSTRAINT IF EXISTS project_claim_bindings_project_id_fkey;
    ALTER TABLE public.project_claim_bindings DROP CONSTRAINT IF EXISTS fk_project_claim_bindings_project_id;
    ALTER TABLE public.project_claim_bindings 
      ADD CONSTRAINT project_claim_bindings_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- manuscript_sections
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manuscript_sections') THEN
    ALTER TABLE public.manuscript_sections DROP CONSTRAINT IF EXISTS manuscript_sections_project_id_fkey;
    ALTER TABLE public.manuscript_sections DROP CONSTRAINT IF EXISTS fk_manuscript_sections_project_id;
    ALTER TABLE public.manuscript_sections 
      ADD CONSTRAINT manuscript_sections_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- peer_review_critiques
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'peer_review_critiques') THEN
    ALTER TABLE public.peer_review_critiques DROP CONSTRAINT IF EXISTS peer_review_critiques_project_id_fkey;
    ALTER TABLE public.peer_review_critiques DROP CONSTRAINT IF EXISTS fk_peer_review_critiques_project_id;
    ALTER TABLE public.peer_review_critiques 
      ADD CONSTRAINT peer_review_critiques_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- manuscript_versions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manuscript_versions') THEN
    ALTER TABLE public.manuscript_versions DROP CONSTRAINT IF EXISTS manuscript_versions_project_id_fkey;
    ALTER TABLE public.manuscript_versions DROP CONSTRAINT IF EXISTS fk_manuscript_versions_project_id;
    ALTER TABLE public.manuscript_versions 
      ADD CONSTRAINT manuscript_versions_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_research_gaps
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_research_gaps') THEN
    ALTER TABLE public.project_research_gaps DROP CONSTRAINT IF EXISTS project_research_gaps_project_id_fkey;
    ALTER TABLE public.project_research_gaps DROP CONSTRAINT IF EXISTS fk_project_research_gaps_project_id;
    ALTER TABLE public.project_research_gaps 
      ADD CONSTRAINT project_research_gaps_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_titles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_titles') THEN
    ALTER TABLE public.project_titles DROP CONSTRAINT IF EXISTS project_titles_project_id_fkey;
    ALTER TABLE public.project_titles DROP CONSTRAINT IF EXISTS fk_project_titles_project_id;
    ALTER TABLE public.project_titles 
      ADD CONSTRAINT project_titles_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_journal_candidates
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_journal_candidates') THEN
    ALTER TABLE public.project_journal_candidates DROP CONSTRAINT IF EXISTS project_journal_candidates_project_id_fkey;
    ALTER TABLE public.project_journal_candidates DROP CONSTRAINT IF EXISTS fk_project_journal_candidates_project_id;
    ALTER TABLE public.project_journal_candidates 
      ADD CONSTRAINT project_journal_candidates_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_activity
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_activity') THEN
    ALTER TABLE public.project_activity DROP CONSTRAINT IF EXISTS project_activity_project_id_fkey;
    ALTER TABLE public.project_activity DROP CONSTRAINT IF EXISTS fk_project_activity_project_id;
    ALTER TABLE public.project_activity 
      ADD CONSTRAINT project_activity_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;

  -- project_files
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_files') THEN
    ALTER TABLE public.project_files DROP CONSTRAINT IF EXISTS project_files_project_id_fkey;
    ALTER TABLE public.project_files DROP CONSTRAINT IF EXISTS fk_project_files_project_id;
    ALTER TABLE public.project_files 
      ADD CONSTRAINT project_files_project_id_fkey 
      FOREIGN KEY (project_id) REFERENCES public.projects(project_id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Trigger function to atomically clean up any loosely coupled child records
CREATE OR REPLACE FUNCTION public.handle_project_delete_cascade()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_claim_binding_evidence') THEN
    DELETE FROM public.project_claim_binding_evidence WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_claim_bindings') THEN
    DELETE FROM public.project_claim_bindings WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_claims') THEN
    DELETE FROM public.project_claims WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_evidence_items') THEN
    DELETE FROM public.project_evidence_items WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_evidence') THEN
    DELETE FROM public.project_evidence WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_sources') THEN
    DELETE FROM public.project_sources WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manuscript_sections') THEN
    DELETE FROM public.manuscript_sections WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'peer_review_critiques') THEN
    DELETE FROM public.peer_review_critiques WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manuscript_versions') THEN
    DELETE FROM public.manuscript_versions WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_research_gaps') THEN
    DELETE FROM public.project_research_gaps WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_titles') THEN
    DELETE FROM public.project_titles WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_journal_candidates') THEN
    DELETE FROM public.project_journal_candidates WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_activity') THEN
    DELETE FROM public.project_activity WHERE project_id = OLD.project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_files') THEN
    DELETE FROM public.project_files WHERE project_id = OLD.project_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_project_delete_cascade ON public.projects;
CREATE TRIGGER tr_project_delete_cascade
  BEFORE DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_project_delete_cascade();

-- 3. Ensure Row-Level Security allows owners to delete their own projects directly
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_delete_owner" ON public.projects;
CREATE POLICY "projects_delete_owner" ON public.projects
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
