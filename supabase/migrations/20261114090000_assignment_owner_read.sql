-- Coursework relational tables: let owners actually read their own rows.
--
-- 20261113180000 gave each assignment_* table an owner-select policy that
-- looked the project up in public.projects. But public.projects grants the
-- browser roles no SELECT (only the server reads it, with the service role),
-- so that lookup always came back empty and the policies denied everyone,
-- owners included. This replaces the lookup with a narrow SECURITY DEFINER
-- check that answers one question for the caller: "do I own this project?"
-- Writes stay server-only (there are still no insert/update/delete policies).

create or replace function public.owns_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects
    where project_id = p_project_id and owner_id = auth.uid()
  );
$$;

revoke all on function public.owns_project(text) from public;
grant execute on function public.owns_project(text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'assignment_projects', 'assignment_files', 'assignment_outline_sections',
    'assignment_draft_revisions', 'assignment_submission_checks'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.owns_project(project_id))',
      t || '_select_own', t
    );
  end loop;
end $$;
