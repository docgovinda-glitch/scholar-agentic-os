-- ============================================================================
-- Migration: project delete hygiene + safe cleanup of empty cloned projects
-- ============================================================================
-- 1. presentation_decks.project_id has no foreign key on purpose (a deck can
--    exist without a project, and the column may hold an id the server never
--    persisted), so deleting a project left its decks behind. An AFTER DELETE
--    trigger now removes decks linked to the deleted project. Every other
--    child of public.projects already cascades (20260924180000,
--    20261113180000; checked with a full replay on Postgres 16).
--
-- 2. Older browser builds could "commit" an already-persisted proj-* id a
--    second time, creating an empty clone row. find_empty_project_clones()
--    lists only rows that are provably empty clones:
--      - no document, no submissions, no claim graph, no evidence, no
--        assignment state, and no answers other than a title;
--      - no rows in any content table (sources, manuscript sections, files,
--        coursework outline/draft/files, decks);
--      - another project of the same owner and output type exists that was
--        created up to 10 minutes EARLIER (the original), so the first row of
--        a format is never a candidate.
--    delete_empty_project_clones(dry_run) deletes exactly those rows, and only
--    when called with dry_run => false. Nothing is deleted by this migration.
--    Both functions are callable by service_role only.
--
-- RLS note (no change here): public.projects has an owner DELETE policy but
-- no client SELECT policy, so a delete sent with the user's own JWT matches 0
-- rows. Projects are deleted only by the server route (service role, owner
-- checked, and it now fails when no row was removed); the browser's direct
-- table delete was removed in the same change.
--
-- Idempotent. Rollback:
--   DROP TRIGGER IF EXISTS tr_project_delete_decks ON public.projects;
--   DROP FUNCTION IF EXISTS public.delete_project_decks();
--   DROP FUNCTION IF EXISTS public.delete_empty_project_clones(boolean);
--   DROP FUNCTION IF EXISTS public.find_empty_project_clones();
-- ============================================================================
BEGIN;

-- 1. Decks follow their project ------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_project_decks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regclass('public.presentation_decks') IS NOT NULL THEN
    DELETE FROM public.presentation_decks WHERE project_id = OLD.project_id;
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_decks() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_project_delete_decks ON public.projects;
CREATE TRIGGER tr_project_delete_decks
  AFTER DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.delete_project_decks();

CREATE INDEX IF NOT EXISTS presentation_decks_project_id_idx
  ON public.presentation_decks (project_id) WHERE project_id IS NOT NULL;

-- 2. Provably empty clones ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_empty_project_clones()
RETURNS TABLE (project_id text, owner_id uuid, output_type_id text, created_at timestamptz, original_project_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.project_id, p.owner_id, p.output_type_id, p.created_at, orig.project_id
  FROM public.projects p
  CROSS JOIN LATERAL (
    SELECT o.project_id
    FROM public.projects o
    WHERE o.owner_id = p.owner_id
      AND o.output_type_id = p.output_type_id
      AND o.project_id <> p.project_id
      AND o.created_at < p.created_at
      AND o.created_at >= p.created_at - interval '10 minutes'
    ORDER BY o.created_at
    LIMIT 1
  ) orig
  WHERE p.document IS NULL
    AND p.rubric_report IS NULL
    AND p.cover_letter IS NULL
    AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p.submissions) = 'array' THEN p.submissions END), 0) = 0
    AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p.claim_graph -> 'claims') = 'array' THEN p.claim_graph -> 'claims' END), 0) = 0
    AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p.evidence_ledger -> 'sources') = 'array' THEN p.evidence_ledger -> 'sources' END), 0) = 0
    AND coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p.evidence_ledger -> 'items') = 'array' THEN p.evidence_ledger -> 'items' END), 0) = 0
    AND (p.assignment_state IS NULL OR p.assignment_state = '{}'::jsonb)
    AND (coalesce(p.answers, '{}'::jsonb) - 'title') = '{}'::jsonb
    AND NOT EXISTS (SELECT 1 FROM public.project_sources s WHERE s.project_id = p.project_id)
    AND NOT EXISTS (SELECT 1 FROM public.manuscript_sections s WHERE s.project_id = p.project_id)
    AND NOT EXISTS (SELECT 1 FROM public.project_files s WHERE s.project_id = p.project_id)
    AND NOT EXISTS (SELECT 1 FROM public.assignment_files s WHERE s.project_id = p.project_id)
    AND NOT EXISTS (SELECT 1 FROM public.assignment_outline_sections s WHERE s.project_id = p.project_id)
    AND NOT EXISTS (SELECT 1 FROM public.assignment_draft_revisions s WHERE s.project_id = p.project_id)
    AND NOT EXISTS (SELECT 1 FROM public.presentation_decks s WHERE s.project_id = p.project_id);
$$;

CREATE OR REPLACE FUNCTION public.delete_empty_project_clones(dry_run boolean DEFAULT true)
RETURNS TABLE (project_id text, deleted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.project_id FROM public.find_empty_project_clones() c LOOP
    IF NOT dry_run THEN
      DELETE FROM public.projects pr WHERE pr.project_id = r.project_id;
    END IF;
    project_id := r.project_id;
    deleted := NOT dry_run;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.find_empty_project_clones() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_empty_project_clones(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_empty_project_clones() TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_empty_project_clones(boolean) TO service_role;

COMMIT;
