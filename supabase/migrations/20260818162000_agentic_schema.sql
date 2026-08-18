-- Migration to create relational tables for Agentic Workflow
-- Extracted from the projects.answers JSONB column

CREATE TABLE IF NOT EXISTS public.project_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    authors JSONB NOT NULL DEFAULT '[]'::jsonb,
    year INTEGER,
    journal TEXT,
    source_type TEXT NOT NULL, -- 'vault' or 'external'
    relevance_score INTEGER,
    themes JSONB DEFAULT '[]'::jsonb,
    abstract TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_evidence (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    source_id UUID REFERENCES public.project_sources(id) ON DELETE SET NULL,
    quote TEXT NOT NULL,
    claim_type TEXT,
    strength TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.manuscript_sections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Drafted',
    word_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(project_id, section_name)
);

CREATE TABLE IF NOT EXISTS public.peer_review_critiques (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    lens TEXT NOT NULL,
    feedback TEXT NOT NULL,
    severity TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.project_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manuscript_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_review_critiques ENABLE ROW LEVEL SECURITY;

-- Create function to automatically update 'updated_at'
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_manuscript_sections_modtime
    BEFORE UPDATE ON public.manuscript_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- Note: Policies intentionally omitted to rely on server-side Service Role bypass,
-- matching the design in schema_store.sql where public.projects has zero policies.

-- MIGRATION SCRIPT (to be run after applying schema)
-- We will write a separate Node.js script for migrating the complex JSONB data
-- to these tables rather than doing it purely in SQL, as the JSON structures
-- inside 'answers' may require robust parsing.
