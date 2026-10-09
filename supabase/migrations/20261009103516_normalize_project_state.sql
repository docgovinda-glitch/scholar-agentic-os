-- 1. Optimistic Locking
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- 2. Normalized Tables for project.answers

CREATE TABLE IF NOT EXISTS public.project_answers (
  project_id VARCHAR(255) REFERENCES public.projects(project_id) ON DELETE CASCADE,
  key VARCHAR(255) NOT NULL,
  value JSONB,
  PRIMARY KEY (project_id, key)
);
ALTER TABLE public.project_answers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) REFERENCES public.projects(project_id) ON DELETE CASCADE,
  source_id VARCHAR(255) NOT NULL,
  title TEXT,
  authors TEXT,
  year VARCHAR(50),
  abstract TEXT,
  url TEXT,
  doi VARCHAR(255),
  status VARCHAR(50),
  is_excluded BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, source_id)
);
ALTER TABLE public.project_sources ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_uploaded_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) REFERENCES public.projects(project_id) ON DELETE CASCADE,
  document_id VARCHAR(255) NOT NULL,
  filename TEXT,
  status VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, document_id)
);
ALTER TABLE public.project_uploaded_sources ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.project_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) REFERENCES public.projects(project_id) ON DELETE CASCADE,
  evidence_id VARCHAR(255) NOT NULL,
  source_id VARCHAR(255),
  text TEXT,
  status VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, evidence_id)
);
ALTER TABLE public.project_evidence ENABLE ROW LEVEL SECURITY;
