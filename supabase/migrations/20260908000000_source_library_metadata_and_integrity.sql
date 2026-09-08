-- Migration: Source Library Lightweight Metadata & Integrity Indexes
--
-- ARCHITECTURAL GUARANTEE:
-- public.user_vault_items persists strictly lightweight bibliographic metadata
-- (title, authors, year, journal, DOI, web URL, citation, writing notes, project tags).
-- Actual user documents (PDFs, DOCX, XLSX, etc.) reside exclusively in the user's
-- connected Google Drive or Microsoft OneDrive.
-- Zero document binaries, zero full extracted text, zero OCR output, zero webpage HTML.

-- 1. Explicit table documentation
COMMENT ON TABLE public.user_vault_items IS 'Stores lightweight Source Library bibliographic reference metadata only. Never stores document binaries, full extracted text, OCR dumps, or webpage HTML.';

-- 2. Performance indexes for DOI lookup, canonical URL matching, and source identity
CREATE INDEX IF NOT EXISTS idx_user_vault_items_doi ON public.user_vault_items (user_id, (metadata->>'doi'));
CREATE INDEX IF NOT EXISTS idx_user_vault_items_url ON public.user_vault_items (user_id, (metadata->>'url'));
CREATE INDEX IF NOT EXISTS idx_user_vault_items_source_id ON public.user_vault_items (user_id, (metadata->>'sourceId'));
