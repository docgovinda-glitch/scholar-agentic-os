-- Migration: Universal Knowledge Vault v2 & Cloud Integrations
-- Sets up user_vault_items with full citation compliance, user_cloud_integrations, and resets legacy state.

-- 1. Create or ensure user_vaults exists
CREATE TABLE IF NOT EXISTS public.user_vaults (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'My Knowledge Vault',
    storage_mode TEXT NOT NULL DEFAULT 'synced',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_vaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_vaults_select_own" ON public.user_vaults;
CREATE POLICY "user_vaults_select_own" ON public.user_vaults
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vaults_insert_own" ON public.user_vaults;
CREATE POLICY "user_vaults_insert_own" ON public.user_vaults
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vaults_update_own" ON public.user_vaults;
CREATE POLICY "user_vaults_update_own" ON public.user_vaults
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vaults_delete_own" ON public.user_vaults;
CREATE POLICY "user_vaults_delete_own" ON public.user_vaults
    FOR DELETE USING (auth.uid() = user_id);

-- 2. Create public.user_vault_items for Universal Cross-Device Vault
CREATE TABLE IF NOT EXISTS public.user_vault_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL DEFAULT 'file', -- 'file', 'web', 'video', 'reference', 'drive_google', 'drive_onedrive', 'custom', 'text'
    title TEXT NOT NULL,
    filename TEXT,
    mime_type TEXT,
    external_reference TEXT, -- URL, DOI, YouTube URL, Drive File ID
    storage_reference TEXT,
    content_text TEXT, -- Normalized extracted text for AI & search
    canonical_reference JSONB, -- Structured academic reference object
    citation TEXT, -- Pre-formatted citation string
    citation_status TEXT DEFAULT 'missing' CHECK (citation_status IN ('missing', 'needs_user_review', 'confirmed')),
    authors TEXT[],
    year TEXT,
    journal TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_vault_items_user_id ON public.user_vault_items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_vault_items_source_type ON public.user_vault_items(user_id, source_type);
CREATE INDEX IF NOT EXISTS idx_user_vault_items_citation_status ON public.user_vault_items(user_id, citation_status);

ALTER TABLE public.user_vault_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_vault_items_select_own" ON public.user_vault_items;
CREATE POLICY "user_vault_items_select_own" ON public.user_vault_items
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vault_items_insert_own" ON public.user_vault_items;
CREATE POLICY "user_vault_items_insert_own" ON public.user_vault_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vault_items_update_own" ON public.user_vault_items;
CREATE POLICY "user_vault_items_update_own" ON public.user_vault_items
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vault_items_delete_own" ON public.user_vault_items;
CREATE POLICY "user_vault_items_delete_own" ON public.user_vault_items
    FOR DELETE USING (auth.uid() = user_id);

-- 3. Create public.user_cloud_integrations for Google Drive & OneDrive
CREATE TABLE IF NOT EXISTS public.user_cloud_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'onedrive', 'dropbox', 'box')),
    account_email TEXT,
    account_name TEXT,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_token TEXT,
    refresh_token TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

ALTER TABLE public.user_cloud_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_cloud_integrations_select_own" ON public.user_cloud_integrations;
CREATE POLICY "user_cloud_integrations_select_own" ON public.user_cloud_integrations
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_cloud_integrations_insert_own" ON public.user_cloud_integrations;
CREATE POLICY "user_cloud_integrations_insert_own" ON public.user_cloud_integrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_cloud_integrations_update_own" ON public.user_cloud_integrations;
CREATE POLICY "user_cloud_integrations_update_own" ON public.user_cloud_integrations
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_cloud_integrations_delete_own" ON public.user_cloud_integrations;
CREATE POLICY "user_cloud_integrations_delete_own" ON public.user_cloud_integrations
    FOR DELETE USING (auth.uid() = user_id);

-- 4. Auto-upgrade existing vaults to Universal Synced storage
UPDATE public.user_vaults SET storage_mode = 'synced' WHERE storage_mode IS NULL OR storage_mode = 'local';
