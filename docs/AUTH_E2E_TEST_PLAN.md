# Scholar Core Authentication - End-to-End Testing Plan

## Overview

This document outlines the complete end-to-end testing coverage for Scholar Core's authentication system. All scenarios have been implemented and tested with automated unit and integration tests. Manual testing on production domain is required for full verification before launch.

## Test Coverage Summary

**Total Automated Tests: 1593**
- Service layer tests: 43 tests (supabaseAuthService)
- Component integration tests: 24 tests (DeskAuthGate)
- App-wide integration tests: ~50+ tests across Desk and onboarding flows

## End-to-End Authentication Flows

### 1. ✅ Registration Flow (Complete)

**Happy Path Test Coverage:**
```
1. User navigates to signup
2. Fills all required fields (username, email, phone, password, education)
3. Selects user type and education level
4. Completes CAPTCHA challenge (if enabled)
5. Account created successfully
6. Verification email sent to registered address
7. RegisteredScreen shows with email confirmation
8. User sees "Resend verification email" option
```

**Tests Implemented:**
- ✅ Collects every required field (no institutional ID fields)
- ✅ Validates all field formats before submission
- ✅ Shows "Account created" confirmation
- ✅ Sends verification email successfully
- ✅ Accepts various email providers (Gmail, Yahoo, .edu domains)
- ✅ Duplicate email at signup → `signUp()` surfaces Supabase's
  "User already registered" error as a form error

**Not implemented — corrected:** `checkUsernameAvailable()`,
`checkEmailAvailable()`, and `checkPhoneAvailable()` exist and are unit-tested
against their RPCs, but **SignUpScreen never calls them.** There is no
real-time as-you-type availability feedback, and the submit button is gated
only on field-format validity, not on availability. An earlier draft of this
document claimed real-time validation and duplicate-username/duplicate-phone
form tests that do not exist — corrected here rather than left standing.
Username and phone duplicates are still caught, just later than described:
the database's `profiles_username_key` / `profiles_phone_e164_unique`
constraints reject the insert at submission time. That rejection path itself
is untested end-to-end (no test simulates the DB constraint violation
propagating back through `signUp()` to the form).

**Error Cases Tested:**
- ✅ Missing required fields → submit disabled
- ✅ Invalid email format → validation error
- ✅ Invalid phone format → validation error
- ✅ Weak password → validation error
- ✅ Password too short → validation error
- ✅ CAPTCHA missing → validation error (when enabled)
- ✅ Duplicate email at signup → generic Supabase error surfaced

**Error cases — not covered:**
- ⬜ Duplicate username → not exercised through the signup form or service
  layer (only the standalone `checkUsernameAvailable()` RPC wrapper is
  tested, and it's unused by the form)
- ⬜ Duplicate phone → same gap

### 2. ✅ Email Verification Flow (Complete, corrected below)

**Happy Path Test Coverage:**
```
1. User receives verification email
2. Clicks verification link in email (type=signup in URL)
3. Supabase Auth automatically signs user in
4. EmailVerificationSuccessScreen shows confirmation
5. User sees verified email address
6. User clicks "Continue to Scholar Core"
7. useDeskSession.acknowledge() flips the session status straight to
   "signed-in" — no second sign-in required, since the user already holds
   a valid session from step 3
8. User is in the authenticated app
```

**Correction:** an earlier draft of this document described step 6-8 as
"routed to sign-in screen, then signs in to access the app" and marked it
✅ tested. Neither was true: the button only changed `AuthFlow`'s local UI
state, `useDeskSession`'s "email-verified" status was never cleared by
anything other than a `USER_UPDATED`/`SIGNED_OUT` event, and no test in the
suite exercised this path at all. In practice this trapped a verified user
on the confirmation screen indefinitely — even re-entering their password
just re-triggered "email-verified" again instead of reaching the app. This
has been fixed (see `useDeskSession.ts`'s `acknowledge()` on the
"email-verified" status, wired through `DeskAuthGate.tsx` and
`AuthFlow.tsx`) and is now covered by real tests.

**Tests Implemented:**
- ✅ Detection of verification link in URL (`useDeskSession.test.ts`)
- ✅ Distinct "email-verified" session state (not regular sign-in)
- ✅ Success confirmation screen displays, app content does not
  (`DeskAuthGate.test.tsx`)
- ✅ Clicking Continue calls `acknowledge()`, which is what actually lets
  the app render — asserted directly, not inferred from screen text
- ✅ `acknowledge()` transitions the session straight to "signed-in"
  (`useDeskSession.test.ts`)
- ✅ A later SIGNED_IN event (e.g. token refresh) after `acknowledge()`
  does not fall back into "email-verified" and re-trap the user

**Error Cases — not covered, flagged rather than claimed:**
- ⬜ Expired verification link — no test exists; Supabase's own error
  response for this case has not been reproduced or asserted against
- ⬜ Invalid/malformed verification link (no token) — same, untested
- ⬜ Already-verified account re-clicking an old link — untested for this
  flow specifically (a related but distinct case, resending a *new*
  verification email to an already-verified address, is covered under
  Flow 3 below)

### 3. ✅ Resend Verification Email Flow (Complete)

**Happy Path Test Coverage:**
```
1. User on RegisteredScreen after signup
2. Clicks "Resend verification email" link
3. Enters email address (pre-filled with signup email)
4. Clicks "Resend email" button
5. Email service sends verification email
6. User sees success confirmation
7. User can click back to RegisteredScreen
8. Can reattempt resend if first didn't arrive
```

**Tests Implemented:**
- ✅ Resend email service function works
- ✅ Success message shown after resend
- ✅ Email address displayed in resend screen
- ✅ Handles already-verified emails gracefully
- ✅ Handles user-not-found gracefully
- ✅ Generic error handling with fallback message
- ✅ Loading state during resend

**Error Cases Tested:**
- ✅ Email not found → helpful error message
- ✅ Email already verified → confirms account is ready
- ✅ Email service failure → generic error message
- ✅ Invalid email format → validation error

### 4. ✅ Flexible Login Flow - Username (Complete)

**Happy Path Test Coverage:**
```
1. User navigates to sign-in
2. Enters username in "User ID, email, or mobile number" field
3. Enters password
4. Completes CAPTCHA (if enabled)
5. SignIn detects identifier as username
6. Calls email_for_username() RPC
7. Gets email for Supabase Auth
8. Authenticates with Supabase
9. Loads user profile
10. Verifies account is active
11. Routes to authenticated app
```

**Tests Implemented:**
- ✅ Username lookup via RPC function works
- ✅ Error handling when username not found
- ✅ Prevents login without password
- ✅ Correct error message for invalid password
- ✅ Prevents login for restricted accounts
- ✅ Prevents login for suspended accounts
- ✅ Prevents login for deleted accounts
- ✅ Does not confirm/deny account existence (security)

**Error Cases Tested:**
- ✅ Non-existent username → generic error
- ✅ Wrong password → generic error
- ✅ Restricted account → clear restriction message
- ✅ Suspended account → clear suspension message
- ✅ Deleted account → clear deletion message

### 5. ✅ Flexible Login Flow - Email (Complete)

**Happy Path Test Coverage:**
```
1. User navigates to sign-in
2. Enters email address in identifier field
3. Enters password
4. SignIn detects identifier as email
5. Uses email directly (no RPC needed)
6. Authenticates with Supabase Auth
7. Loads user profile
8. Routes to authenticated app
```

**Tests Implemented:**
- ✅ Email detection via regex pattern
- ✅ Direct email pass-through to Supabase Auth
- ✅ Success login with valid credentials
- ✅ Correct error handling for non-existent email
- ✅ Correct error handling for wrong password

**Error Cases Tested:**
- ✅ Non-existent email → generic error
- ✅ Wrong password → generic error
- ✅ Invalid email format → rejected before lookup

### 6. ✅ Flexible Login Flow - Phone (Complete)

**Happy Path Test Coverage:**
```
1. User navigates to sign-in
2. Enters phone number in E.164 format (+1234567890)
3. Enters password
4. SignIn detects identifier as phone
5. Calls email_for_phone_e164() RPC
6. Gets email for Supabase Auth
7. Authenticates with Supabase
8. Routes to authenticated app
```

**Tests Implemented:**
- ✅ Phone number detection via E.164 regex
- ✅ RPC lookup for phone numbers works
- ✅ Error handling for non-existent phone
- ✅ Correct password validation
- ✅ Prevents invalid phone format login

**Error Cases Tested:**
- ✅ Non-existent phone → generic error
- ✅ Wrong password → generic error
- ✅ Invalid format (no +) → generic error
- ✅ Invalid format (too few digits) → generic error

### 7. ✅ Password Reset Flow (Complete)

**Happy Path Test Coverage:**
```
1. User on sign-in screen
2. Clicks "Forgot your password?"
3. Enters email address
4. Completes CAPTCHA (if enabled)
5. Password reset email sent
6. User clicks link in email (type=recovery)
7. RecoverScreen shows for password update
8. User enters new password and confirmation
9. Passwords match - submit enabled
10. Password updated successfully
11. User routed to sign-in
12. User can sign in with new password
```

**Tests Implemented:**
- ✅ Recovery link detection (type=recovery)
- ✅ Distinct "recovery" session state
- ✅ Password reset form shows on recovery
- ✅ Password mismatch detected in real-time
- ✅ Weak password validation
- ✅ Password update succeeds
- ✅ User sent back to sign-in after update
- ✅ Does not confirm email existence (security)

**Error Cases Tested:**
- ✅ Email not found (generic message)
- ✅ Password too short (validation)
- ✅ Passwords don't match (real-time feedback)

**Error cases — not covered:**
- ⬜ Expired recovery link — no test reproduces or asserts Supabase's error
  response for this case

### 8. ✅ Duplicate Identifier Detection (Core Layer)

**Tests Implemented:**
- ✅ check_username_available() RPC works
- ✅ check_email_available() RPC works
- ✅ check_phone_available() RPC works
- ✅ All three report availability correctly
- ✅ Error handling when checks fail

**Database Constraints:**
- ✅ Username unique constraint enforced
- ✅ Phone E.164 unique constraint enforced
- ✅ Email uniqueness via Supabase Auth
- ✅ All constraints idempotent (re-runnable)

### 9. ✅ Account Status Validation (Complete)

**Tests Implemented:**
- ✅ Active accounts can sign in
- ✅ Restricted accounts blocked with message
- ✅ Suspended accounts blocked with message
- ✅ Deleted accounts blocked with message
- ✅ New accounts default to active status

### 10. ✅ Landing Page & Navigation

**Tests Implemented:**
- ✅ Landing page shows on first load
- ✅ "Get started" button navigates to signup
- ✅ "Sign in" button navigates to sign-in
- ✅ All auth screens have navigation back
- ✅ Links between screens work correctly

## Manual Testing Checklist for Production

**Before Production Launch, Manually Test:**

- [ ] **Registration on Production Domain**
  - [ ] Navigate to signup page
  - [ ] Fill form with test user data
  - [ ] Verify CAPTCHA loads and works
  - [ ] Complete signup
  - [ ] Receive verification email
  - [ ] Click verification link in email
  - [ ] Verify success confirmation shows
  - [ ] Sign in with new account

- [ ] **Email Verification**
  - [ ] Check email inbox for verification email
  - [ ] Verify sender address is correct
  - [ ] Click verification link in email
  - [ ] Confirm success page displays
  - [ ] Verify email shows in success message

- [ ] **Flexible Login - All Three Ways**
  - [ ] Sign in with username → success
  - [ ] Sign in with email → success
  - [ ] Sign in with phone (+countrycode) → success
  - [ ] Try wrong password → error
  - [ ] Try non-existent identifier → error

- [ ] **Password Reset**
  - [ ] Click "Forgot password?"
  - [ ] Enter email
  - [ ] Receive reset email
  - [ ] Click reset link
  - [ ] Set new password
  - [ ] Sign in with new password

- [ ] **Resend Verification Email**
  - [ ] Go through signup
  - [ ] Before clicking verification email, open resend page
  - [ ] Click "Resend verification email"
  - [ ] Receive email again
  - [ ] Verify both emails work

- [ ] **Error Messages**
  - [ ] Try duplicate email → get error
  - [ ] Try invalid password format → get error
  - [ ] Try invalid phone format → get error
  - [ ] All errors show helpful messages (not crash)

- [ ] **Browser Compatibility**
  - [ ] Test on Chrome
  - [ ] Test on Firefox
  - [ ] Test on Safari
  - [ ] Test on mobile browsers

- [ ] **Session Management**
  - [ ] Sign in and close browser
  - [ ] Reopen site → still signed in (token persisted)
  - [ ] Sign out → routed to landing page
  - [ ] Cannot access authenticated app after sign out

## Known Test Limitations

1. **CAPTCHA**: Cannot fully test Turnstile widget in non-production environment
   - Requires production domain registration in Cloudflare
   - Widget loads but cannot verify token verification works without real Turnstile

2. **Email Delivery**: Test mocks email sending
   - Real email delivery cannot be verified in test environment
   - Manual testing on staging/production required

3. **Session Persistence**: Tests use mocked session storage
   - Real browser persistence not tested in unit tests
   - Manual testing required to verify session survives page refresh

4. **Real-time duplicate-identifier feedback**: `checkUsernameAvailable()`,
   `checkEmailAvailable()`, `checkPhoneAvailable()` are implemented and unit
   -tested against their RPCs, but not called anywhere in SignUpScreen.
   Duplicates are still caught, just at submission time via database
   constraints and Supabase Auth's own rejection, not as the user types.

5. **Expired/invalid verification and recovery links**: no test reproduces
   Supabase's error response for a stale or malformed link in either the
   email-verification or password-recovery flow.

## Regression Test Suggestions

After authentication system changes, run these regression tests:

1. Full signup-to-signin flow (all three identifier types)
2. Password reset flow
3. Email verification flow
4. Account status checks (active, restricted, suspended)
5. Duplicate identifier detection
6. CAPTCHA handling (if enabled)
7. Error messages for all failure scenarios
8. Cross-browser compatibility

## Summary

✅ Core authentication flows implemented, and this pass corrected two real
  defects a prior draft of this document had marked as tested when they
  were not: an account-enumeration leak in flexible login (username/phone
  "not found" responses named the identifier type instead of using the same
  generic message the email path uses), and a lockout bug where a verified
  user could never actually reach the app — `useDeskSession`'s
  "email-verified" status had no way to clear except events the success
  screen's "Continue" button never fired.
✅ 1,598 automated tests (up from 1,593 — 5 added while fixing the lockout
  bug above) covering signup, login, verification, and password reset
✅ Database integrity enforced with uniqueness constraints
✅ Flexible login supporting username, email, and phone, without confirming
  which identifier type doesn't exist
✅ Email verification with success confirmation, and a working path from
  that screen into the authenticated app
✅ Resend verification email functionality (now calling Supabase's real
  `auth.resend()` API — the prior implementation called a method,
  `resendSignUpEmail()`, that does not exist on the Supabase client and
  would have thrown at runtime the first time a user tried it)
✅ Scholar Core branding applied consistently
✅ CAPTCHA verification guide provided

**Known gaps, not fixed this pass (see "Known Test Limitations" above):**
real-time duplicate-identifier feedback is implemented but unwired from
SignUpScreen; expired/invalid verification and recovery links are untested;
duplicate username/phone at registration is untested end-to-end (only
duplicate email is).

**Status: Core flows now correct and tested. Manual testing on the
production domain (CAPTCHA, email delivery, session persistence — see
checklist above) is still required before launch.**
