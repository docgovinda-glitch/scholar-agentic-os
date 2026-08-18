-- Audit Gaps Migration

-- 1. Add `waived` boolean to peer_review_critiques
ALTER TABLE public.peer_review_critiques
ADD COLUMN IF NOT EXISTS waived BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. Create `manuscript_versions` table for revision history
CREATE TABLE IF NOT EXISTS public.manuscript_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    section_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for manuscript_versions
ALTER TABLE public.manuscript_versions ENABLE ROW LEVEL SECURITY;

-- Note: Policies intentionally omitted for manuscript_versions to rely on server-side Service Role bypass,
-- matching the design of manuscript_sections.
