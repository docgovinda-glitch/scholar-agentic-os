-- ============================================================================
-- Migration: two routing layers, an admin resource pool, and privacy by
--            construction
-- ============================================================================
--
-- Establishes the separation the platform owner asked for: users route over
-- THEIR OWN configured providers privately, and the administrator routes over
-- a SEPARATE pool of admin-owned resources that Premium plans draw from.
-- These are two systems that happen to share one pure ranking function; they
-- never share a candidate pool, a credential, or a view.
--
-- Idempotent throughout. Safe to re-run.

begin;

-- ----------------------------------------------------------------------------
-- 1. AI RESOURCES — the admin's pool
-- ----------------------------------------------------------------------------
-- The request asked to think in AI *Resources* rather than AI *Providers*: a
-- resource is a specific (provider, model) pairing with its own access type,
-- cost, capability tags and availability. That is what lets an admin move a
-- Premium capability from Provider A to Provider B without a subscriber
-- reconfiguring anything — the plan grants the RESOURCE, and the resource's
-- underlying provider is an implementation detail the user never sees.
--
-- `label` is the user-visible name and is deliberately provider-agnostic
-- ("Advanced writing", "Fast drafting"). `provider_id`/`model_id` are the
-- admin-facing wiring behind it.
create table if not exists public.ai_resources (
  id uuid primary key default gen_random_uuid(),
  -- What a Premium user sees. Never a provider name, so the underlying
  -- provider can be swapped without changing what the user was promised.
  label text not null,
  description text,
  provider_id text not null references public.ai_providers(id) on delete cascade,
  model_id text,
  -- Where the capacity comes from. 'local' and 'free' cost the platform
  -- nothing; 'paid'/'byok' spend the admin's own credential.
  access_type text not null check (access_type in ('local', 'free', 'paid', 'byok')),
  -- Free-form tags the router can match a task against, e.g.
  -- {"reasoning","long-context"}. Empty means "general purpose".
  capabilities text[] not null default '{}',
  -- Rough per-1k-token cost in USD, for the admin's own cost planning. Null
  -- when the resource costs the platform nothing.
  cost_per_1k_usd numeric,
  -- Optional ceiling for this resource specifically, independent of any
  -- plan's overall credit limits.
  daily_request_limit integer,
  enabled boolean not null default true,
  -- Which stored platform credential to use. Matches
  -- platform_provider_credentials.label; 'default' is the usual one.
  credential_label text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_resources_provider on public.ai_resources(provider_id);

-- Admin-only: this table describes the platform's own infrastructure, not
-- anything belonging to a user. Zero policies means anon/authenticated cannot
-- read it at all; every access goes through a requireScope-gated server route.
alter table public.ai_resources enable row level security;

-- ----------------------------------------------------------------------------
-- 2. PLAN → RESOURCE grants
-- ----------------------------------------------------------------------------
-- Which resources each Premium plan may draw on. A plan with no rows here
-- grants no Premium resources at all, which is the safe default: a newly
-- created plan cannot accidentally spend on everything.
create table if not exists public.plan_resources (
  plan_id text not null references public.premium_plans(id) on delete cascade,
  resource_id uuid not null references public.ai_resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, resource_id)
);

alter table public.plan_resources enable row level security;

-- Plans need a user-facing description now that users can see and request
-- them, plus a display order for the pricing list.
alter table public.premium_plans add column if not exists description text;
alter table public.premium_plans add column if not exists weekly_credits integer;
alter table public.premium_plans add column if not exists sort_order integer not null default 0;
-- Whether users may request this plan themselves. An admin-only plan (e.g. a
-- staff plan) stays grantable but never appears in the user-facing list.
alter table public.premium_plans add column if not exists user_requestable boolean not null default true;

-- ----------------------------------------------------------------------------
-- 3. PREMIUM REQUESTS — the missing self-service path
-- ----------------------------------------------------------------------------
-- Before this, Premium could only be granted by an admin who already knew a
-- user's id; a user seeing "Not subscribed" had no action available and no way
-- to signal interest. This is the queue that closes that loop.
create table if not exists public.premium_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_plan_id text references public.premium_plans(id) on delete set null,
  -- The user's own words about why. Never required.
  note text,
  status text not null check (status in ('pending', 'approved', 'declined', 'withdrawn')) default 'pending',
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_premium_requests_status on public.premium_requests(status, created_at desc);
-- At most one open request per user, so a user cannot flood the admin queue
-- by clicking twice. Partial unique index: resolved requests stay as history.
create unique index if not exists idx_premium_requests_one_open
  on public.premium_requests(user_id) where status = 'pending';

alter table public.premium_requests enable row level security;

-- A user may see and create their OWN requests, and nothing else. The admin
-- side reads through the service role, as every other admin route does.
drop policy if exists premium_requests_select_own on public.premium_requests;
create policy premium_requests_select_own
  on public.premium_requests for select using (auth.uid() = user_id);

drop policy if exists premium_requests_insert_own on public.premium_requests;
create policy premium_requests_insert_own
  on public.premium_requests for insert with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. PRIVACY BY CONSTRUCTION — the usage ledger is platform-paid only
-- ----------------------------------------------------------------------------
-- The owner's requirement is that an administrator must not be able to see
-- which providers or models an individual user chooses, or what they send
-- where. ai_usage_ledger is the only table that could carry that, and today
-- only Premium requests are written to it (server/routes/studio.ts) — because
-- Premium is the platform's own spend, which the admin legitimately must
-- account for.
--
-- Today that is a convention held in one function. This makes it a rule the
-- database enforces: a local/free/BYOK request — the user's own business,
-- paid for by the user — can no longer be recorded here even by mistake. A
-- future code path that tried would fail loudly rather than quietly building
-- a surveillance log.
--
-- Existing rows are unaffected: every row already present was written by the
-- Premium path.
alter table public.ai_usage_ledger drop constraint if exists ai_usage_ledger_platform_paid_only;
alter table public.ai_usage_ledger
  add constraint ai_usage_ledger_platform_paid_only check (tier = 'premium');

commit;

-- ============================================================================
-- Verification
-- ============================================================================
--   select count(*) from public.ai_resources;
--   select count(*) from public.plan_resources;
--   select conname from pg_constraint
--    where conrelid = 'public.ai_usage_ledger'::regclass
--      and conname = 'ai_usage_ledger_platform_paid_only';
--   -- Must fail:
--   -- insert into public.ai_usage_ledger (user_id, tier, request_id, status)
--   --   values (gen_random_uuid(), 'byok', gen_random_uuid(), 'success');
