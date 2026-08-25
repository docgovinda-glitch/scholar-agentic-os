-- Duplicate identifier detection: RPC functions to check availability
--
-- These functions allow the signup form to check username, email, and phone availability
-- in real-time as the user types, providing immediate feedback when an identifier is taken.
--
-- This prevents the user from submitting a form that will fail due to duplicate identifiers,
-- and provides clear guidance on which identifier conflicts and what to do about it.
--
-- The client-side signUp() function will call these during form validation and provide
-- specific error messages. For example:
--   - "This username is already taken"
--   - "This email address is already registered. Would you like to sign in instead?"
--   - "This phone number is already registered"

-- ============================================================================
-- 1. check_username_available: Verify username availability
-- ============================================================================
-- Input: username to check
-- Output: true if available, false if already taken
--
-- Called during signup form validation to check username availability.
-- Allows the signup form to show real-time feedback as the user types.

create or replace function public.check_username_available(lookup_username text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select not exists(
    select 1 from public.profiles
    where username = lookup_username
  );
$$;

grant execute on function public.check_username_available(text) to anon, authenticated;

-- ============================================================================
-- 2. check_email_available: Verify email availability
-- ============================================================================
-- Input: email to check
-- Output: true if available, false if already registered in auth.users
--
-- Email uniqueness is enforced by Supabase Auth (auth.users table).
-- We check by attempting a lookup — if the email exists in auth.users,
-- check_email_available returns false.
--
-- Note: We cannot directly query auth.users due to RLS policies, so this
-- function is a fallback. The real enforcement happens at signup time when
-- Supabase Auth returns "User already registered" if the email exists.

create or replace function public.check_email_available(lookup_email text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select not exists(
    select 1 from auth.users
    where email = lookup_email
  );
$$;

grant execute on function public.check_email_available(text) to anon, authenticated;

-- ============================================================================
-- 3. check_phone_available: Verify phone_e164 availability
-- ============================================================================
-- Input: phone_e164 (complete E.164 format phone number)
-- Output: true if available, false if already registered
--
-- Phone uniqueness is enforced by the unique constraint added in
-- 2026-08-15_auth_uniqueness_constraints.sql. This function allows
-- the signup form to check availability before submission.

create or replace function public.check_phone_available(lookup_phone_e164 text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select not exists(
    select 1 from public.profiles
    where phone_e164 = lookup_phone_e164
      and phone_e164 is not null  -- allow multiple users with no phone
  );
$$;

grant execute on function public.check_phone_available(text) to anon, authenticated;

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- These functions are read-only and safe to add/update in production.
-- They do not modify data, only check for existing identifiers.
--
-- Client-side changes required:
--   - src/services/supabaseAuthService.ts should export check functions:
--     - checkUsernameAvailable(username: string): Promise<boolean>
--     - checkEmailAvailable(email: string): Promise<boolean>
--     - checkPhoneAvailable(phoneE164: string): Promise<boolean>
--
--   - src/desk/auth/AuthFlow.tsx SignUpScreen should:
--     - Call these functions during form validation
--     - Show real-time feedback as user types
--     - Prevent form submission if identifier conflicts
--     - For email conflicts, show link to sign-in
--
--   - Tests must cover:
--     - Available identifier → shows no error
--     - Duplicate identifier → shows error and prevents submission
--     - Form can be corrected and resubmitted after fixing identifier
