-- User-scoped AI configuration for the Desk client.
--
-- Separate from supabase/schema.sql and schema_store.sql, and independent of
-- both: nothing here references them, and running one does not require another.
--
-- ============================================================================
-- WHY THIS TABLE HOLDS NO SECRETS
-- ============================================================================
--
-- API keys are NOT stored here, and are not stored on the server at all for
-- Desk. They stay on the device that entered them.
--
-- The existing `api_credentials` table (schema.sql) does hold keys, encrypted
-- client-side. That design is sound in principle, and its own history shows
-- exactly where it gets difficult: the encryption secret was originally the
-- login passcode hash, which lived in the same localStorage blob as the
-- ciphertext — so anyone who could read one could read the other, and the
-- encryption bought nothing. src/services/vaultPassphrase.ts fixed that by
-- holding the passphrase in memory only, never persisted. Correct, but it
-- means the user must re-supply a passphrase every session before their own
-- stored keys can be decrypted.
--
-- Desk takes the simpler position: a secret the server never receives cannot
-- leak from the server. Keys live in the browser's local storage on the device
-- that entered them, and a database compromise exposes no provider
-- credentials because none are there.
--
-- The honest cost, stated in the UI rather than hidden: keys do not follow the
-- user to a new device and must be entered again there. Which provider and
-- model they chose DOES follow them, because that is what this table is for.
--
-- If cross-device key sync is wanted later, the upgrade path is a user-held
-- passphrase gating `api_credentials` — deliberately not done here, because it
-- adds a mandatory secret to onboarding to solve a problem most single-device
-- users do not have.

create table if not exists public.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Active provider id, matching CLOUD_PROVIDERS[].id in
  -- src/config/providerCatalog.ts.
  provider text not null default 'gemini',
  -- Non-secret preferences only: chosen model names, custom base URLs for the
  -- providers that need one. Anything that would be damaging to disclose
  -- belongs on the device, not in this column.
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Unlike public.projects — which is server-only and therefore denies every
-- browser-reachable role — this table IS written directly by the browser, so
-- it needs a policy rather than a deny-all.
--
-- `for all` covers select/insert/update/delete. Postgres defaults `with check`
-- to the `using` expression when it is omitted, so an insert cannot set
-- user_id to somebody else's id; it is written out explicitly anyway, because
-- relying on that default is exactly the kind of thing a later edit breaks
-- without noticing.
alter table public.user_ai_settings enable row level security;

drop policy if exists user_ai_settings_all_own on public.user_ai_settings;
create policy user_ai_settings_all_own
  on public.user_ai_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
