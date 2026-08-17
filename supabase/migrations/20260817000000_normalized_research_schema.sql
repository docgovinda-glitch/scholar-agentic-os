-- Migration: 2026-08-17_normalized_research_schema.sql
-- Goal: Normalize Evidence Ledger and Claim-Evidence Graph data out of the monolithic `projects` JSONB columns
-- into relational tables to support agentic workflows, provenance tracking, and strict citation governance.

-- 1. Project Sources (The discovered literature)
CREATE TABLE IF NOT EXISTS public.project_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    source_id TEXT NOT NULL, -- The legacy 'src-xxxx' string id
    title TEXT NOT NULL,
    authors TEXT[] NOT NULL DEFAULT '{}',
    url TEXT,
    doi TEXT,
    venue TEXT,
    year INT,
    source_type TEXT NOT NULL,
    authority_tier TEXT NOT NULL,
    discovered_via TEXT NOT NULL,
    discovered_at TIMESTAMPTZ NOT NULL,
    vault_item_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, source_id)
);

-- 2. Project Evidence Items (The exact quotes pulled from sources)
CREATE TABLE IF NOT EXISTS public.project_evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL, -- The legacy 'ev-xxxx' string id
    source_id TEXT NOT NULL,
    state TEXT NOT NULL, -- 'discovered', 'extracted', 'verified', 'proposed', 'user_approved', 'citable'
    quote TEXT,
    locator JSONB,
    proposed_claim_id TEXT,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, evidence_id),
    FOREIGN KEY (project_id, source_id) REFERENCES public.project_sources(project_id, source_id) ON DELETE CASCADE
);

-- 3. Project Claims (The assertions made by the author/AI)
CREATE TABLE IF NOT EXISTS public.project_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    claim_id TEXT NOT NULL,
    text TEXT NOT NULL,
    draft_span_id TEXT,
    status TEXT, -- e.g., 'unsupported'
    unsupported_reason TEXT,
    unsupported_actor TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, claim_id)
);

-- 4. Project Claim Bindings (The link between a Claim and Evidence Items)
CREATE TABLE IF NOT EXISTS public.project_claim_bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
    binding_id TEXT NOT NULL, -- 'binding-xxxx'
    claim_id TEXT NOT NULL,
    strength TEXT NOT NULL, -- 'strong', 'moderate', 'weak', 'contradicts'
    rationale TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, binding_id),
    FOREIGN KEY (project_id, claim_id) REFERENCES public.project_claims(project_id, claim_id) ON DELETE CASCADE
);

-- 5. Project Claim Binding Evidence (Many-to-Many junction mapping a binding to its specific evidence)
-- A single binding can point to multiple evidence locators.
CREATE TABLE IF NOT EXISTS public.project_claim_binding_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL,
    binding_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    quote TEXT NOT NULL,
    locator JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (project_id, binding_id) REFERENCES public.project_claim_bindings(project_id, binding_id) ON DELETE CASCADE,
    FOREIGN KEY (project_id, source_id) REFERENCES public.project_sources(project_id, source_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ps_project_id ON public.project_sources(project_id);
CREATE INDEX IF NOT EXISTS idx_pei_project_id_state ON public.project_evidence_items(project_id, state);
CREATE INDEX IF NOT EXISTS idx_pc_project_id ON public.project_claims(project_id);
CREATE INDEX IF NOT EXISTS idx_pcb_project_id_claim_id ON public.project_claim_bindings(project_id, claim_id);

-- Enable RLS (locked down by default)
ALTER TABLE public.project_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_sources FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_evidence_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_claims FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_claim_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_claim_bindings FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_claim_binding_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_claim_binding_evidence FORCE ROW LEVEL SECURITY;
