-- Migration: Knowledge Vault Collections, Tagging & Retraction Monitoring Indexes
-- Enhances search and query performance on JSONB metadata for collections, tags, and retraction statuses.

CREATE INDEX IF NOT EXISTS idx_user_vault_items_metadata_gin ON public.user_vault_items USING gin (metadata);
CREATE INDEX IF NOT EXISTS idx_user_vault_items_collection ON public.user_vault_items (user_id, (metadata->>'collection'));
CREATE INDEX IF NOT EXISTS idx_user_vault_items_retraction_status ON public.user_vault_items (user_id, (metadata->>'retractionStatus'));
