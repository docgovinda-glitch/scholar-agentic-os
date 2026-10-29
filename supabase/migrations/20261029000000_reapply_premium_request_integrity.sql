-- ============================================================================
-- Migration: re-apply the premium_requests integrity policies
-- ============================================================================
-- 20260812120000_premium_request_integrity sorts BEFORE
-- 20260812180000_two_router_architecture, and the latter drops and recreates
-- premium_requests_insert_own with only `auth.uid() = user_id`. Applied in
-- timestamp order, the stricter policy is silently replaced, so an
-- authenticated user can insert a request that is already 'approved' and
-- names an administrator in decided_by. (On a fresh database the earlier
-- migration even fails, because premium_requests does not exist yet.)
--
-- Re-creating both policies here, after both migrations, makes the final
-- state correct regardless of the order the earlier two were applied in.
-- Idempotent; policy-only, no data changes.
begin;

drop policy if exists premium_requests_insert_own on public.premium_requests;
create policy premium_requests_insert_own
  on public.premium_requests
  for insert
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and decision_note is null
  );

drop policy if exists premium_requests_withdraw_own on public.premium_requests;
create policy premium_requests_withdraw_own
  on public.premium_requests
  for update
  using (auth.uid() = user_id and status = 'pending')
  with check (
    auth.uid() = user_id
    and status in ('pending', 'withdrawn')
    and decided_by is null
    and decision_note is null
  );

commit;

-- Verification (read-only):
--   select policyname, cmd, with_check from pg_policies
--    where schemaname = 'public' and tablename = 'premium_requests'
--    order by policyname;
-- Rollback: re-run 20260812180000's policy block (restores the weaker check).
