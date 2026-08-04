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
-- No Row Level Security here: this table is written only from the server
-- process, over a direct Postgres connection (DATABASE_URL — Project
-- Settings -> Database -> Connection string in the Supabase dashboard),
-- never from a browser client with the anon key. That's a different trust
-- boundary from supabase/schema.sql's tables, which the browser does talk
-- to directly and which RLS is what protects.
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

create index if not exists idx_projects_output_type on public.projects(output_type_id);
-- Every listing query is owner-scoped and ordered by recency.
create index if not exists idx_projects_owner on public.projects(owner_id, updated_at desc);
