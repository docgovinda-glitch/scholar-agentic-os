-- Drop tables that no application code reads or writes.
--
-- Evidence (checked 2026-11-26 against src/, server/, scripts/, supabase/functions/
-- and the live project's catalog):
--   * No `.from("<table>")`, SupabaseTable(...) or raw SQL reference in any code path.
--   * No foreign key from another table points at any of them, and no view or
--     trigger depends on them (pg_constraint / pg_depend / pg_trigger).
--   * Row counts on production at that time:
--       manuscript_versions              0
--       project_answers                  0
--       project_uploaded_sources         0
--       project_claim_binding_evidence   0
--       ai_models                        115  (stale seed rows; the seeding script is gone,
--                                             model data now lives in src/config/modelCatalog.ts)
--
-- Deliberately NOT dropped:
--   * ai_providers: still the FK anchor for user_ai_connections.
--   * The anonymization_report / anonymized_document columns on public.projects
--     (the feature was removed in code; drop them in a later migration if wanted).
--   * match_project_evidence(): an unused pgvector function, left for a separate decision.
--
-- No CASCADE on purpose: if anything unexpected depends on one of these tables the
-- statement fails and the migration (run in one transaction by the runner) rolls back
-- instead of dropping the dependent.
--
-- The project-delete trigger function (20260924180000_project_cascade_delete.sql) guards its
-- deletes from manuscript_versions and project_claim_binding_evidence with
-- `IF EXISTS (... information_schema.tables ...)`, so it keeps working after these are gone.
--
-- Irreversible: the tables and their rows are lost. If you want a safety net for ai_models,
-- take a backup first:  create table public._ai_models_backup as table public.ai_models;

drop table if exists public.manuscript_versions;
drop table if exists public.project_answers;
drop table if exists public.project_uploaded_sources;
drop table if exists public.project_claim_binding_evidence;
drop table if exists public.ai_models;
