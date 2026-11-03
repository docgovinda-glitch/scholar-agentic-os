-- ============================================================================
-- Migration: public.user_provider_keys (AI keys saved to the user's account)
-- ============================================================================
-- A user's own provider API keys (Gemini, Groq, OpenAI…) were kept only in
-- the browser where they were typed, so keys set up on a computer did not
-- work on the same person's phone. The owner chose to keep them in the
-- account instead, so every device the person signs in on can use them.
--
-- Each key is encrypted with its own content-encryption key (AES-256-GCM),
-- which is wrapped under the server's MASTER_KEY — the same envelope as
-- platform_provider_credentials. MASTER_KEY is never stored in the database,
-- so a copy of this table alone yields nothing.
--
-- Access: RLS on with NO client policies. Only the server (service role)
-- reads and writes, through server/src/aiEngine/userKeyVault.ts, and every
-- query is scoped by the signed-in user's id (server/routes/aiAccess.ts).
-- Idempotent. Rollback: DROP TABLE public.user_provider_keys; (keys stay on
-- the devices that already have them).
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_provider_keys (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL CHECK (char_length(provider_id) BETWEEN 1 AND 64),
  encrypted_cek jsonb NOT NULL,
  encrypted_key jsonb NOT NULL,
  -- "••••" + last four characters, set at write time; lists never decrypt.
  masked_preview text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider_id)
);

ALTER TABLE public.user_provider_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_provider_keys FROM anon, authenticated;
GRANT ALL ON public.user_provider_keys TO service_role;

COMMIT;
