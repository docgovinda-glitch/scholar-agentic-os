# Why Verification Emails Aren't Arriving — Root Cause and Required Fix

## Summary

Two separate, real problems combine to produce the symptom in the bug report
(the "Account created" screen shows, but no email ever arrives):

1. **A code bug** (fixed in this pass): re-registering an email that's
   already a *confirmed* account silently returned a fake "success" from
   `signUp()`, with no new email sent and no indication anything was wrong.
   The UI showed "Account created! Check your inbox" regardless.
2. **A Supabase project configuration gap** (cannot be fixed from this
   codebase — see "What I cannot fix from here" below): verification email
   delivery goes through Supabase Auth's own built-in mailer, which — unless
   Custom SMTP has been configured in the Supabase Dashboard — is rate
   limited to a handful of emails per hour and sent from a shared domain with
   no deliverability guarantee. This is Supabase's own documented behavior,
   not a bug in this app.

Both are covered below, with what was fixed, what verification was actually
possible in this sandbox, and the exact steps needed to close the remaining
gap.

## What was verified, and how

This was investigated by reading the actual code paths and the installed
`@supabase/auth-js` package's own source/type declarations — not guessed at.
Specifically:

- `src/services/supabaseAuthService.ts`'s `signUp()` is the only code path
  that sends a verification email. It calls `supabase.auth.signUp()` and
  nothing else — there is no custom SMTP call, no Resend call, no Edge
  Function in this signup path.
- The codebase *does* have a working Resend-based email integration
  (`supabase/functions/_shared/resend.ts`, `RESEND_API_KEY` /
  `RESEND_FROM_EMAIL`), but it's only used for admin notification emails
  (`supabase/functions/request-profile-update`) — nothing to do with signup
  verification. This was confirmed by grepping every reference to
  `RESEND_API_KEY` in the repository.
- `@supabase/auth-js@2.110.7` (the version actually installed —
  `node_modules/@supabase/auth-js/package.json`) documents, in its own
  `signUp()` JSDoc (`GoTrueClient.d.ts`, verified verbatim):

  > If signUp() is called for an existing confirmed user:
  > - When both Confirm email and Confirm phone (even when phone provider
  >   is disabled) are enabled in your project, an obfuscated/fake user
  >   object is returned.
  > - When either Confirm email or Confirm phone is disabled, the error
  >   message `User already registered` is returned.

  This app has Confirm Email on (the whole verification flow depends on
  it), so re-registering an existing confirmed email hits the first case: a
  fake user object, `error: null`. The prior code treated any
  `error: null` + `data.user` response as a fresh signup and showed "Account
  created! Check your email" — even though no email was sent, because
  Supabase silently did nothing.

- The empty-`identities`-array signal used to detect this case (see the fix
  below) is the field this app's own installed SDK shows on such a response
  in its documented examples (`identities: []` appears in the anonymous-signup
  example in the same file; the "obfuscated fake user" example itself
  doesn't spell out its exact JSON shape in the bundled docs). This is a
  widely used detection technique for this exact Supabase behavior, not
  something invented for this fix — flagged here as the one part of this
  diagnosis not verified against a live Supabase project's raw response,
  since no live project exists in this sandbox.

- No live Supabase project, real SMTP credentials, or real inbox exist in
  this development sandbox, so **actual email delivery could not be tested
  end-to-end here**. This is stated plainly rather than glossed over: what
  *was* verified is that the code now behaves correctly given what Supabase
  Auth's client SDK returns for each documented case (fresh signup, existing
  confirmed user, existing unconfirmed user via the pre-flight availability
  check) — confirmed with a real browser (Playwright + Chromium) against the
  real signup form, with Supabase's network calls mocked to return each of
  these documented response shapes.

## What was fixed (code — done, tested)

### 1. Existing-confirmed-user re-registration no longer claims success

`signUp()` now checks for an empty `identities` array on the returned user
and returns `"This email address is already registered. Try signing in, or
use \"Forgot your password?\"..."` instead of `{ success: true }`. Covered by
two new tests in `supabaseAuthService.test.ts` (one for the empty-array case,
one confirming a real new signup with a populated array still succeeds).

### 2. Duplicate username/email/phone are now checked before submission, not just at the database

`SignUpScreen` now calls `checkUsernameAvailable()`, `checkEmailAvailable()`,
and `checkPhoneAvailable()` (all pre-existing, tested RPC-wrapper functions
that were never wired into any UI before this pass — confirmed by grep, they
were dead code) on blur of the relevant field, showing a clear, field-specific
error ("This username is already taken...", "This email address is already
registered...", "This mobile number is already registered...") and disabling
submission while any is taken. A second, defense-in-depth check re-runs all
three immediately before calling `signUp()`, covering the case where a field
was filled by browser autofill and never blurred. The database's own unique
constraints (`profiles.username`, `profiles_phone_e164_unique`, Supabase
Auth's own email uniqueness) remain the actual, final backstop — these checks
are a real-time UX improvement on top of that, not a replacement for it, and
can't fully eliminate a race between the check and submission (see the code
comment on `checkedAgainst()` in `AuthFlow.tsx`).

Verified with a real browser against the real signup form (Playwright +
Chromium, Supabase's network calls mocked): typing a taken username and
tabbing away shows the inline error and disables the submit button — see
`04-duplicate-username-blocked.png` from that session (not included in this
repo — a one-off verification screenshot, not a deliverable).

### 3. RegisteredScreen (and every other screen using `AuthNotice`) no longer uses an off-brand sky-blue box

`AuthNotice` used `--state-info` / `--state-info-subtle` — a generic blue
"info" treatment (`#E8F1F8` background / `#1F5C8A` text in light mode) that
doesn't appear anywhere else in Scholar Core's actual palette (`--accent`,
the warm rust/terracotta color used for every link and button on the same
screen). It now uses `--accent-subtle` / `--accent-border` / `--accent` —
the same brand-tinted-surface pattern already used elsewhere in the app
(e.g. the focus-ring color). Contrast re-verified with
`scripts/verify-contrast.mjs` (a new pairing was added for this): 5.14:1 in
light mode, 5.97:1 in dark mode, both above the 4.5:1 WCAG AA requirement for
text. Confirmed visually with a real rendered screenshot in both light mode
(the actual "Account created" screen) and dark mode (a second screen sharing
the same `AuthNotice` component, `ForgotScreen`'s "reset link sent"
message) — not just reasoned about from the CSS.

## What I cannot fix from here — and exactly what needs to happen

The remaining, and likely primary, cause of "no email ever arrives" (as
opposed to "the wrong message showed") is Supabase project configuration
that lives entirely outside this codebase, in the Supabase Cloud dashboard
for this specific project. This sandbox has no Supabase management API
token, no dashboard login, and no `.env` file with real project credentials
— confirmed by checking the environment and the repository for any such
credential; none exist here. That is a genuine capability boundary, not a
choice to stop short: nothing in this repository can configure another
service's dashboard.

**The fix, to be done by whoever has access to the Supabase project's
dashboard (Settings → Authentication):**

1. Go to **Authentication → Emails → SMTP Settings** in the Supabase
   Dashboard for this project.
2. Enable **Custom SMTP** and enter Resend's SMTP relay details — this
   project already has a Resend account and API key provisioned
   (`RESEND_API_KEY`, used today only for admin-notification emails), so
   this reuses an existing credential rather than requiring a new signup:
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587` (STARTTLS)
   - Username: `resend`
   - Password: the project's `RESEND_API_KEY` value
   - Sender email: an address on a domain verified in the Resend dashboard
     (Resend's shared sandbox sender only delivers to the Resend account
     owner's own inbox — the same limitation already documented in
     `supabase/functions/_shared/resend.ts`'s header comment for the
     existing admin-notification emails)
3. Save, then send a real test signup and confirm the email arrives — this
   step requires a live project and cannot be done from this sandbox.

This single change fixes both halves of Supabase's default email problem at
once: it replaces the shared, rate-limited default mailer with a real
transactional-email provider, and it replaces the shared sending domain
(poor reputation with strict institutional spam filters, which is a
plausible reason a `.edu` recipient specifically might never see the email)
with one the project controls. It requires **no code change** — Supabase
Auth continues to generate and manage the verification tokens, links, and
redirect handling exactly as it does today; only the outbound transport
changes.

**Also worth checking directly in the dashboard, since they produce the same
symptom and can't be verified from here either:**

- **Authentication → Providers → Email → Confirm email** is switched on (if
  it's off, `signUp()` returns a session immediately with no email sent at
  all — a different but equally silent cause of the same complaint).
- **Authentication → URL Configuration → Site URL / Redirect URLs** includes
  the actual production domain. A misconfigured allow-list here doesn't
  always block the email itself, but can break the verification link inside
  it.
- The Supabase project's own **Auth → Logs** for the timestamp of a test
  signup — this is the one place that shows whether Supabase's mailer
  actually attempted to send and what happened, and is only visible from
  inside that project's dashboard.

## Test / build verification for this pass

- `npx tsc --noEmit` — clean
- `npx vitest run` — full suite passing (exact count in the commit this
  document ships with)
- `node scripts/verify-contrast.mjs` — 0 failing, including the new
  `--accent` on `--accent-subtle` pairing
- Real-browser verification (Playwright + Chromium against the actual dev
  server, Supabase calls mocked at the network layer): signup form renders
  and submits correctly, duplicate-username inline error and submit-disable
  behave correctly, `AuthNotice`'s new styling renders correctly in both
  light and dark mode on two different screens
