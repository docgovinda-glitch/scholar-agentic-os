-- Migration: 4-Phase Coursework & Essay Engine JSONB Schema
-- Supports 4-phase state slices: brief, sources, drafting, submission

-- 1. Ensure table public.assignment_projects exists for dedicated assignment tracking
create table if not exists public.assignment_projects (
  project_id text primary key references public.projects(project_id) on delete cascade,
  current_phase text not null default 'understand' check (current_phase in ('understand', 'sources', 'drafting', 'submission')),
  brief jsonb not null default '{}'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  drafting jsonb not null default '{}'::jsonb,
  submission jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS policies for assignment_projects
alter table public.assignment_projects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
      and tablename = 'assignment_projects' 
      and policyname = 'Users can view and manage their own assignment projects'
  ) then
    create policy "Users can view and manage their own assignment projects"
      on public.assignment_projects
      for all
      using (
        exists (
          select 1 from public.projects
          where projects.project_id = assignment_projects.project_id
            and projects.owner_id = auth.uid()
        )
      );
  end if;
end $$;

-- 2. Add assignment_state column to public.projects to ensure atomic, non-destructive persistence alongside journal article fields
alter table public.projects add column if not exists assignment_state jsonb default '{}'::jsonb;
