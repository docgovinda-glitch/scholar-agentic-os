-- ============================================================================
-- Migration: Premium catalogue — which providers/models Premium users may use
-- ============================================================================
--
-- Also present at the end of supabase/schema_ai_engine.sql, which remains the
-- canonical full-schema file; this is the same change extracted so a deployed
-- project can apply just the delta.
--
-- WHAT THIS CHANGES, AND WHY IT IS A BEHAVIOUR CHANGE
--
-- "Premium" used to mean "any provider with an active row in
-- platform_provider_credentials". That conflated two separate decisions:
-- whether Scholar HOLDS a key for a provider, and whether Scholar wants to
-- SPEND it on Premium subscribers. An admin storing a credential merely to
-- try a provider out silently made it live for every subscriber immediately.
--
-- premium_enabled is the admin's explicit opt-in, enforced server-side in
-- assembleRoutingCandidates (server/src/aiEngine/routingCandidates.ts) — the
-- one code path both the routing preview and real Premium execution share, so
-- it cannot be bypassed from the client. premium_models optionally narrows
-- Premium to specific model ids; empty means "use the provider's catalogue
-- default", which is the behaviour that existed before.
--
-- DEFAULT false IS DELIBERATE AND FAILS CLOSED. After applying this, NO
-- provider is Premium-eligible until an admin turns it on in
-- Admin → Providers → "Add to Premium". On a deployment with live Premium
-- subscribers, apply this and set the intended providers in the same sitting,
-- or Premium requests will correctly find no eligible provider in between.
--
-- Idempotent: `add column if not exists` twice, nothing else.

begin;

alter table public.ai_providers add column if not exists premium_enabled boolean not null default false;
alter table public.ai_providers add column if not exists premium_models text[] not null default '{}';

commit;

-- ============================================================================
-- Verification — run after the transaction commits.
-- ============================================================================
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_name = 'ai_providers'
--      and column_name in ('premium_enabled', 'premium_models');
--
--   -- Which providers are currently Premium-eligible (expect none at first):
--   select id, name, premium_enabled, premium_models
--     from public.ai_providers where premium_enabled;
