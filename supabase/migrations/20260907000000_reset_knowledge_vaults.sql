-- Migration: Reset Knowledge Vault for All Users
-- This migration wipes all existing vaults, items, and cloud integrations
-- so that all users experience a clean, first-time onboarding setup flow.

DELETE FROM public.user_vault_items WHERE true;
DELETE FROM public.user_cloud_integrations WHERE true;
DELETE FROM public.user_vaults WHERE true;
