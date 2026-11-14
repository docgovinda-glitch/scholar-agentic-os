-- Coursework & Essay (OT-01): normalized, queryable state for all five stages.
--
-- The project row (`projects.answers`) stays the source of truth the app reads;
-- the server mirrors every Coursework save into these tables (service role,
-- after the route has checked ownership), so each stage is stored in its own
-- typed rows with foreign keys back to the project:
--
--   Stage 1 Extract     -> assignment_projects (brief text, target words) + assignment_files (role 'brief')
--   Stage 2 Understand  -> assignment_outline_sections
--   Stage 3 Sources     -> project_sources (+ origin) and assignment_files (role 'source')
--   Stage 4 Draft       -> assignment_draft_revisions (one snapshot per changed section)
--   Stage 5 Submission  -> assignment_submission_checks
--
-- Owners may read their own rows directly; all writes go through the server.

-- 1. Workspace state. The 2026-09-27 table only allowed four phases (no
--    'extract') and was never written; widen it and add per-stage status.
create table if not exists public.assignment_projects (
  project_id text primary key references public.projects(project_id) on delete cascade,
  current_phase text not null default 'extract',
  brief jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  drafting jsonb not null default '{}'::jsonb,
  submission jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assignment_projects drop constraint if exists assignment_projects_current_phase_check;
alter table public.assignment_projects alter column current_phase set default 'extract';
alter table public.assignment_projects
  add constraint assignment_projects_current_phase_check
  check (current_phase in ('extract', 'understand', 'sources', 'drafting', 'submission'));

alter table public.assignment_projects add column if not exists title text;
alter table public.assignment_projects add column if not exists brief_text text;
alter table public.assignment_projects add column if not exists target_word_count integer
  check (target_word_count is null or target_word_count between 0 and 200000);
alter table public.assignment_projects add column if not exists citation_style text;
alter table public.assignment_projects add column if not exists writing_style text;
alter table public.assignment_projects add column if not exists stage_status jsonb not null default '{}'::jsonb;
alter table public.assignment_projects add column if not exists preferences jsonb not null default '{}'::jsonb;

-- 2. Files: the assignment brief (Stage 1) and the student's own source uploads (Stage 3).
create table if not exists public.assignment_files (
  project_id text not null references public.projects(project_id) on delete cascade,
  file_id text not null check (char_length(file_id) between 1 and 200),
  role text not null check (role in ('brief', 'source')),
  file_name text not null default '' check (char_length(file_name) <= 500),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  storage_path text,
  parsed_text text,
  processing_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, file_id),
  constraint assignment_files_text_size check (parsed_text is null or octet_length(parsed_text) <= 2000000)
);

-- 3. Outline (Stage 2): one row per heading / subheading, ordered and nested.
create table if not exists public.assignment_outline_sections (
  project_id text not null references public.projects(project_id) on delete cascade,
  section_id text not null check (char_length(section_id) between 1 and 200),
  parent_section_id text,
  position integer not null check (position >= 0),
  level smallint not null default 1 check (level between 1 and 3),
  title text not null default '',
  guidance text,
  target_word_count integer check (target_word_count is null or target_word_count >= 0),
  key_points jsonb not null default '[]'::jsonb check (jsonb_typeof(key_points) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (project_id, section_id)
);

-- 4. Sources (Stage 3): live, vault, upload or prescribed-in-brief.
alter table public.project_sources add column if not exists origin text;
alter table public.project_sources add column if not exists is_approved boolean not null default false;

-- 5. Draft revisions (Stage 4): a snapshot each time a section's text changes.
create table if not exists public.assignment_draft_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(project_id) on delete cascade,
  section_id text not null,
  content_hash text not null,
  content text not null default '',
  word_count integer not null default 0 check (word_count >= 0),
  cited_source_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(cited_source_ids) = 'array'),
  created_at timestamptz not null default now(),
  unique (project_id, section_id, content_hash),
  constraint assignment_draft_revisions_size check (octet_length(content) <= 500000)
);

create index if not exists assignment_draft_revisions_section_idx
  on public.assignment_draft_revisions (project_id, section_id, created_at desc);

-- 6. Pre-submission checks (Stage 5).
create table if not exists public.assignment_submission_checks (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(project_id) on delete cascade,
  report_hash text not null,
  passed boolean,
  report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, report_hash)
);

-- RLS: owners read their own rows; no direct writes from the browser.
do $$
declare t text;
begin
  foreach t in array array[
    'assignment_projects', 'assignment_files', 'assignment_outline_sections',
    'assignment_draft_revisions', 'assignment_submission_checks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select using (exists (select 1 from public.projects p where p.project_id = %I.project_id and p.owner_id = auth.uid()))',
      t || '_select_own', t, t
    );
  end loop;
end $$;

-- The 2026-09-27 "for all" policy let owners write workspace state directly; writes now go through the server only.
drop policy if exists "Users can view and manage their own assignment projects" on public.assignment_projects;
