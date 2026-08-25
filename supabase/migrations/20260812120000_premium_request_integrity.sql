-- ============================================================================
-- Migration: a user may create only a PENDING request, and may not forge a
--            decision on it
-- ============================================================================
--
-- Found reviewing the premium-request queue. premium_requests_insert_own
-- checked only `auth.uid() = user_id`, so a user holding the anon key could
-- POST to PostgREST directly and insert a row with any column they liked:
--
--   status = 'approved', decided_by = <another admin's id>,
--   decided_at = now(), decision_note = 'approved by X'
--
-- That grants no Premium by itself — entitlement lives in user_entitlements
-- and is written only by the admin route — but it forges an approval record
-- against a named administrator and pollutes the queue an admin works from.
-- A decision is the administrator's to record, so the database now says so.
--
-- Idempotent.

begin;

drop policy if exists premium_requests_insert_own on public.premium_requests;
create policy premium_requests_insert_own
  on public.premium_requests
  for insert
  with check (
    auth.uid() = user_id
    -- A request starts pending. Anything else is a decision, and a decision is
    -- not the requester's to make.
    and status = 'pending'
    and decided_by is null
    and decided_at is null
    and decision_note is null
  );

-- Users may withdraw their own PENDING request and nothing else: no editing a
-- decided one back to pending, and no writing a decision. The admin path uses
-- the service role and is unaffected by this.
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

-- ============================================================================
-- Verification
-- ============================================================================
--   select policyname, cmd, with_check from pg_policies
--    where tablename = 'premium_requests' order by policyname;
--
--   -- As an authenticated user, this must fail:
--   -- insert into public.premium_requests (user_id, status)
--   --   values (auth.uid(), 'approved');
