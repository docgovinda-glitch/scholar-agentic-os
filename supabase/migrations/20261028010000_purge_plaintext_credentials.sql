-- ============================================================================
-- Migration: Purge Plaintext Credentials & Force Reconnect (F-07, F-08)
-- ============================================================================
-- 1. Deletes existing plaintext rows in `public.api_credentials` (written by
--    the legacy identity stub `(k) => k` in `supabaseAuthService.ts` before
--    PR #79 removed server-side BYOK storage).
-- 2. Deletes existing plaintext OAuth token rows in `public.user_cloud_integrations`
--    (rows where `access_token` or `refresh_token` lacks the `enc:v1:` AES-256-GCM
--    envelope prefix), forcing users to reconnect Zotero, Mendeley, Google Drive,
--    or OneDrive so tokens are re-issued and stored encrypted.
-- 3. Drops direct client SELECT policy on `public.user_cloud_integrations` so
--    `access_token` and `refresh_token` columns cannot be queried directly via
--    PostgREST (`GET /api/vault/cloud/connections` returns sanitized metadata).
--
-- IMPORTANT (F-01 Dependency):
-- `encryptCloudToken` derives its key from `MASTER_KEY` / `CREDENTIAL_MASTER_KEY`
-- (with `SUPABASE_SERVICE_ROLE_KEY` fallback), which were leaked in git history
-- (`F-01`). Encryption at rest only provides real protection after `F-01`
-- credential rotation (`ROTATION_RUNBOOK.md`) is completed.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'api_credentials'
  ) THEN
    DELETE FROM public.api_credentials
    WHERE encrypted_api_key IS NULL
       OR (
         encrypted_api_key NOT LIKE 'enc:v1:%'
         AND encrypted_api_key NOT LIKE '{"ciphertext"%'
       );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_cloud_integrations'
  ) THEN
    DELETE FROM public.user_cloud_integrations
    WHERE access_token IS NULL
       OR access_token NOT LIKE 'enc:v1:%'
       OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE 'enc:v1:%');

    DROP POLICY IF EXISTS "Users can view own cloud integrations" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "Users can insert own cloud integrations" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "Users can update own cloud integrations" ON public.user_cloud_integrations;
  END IF;
END $$;

COMMIT;

