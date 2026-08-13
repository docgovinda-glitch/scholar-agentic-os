-- Unified login: Add RPC functions to support username, email, and phone login
--
-- Previously, Scholar only supported login by username. This migration adds functions
-- to support flexible login using:
--   1. Username / User ID
--   2. Email address
--   3. Mobile number (phone_e164)
--
-- The client-side signIn() function will:
--   1. Detect which type of identifier the user entered (using regex patterns)
--   2. Call the appropriate lookup function
--   3. Get back the email
--   4. Authenticate with Supabase Auth using email + password
--
-- This keeps the complexity in the database (where it belongs for consistency)
-- and makes the client-side logic straightforward.

-- ============================================================================
-- 1. email_for_phone_e164: Look up email by complete phone number
-- ============================================================================
-- Input: phone_e164 format (e.g., "+19800000000")
-- Output: email address associated with that phone, or NULL if not found
--
-- Used when user enters a phone number at login.
-- Identical signature to email_for_username() for consistency.

create or replace function public.email_for_phone_e164(lookup_phone_e164 text)
returns text
language sql
security definer set search_path = public
stable
as $$
  select au.email
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.phone_e164 = lookup_phone_e164
  limit 1;
$$;

grant execute on function public.email_for_phone_e164(text) to anon, authenticated;

-- ============================================================================
-- 2. email_for_identifier: Universal lookup by username, email, or phone
-- ============================================================================
-- Input: identifier (username, email address, or phone_e164)
-- Output: email address for Supabase Auth signin
--
-- Returns NULL if identifier not found or is ambiguous.
-- Called by client-side signIn() which pre-detects identifier type and calls
-- the specific function above, but this is kept as a comprehensive alternative
-- in case the client-side detection misidentifies the input.

create or replace function public.email_for_identifier(lookup_identifier text)
returns table(email text, found_by text)
language sql
security definer set search_path = public
stable
as $$
  -- Try username first (most specific)
  select au.email, 'username'::text as found_by
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.username = lookup_identifier
  limit 1

  union all

  -- Try email address (exact match in auth.users)
  select au.email, 'email'::text as found_by
  from auth.users au
  where au.email = lookup_identifier
  limit 1

  union all

  -- Try phone_e164 (only if it looks like a phone in E.164 format)
  select au.email, 'phone'::text as found_by
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.phone_e164 = lookup_identifier
    and lookup_identifier like '+%'  -- E.164 format starts with +
  limit 1
$$;

grant execute on function public.email_for_identifier(text) to anon, authenticated;

-- ============================================================================
-- 3. Verify functions work correctly
-- ============================================================================
-- Test queries (run in SQL Editor to verify):
--
-- -- Test email_for_username (existing function, should still work):
-- SELECT email_for_username('testuser');
--
-- -- Test email_for_phone_e164 (new function):
-- SELECT email_for_phone_e164('+19800000000');
--
-- -- Test email_for_identifier (new universal function):
-- SELECT * FROM email_for_identifier('testuser');
-- SELECT * FROM email_for_identifier('test@example.com');
-- SELECT * FROM email_for_identifier('+19800000000');

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- These functions are read-only and safe to add/update in production.
-- They do not modify data, only query existing profiles and auth.users.
--
-- Client-side changes required:
--   - src/services/supabaseAuthService.ts signIn() function must be updated
--     to detect identifier type and call appropriate function
--   - src/desk/auth/AuthFlow.tsx SignInScreen must update field label and hint
--   - Tests must cover all three identifier types
