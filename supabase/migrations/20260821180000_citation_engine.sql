-- ============================================================================
-- Migration: 20260821180000_citation_engine.sql
-- Description: Authoritative Citation Engine & User-Confirmed Citation Readiness
-- ============================================================================

-- 1. Add citation readiness columns to user_vault_items
ALTER TABLE public.user_vault_items
  ADD COLUMN IF NOT EXISTS citation_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS canonical_reference JSONB;

-- Index for querying citation-ready vault items
CREATE INDEX IF NOT EXISTS idx_user_vault_items_citation_status
  ON public.user_vault_items(user_id, citation_status);

-- 2. Add citation readiness columns to project_sources
ALTER TABLE public.project_sources
  ADD COLUMN IF NOT EXISTS citation_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS canonical_reference JSONB;

-- Index for querying citation-ready project sources
CREATE INDEX IF NOT EXISTS idx_project_sources_citation_status
  ON public.project_sources(project_id, citation_status);
