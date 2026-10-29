-- ============================================================================
-- Migration: create public.presentation_decks (Presentation Studio storage)
-- ============================================================================
-- server/routes/presentations.ts persists decks to `presentation_decks`
-- through the Supabase Data API, but no migration ever created the table.
-- Until PR #81 the route silently fell back to process memory (decks lost on
-- every restart); since #81 the ownership lookup fails closed, so saves
-- return 503. This creates the table with the columns PresentationDeckRow
-- uses.
--
-- Access: RLS on with NO client policies. Only the server (service role)
-- reads and writes, and it scopes every query by user_id
-- (presentations.ts lookupDeck / owner-filtered update & delete).
-- Idempotent. Rollback: DROP TABLE public.presentation_decks; (only while
-- it holds no user decks).
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.presentation_decks (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 120),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text,
  title text NOT NULL DEFAULT '',
  topic text,
  framework text,
  theme_id text,
  custom_theme jsonb,
  slides jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_module text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS presentation_decks_user_updated_idx
  ON public.presentation_decks (user_id, updated_at DESC);

ALTER TABLE public.presentation_decks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presentation_decks FROM anon, authenticated;
GRANT ALL ON public.presentation_decks TO service_role;

COMMIT;
