-- P1-11: deduct_credits / grant_credits reject a zero or negative amount.
-- A negative charge would have added credits and a negative grant removed
-- them. Only the service role can call these, and the server already sends
-- positive amounts (admin grant validates > 0; usage charges are >= 1), so
-- this changes no current behaviour; it closes the gap at the database.
-- Bodies are otherwise identical to supabase/schema_ai_engine.sql.

create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_note text default null
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'credit amount must be positive, got %', p_amount using errcode = '22023';
  end if;
  insert into public.credit_balances (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  update public.credit_balances
    set balance = balance + p_amount, updated_at = now()
    where user_id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, note)
    values (p_user_id, p_amount, p_reason, p_note);
end;
$$;

revoke execute on function public.grant_credits(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.grant_credits(uuid, numeric, text, text) to service_role;

create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount numeric,
  p_daily_limit numeric,
  p_monthly_limit numeric,
  p_reason text,
  p_request_id uuid,
  p_note text default null,
  p_weekly_limit numeric default null
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance numeric;
  v_daily_used numeric;
  v_weekly_used numeric;
  v_monthly_used numeric;
  v_daily_reset timestamptz;
  v_weekly_reset timestamptz;
  v_monthly_reset timestamptz;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'credit amount must be positive, got %', p_amount using errcode = '22023';
  end if;
  insert into public.credit_balances (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select balance, daily_used, weekly_used, monthly_used, daily_reset_at, weekly_reset_at, monthly_reset_at
    into v_balance, v_daily_used, v_weekly_used, v_monthly_used, v_daily_reset, v_weekly_reset, v_monthly_reset
    from public.credit_balances where user_id = p_user_id for update;

  if v_daily_reset < date_trunc('day', now()) then
    v_daily_used := 0;
    v_daily_reset := date_trunc('day', now());
  end if;
  if v_weekly_reset < date_trunc('week', now()) then
    v_weekly_used := 0;
    v_weekly_reset := date_trunc('week', now());
  end if;
  if v_monthly_reset < date_trunc('month', now()) then
    v_monthly_used := 0;
    v_monthly_reset := date_trunc('month', now());
  end if;

  if p_daily_limit is not null and v_daily_used + p_amount > p_daily_limit then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      weekly_used = v_weekly_used, weekly_reset_at = v_weekly_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'daily_limit_exceeded';
  end if;
  if p_weekly_limit is not null and v_weekly_used + p_amount > p_weekly_limit then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      weekly_used = v_weekly_used, weekly_reset_at = v_weekly_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'weekly_limit_exceeded';
  end if;
  if p_monthly_limit is not null and v_monthly_used + p_amount > p_monthly_limit then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      weekly_used = v_weekly_used, weekly_reset_at = v_weekly_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'monthly_limit_exceeded';
  end if;
  if v_balance < p_amount then
    update public.credit_balances set daily_used = v_daily_used, daily_reset_at = v_daily_reset,
      weekly_used = v_weekly_used, weekly_reset_at = v_weekly_reset,
      monthly_used = v_monthly_used, monthly_reset_at = v_monthly_reset where user_id = p_user_id;
    return 'insufficient_balance';
  end if;

  update public.credit_balances
    set balance = v_balance - p_amount,
        daily_used = v_daily_used + p_amount,
        weekly_used = v_weekly_used + p_amount,
        monthly_used = v_monthly_used + p_amount,
        daily_reset_at = v_daily_reset,
        weekly_reset_at = v_weekly_reset,
        monthly_reset_at = v_monthly_reset,
        updated_at = now()
    where user_id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, request_id, note)
    values (p_user_id, -p_amount, p_reason, p_request_id, p_note);

  return 'ok';
end;
$$;

revoke execute on function public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, numeric, numeric, numeric, text, uuid, text, numeric) to service_role;
