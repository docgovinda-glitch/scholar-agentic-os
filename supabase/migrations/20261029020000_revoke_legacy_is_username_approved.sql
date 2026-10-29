-- ============================================================================
-- Migration: lock down the legacy is_username_approved() RPC (T5 finding)
-- ============================================================================
-- Production has public.is_username_approved(text), a SECURITY DEFINER
-- function that no repo migration creates and no app code calls (only the
-- generated src/types/database.types.ts mentions it). It is executable by
-- anon, so anyone can test whether a username exists, the same enumeration
-- the Hotfix 2 lockdown closed for email_for_username / check_*_available.
--
-- Containment only (reversible, nothing dropped): revoke EXECUTE from
-- PUBLIC, anon and authenticated; keep service_role.
-- Undo: GRANT EXECUTE ON FUNCTION public.is_username_approved(text)
--         TO PUBLIC, anon, authenticated;
-- ============================================================================
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_username_approved(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.is_username_approved(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.is_username_approved(text) TO service_role;
  END IF;
END $$;

COMMIT;
