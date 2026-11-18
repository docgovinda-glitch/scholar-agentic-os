-- Atomic merge of answer keys into one project row.
--
-- Server routes that call the AI used to load a project, wait for the model
-- (often minutes), then upsert the whole row. Anything the student saved in
-- the meantime was overwritten with the stale copy. This function merges only
-- the keys a route produced, in one statement, so concurrent writes to other
-- keys survive.
--
-- p_patch: an object of answer keys. A key whose value is JSON null is
-- removed from answers; every other key is set (replaced, not deep-merged).
-- Returns the updated row, or no row when the project does not exist.
--
-- Only the service role may call it (the server checks ownership before the
-- call, as it does for every other write through the Data API).

create or replace function public.patch_project_answers(p_project_id text, p_patch jsonb)
returns setof public.projects
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.projects
     set answers = (
           coalesce(answers, '{}'::jsonb)
           || coalesce((select jsonb_object_agg(e.key, e.value)
                          from jsonb_each(p_patch) e
                         where e.value <> 'null'::jsonb), '{}'::jsonb)
         ) - coalesce((select array_agg(e.key)
                         from jsonb_each(p_patch) e
                        where e.value = 'null'::jsonb), '{}'::text[]),
         version = coalesce(version, 1) + 1,
         updated_at = now()
   where project_id = p_project_id
     and jsonb_typeof(p_patch) = 'object'
  returning *;
$$;

revoke all on function public.patch_project_answers(text, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.patch_project_answers(text, jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.patch_project_answers(text, jsonb) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.patch_project_answers(text, jsonb) to service_role;
  end if;
end
$$;
