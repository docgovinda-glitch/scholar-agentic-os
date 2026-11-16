-- Coursework (OT-01) tables: owners read their own Stage 3 sources; browser
-- roles hold no write privileges at all.
--
-- 1. public.project_sources has forced RLS and no policy, so an owner could not
--    read the sources of their own project (the other assignment_* tables
--    already allow it through public.owns_project). Add the same owner-select.
-- 2. Supabase's default privileges grant anon/authenticated INSERT, UPDATE,
--    DELETE and TRUNCATE on new public tables. RLS (no write policies) already
--    rejects row writes, but TRUNCATE is not subject to RLS. All writes to these
--    tables go through the server with the service role, so revoke them, and
--    revoke everything from anon.

drop policy if exists project_sources_select_own on public.project_sources;
create policy project_sources_select_own on public.project_sources
  for select to authenticated using (public.owns_project(project_id));

do $$
declare t text;
begin
  foreach t in array array[
    'assignment_projects', 'assignment_files', 'assignment_outline_sections',
    'assignment_draft_revisions', 'assignment_submission_checks', 'project_sources'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
