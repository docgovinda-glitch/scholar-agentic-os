-- Migration: Activity and Files
-- Creates tables for the Activity Tray and Project Files features

-- Project Activity Table
CREATE TABLE IF NOT EXISTS public.project_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g., 'stage_advanced', 'agent_run', 'file_uploaded'
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by project and timeline ordering
CREATE INDEX IF NOT EXISTS idx_project_activity_project_id_created_at ON public.project_activity(project_id, created_at DESC);

-- Project Files Table
CREATE TABLE IF NOT EXISTS public.project_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for project files
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON public.project_files(project_id);

-- Enable RLS
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies
-- Note: Assuming standard project ownership policies based on `project_id`.
CREATE POLICY "Users can view activity for their projects" ON public.project_activity
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view files for their projects" ON public.project_files
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert files for their projects" ON public.project_files
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT id FROM public.projects WHERE user_id = auth.uid()
        )
    );
