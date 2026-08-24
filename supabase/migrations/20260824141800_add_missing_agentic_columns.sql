-- Add missing columns to project_sources that were skipped due to CREATE TABLE IF NOT EXISTS collision
ALTER TABLE public.project_sources
ADD COLUMN IF NOT EXISTS relevance_score INTEGER,
ADD COLUMN IF NOT EXISTS themes JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS abstract TEXT;
