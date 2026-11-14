-- public.owns_project is only for signed-in users' RLS checks. Supabase's
-- default privileges also granted EXECUTE to anon; it always returned false
-- there (no auth.uid()), but nothing anonymous should be able to call it.
revoke execute on function public.owns_project(text) from anon;
