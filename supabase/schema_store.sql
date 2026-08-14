-- services/store's schema — project persistence for the redesigned Atlas /
-- Conductor / Rubric / Claim-graph architecture
-- (docs/01-product/13-MODULE-SPECIFICATIONS.md's "services/store": "Object
-- persistence, transactions, snapshots. Owns the Postgres schema.").
--
-- This is a SEPARATE, independent schema from supabase/schema.sql (which
-- covers the older app's users/auth/api-credentials). Nothing in either
-- file references the other; running one does not require the other.
--
-- Backs src/services/store/pgProjectStore.ts, selected automatically by
-- src/services/store/projectStore.ts whenever DATABASE_URL is set. Without
-- DATABASE_URL the server keeps using the in-memory store
-- (src/app/conductor/projectStore.ts) — running this file is optional until
-- you actually want project data to survive a restart.
--
-- Run this in the Supabase SQL Editor (or via `psql "$DATABASE_URL" -f
-- supabase/schema_store.sql`) once, before setting DATABASE_URL.
--
-- Row Level Security IS enabled below, with deliberately zero policies.
--
-- This reverses an earlier note here which read "No Row Level Security here:
-- this table is written only from the server process, over a direct Postgres
-- connection ... never from a browser client with the anon key." That was true
-- of the direct-connection path, and it stopped being true the moment this
-- table became reachable through Supabase's Data API (PostgREST), which
-- publishes every table in `public` at
-- https://<ref>.supabase.co/rest/v1/<table>. The anon key is public by design
-- — it ships inside the browser bundle — so without RLS, anyone who viewed the
-- page source could read and rewrite every project in the database.
--
-- RLS was in fact already on in the live database, but only because Supabase
-- enables it by default on new tables. A fresh database created from this file
-- alone would have had it OFF. That gap is closed by declaring it here.
--
-- Zero policies is the intended configuration, not an oversight: with RLS on
-- and no policy, `anon` and `authenticated` can do nothing at all, while
-- `service_role` and `postgres` still have full access because they carry
-- BYPASSRLS. The server holds the service-role key; browsers never do.
-- Authorization by owner is enforced in server/routes/project.ts
-- (loadOwnedProject), which is where it can distinguish "not found" from
-- "not yours" — a policy here could only ever deny.
--
-- Column shapes mirror src/app/conductor/projectStore.ts's ProjectRecord
-- (answers/gates/document/rubric_report/claim_graph/waivers), stored as
-- jsonb rather than normalized further — this is the pragmatic increment
-- described in src/services/store/pgProjectStore.ts's module comment, not
-- docs/04-architecture/45-DATA-ARCHITECTURE.md §2-§10's full target schema.

create table if not exists public.projects (
  project_id text primary key,
  -- Supabase user id of the owner. Every read and write through
  -- server/routes/project.ts is checked against this.
  --
  -- No foreign key to auth.users, deliberately: deleting an account must not
  -- cascade a user's academic work out of existence without an explicit,
  -- reviewed deletion path. Orphaned rows are the safer failure here.
  owner_id uuid not null,
  output_type_id text not null,
  answers jsonb not null default '{}'::jsonb,
  gates jsonb not null default '{}'::jsonb,
  document jsonb,
  rubric_report jsonb,
  claim_graph jsonb not null default '{}'::jsonb,
  waivers jsonb not null default '{}'::jsonb,
  -- Post-G6 submission attempts against journals (domain/submission/types.ts).
  -- Orthogonal to the gate columns above — a project can be G6-signed-off
  -- with any number of submission attempts against different venues.
  submissions jsonb not null default '[]'::jsonb,
  -- The target journal's captured requirements (domain/journal/types.ts,
  -- gate G1). Nullable, unlike the columns above defaulting to an empty
  -- container: "not yet captured" is a real, distinct state from "captured
  -- but empty" for this one.
  journal_requirements jsonb,
  -- Discovered sources and their evidence-provenance state
  -- (domain/evidence/types.ts). Defaults to an empty ledger, same as
  -- claim_graph above — always present, possibly with nothing in it yet.
  evidence_ledger jsonb not null default '{"sources":[],"items":[]}'::jsonb,
  -- The long-form generation engine's durable checkpoint
  -- (domain/manuscript/types.ts). Nullable, same as journal_requirements:
  -- "never started" is a real, distinct state, not an empty container.
  generation_job jsonb,
  -- Every multi-lens peer review round run so far (domain/review/types.ts).
  -- Defaults to an empty history, same as claim_graph/evidence_ledger:
  -- always present, versioned — a round is appended, never overwritten.
  peer_review_history jsonb not null default '{"rounds":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration for databases created before owner_id existed.
--
-- `create table if not exists` above is a no-op on an existing table, so a
-- deployed database would keep its old, owner-less shape and every insert
-- would fail on the missing column. This adds it.
--
-- Existing rows are the awkward case: they were created through an
-- unauthenticated endpoint and have no recoverable owner. They are assigned
-- the nil UUID rather than being deleted (destroying user work) or left
-- nullable (which would let the ownership check be bypassed by a null).
-- No real Supabase user has the nil UUID, so those rows become unreachable
-- through the API — quarantined, not destroyed, and available for a
-- deliberate reassignment or purge.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'owner_id'
  ) then
    alter table public.projects add column owner_id uuid;
    update public.projects set owner_id = '00000000-0000-0000-0000-000000000000' where owner_id is null;
    alter table public.projects alter column owner_id set not null;
  end if;
end $$;

-- Migration for databases created before the submissions column existed.
-- Unlike owner_id above, this has no awkward backfill case: a project with
-- no submission history yet is simply an empty list, exactly what new rows
-- already default to.
alter table public.projects add column if not exists submissions jsonb not null default '[]'::jsonb;

-- Migration for databases created before journal_requirements existed.
-- Nullable, no default: an existing row simply has no requirements captured
-- yet, the same state a freshly created row starts in.
alter table public.projects add column if not exists journal_requirements jsonb;

-- Migration for databases created before evidence_ledger existed. Same
-- no-awkward-backfill case as submissions above: an existing project simply
-- has an empty ledger, exactly what a new row already defaults to.
alter table public.projects add column if not exists evidence_ledger jsonb not null default '{"sources":[],"items":[]}'::jsonb;

-- Migration for databases created before generation_job existed. Nullable,
-- no default — same "not yet captured" case as journal_requirements.
alter table public.projects add column if not exists generation_job jsonb;

-- Migration for databases created before peer_review_history existed. Same
-- no-awkward-backfill case as submissions/evidence_ledger: an existing
-- project simply has no rounds yet, exactly what a new row already defaults to.
alter table public.projects add column if not exists peer_review_history jsonb not null default '{"rounds":[]}'::jsonb;

-- Deny-all baseline for anon/authenticated (see the note at the top of this
-- file). FORCE additionally applies RLS to the table's owner; roles with
-- BYPASSRLS — service_role and postgres — are unaffected either way, so the
-- server keeps working while every browser-reachable role is locked out.
alter table public.projects enable row level security;
alter table public.projects force row level security;

create index if not exists idx_projects_output_type on public.projects(output_type_id);
-- Every listing query is owner-scoped and ordered by recency.
create index if not exists idx_projects_owner on public.projects(owner_id, updated_at desc);
