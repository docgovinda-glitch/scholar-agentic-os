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

create index if not exists idx_projects_output_type on public.projects(output_type_id);
