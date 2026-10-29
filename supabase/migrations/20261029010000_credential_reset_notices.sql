-- ============================================================================
-- Migration: credential reset notices + finish the plaintext purge (F-11)
-- ============================================================================
-- 20261028010000_purge_plaintext_credentials was applied to production on
-- 2026-10-29 in its first version (purge only). The notice table, the
-- affected-user records and the remaining client-policy drops were later
-- added to that file, after it had been applied, so they never ran. They live
-- here instead. Every statement is idempotent: on a database where the purge
-- already removed the rows, this creates the table and policies and drops
-- the leftover client policies without touching data.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.security_credential_reset_notices (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  had_api_credentials boolean NOT NULL DEFAULT false,
  had_cloud_integrations boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz
);

ALTER TABLE public.security_credential_reset_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_credential_reset_notices_select_own" ON public.security_credential_reset_notices;
CREATE POLICY "security_credential_reset_notices_select_own"
  ON public.security_credential_reset_notices
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "security_credential_reset_notices_update_own" ON public.security_credential_reset_notices;
CREATE POLICY "security_credential_reset_notices_update_own"
  ON public.security_credential_reset_notices
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'api_credentials'
  ) THEN
    INSERT INTO public.security_credential_reset_notices (user_id, had_api_credentials, dismissed_at)
    SELECT DISTINCT ac.user_id, true, NULL::timestamptz
    FROM public.api_credentials ac
    INNER JOIN auth.users u ON u.id = ac.user_id
    ON CONFLICT (user_id) DO UPDATE
      SET had_api_credentials = true,
          dismissed_at = NULL;

    DELETE FROM public.api_credentials;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_cloud_integrations'
  ) THEN
    INSERT INTO public.security_credential_reset_notices (user_id, had_cloud_integrations, dismissed_at)
    SELECT DISTINCT uci.user_id, true, NULL::timestamptz
    FROM public.user_cloud_integrations uci
    INNER JOIN auth.users u ON u.id = uci.user_id
    WHERE uci.access_token IS NULL
       OR uci.access_token NOT LIKE 'enc:v1:%'
       OR (uci.refresh_token IS NOT NULL AND uci.refresh_token NOT LIKE 'enc:v1:%')
    ON CONFLICT (user_id) DO UPDATE
      SET had_cloud_integrations = true,
          dismissed_at = NULL;

    DELETE FROM public.user_cloud_integrations
    WHERE access_token IS NULL
       OR access_token NOT LIKE 'enc:v1:%'
       OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE 'enc:v1:%');

    -- Drop both naming variants of direct client RLS policies on user_cloud_integrations
    DROP POLICY IF EXISTS "user_cloud_integrations_select_own" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "user_cloud_integrations_insert_own" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "user_cloud_integrations_update_own" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "user_cloud_integrations_delete_own" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "Users can view own cloud integrations" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "Users can insert own cloud integrations" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "Users can update own cloud integrations" ON public.user_cloud_integrations;
    DROP POLICY IF EXISTS "Users can delete own cloud integrations" ON public.user_cloud_integrations;
  END IF;
END $$;

COMMIT;
