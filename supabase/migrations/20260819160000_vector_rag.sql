-- Enable the pgvector extension if it is not already enabled
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add embedding column to project_evidence
ALTER TABLE public.project_evidence ADD COLUMN IF NOT EXISTS embedding extensions.vector(768);

-- Create an index for vector similarity search (cosine distance)
CREATE INDEX ON public.project_evidence USING hnsw (embedding extensions.vector_cosine_ops);

-- Setup a generic search function for RAG
CREATE OR REPLACE FUNCTION match_project_evidence(
  query_embedding extensions.vector(768),
  match_threshold float,
  match_count int,
  p_id text
)
RETURNS TABLE (
  id uuid,
  project_id text,
  quote text,
  claim_type text,
  strength text,
  tags jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    project_evidence.id,
    project_evidence.project_id,
    project_evidence.quote,
    project_evidence.claim_type,
    project_evidence.strength,
    project_evidence.tags,
    1 - (project_evidence.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM public.project_evidence
  WHERE project_evidence.project_id = p_id
    AND 1 - (project_evidence.embedding OPERATOR(extensions.<=>) query_embedding) > match_threshold
  ORDER BY project_evidence.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
$$;
