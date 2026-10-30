-- B4: credit balance and ledger stay in step (local Supabase only; CI e2e).
-- Run: psql "$DB_URL" -v ON_ERROR_STOP=1 -f scripts/db/test-credits.sql
-- Everything happens in one transaction that is rolled back.
begin;

do $$
declare
  u uuid := gen_random_uuid();
  r text;
  bal numeric;
  ledger_sum numeric;
  ledger_rows int;
begin
  insert into auth.users (id, email) values (u, 'credits-test-' || u || '@example.test');

  -- A grant adds to the balance and writes one ledger row.
  perform public.grant_credits(u, 10, 'admin_grant', 'test grant');

  -- A charge within limits succeeds.
  r := public.deduct_credits(u, 3, null, null, 'usage', gen_random_uuid(), 'test charge', null);
  if r <> 'ok' then raise exception 'expected ok, got %', r; end if;

  -- A charge above the balance is refused and changes nothing.
  r := public.deduct_credits(u, 8, null, null, 'usage', gen_random_uuid(), null, null);
  if r <> 'insufficient_balance' then raise exception 'expected insufficient_balance, got %', r; end if;

  -- Each limit is enforced against what was already used (3).
  r := public.deduct_credits(u, 2, 4, null, 'usage', gen_random_uuid(), null, null);
  if r <> 'daily_limit_exceeded' then raise exception 'expected daily_limit_exceeded, got %', r; end if;
  r := public.deduct_credits(u, 2, null, null, 'usage', gen_random_uuid(), null, 4);
  if r <> 'weekly_limit_exceeded' then raise exception 'expected weekly_limit_exceeded, got %', r; end if;
  r := public.deduct_credits(u, 2, null, 4, 'usage', gen_random_uuid(), null, null);
  if r <> 'monthly_limit_exceeded' then raise exception 'expected monthly_limit_exceeded, got %', r; end if;

  -- The balance equals the ledger, and refused charges left no ledger rows.
  select balance into bal from public.credit_balances where user_id = u;
  select coalesce(sum(delta), 0), count(*) into ledger_sum, ledger_rows from public.credit_ledger where user_id = u;
  if bal <> 7 then raise exception 'balance should be 7, is %', bal; end if;
  if ledger_sum <> bal then raise exception 'ledger sum % does not match balance %', ledger_sum, bal; end if;
  if ledger_rows <> 2 then raise exception 'expected 2 ledger rows (grant + one charge), found %', ledger_rows; end if;

  -- Usage counters moved only for the successful charge.
  perform 1 from public.credit_balances
    where user_id = u and daily_used = 3 and weekly_used = 3 and monthly_used = 3;
  if not found then raise exception 'usage counters should all be 3'; end if;

  raise notice 'credits: balance % = ledger %, % rows, limits enforced', bal, ledger_sum, ledger_rows;
end;
$$;

-- Only the service role may move credits.
do $$
begin
  if has_function_privilege('authenticated', 'public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text, numeric)', 'execute')
     or has_function_privilege('anon', 'public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text, numeric)', 'execute')
     or has_function_privilege('authenticated', 'public.grant_credits(uuid, numeric, text, text)', 'execute')
     or has_function_privilege('anon', 'public.grant_credits(uuid, numeric, text, text)', 'execute') then
    raise exception 'credit functions must not be executable by anon/authenticated';
  end if;
  raise notice 'credits: functions restricted to service_role';
end;
$$;

rollback;
