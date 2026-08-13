# Verifying the Auth Migrations Are Actually Applied to Your Supabase Project

## Why this document exists

Every migration referenced by the auth work in this repo exists as a `.sql`
file under `supabase/migrations/` — but **a file existing in this repository
does not mean it has been run against your live Supabase project.** Nothing
in this sandbox has a connection to your real Supabase project (no dashboard
login, no CLI session, no management API token), so nothing here could
verify — or apply — these migrations for you. This document is the
replacement: a single copy-paste query you (or whoever has SQL Editor
access to the project) can run to check, plus exactly what to do about
anything it finds missing.

**This matters more than it might look like.** The client code added in this
pass (`checkUsernameAvailable`, `checkEmailAvailable`, `checkPhoneAvailable`,
now wired into the signup form for the first time) calls RPC functions that
only exist if `2026-08-15_duplicate_identifier_detection.sql` has been
applied. That code was written to **fail open** on an RPC error rather than
block signup (see `availableOnRpcFailure()` in
`src/services/supabaseAuthService.ts`), specifically so that a missing
migration degrades to "the real-time duplicate warning doesn't show," not
"nobody can sign up." But failing open only means the *symptom* is
survivable — the underlying gap (no server-side duplicate detection for
username/phone availability checks, no phone-based login, no phone
uniqueness enforcement) is still real until the migration is actually run.

## The check

Run this in your Supabase project's **SQL Editor** (Dashboard → SQL Editor →
New query). It returns one row per thing this repo's auth work depends on,
with a plain yes/no for whether it exists in your database right now.

```sql
select
  'function: check_username_available' as item,
  exists (select 1 from pg_proc where proname = 'check_username_available') as exists_in_db
union all
select 'function: check_email_available',
  exists (select 1 from pg_proc where proname = 'check_email_available')
union all
select 'function: check_phone_available',
  exists (select 1 from pg_proc where proname = 'check_phone_available')
union all
select 'function: email_for_phone_e164',
  exists (select 1 from pg_proc where proname = 'email_for_phone_e164')
union all
select 'function: email_for_identifier',
  exists (select 1 from pg_proc where proname = 'email_for_identifier')
union all
select 'function: email_for_username (base schema, should already exist)',
  exists (select 1 from pg_proc where proname = 'email_for_username')
union all
select 'constraint: profiles_phone_e164_unique',
  exists (
    select 1 from pg_constraint
    where conname = 'profiles_phone_e164_unique' and conrelid = 'public.profiles'::regclass
  )
union all
select 'constraint: profiles.username unique (base schema, should already exist)',
  exists (
    select 1 from information_schema.table_constraints
    where table_name = 'profiles' and constraint_type = 'UNIQUE'
  )
order by item;
```

## Reading the result

- **All rows `true`** — every migration this auth work depends on is live.
  The real-time duplicate warnings, phone-number login, and phone
  uniqueness enforcement described in the other auth docs in this folder
  are all actually active, not just present in the repo.
- **Any row `false`** — that specific piece is not live yet. None of them
  will crash the app (the client code fails open/degrades gracefully, as
  described above), but each missing piece has a specific, narrower effect:
  - `check_username_available` / `check_email_available` /
    `check_phone_available` missing → the on-blur "already taken" warning
    on the signup form silently never fires for that field. Signup itself
    still works; you just lose the early warning (duplicates are still
    caught at submission — see below).
  - `email_for_phone_e164` missing → signing in with a phone number always
    fails with "Invalid credentials," even for a correct, registered phone
    number. Username and email login are unaffected.
  - `profiles_phone_e164_unique` missing → two accounts could end up with
    the same phone number; nothing currently blocks it at the database
    level for phone specifically (username and email are still protected —
    `profiles.username unique` is base-schema, and email uniqueness is
    enforced by Supabase Auth itself, not by any of these migrations).

## Fixing a missing item

Every migration file under `supabase/migrations/` is written to be
idempotent (`create or replace function`, `if not exists` guards on
constraints/indexes) — each one is safe to run again even if parts of it
already exist. To apply a missing one, open its `.sql` file in this repo and
run its full contents in the SQL Editor:

- `supabase/migrations/2026-08-15_duplicate_identifier_detection.sql` — the
  three `check_*_available` functions
- `supabase/migrations/2026-08-15_unified_login_functions.sql` —
  `email_for_phone_e164`, `email_for_identifier`
- `supabase/migrations/2026-08-15_auth_uniqueness_constraints.sql` — the
  phone uniqueness constraint (reads the deployment notes at the bottom of
  that file first — it documents a pre-check for existing duplicate phone
  numbers that would block the constraint from being added)

After applying, re-run the verification query above to confirm.
