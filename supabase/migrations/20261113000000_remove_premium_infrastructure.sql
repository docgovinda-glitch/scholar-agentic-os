-- Premium AI is no longer part of the platform: AI Access supports Local and
-- BYOK only. This removes every Premium table and function. Premium will be
-- designed again from scratch if it returns.
--
-- DESTRUCTIVE: the credit ledger, usage ledger, entitlements and platform
-- credentials are deleted with no way back. Export anything you need first.
-- Not applied automatically (migrations are deployed with the Supabase CLI).

-- Drops every overload, whatever argument types this database ended up with.
do $$
declare fn record;
begin
  for fn in
    select oid::regprocedure as sig from pg_proc
    where pronamespace = 'public'::regnamespace and proname in ('deduct_credits', 'grant_credits')
  loop
    execute 'drop function if exists ' || fn.sig || ' cascade';
  end loop;
end $$;

drop table if exists public.plan_resources cascade;
drop table if exists public.ai_resources cascade;
drop table if exists public.premium_requests cascade;
drop table if exists public.user_quota_overrides cascade;
drop table if exists public.user_entitlements cascade;
drop table if exists public.premium_plans cascade;
drop table if exists public.credit_ledger cascade;
drop table if exists public.credit_balances cascade;
drop table if exists public.ai_usage_ledger cascade;
drop table if exists public.platform_provider_credentials cascade;
drop table if exists public.platform_budgets cascade;
drop table if exists public.provider_health cascade;

-- A connection is Local or BYOK. "free" folded into BYOK: a free-tier key is still the user's own key.
update public.user_ai_connections set tier = 'byok' where tier = 'free';
