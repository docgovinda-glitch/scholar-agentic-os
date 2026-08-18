-- Migration: Agentic Pipeline Support
-- Creates tables for the 25-stage pipeline specific entities

-- 1. project_research_gaps
CREATE TABLE IF NOT EXISTS project_research_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    gap_type TEXT NOT NULL, -- 'empirical', 'theoretical', 'methodological', 'knowledge'
    description TEXT NOT NULL,
    importance_score INTEGER,
    status TEXT NOT NULL DEFAULT 'identified', -- 'identified', 'selected', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. project_titles
CREATE TABLE IF NOT EXISTS project_titles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title_text TEXT NOT NULL,
    subtitle_text TEXT,
    rationale TEXT,
    status TEXT NOT NULL DEFAULT 'proposed', -- 'proposed', 'locked', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. project_journal_candidates
CREATE TABLE IF NOT EXISTS project_journal_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    journal_name TEXT NOT NULL,
    publisher TEXT,
    impact_factor NUMERIC,
    match_score INTEGER,
    rationale TEXT,
    status TEXT NOT NULL DEFAULT 'discovered', -- 'discovered', 'selected', 'rejected'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookup by project
CREATE INDEX IF NOT EXISTS idx_project_research_gaps_project_id ON project_research_gaps(project_id);
CREATE INDEX IF NOT EXISTS idx_project_titles_project_id ON project_titles(project_id);
CREATE INDEX IF NOT EXISTS idx_project_journal_candidates_project_id ON project_journal_candidates(project_id);
