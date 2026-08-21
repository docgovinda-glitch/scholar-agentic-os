-- Migration: Universal Knowledge Vault
-- Creates account-level user_vault_items table and vault-files storage bucket

-- 1. Create public.user_vault_items table for normalized metadata & extracted usable text
CREATE TABLE IF NOT EXISTS public.user_vault_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL DEFAULT 'file', -- 'file', 'web', 'video', 'reference', 'custom', 'text'
    title TEXT NOT NULL,
    filename TEXT,
    mime_type TEXT,
    external_reference TEXT, -- URL, DOI, YouTube URL
    storage_reference TEXT, -- Storage bucket object path
    content_text TEXT, -- Normalized extracted text / transcript / abstract for AI access
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by user and creation order
CREATE INDEX IF NOT EXISTS idx_user_vault_items_user_id ON public.user_vault_items(user_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.user_vault_items ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies: strict user isolation
DROP POLICY IF EXISTS "user_vault_items_select_own" ON public.user_vault_items;
CREATE POLICY "user_vault_items_select_own" ON public.user_vault_items
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vault_items_insert_own" ON public.user_vault_items;
CREATE POLICY "user_vault_items_insert_own" ON public.user_vault_items
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vault_items_update_own" ON public.user_vault_items;
CREATE POLICY "user_vault_items_update_own" ON public.user_vault_items
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_vault_items_delete_own" ON public.user_vault_items;
CREATE POLICY "user_vault_items_delete_own" ON public.user_vault_items
    FOR DELETE
    USING (auth.uid() = user_id);

-- 2. Add storage_mode column to public.user_vaults if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'user_vaults' 
        AND column_name = 'storage_mode'
    ) THEN
        ALTER TABLE public.user_vaults ADD COLUMN storage_mode TEXT NOT NULL DEFAULT 'local';
    END IF;
END $$;

-- 3. Create storage bucket for vault-files if storage extension is active
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('vault-files', 'vault-files', false, 52428800, null)
        ON CONFLICT (id) DO UPDATE SET
            public = excluded.public,
            file_size_limit = excluded.file_size_limit,
            allowed_mime_types = excluded.allowed_mime_types;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignore if storage extension is not present in test environment
END $$;
