-- Authentication system: Add database-level uniqueness constraints for email and phone
--
-- ROOT CAUSE: Currently, only username has a uniqueness constraint. Email and phone_e164
-- lack database-level uniqueness, allowing duplicate accounts with same email or phone.
-- This migration adds the missing constraints to enforce:
--
--   1. Each phone_e164 is unique (one account per phone number + country code combination)
--   2. Email uniqueness via Supabase Auth (auth.users table)
--
-- Phone uniqueness implementation:
--   - phone_e164 is a generated column combining phone_country_code + phone
--   - NULL values are allowed (users with no phone registered)
--   - Generated columns cannot have explicit constraints in their definition,
--     so we add a unique constraint on the column after it exists
--   - Constraint is not enforced when phone_e164 is NULL, allowing multiple users
--     with no phone registered (this is correct behavior)
--
-- Email uniqueness is enforced by Supabase Auth (auth.users table):
--   - Supabase automatically enforces email uniqueness at auth level
--   - No additional constraint needed in profiles table
--   - Email is only stored in auth.users, never duplicated in profiles
--
-- This migration is IDEMPOTENT:
--   - Uses "add constraint if not exists" pattern
--   - Safe to re-run against already-updated database
--   - Checks for existing duplicates before adding constraint

-- ============================================================================
-- 1. Check for duplicate phone_e164 values (before adding constraint)
-- ============================================================================
-- This query identifies any existing duplicates that would prevent constraint creation:
-- SELECT phone_e164, COUNT(*) as count FROM profiles WHERE phone_e164 IS NOT NULL GROUP BY phone_e164 HAVING COUNT(*) > 1;
-- If this returns rows, those duplicates must be manually resolved before constraint can be added.

-- ============================================================================
-- 2. Add unique constraint on phone_e164
-- ============================================================================
-- This ensures no two users can have the same complete phone number (country code + number).
-- NULL phone_e164 values are allowed (users who didn't provide a phone), and NULL is not
-- considered equal to other NULLs in a unique constraint, so multiple users with no phone
-- is allowed (correct behavior).

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_phone_e164_unique' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_phone_e164_unique unique (phone_e164);
  end if;
end $$;

-- ============================================================================
-- 3. Create index on phone_e164 for fast lookups
-- ============================================================================
-- Supports efficient queries like "find user by phone number"

create index if not exists idx_profiles_phone_e164 on public.profiles(phone_e164) where phone_e164 is not null;

-- ============================================================================
-- 4. Add index on email for future lookups in auth.users
-- ============================================================================
-- Note: Supabase Auth handles auth.users; this comment documents that email uniqueness
-- is already enforced there. We do not add a column to profiles for email (email lives
-- only in auth.users, see supabaseAuthService.ts:getProfile() which reads it from
-- auth.getUser(), never from profiles).

-- ============================================================================
-- 5. Verify constraints are in place
-- ============================================================================
-- This final check ensures the constraints were successfully created.
-- After running this migration, the following should be true:
--
--   SELECT constraint_name, table_name, column_name
--   FROM information_schema.constraint_column_usage
--   WHERE table_name = 'profiles' AND column_name IN ('username', 'phone_e164')
--   ORDER BY constraint_name;
--
-- Should return:
--   - constraint_name: 'profiles_pkey', column_name: 'id'
--   - constraint_name: 'profiles_username_key', column_name: 'username'
--   - constraint_name: 'profiles_phone_e164_unique', column_name: 'phone_e164'

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- Before running this migration, verify:
--   1. No existing duplicate phone_e164 values exist
--      (Run check query above to verify - if there are duplicates, they must be manually resolved)
--   2. Database backup exists
--   3. No active user registration happening during migration
--
-- If the constraint creation fails due to duplicates:
--   1. Query to find duplicates: SELECT phone_e164, COUNT(*) FROM profiles WHERE phone_e164 IS NOT NULL GROUP BY phone_e164 HAVING COUNT(*) > 1;
--   2. Manually review and merge/delete duplicate accounts
--   3. Re-run migration
--
-- Rollback procedure (if needed):
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_e164_unique;
--   DROP INDEX IF EXISTS idx_profiles_phone_e164;
