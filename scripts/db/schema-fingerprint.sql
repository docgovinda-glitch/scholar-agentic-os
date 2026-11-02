-- Read-only schema fingerprint: one line per object, sorted, so two databases
-- can be compared with a plain diff (scripts/db/schema-diff.sh). Covers the
-- public schema, storage buckets/policies and extensions. Selects only.
with
tbl as (
  select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
lines as (
  select 'table ' || tbl.relname || ' rls=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity
  from tbl join pg_class c on c.oid = tbl.oid
  union all
  select 'column ' || t.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
         || case when a.attnotnull then ' not null' else '' end
         || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
  from tbl t join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  union all
  select 'constraint ' || t.relname || ' ' || con.contype::text || ' ' || pg_get_constraintdef(con.oid)
  from tbl t join pg_constraint con on con.conrelid = t.oid
  union all
  select 'index ' || regexp_replace(indexdef, ' USING ', ' using ') from pg_indexes where schemaname = 'public'
  union all
  select 'policy ' || schemaname || '.' || tablename || ' "' || policyname || '" ' || permissive || ' ' || cmd
         || ' to ' || array_to_string(array(select unnest(roles) order by 1), ',')
         || ' using(' || coalesce(qual, '') || ') check(' || coalesce(with_check, '') || ')'
  from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'function ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') returns '
         || pg_get_function_result(p.oid) || case when p.prosecdef then ' security definer' else '' end
         || ' ' || p.provolatile::text || coalesce(' config=' || array_to_string(p.proconfig, ';'), '')
         -- Body hash ignores comments and whitespace, so a comment-only edit is not drift.
         || ' body=' || md5(regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
  union all
  select 'execute ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || r.rolname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
  where n.nspname = 'public' and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend dp where dp.objid = p.oid and dp.deptype = 'e')
    and has_function_privilege(r.rolname, p.oid, 'execute')
  union all
  select 'grant ' || table_name || ' ' || grantee || ' ' || privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select 'trigger ' || c.relname || ' ' || pg_get_triggerdef(tg.oid)
  from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where not tg.tgisinternal and n.nspname in ('public', 'storage', 'auth')
  union all
  select 'bucket ' || id || ' public=' || coalesce(public::text, 'null') || ' limit=' || coalesce(file_size_limit::text, 'null')
         || ' mime=' || coalesce(array_to_string(allowed_mime_types, ','), 'null')
  from storage.buckets
  union all
  select 'extension ' || extname from pg_extension
)
select regexp_replace(l, '\s+', ' ', 'g') as line from lines t(l) order by 1;
