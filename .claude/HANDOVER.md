# HANDOVER.md — Scholar Agentic Operating System Developer Handover

## Standing Instruction — Contradicting Docs (read this before using any doc below)

**If two planning/architecture docs contradict each other on anything material to the task at hand: STOP and ask the user. Do not resolve it silently, and do not assume the newer document is automatically correct** — "newer" is a tiebreaker of last resort for genuinely unrelated stale content, not a license to skip asking when the contradiction actually matters to the work in front of you. The ranking below exists to tell you which doc to *read* first and which claims are already known-stale; it is not permission to auto-resolve a live conflict without flagging it.

## Standing Blocker — Legal Review Required Before Live Deployment (added 2026-07-22)

**Live deployment of this product is blocked on legal review of the Terms & Conditions, separate from and in addition to any technical blocker recorded elsewhere in this file.** `docs/planning/terms-of-service-draft.md` is an AI-written first draft — explicitly marked not legal advice, not ready to deploy — covering AI/agent-sourced-content disclaimers, data-loss and account-compromise liability, service-availability disclaimers, and a billing-terms placeholder. It must be reviewed, corrected, and completed by a qualified lawyer before publication. Do not treat the mechanism spec (`target-workflow.md` §9 — versioned acceptance, Supabase acceptance record, blocking re-acceptance gate) as blocked by this — the *mechanism* can be built and tested against placeholder/draft text; only *publishing real terms and going live* is blocked on the legal review.

## Standing Boundary Rule — Fetch/Search Proxy Scope (added 2026-07-22)

**Decision recorded**: the project owner has accepted a thin, stateless fetch/search proxy as **one deliberate, narrowly-scoped exception** to the client-side-by-default architecture. Everything else stands: agents, skills, AI calls, and drafting all still run locally in the browser; users still bring their own keys; there is still no per-user server cost. This is a **stopgap**, explicitly — the project owner may buy a shared server later, at which point this proxy folds into that real hosting rather than persisting as a separate architectural fork.

**The bright line — what the proxy may do, and only this:**
- Fetch an outbound resource (a query to a search/retrieval API, or a target page/document's content) and return the response to the caller, unmodified.
- Nothing else.

**What the proxy must never do — and what would need to come back as a fresh decision, not be silently absorbed as "a natural extension":**
- **Never stores data.** No database, no cache that persists beyond the single request/response it's handling.
- **Never authenticates end users.** No session, no cookie-as-identity, no login of any kind.
- **Never holds session state.** Every invocation is independent; nothing about one call may affect another.
- If a future task looks like it would require any of the above — e.g., caching results to save on API costs, rate-limiting per logged-in user, or (a concrete, anticipated example) routing AI-provider calls like OpenAI's through this same proxy if its CORS access ever turns out to be blocked (`ai-gateway.md`'s still-unresolved OpenAI question) — **stop and ask the project owner.** Don't reason "the proxy already exists, so extending it a bit is a small step" — that reasoning is exactly what this rule exists to prevent.

**Precedent, not a new pattern**: `/api/parse-external-link` in the current (still-live) `server.ts` already does exactly this kind of server-side fetch-and-return today. This decision formalizes and extends that existing pattern — to arXiv (confirmed CORS-blocked, `target-workflow.md` §5), and to generic authoritative-web-search plus full-text page fetching (`target-workflow.md` §7) — it does not introduce a new category of server-side logic into this project.

## Document Authority Order (as of 2026-07-22)

Newest-decision-wins ranking of every planning/architecture doc referenced by this project, for when two of them disagree. Each entry states what it's still authoritative *for* and what in it is superseded.

1. **This file's Standing Boundary Rule, Standing Blocker (both above), and top section (below), dated 2026-07-21/22** — the "Next Session — READ THIS FIRST" and "Correction" notes just below this section, plus the two Standing sections just above it. Authoritative for: current, as-of-now implementation/commit status of the Supabase auth cutover, the password-reset switch, and the agent/Skills wiring; the **exact, bright-line scope of the accepted fetch/search proxy exception**; and the fact that **live deployment is blocked on legal review of the T&C**, independent of technical status. These are the single authoritative statements of each, not any paraphrase elsewhere. Wins over every doc below on these specific topics.
2. **`docs/planning/target-workflow.md`** (2026-07-22) — authoritative for: the target 12-stage workflow spec, the 5 resolved design ambiguities (§4), the **empirical, browser-tested** CORS results for the five scholarly-literature retrieval APIs (§5, all now resolved — 4 of 5 direct, only arXiv needs the accepted proxy), the **decided** exclusion of Google Scholar (§6), the now-resolved-architecture/still-open-vendor-choice research on authoritative web search against government/international bodies (§7), the not-decided authoritative-source-filtering design question (§8), and the **T&C mandatory-acceptance mechanism spec** (§9 — versioning, Supabase acceptance record, blocking re-acceptance gate; not the legal text itself). Newest planning doc; supersedes anything below that touches workflow stages, scholarly-API/web-search retrieval, or the T&C mechanism.
3. **`docs/planning/terms-of-service-draft.md`** (2026-07-22) — authoritative for: the current draft legal text referenced by `target-workflow.md` §9. **Explicitly not legal advice and not ready to deploy** — see the Standing Blocker above. Supersedes nothing (this is a new document with no prior version), but any future T&C draft revision should update this file in place, not create a second one.
4. **`docs/planning/competitive-analysis.md`** (2026-07-22, same day as above) — authoritative for: the competitor landscape and the separately-labeled "My Recommendations" opinions. Narrower scope than target-workflow.md; no ranking conflict with it.
5. **`docs/planning/2026-07-20-session-notes.md`** (2026-07-20) — authoritative for: the still-undecided UI aesthetic proposal ("Ancient Knowledge, Future Interface") and the agent-roster-redesign proposal (blocked on ARCH-3, still blocked). **Not** authoritative for its "Native Agent Skills" section's implementation-status line — that claim is now stale; see the contradiction list below.
6. **`docs/planning/sponsored-placements.md`** (2026-07-21) — authoritative for: the unified placement-categories design (conferences/admissions/publishers/Tier-4 affiliate as one mechanism). Still fully unimplemented; no contradictions found against it. Depends on the Supabase pick in `hosting-and-topology.md` §3, which stands.
7. **`docs/planning/ai-gateway.md`** (2026-07-21) — authoritative for: the 5-tier AI Gateway model and proposed tier sequencing. Its CORS open-questions (direct-browser access to OpenAI/Anthropic/Gemini/OpenRouter) are a **different, still fully unresolved** question from target-workflow.md §5's now-resolved scholarly-literature-API CORS results — see the contradiction list below for why these must not be conflated.
8. **`docs/planning/hosting-and-topology.md`** (2026-07-21, amended 2026-07-22) — authoritative for: the client-side-by-default architecture pivot itself (still `PENDING ARCHITECTURE DECISION — NOT APPROVED` as a whole), the Supabase-vs-Firebase pick (Supabase, stands), and the `server.ts` route-by-route breakdown (§4). **Not** authoritative for: (a) the admin-approval-gated password-reset design described in its §3 schema-mapping table and §4's route list — superseded by the confirmed switch to Supabase's self-service `resetPasswordForEmail`; (b) its "no backend server, ever" / "no self-managed backend server" framing (§1, §2) — amended by the 2026-07-22 fetch/search proxy decision (see the Standing Boundary Rule above, which is the actual authoritative scope). All three affected spots in this doc now carry an inline pointer to the current source.
9. **"The original production-readiness plan"** — flagged, not ranked, **and explicitly NOT a file that exists anywhere in this repo.** Do not search for `production-readiness-plan.md`, `production_readiness.md`, or any similarly-named file — none exists; this was checked directly (`grep`, not assumed) and there is no such standalone document to find. **The only surviving artifact that preserves any of its content is `hosting-and-topology.md` §6** ("Cross-Reference: Existing Production-Readiness Plan"), which reconstructs its backlog IDs (`ARCH-1`–`ARCH-7`, `SEC-1`–`SEC-7`, `DEPLOY-1`–`DEPLOY-5`, `QUAL-1`–`QUAL-4`, `TEST-1`–`TEST-5`, `PERF-1`–`PERF-3`, `UX-1`–`UX-3`, `DX-1`–`DX-5`) and re-prioritizes each against the hosting pivot from memory of that earlier session, not from a file. Older docs with their own, different ID schemes exist (`docs/project_baseline.md`, `docs/epic_roadmap.md`, `docs/implementation_plan.md` — `T00x`/`P0`–`P2`/`E01`–`E03` IDs, dated 2026-07-14/17) but were not verified to be the same document this backlog was drawn from — treat `hosting-and-topology.md` §6 as the only authoritative surviving record of that plan's content and status, and stop looking for anything else.
10. **This file, everywhere below the top section** (§1 onward) — authoritative for the moment-in-time status snapshots it records, but the file is chronological/append-only rather than re-ordered on every edit: later-dated notes near the top win over older material further down wherever the two overlap. This Document Authority Order section, being the newest addition, wins over all of it.

### Known contradictions between planning docs (audited 2026-07-22)

Only actual, verified conflicting statements — not assumed ones.

1. **Password-reset design: admin-approval-gated vs. self-service.**
   - **Stale**: `hosting-and-topology.md` §3 (the "Existing `users.json` shape" row, which names `tempPasscodeHash`/`resetApproved` fields "used by the password-reset flow," and the "Bottom line" paragraph's "admin-approval-by-email-link" framing) and §4 (the "Moves to the BaaS" section, which lists `/api/request-password-reset`/`/api/approve-reset` as mapping straight to Supabase equivalents).
   - **Current**: this file's own confirmed decision (2026-07-21) and its actual implementation (commit `5a59eef`) — Supabase's built-in `resetPasswordForEmail`/`updateUser` self-service flow, with no admin-approval step at all. `supabase/functions/request-password-reset`, `approve-password-reset`, and the `pending_password_resets` table are now dead code, pending removal once live-verification finishes (see this file's §"Next session's actual first task").
   - Both stale sections in `hosting-and-topology.md` now carry an inline superseded-header pointing here.

2. **Native Agent/Skills wiring: location and status.**
   - **Stale**: `2026-07-20-session-notes.md` §2's status line — *"No `SkillResult` field has been added, no agent has been rewired to `src/skills/`, and `createAgentContext()` in `server.ts` is unchanged."*
   - **Current**: this file's top "Correction" section — `ResearchPlannerAgent` **is** now wired to `src/skills/` (1 of 8 agents), and `createAgentContext()` was briefly added to `server.ts` then **removed from it entirely** — the wiring lives client-side in `src/services/agentService.ts` instead, consistent with `hosting-and-topology.md` §4's own instruction that this logic "should move client-side cleanly." The other 7 agents remain unwired, matching the original proposal's scope.
   - The stale section in `2026-07-20-session-notes.md` now carries an inline superseded-header pointing here.

3. **Resolved, not a contradiction, but worth closing the loop on**: `hosting-and-topology.md` §4 flagged `/api/lookup-doi`'s (Crossref) direct-browser CORS support as "plausible... but not confirmed here." `target-workflow.md` §5 now confirms this empirically — Crossref is directly callable, no proxy needed. An inline resolved-note was added at the original flag.

4. **Amendment, not a contradiction, but material to every doc that assumed the old constraint**: `hosting-and-topology.md` §1/§2 and `ai-gateway.md`'s status line both state the architecture has **zero** server-side component beyond the BaaS ("no backend server to run or pay for, ever" / "no self-managed backend server in this topology"). **This is now amended, not stale-and-wrong** — the project owner made a deliberate decision (2026-07-22) to accept one narrowly-scoped exception (see the Standing Boundary Rule above). Both docs carry inline pointers at the affected lines. Anything built against the old "literally zero server-side, full stop" reading should be re-checked against the Standing Boundary Rule's exact scope before assuming it's still accurate.

5. **Explicitly NOT a contradiction — flagged only to prevent conflation**: `ai-gateway.md` and `hosting-and-topology.md` §4 both raise an open, unresolved CORS question about **AI-provider APIs** (OpenAI especially, also Anthropic/Gemini/OpenRouter) for the AI Gateway tiers. `target-workflow.md` §5's newly-completed empirical CORS test covers a **different set of APIs entirely** — scholarly-literature retrieval (Crossref/OpenAlex/Semantic Scholar/PubMed/arXiv). Resolving one does not resolve the other; the AI-provider CORS question remains fully open and untested. **Also note**: the fetch/search proxy accepted in item 4 above was scoped to retrieval, not to this AI-provider question — the two remain separate even after that decision.

---

## Correction: Agent/Skills Framework re-homed client-side (was briefly wired into server.ts by mistake)

The `ResearchPlannerAgent`-to-Skills-Framework wiring (committed as `2e5e9fb`) was initially wired into `server.ts`, registering `AgentRegistry`/`SkillRegistry` and exposing `/api/agents` + `/api/agents/execute` there. This contradicted `docs/planning/hosting-and-topology.md` §4, already on record: the Agent/Skills stack is pure in-memory JS/TS logic with no Node-only dependency (re-verified here: every runtime import across all 8 agents, both registries, both executors is either type-only or `src/core/logger.ts`, which is plain `console.*`) — it belongs client-side, not behind an HTTP hop to a server this whole engagement has been trying to stop needing. This was in fact the *original* reason the wiring work was paused before Phase 1 — re-homing it was already anticipated, just not re-checked before committing this time.

**Fixed**: moved to `src/services/agentService.ts` (`listAgents()`, `executeAgent(id, input)` — no HTTP layer at all now, direct in-process calls). Removed from `server.ts` entirely: the `AgentRegistry`/`AgentExecutor`/`SkillRegistry` registration, `createAgentContext()`, and the `/api/agents`+`/api/agents/execute` routes. Confirmed via grep before removing: no frontend code called those routes yet, so there was no live behavior to preserve across the move. New test file `src/services/__tests__/agentService.test.ts` (3 tests). `tsc --noEmit` clean; full suite 375/377 (same 2 pre-existing, unrelated failures as elsewhere in this file).

**Lesson for next time this kind of "pick up paused work" request comes in**: re-check `docs/planning/hosting-and-topology.md` and this file's own notes for *why* something was paused before resuming it, not just that it was — the reason is often the constraint that still applies.

## Next Session — READ THIS FIRST

**Phase 1 of `docs/planning/hosting-and-topology.md` (static hosting + Supabase migration) is built and unit-tested, but NOT live-verified and NOT cut over — read this before touching auth, hosting, or AI-gateway work.** As of 2026-07-21:

**What's done and verified** (`npx tsc --noEmit` clean, `npx vitest run` — 21 files / 347 tests passing):
- `supabase/schema.sql` — `profiles`, `api_credentials`, `pending_password_resets` tables, RLS policies, an auto-profile-creation trigger, and two security-definer RPCs (`email_for_username`, `is_username_approved`) needed because the app logs in by username but Supabase Auth is email-based.
- `src/services/supabaseClient.ts` + `src/services/supabaseAuthService.ts` — full client-side replacement for `server.ts`'s auth/user/admin routes (signUp, signIn, checkApproval, saveModelPreferences, saveApiKeys, requestPasswordReset, requestProfileUpdate), unit-tested against a mocked Supabase client.
- `supabase/functions/` — 5 Edge Functions (Deno) covering the admin-approval-by-email workflows that need the service_role key: `send-approval-email`, `approve-registration`, `request-password-reset`, `approve-password-reset`, `request-profile-update`. **Not type-checked or tested by this project's `tsc`/`vitest`** — that's a structural limitation (different runtime), not skipped effort; `tsconfig.json` now explicitly excludes `supabase/functions`.
- `scripts/migrate-users-to-supabase.ts` — one-off `users.json` → Supabase migration script (`npm run migrate:users-to-supabase`).
- `DEPLOYMENT_README.md` and `render.yaml` rewritten for the new split: Supabase (auth/user data) + static hosting (frontend) + a slimmed-down interim `server.ts` (still needed — see below).

**Update: the live Supabase project is now provisioned and fully verified** (see the closed-out walkthrough below) — item 1 below is historical, kept for context on what this phase originally shipped without live verification.

**What's explicitly NOT done, and why:**
1. ~~No live Supabase project exists.~~ **Superseded** — live project `scholarAgent` (`gfjhsijrwodjvkisouzw`, `ap-south-1`) now exists, schema is applied, all 5 Edge Functions are deployed and verified working end-to-end (see below). What's still true from this point: the frontend isn't yet pointed at any of it (item 2 below).
2. ~~**The actual UI is NOT cut over.** `UserProfileGate.tsx` (1,782 lines), `ProfileSettings.tsx`, and `AIControlCenter.tsx` still call the old `/api/*` Express routes.~~ **Superseded (2026-07-22) — all three are now cut over.** See "Auth/profile Supabase cutover — COMPLETE" below for the full status, including two pre-existing UI bugs found (not fixed, out of scope) and an Edge Function CORS bug found and fixed along the way.
3. **`server.ts`'s old ~1,050 auth/user/admin lines are untouched, deliberately** — per the "don't delete until the replacement is verified working" instruction. They're still what actually runs today; nothing currently points at the new Supabase code.
4. **Two design questions from the previous pass are now CONFIRMED, not open — do not re-litigate, implement per this when the relevant code is touched:**
   - **Password reset**: switch to Supabase Auth's built-in `resetPasswordForEmail` self-service flow, dropping the custom admin-approval gate currently built (`pending_password_resets` table in `supabase/schema.sql`, and the `request-password-reset`/`approve-password-reset` Edge Functions). Reasoning: the old flow's admin-approval step wasn't adding security on top of an already-verified mechanism — `server.ts`'s `/api/request-password-reset` never checked that the submitted email matched the account on file, so anyone who knew a username could stage a reset with an arbitrary email; the admin clicking approve was the *only* thing preventing takeover. Supabase's built-in reset closes that gap directly (the link only ever goes to the real email on `auth.users`), at the cost of losing the admin's visibility into every reset event — an accepted tradeoff. **Not implemented yet.** This happens as part of the Step 2 UI cutover (`UserProfileGate.tsx`'s `handleForgotPasswordSubmit`), not in isolation — when that happens, `supabase/functions/request-password-reset`, `approve-password-reset`, and the `pending_password_resets` table become dead code to remove.
   - **BYOK key encryption**: confirmed direction is a client-side, app-level encryption layer using the already-built `src/utils/crypto.ts` (`encryptDataAsync`/`decryptDataAsync` — AES-GCM + PBKDF2, already throws on an empty secret, no hardcoded fallback to reintroduce). The secret is a **separate vault passphrase**, distinct from the account's login password, entered once per session and held only in memory — never persisted to localStorage/disk. If it's missing (e.g., a page refresh cleared in-memory state), the UI must explicitly prompt to re-enter it before decrypting/re-encrypting anything — never silently fall back to an empty or default secret. **Not implemented yet** — `supabaseAuthService.ts`'s `saveApiKeys` deliberately still stores keys unencrypted; this is deferred until Supabase is live and the encryption round-trip can be tested for real, not built blind.

**Supabase go-live walkthrough — CLOSED OUT, fully verified.** Live project: `scholarAgent`, ref `gfjhsijrwodjvkisouzw`, region `ap-south-1`.
- **Step 1**: Project URL + anon (Publishable) key located and distinguished from the Secret (service_role) key; `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set in the local, gitignored `.env`. Secret key was shown in chat once but never written to any file.
- **Step 2**: `supabase/schema.sql` run against the live project via the SQL Editor. Verified: `profiles`, `api_credentials`, `pending_password_resets` tables exist; RLS enabled on all three; exactly the three expected policies present.
- **Step 3**: the hardcoded admin notification email (`"doc.govinda@gmail.com"`, previously duplicated across `server.ts`, the unwired `server/routes/auth.ts` duplicate, and 3 of the 5 Edge Functions) is now a configurable `ADMIN_EMAIL` (committed — see git log). Supabase CLI installed via `npx supabase@2.109.1` (Homebrew's own `curl` couldn't verify GitHub's release-asset CDN cert on this machine — an unresolved local Homebrew/curl issue, unrelated to Supabase; `npx` sidesteps it using Node's own CA store). Project linked (`supabase/.temp/linked-project.json` confirms `gfjhsijrwodjvkisouzw` — note this CLI version doesn't use `supabase/config.toml`, it's `.temp/`-based, now gitignored). All 5 Edge Functions deployed with `--use-api` (no Docker on this machine) and `--no-verify-jwt` on `approve-registration`/`approve-password-reset` (verified: both return `400`, not `401`). `RESEND_API_KEY` and `ADMIN_EMAIL` secrets set (`supabase secrets list` confirms both registered, distinct from the auto-injected `SUPABASE_*` platform secrets). **Full end-to-end send path verified**: 3 test emails confirmed landed in the `ADMIN_EMAIL` inbox.
- **Two secret-handling mishaps during this walkthrough, both resolved, worth knowing about if repeating similar steps**: (a) the Resend key was twice set to instructional placeholder text instead of a real value (`re_your_actual_key_here` literally, then a Render API key — prefix `rnd_` — pasted by mistake instead of a Resend key, prefix `re_`) — resolved by testing the key directly against `https://api.resend.com/emails` first to isolate "is the key itself valid" from "did it get set correctly," before touching Supabase secrets. (b) The Render `rnd_` key was briefly shown in full in a screenshot in chat — flagged to the user as exposed, same handling as the Supabase Secret Key earlier; revoking it is the user's call, not blocking.

**`UserProfileGate.tsx` cutover — DONE, mid-manual-verification.** Explicitly scoped narrow this pass: a like-for-like data-layer swap only — password-reset logic and BYOK/API-key encryption were **deliberately excluded** from this pass (confirmed explicitly: "those are separate, later efforts," superseding the older plan below that said to bundle them in). What actually happened:
1. **15 characterization tests** written first (`src/components/__tests__/UserProfileGate.test.tsx`), confirmed passing against the OLD `/api/*`-backed code as a locked-in baseline, *then* updated to mock `supabaseAuthService.ts` and re-confirmed passing against the NEW code — same assertions where the interaction genuinely didn't change, updated assertions where it did (see below). Required adding `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as new devDependencies and a `vitest.config.ts` (jsdom needs a real `url` to enable `localStorage`, which vitest's default jsdom environment setup doesn't proxy correctly onto `global` on Node 26+ — worked around via `global.jsdom.window.localStorage`, documented in the test file).
2. **Registration, login, forgot-password** now call `signUp`/`signIn`/`requestPasswordReset` in `supabaseAuthService.ts` instead of `fetch('/api/*')`. Three things could **not** be a pure swap and required explicit decisions (all confirmed by the user before implementing):
   - **OTP email pre-check**: no Supabase equivalent exists (Supabase's own "Confirm email" is meant to be disabled — see below — since `is_approved` replaces it). Now a client-side-only step: the 6-digit code is generated and shown via the same sandbox-bypass message the old code used whenever Resend wasn't configured, but nothing is ever actually dispatched. `formsubmit.co` fallback removed as a result (unreachable now).
   - **Activation**: the old "enter an activation key" flow has no Supabase equivalent (approval is the admin flipping `is_approved` directly; there's no key issued). Replaced with a "Check Approval Status" button on the same pending screen, which just attempts `signIn()` with the already-collected signup credentials.
   - **Wrong-password path**: as a side effect of `signIn()`'s cleaner interface, a wrong password now correctly hits the real error branch directly, rather than accidentally-correctly falling back to a local check because the old server returned `400` (which the old client code misread as "network/offline"). Net behavior visible to the user is the same message; the old escape hatch that auto-approved logins for usernames unknown to the server (see `server.ts`'s `/api/verify-and-sync-profile`, "avoid locking out existing dev profiles") has **no equivalent** and was not reproduced — a real, minor, accepted-as-fine behavior narrowing, not a bug.
3. `tsc --noEmit` clean, full suite: 360/362 passing (the pre-existing 2 `supabaseClient.test.ts` failures noted above, unrelated).
4. **Manual live verification — DONE, confirmed working end-to-end.** signup → registration (`signUp`) → admin approval → login (`signIn`) all confirmed through the real app against the live Supabase project; login success correctly proceeds to the app's "Initialize AI Intelligence" onboarding step. Two things surfaced along the way, both understood, neither a code bug:
   - Supabase's own "Confirm email" setting is still **enabled** on the live project, so `signUp()` currently triggers *two* separate emails (Supabase's own confirmation email, and this app's own `send-approval-email` admin-notification) — still recommend disabling "Confirm email" in Supabase (Dashboard → Authentication → Providers → Email) per `DEPLOYMENT_README.md` §1 step 5 (documented there, not yet actually done) to avoid the redundant step for future signups.
   - The actual test registration's admin-approval email never arrived (cause not fully root-caused — a `send-approval-email` diagnostic call with placeholder data sent and delivered successfully immediately after, confirming the Edge Function/secret/inbox all work correctly in general). Worked around by manually toggling `is_approved = true` for the test row directly in Table Editor rather than via the email link — equivalent effect, since that's all the "Approve Scholar" link does server-side. This directly motivated the bug fix in the follow-up pass below (item 1).

**Follow-up pass — DONE, verified live: email-status bug fix + countryCode fix + dead-code removal.** Same characterization-test-first discipline as the cutover above (tests locked in current behavior, including the bugs, before any fix landed; updated only where behavior intentionally changed).
1. **Silent email-failure bug — fixed** in `signUp()`, `requestPasswordReset()`, `requestProfileUpdate()` (`supabaseAuthService.ts`): all three previously only checked `supabase.functions.invoke()`'s transport-level `error`, never the Edge Function's own returned body — a function that ran but failed to actually send via Resend internally reported blanket success with no warning. Now checks `data.emailSent === false` too and returns `{success: true, error: "..."}` (still not a hard failure — the underlying action, e.g. account creation or reset-staging, did succeed) with an honest caveat message. `UserProfileGate.tsx`'s `handleForgotPasswordSubmit` updated to surface `result.error` on success (mirrors the pattern `handleVerifyDualOtp` already had for `signUp`). `requestProfileUpdate`'s fix has no visible UI effect yet since its caller (`ProfileSettings.tsx`) isn't cut over — still fixed for correctness.
2. **countryCode dropdown bug — fixed**: the phone number sent to `signUp()` previously ignored the selected country-code dropdown entirely (`phone.trim()` alone). `handleVerifyDualOtp` now builds it as `` `${countryCode}${phone.trim()}` `` before stripping formatting characters. Verified live: a non-default country code now shows up correctly in the stored `profiles.phone` value.
3. **Dead code removed** (approved list, nothing more): `socialModal`/`customGoogleEmail`/`customGoogleName`/`showCustomGoogleForm` (unused state), `comparePhoneNumbers`/`cleanPhoneNumber` (unused helpers), the `rememberDevice` checkbox (bound but never read), and **all** Facebook + Twilio + WhatsApp code — `triggerFacebookSignIn`, the `window.FB` SDK calls, the `"facebook"` branch of `handleSocialSignIn` (now Google-only, signature simplified), the Facebook/Twilio config-prompt-modal branches, and the corresponding fields in `App.tsx`'s separate developer-settings panel (`facebookId`, `twilioSid`/`twilioToken`/`twilioFrom` state, their input fields, and the description copy mentioning them). Google OAuth fully untouched and confirmed still working live. `promptKeyType`'s type narrowed from `"google" | "facebook" | null` to `"google" | null`.
4. Characterization suite: 4 new tests added (countryCode behavior, forgot-password error-surfacing, 2 Google OAuth tests) plus 3 new `supabaseAuthService.test.ts` tests (one per fixed function) — all written against CURRENT behavior first (including the bugs), confirmed passing, then updated to the fixed expectations after implementing. `tsc --noEmit` clean; full suite 367/369 passing (same 2 pre-existing, unrelated `supabaseClient.test.ts` failures as before).
5. **Manual live verification — DONE**: signup with a deliberately-broken `RESEND_API_KEY` (confirmed the new honest failure banner appears instead of silent success, then the real key was restored), a normal successful signup, a signup with a non-default country code (confirmed via `profiles.phone` in the database), and a real Google OAuth login (confirmed untouched, still works).

**"Clear Saved API Keys" / "Remove All Users" — resolved by removal, not gating.** Both buttons (and their handlers) deleted entirely from `UserProfileGate.tsx` — no unauthenticated user can trigger either action anymore. Considered building an actual admin-gated surface to house them instead, but there is no admin-auth infrastructure anywhere in this app today (no `is_admin` flag check, no admin route) — building that was explicitly declined as out of scope for a quick fix; confirmed "remove only, for now" instead. If admin-side equivalents of these actions are wanted later, that's a new, separately-scoped feature, not a relocation.

**Wording fix — DONE**: "for Doctoral Scholars" → "for Scholars" in `UserProfileGate.tsx`.

**Password-reset switch to Supabase's `resetPasswordForEmail` — CODE DONE, UNIT-TESTED, CONFIRMED WORKING for the sandbox's allowed recipient; full verification pending Resend custom-domain setup (root cause identified, not a code problem — see item 11).** Replaces the custom admin-approval-gated reset per the long-confirmed design decision.
1. `supabaseAuthService.ts`: `requestPasswordReset` removed, replaced with `sendPasswordResetEmail(email)` (calls `supabase.auth.resetPasswordForEmail`) and `updatePassword(newPassword)` (calls `supabase.auth.updateUser`), plus `onPasswordRecovery(callback)` (wraps `supabase.auth.onAuthStateChange`, fires on the `PASSWORD_RECOVERY` event).
2. `UserProfileGate.tsx`: forgot-password form simplified to email-only (no more username/new-password fields — Supabase enforces the link only reaches the real account email, closing the old arbitrary-email gap directly). New "Set New Password" screen added, shown via the `PASSWORD_RECOVERY` listener.
3. **Real bug found and fixed during live testing**: Supabase's recovery redirect lands with `#access_token=...&type=recovery` in the URL — the *same* hash shape as the pre-existing Google OAuth callback handler expects. That handler grabbed any `access_token` unconditionally and stripped the hash via `history.replaceState` before Supabase's own client library could read it, silently breaking recovery (user landed back on the plain login screen with no error). Fixed by checking `type=recovery` to disambiguate; only handles the hash as Google's callback when it isn't a Supabase recovery redirect. Regression test added (`UserProfileGate.test.tsx`, simulates the colliding hash, asserts the Google-callback fetch never fires).
4. Tests: 22 component tests (`UserProfileGate.test.tsx`) + 18 service tests (`supabaseAuthService.test.ts`) passing. `tsc --noEmit` clean. Full suite 372/374 (same 2 pre-existing, unrelated `supabaseClient.test.ts` failures as always).
5. ~~**Live verification status**: ... testing hit Supabase's built-in email rate limit before that could happen.~~ **Superseded (2026-07-22)** — see item 9 below: the rate limit is no longer the blocker (SMTP is now configured), but live verification is **still incomplete**, now blocked on a different, new issue.
6. ~~**Custom SMTP (Resend) — explicitly deferred**...~~ **Superseded (2026-07-22)**: SMTP is now configured and saved in Supabase (Dashboard → Authentication → Providers → Email → SMTP settings). See item 9 for what this did and didn't unblock.
7. **Dead code from the old flow, not yet removed**: `supabase/functions/request-password-reset`, `approve-password-reset`, and the `pending_password_resets` table are now genuinely unused — safe to remove once the new flow is fully live-verified, not before. **Still not removed** — item 11 confirms the root cause is a Resend sandbox restriction, not a code bug, but full verification (any recipient, not just the Resend account's own address) is still pending custom-domain setup, so removal stays deferred until then.
8. **Nothing from this password-reset work is committed yet** — sitting alongside the still-paused, untouched native-skills work (`server.ts`, `researchPlanner.ts`, `skills/types.ts`, `researchPlanningSkill.ts`).
9. **Retried 2026-07-22, after SMTP setup — rate limit is gone, but a new, different blocker surfaced.** Real click-through attempt for `cutovertest1`: "Forgot Password?" → submit real email → **`POST /auth/v1/recover` returned HTTP 500** (`{"code":500,"error_code":"unexpected_failure","msg":"Error sending recovery email"}`), confirmed via direct curl against the same live endpoint, not just the browser. This is **not** the rate limit (that error had different text and a different HTTP status) and **not** a code problem in `sendPasswordResetEmail()` — that function just calls `supabase.auth.resetPasswordForEmail()` directly; the 500 is Supabase's own GoTrue auth service failing server-side to actually dispatch the email through whatever SMTP relay is now configured.
   - **Worth noting precisely, not glossed over**: this is a *different* email-sending path than the one already confirmed working today. `send-approval-email`/`request-profile-update` call Resend's HTTP API directly (see the Edge Function CORS fix above) and are confirmed working live. Supabase Auth's built-in emails (`resetPasswordForEmail`, and presumably the signup confirmation email too) go through a separate SMTP-relay integration configured in the Auth settings — and *that* integration is what's failing, not Resend itself.
   - **Not investigated further, per instruction** — this needs someone with Supabase Dashboard access to check the actual SMTP host/port/credentials entered (Resend's SMTP relay is `smtp.resend.com`, username `resend`, password = a Resend API key — a mismatch on any of these would produce exactly this generic `unexpected_failure`) — not something guessable or fixable from the application code side.
   - ~~**Full click-through ... still not confirmed live.** ... **Decision needed**...~~ **Resolved — see item 11**: root cause confirmed as a Resend sandbox-sender restriction, not an SMTP misconfiguration.
10. **Retried again 2026-07-22 after SMTP settings were reconfirmed correct in the Dashboard** (Authentication → Emails → SMTP Settings — Custom SMTP on, sender `onboarding@resend.dev`, host `smtp.resend.com`, port 465, username `resend`, password re-checked). **Identical failure** — same `500` / `unexpected_failure` / "Error sending recovery email", confirmed again via direct curl.
    - **One more diagnostic narrowed down *where* it fails, without guessing a fix**: the same `/auth/v1/recover` endpoint called with a deliberately nonexistent email returned a clean `HTTP 200 {}` — Supabase's recover endpoint is designed to always report success for a nonexistent email (anti-enumeration; it never attempts a real send in that case). This confirms the route, auth service, and request handling are all healthy — the failure happens specifically when GoTrue tries to **actually generate and dispatch the email for a real, existing account**, i.e., at the SMTP send step itself, not before it. Rules out a broad misconfiguration or a dead endpoint; does not by itself distinguish between the three candidates below.
    - **Three live candidates, none confirmed**: (a) Resend's sandbox sender (`onboarding@resend.dev`) is documented to only reliably deliver to the Resend account's own registered address — if `cutovertest1@gmail.com` isn't that address, Resend could be rejecting the send; (b) a Resend API key issue (revoked/invalid despite being "re-checked"); (c) a port/TLS mismatch between what GoTrue's SMTP client expects and what's configured (port 465 implies implicit TLS from connection start, vs. 587's STARTTLS — a mismatch here can also surface as a generic failure). Given host/port/username were all reconfirmed correct and the error is unchanged, this now points **away from a simple config typo** and toward one of these three.
    - ~~**Next step, in progress, not yet done**: checking Resend's own Dashboard delivery log...~~ **Superseded by a more direct test — see item 11.**
11. **Root cause confirmed (2026-07-22): Resend's shared sandbox sender, not a Supabase/SMTP config problem.** Instead of relying on Resend's delivery log, ran the more direct test: retried the same reset request but targeted `doc.govinda@gmail.com` — the email address the project's Resend account is itself registered under — instead of `cutovertest1@gmail.com`. **Result: the request succeeded** (no 500). This confirms candidate (a) from item 10 and rules out (b) and (c): `onboarding@resend.dev` (Resend's shared sandbox sender, still in use here since no custom domain is verified yet) can only deliver to the Resend account's own registered address — sending to any other recipient is rejected server-side by Resend, which GoTrue then surfaces to the client as the generic `unexpected_failure` / "Error sending recovery email." Not a Resend API-key problem, not a port/TLS mismatch, not a Supabase-side bug or a code bug in `sendPasswordResetEmail()`.
    - **What this confirms directly**: the `/auth/v1/recover` request path, GoTrue's handling of it, and the SMTP relay wiring to Resend are all functioning correctly once the recipient is one the sandbox sender is allowed to send to. What this does *not* re-confirm in this pass: the full downstream click-through (opening the received email, landing on the recovery screen, setting a new password, logging in with it) for `doc.govinda@gmail.com` specifically — that exact screen-by-screen path was already built, unit-tested, and previously fixed for a real bug (item 3's Google-OAuth-callback hash collision), so there's high confidence it completes correctly, but it wasn't separately re-walked live in this round beyond confirming the initial send no longer 500s.
    - **Fix, not urgent, already planned**: verify a custom domain in Resend (resend.com/domains), then update the SMTP sender in Supabase (Authentication → Emails → SMTP Settings) from `onboarding@resend.dev` to an address on that verified domain. Deferred until a domain is available — this was already the user's own stated plan, not a new decision.
    - **Status going forward**: the password-reset code and flow are correct and complete. The only remaining gap is Resend's sandbox restriction on the *current* sender address, which is a provisioning/domain-ownership matter, not an application bug. Treat this as "confirmed working for the sandbox's allowed recipient; full verification (any real user's email) pending Resend custom-domain setup" — not "blocked" or "broken."

**Still not done, unchanged**: `server.ts`'s old ~1,050 auth/user/admin lines are untouched, deliberately (all three UI components are cut over now, but the old Express routes stay until a live-verification pass confirms nothing still depends on them). BYOK vault-passphrase encryption — still not implemented, still its own separate future task, unaffected by any of the above. "Admin-gate destructive actions" — no longer applicable; those actions were removed entirely instead (see the Twilio/Facebook-removal pass above).

**Next session's actual first task**: no longer a live-verification blocker — item 11 above confirms the password-reset code and flow are correct; the `POST /auth/v1/recover` 500 was root-caused to Resend's shared sandbox sender only accepting deliveries to the Resend account's own registered address, not a Supabase/SMTP config problem. Two things remain, both non-urgent and sequenced after a custom domain is verified with Resend: (1) do one full screen-by-screen click-through (recovery link click → set new password → log in) against a real, non-sandbox recipient once that domain is live, purely to close out the loop already covered by unit tests; (2) only then remove the now-dead `request-password-reset`/`approve-password-reset` Edge Functions and the `pending_password_resets` table (item 7 above).

**Auth/profile Supabase cutover — COMPLETE (2026-07-22).** `UserProfileGate.tsx`, `ProfileSettings.tsx`, and `AIControlCenter.tsx` all now call `supabaseAuthService.ts` instead of `fetch("/api/*")`. Same characterization-test-first discipline as every prior pass in this file.
1. **Step 1 (API-call inventory) found one real gap, fixed in the service layer, not inline**: `requestProfileUpdate()` existed but dropped `keyHash` — the old `/api/request-profile-update` route computed a SHA-256 hash of the verification key server-side and returned it; the Edge Function it now calls only returns the plain `verificationKey`. Fixed by computing the hash client-side in `requestProfileUpdate()` itself (same `crypto.subtle.digest` algorithm `ProfileSettings.tsx` already used), extending its return type rather than touching the component. `saveModelPreferences`/`saveApiKeys` needed no changes — already session-based (resolve the user from the active Supabase session, not a passed `username`), a strict improvement over the old username-in-body pattern.
2. **Tests**: `ProfileSettings.test.tsx` (12 tests) and `AIControlCenter.test.tsx` (5 tests), each written first against the OLD `fetch` code, confirmed passing there, then updated in place to mock `supabaseAuthService.ts` after the rewire — same assertions, only the mock layer changed. Plus 2 new `supabaseAuthService.test.ts` tests for the `keyHash` computation. `tsc --noEmit` clean; full suite 440/442 (same 2 pre-existing, unrelated `supabaseClient.test.ts` failures as every check in this file).
3. **Two real, pre-existing UI bugs found and characterization-tested (locked in as current behavior), deliberately NOT fixed — out of scope for a data-layer swap**:
   - `ProfileSettings.tsx`'s `handleAdminApprove`/`handleAdminReject` call `setSuccess(msg)` then immediately `loadProfileData()`, which itself calls `setSuccess(null)` in the same handler — the success message is set and instantly overwritten, so it never actually renders. The underlying localStorage write (the actual approve/reject effect) happens correctly; only the confirmation message is silently swallowed.
   - `ProfileSettings.tsx` renders only a permanent loading spinner when `!profile` (profile not found in localStorage) — the component does call `setError("User profile not found.")` in this case, but the top-level early return is keyed on `!profile` alone, so that error text is never actually shown.
   - **A third, found live during re-verification after the Edge Function fix below, also not fixed**: if `profile.phone` is ever stored without its `+` country-code prefix (observed once in this session's own test data — cause not traced, may predate this pass), `loadProfileData()`'s prefix-matching loop fails to recognize any of the known `+NNN` prefixes against an unprefixed number, falls back to its default `+977`, and does *not* strip the already-present `977` from the raw value — so resubmitting produces a visibly duplicated prefix (e.g. `+9779779800000001`). Not investigated further; flagging for a future pass, not guessing at a fix.
4. **Live verification — DONE**, real Supabase project (`gfjhsijrwodjvkisouzw`), confirmed via network log and direct curl: login as a genuinely new account; model-preference change → `PATCH /rest/v1/profiles` → 204; API-key save → `DELETE`/`POST /rest/v1/api_credentials` → 204/201; profile-update-request → full round-trip after the Edge Function fix below (real verification key returned, pending-approval screen shown correctly). Admin approve/reject/cancel/verify-key are pure localStorage with zero Supabase dependency — not re-verified live beyond the existing 12 passing component tests, since there's no network behavior to newly confirm there.
5. **Edge Function CORS bug — found, diagnosed, fixed, deployed, live-verified.** Both `send-approval-email` (hit during registration, earlier this session) and `request-profile-update` (hit during this cutover's live verification) were returning `EDGE_FUNCTION_ERROR` (HTTP 500) — **one shared root cause, not two unrelated bugs**: neither function checked the request method before calling `await req.json()`. A browser's CORS preflight (`OPTIONS`, empty body) hit that line and threw a `SyntaxError`, which Supabase's edge runtime surfaces as a bare 500 with no application-level message. Neither function's response ever carried `Access-Control-Allow-Origin` either, so even a successful preflight wouldn't have helped — a real browser would still have blocked reading the response. This is exactly why a direct `curl POST` (which never triggers a preflight, unlike a real browser `fetch()`) looked completely fine the whole time: **the bug is invisible to anything that doesn't go through an actual browser-enforced CORS preflight**, which is also why it was never caught by this project's `tsc`/`vitest` (`supabase/functions` is a separate Deno runtime, deliberately excluded from both).
   - **Fix**: new `supabase/functions/_shared/cors.ts` (shared `corsHeaders` + a `handleCorsPreflight(req)` short-circuit), wired into both functions ahead of their `req.json()` call. `approve-registration` and the two dead password-reset functions were **not** touched — `approve-registration` is only ever reached via a direct browser navigation (an email-link click), which isn't subject to CORS at all, so it was never actually broken; the password-reset functions are confirmed dead code already scheduled for removal.
   - **No automated regression test was added** for this specific fix — `supabase/functions` sits outside this project's Vitest/tsc boundary by deliberate, already-documented design (see the tsconfig.json exclusion), so there's no existing harness to add a Deno-runtime test into without introducing new tooling, which wasn't in scope here. Verified instead via live `curl` (both `OPTIONS` and `POST`, both functions, confirmed correct headers and bodies) and a full real-browser round-trip through the running app. If a persistent Deno-test harness for `supabase/functions` is wanted, that's a separate, reasonably-sized follow-up task, not something folded into this fix.
   - Deployed via `supabase functions deploy <name> --use-api` (no Docker, same pattern as the original go-live).
6. **Commits**: `380aea2` (the cutover itself) and `39d47d5` (the Edge Function CORS fix), kept separate per the established one-fix-per-commit pattern this session.

**Still paused, unchanged, not part of any of the above**: the native-skills agent-wiring rollout (`ResearchPlannerAgent` wired to `src/skills/`, 1 of 8 agents, still uncommitted — deliberately kept separate from every commit made during this Supabase work). Remains blocked until the hosting picture (including the UI cutover above) is fully settled.

**Next proposed step after live provisioning is done (not started): Phase 2 — AI Gateway Tiers 2 and 3** (free-tier BYOK, heavy BYOK), per `docs/planning/hosting-and-topology.md` §7's proposed sequencing — lowest technical risk of the remaining AI Gateway work, reusing `src/services/aiGateway.ts`'s existing provider adapters. Do not start until Phase 1's live verification and the UI-cutover risk (item 2 above) are resolved.

**Also still paused, unchanged**: the in-progress native-skills agent-wiring rollout (`ResearchPlannerAgent` wired to `src/skills/`, 1 of 8 agents, uncommitted) — `createAgentContext()` lives in `server.ts`, which this hosting migration will eventually eliminate; don't wire the remaining 7 agents until the hosting picture is fully settled. See `docs/planning/2026-07-20-session-notes.md` for that work and the still-open UI redesign / agent-roster (blocked on ARCH-3) proposals.

---

## 0. Repository Migration Note (2026-07-20) — READ FIRST

This is a **fresh repository**, copied from an older working directory
(`/Users/pobpkf/Documents/Doctoral-Research-and-Journal-Publication-Assistant 4.43.36 PM`)
because that location's Claude Code session had a persistent bug where the
`Write` tool could not create new files (reported success but the file never
actually existed on disk, confirmed via both `Bash` and `Read`). That bug
does **not** reproduce in this new location — new-file creation was
verified working here before this note was written.

**Do not repeat completed work.** The old repository had already been through
multiple audit/stabilization/convergence sessions before this migration. This
copy excluded that session's audit-report clutter (`ARCHITECTURE_SYNCHRONIZATION_REPORT.md`,
`ENGINEERING_*_REPORT.md`, etc.) and a few non-code items (`.env`, `users.json`,
a local AI model binary, stray duplicate scaffold folders) — none of that
represents unfinished engineering work, just prior audit trail. If you need
that history, it still exists at the old path above.

**Verified state as of this commit**: 0 TypeScript errors, 18 test files /
330 tests passing (`npx vitest run`), production build succeeds
(`npm run build`), server boots and serves real requests (health check).
Note: `/api/agents` does not exist — `server/routes/` only registers `ai.ts`,
`auth.ts`, and `parser.ts`. The `src/agents/` scholarly agents and
`src/orchestrator/` workflow engine are implemented but are not imported by
`server.ts` or any route, so they are not reachable from the running app yet
(see the kernel-wiring note below).

**Fixed during migration** (both bugs are resolved, not open items):
- `src/ai/` (the AI Kernel) was accidentally omitted by an overly-broad
  copy-exclude pattern — restored and verified.
- `uuid` (used by `src/orchestrator/*`) was an undeclared/phantom dependency
  that only worked in the old repo by accident (already sitting in its
  `node_modules`) — now a proper `package.json` dependency.
- BibTeX/RIS citation import logic, previously stuck inline in `server.ts`
  as a workaround while file-creation was blocked, has been moved to its
  proper home: `src/citation_compliance/importers/` (with tests).

**Suggested next steps** (not started yet, from the prior session's audit):
Knowledge Graph (`src/knowledge/graph/KnowledgeGraph.ts`) is fully
implemented but has no adapter connecting it to any live UI or service —
genuinely disconnected, not a quick fix; would need a product decision on
what it should actually show before wiring it up. The same is true, more
broadly, of most of the "Operating System" kernel layer: grepping the
codebase for each kernel class shows `KnowledgeKernel`, `WritingKernel`,
`PublicationKernel`, `WorkspaceKernel`, and `CollaborationKernel` are only
referenced inside their own module (definition + barrel `index.ts`) — no
import from `server.ts`, `server/routes/`, `src/App.tsx`, or
`src/components/`. `AIKernel` is the exception: `src/research/` consumes it.
`src/orchestrator/` (MultiAgentOrchestrator, WorkflowEngine) and
`src/agents/` (the eight scholarly agents) are likewise fully implemented
and tested but never imported by the running server or UI. None of this is
broken — it's substantial, working library code — but earlier drafts of
this document described it as production-integrated, which overstates its
current reach. Treat "wire an OS kernel / agent / orchestrator into the
live app" as real, unstarted product work, not a loose end to tidy up.
Beyond that, continue the established pattern from this project's
engineering history: prefer deterministic Scholar Core OS processing over
AI where structured data already exists, and validate every change with
`npx tsc --noEmit`, `npx vitest run`, and `npm run build`.

---

## 1. Executive Summary

- **Project Name**: Scholar Agentic Operating System
- **Current Maturity**: v1.0.0 LTS Release
- **Primary Purpose**: AI-native operating system for academic research and journal publication
- **Development Stage**: Phase 6 (Document Intelligence) in progress; Phases 7-10 planned
- **Production Readiness**: Build system stable, 330 tests passing, PWA implemented, authentication ready

---

## 2. Repository Overview

### Major Directories

```
src/
├── ai/                    # AI Operating System (providers, router, cache, telemetry) — kernel: AIKernel
├── research/              # Research Operating System (discovery, analyzers, evidence) — ResearchIntelligenceEngine, no Kernel class
├── knowledge/             # Knowledge Operating System (graph, semantic memory, KQL) — kernel: KnowledgeKernel
├── knowledge_vault/       # Document repository/indexing service (distinct from knowledge/)
├── writing/               # Writing Operating System (drafting, citations) — kernel: WritingKernel
├── publication/           # Publication Operating System (journals, workflow) — kernel: PublicationKernel
├── workspace/             # Workspace Operating System (projects, lifecycle) — kernel: WorkspaceKernel
├── collaboration/         # Collaboration Operating System (teams, roles) — kernel: CollaborationKernel
├── orchestrator/          # Multi-agent workflow engine (MultiAgentOrchestrator, WorkflowEngine, execution/approval/retry)
├── agents/                # Scholarly agents (research planner, literature review, methodology advisor, manuscript writer, ...)
├── document_intelligence/ # Document parsing pipeline (PDF/DOCX/TXT/Markdown → Canonical Document Model)
├── citation_compliance/   # Citation & academic compliance engine (APA7/IEEE/MLA9/Chicago/Harvard/Vancouver)
├── auth/                  # Authentication UI (LoginScreen, authContext, useAuth)
├── lifecycle/             # ResearchLifecycleEngine (10-phase workflow state machine)
├── core/                  # Shared foundation, incl. core/manuscript and core/project
├── components/            # React UI components
├── hooks/                 # Custom React hooks
└── services/              # Service layer integrations

server/                    # Express backend — routes/ (ai, auth, parser), services/, middleware/, data/ (storage layer)

docs/
├── architecture/ # core architecture documents
├── adr/        # architecture decision records
└── development/  # Developer handbook, sprint guides

.claude/        # AI handover documentation (this folder)
```

### Documentation Structure

- `README.md` — Project overview and quick start
- `CHANGELOG.md` — Release history and changes
- `docs/architecture/` — System design documentation
- `docs/adr/` — Architectural decisions
- `.claude/` — AI development handover documents

### Source Layout

Each operating system follows consistent patterns with `core/`, `types/`, and `index.ts` barrel files. Components are in `src/components/`, hooks in `src/hooks/`.

### Test Organization

Tests located in `__tests__/` directories adjacent to source code. Integration tests for cross-module workflows.

### Configuration Files

- `package.json` — Dependencies and scripts
- `tsconfig.json` — TypeScript configuration
- `vite.config.ts` — Vite build configuration
- `.env.example` — Environment variable template

---

## 3. Current Implementation Status

### Operating Systems

| OS | Status | Wired into running app? | Notes |
|----|--------|--------------------------|-------|
| AI OS | ✅ Implemented | Yes — consumed by `src/research/` | Provider abstraction, fallback chains, caching |
| Knowledge OS | ✅ Implemented | No | KnowledgeKernel, KnowledgeGraph, SemanticMemory — only referenced within `src/knowledge/` |
| Research OS | ✅ Implemented | Partially — depends on AIKernel, but not called by `server.ts`/UI | ResearchIntelligenceEngine, evidence workspace |
| Writing OS | ✅ Implemented | No | Manuscript drafting, citation generation — only referenced within `src/writing/` |
| Publication OS | ✅ Implemented | No | Journal management, recommendations — only referenced within `src/publication/` |
| Workspace OS | ✅ Implemented | No | Multi-project support, lifecycle — only referenced within `src/workspace/` |
| Collaboration OS | ✅ Implemented | No | Teams, roles, permissions — only referenced within `src/collaboration/` |

The live product (`server.ts` + `src/App.tsx`/`src/components/`) actually runs on `src/services/aiGateway.ts` + `src/services/aiService.ts`, `src/auth/` (localStorage-backed), and `src/core/project` (`ProjectBuilder`) — a simpler, more conventional stack than the kernel model above describes. See the kernel-wiring note in section 0.

### Architecture

- ✅ Clean Architecture compliant
- ✅ Kernel-based design implemented
- ✅ Dependency Injection in place
- ✅ Event-driven ready
- ✅ No circular dependencies
- ✅ Architecture audit complete

### Documentation

- ✅ 5 Architecture Documents
- ✅ 10 ADRs
- ✅ Developer Handbook
- ✅ AI handover documents (`.claude/`)

### PWA

- ✅ Service worker (`sw.js`)
- ✅ Web manifest (`manifest.json`)
- ✅ Offline-first architecture

### Research Lifecycle

- ✅ 10-phase workflow defined in `src/lifecycle/ResearchLifecycleEngine.ts` — **but nothing imports this file outside itself**; it is not the workflow the running app actually uses.
- ⚠️ The live UI runs a *different*, lettered phase model: `src/types.ts` defines `currentPhase: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "G1" | "G2" | "H" | "I"`, and `src/components/*` + `src/services/aiService.ts` hardcode phase labels against those letters (B = Dissertation Grounding, C = Data/Source Discovery, D = Journal Discovery, E = Compliance Setup, F = Manuscript Co-Drafting, G = Quality Control, H/I = Submission Packaging & Tracking). When a doc or a user says "Phase 6" or "Phase F", confirm which of the two models they mean before acting — they are not the same numbering.
- ✅ State persistence implemented (client-side, via `authContext.tsx` + localStorage, and server-side via `server/data/`)
- ✅ Evidence-controlled reasoning (in the disconnected `src/knowledge/reasoning` module)

### Testing

- ✅ 330 automated tests passing (18 test files)
- ✅ Unit tests for all kernels
- ✅ Integration tests for OS modules

### Build

- ✅ Vite build system operational
- ✅ TypeScript strict mode
- ✅ Tailwind CSS v4 integrated

### Current Repository Maturity

Stable foundation with active Document Intelligence development. Ready for new feature development within established patterns.

---

## 4. Major Features

### AI Operating System
- Multi-provider AI (OpenAI, Anthropic, Gemini, Ollama, LM Studio)
- AIRouter with fallback, caching, telemetry
- ModelRegistry, TaskRouter, PolicyEngine
- Cost tracking and rate limiting

### Knowledge Operating System
- KnowledgeRegistry for object management
- KnowledgeGraph for relationships
- SemanticMemory for vector search
- KQL (Knowledge Query Language) for querying
- ReasoningEngine with deductive/inductive/abductive reasoning

### Research Operating System
- ResearchIntelligenceEngine for analysis
- Literature discovery providers
- Evidence review workspace
- Framework generation
- Methodology recommendation
- Novelty analysis

### Writing Operating System
- Manuscript drafting
- Outline generation with templates
- Citation compliance (APA 7th, IEEE, MLA 9th, Chicago, Harvard, Vancouver)

### Publication Operating System
- Journal database with metadata
- Journal recommendations
- Impact factor-based ranking
- Publication workflow

### Workspace Operating System
- Multi-project management
- Project lifecycle (draft → active → completed → archived)
- State persistence

### Collaboration Operating System
- Team management
- User roles
- Shared workspace features

---

## 5. Architecture Summary

### Operating System Model

Scholar follows an operating system model where each domain (AI, Research, Knowledge, Writing, Publication, Workspace, Collaboration) operates as an independent layer. Layers communicate through well-defined interfaces.

### Kernel Abstractions

Each OS layer implements the `Kernel` interface:
```typescript
interface Kernel {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<HealthStatus>;
  configuration(): KernelConfig;
  capabilities(): KernelCapabilities;
  execute<T>(input: T): Promise<T>;
  events(): EventBus;
  metrics(): Metrics;
}
```

### Research Lifecycle

Ten-phase structured workflow:
1. Research Intake
2. Literature Review
3. Research Planning
4. Methodology Design
5. Data Analysis
6. Draft Writing
7. Manuscript Refinement
8. Compliance Checking
9. Publication Preparation
10. Publication Submission

### AI Abstraction

Multi-provider architecture with:
- `AIProvider` interface for all providers
- `AIRouter` for fallback chains
- Caching and telemetry built-in

### Knowledge Graph

Knowledge objects with:
- UUID identity
- Metadata and relationships
- Lifecycle management
- Confidence scoring

### Workspace Organization

Projects contain:
- Research questions
- Evidence
- Knowledge objects
- Manuscripts
- Publications

---

## 6. Development Environment

### Primary Language
- **TypeScript** (strict mode enabled)

### Frameworks
- React 19 with hooks
- Vite for build
- Express.js for backend API

### Package Manager
- npm (with `package-lock.json` committed)

### Build System
- Vite development server
- TypeScript compiler
- Tailwind CSS v4

### Testing Framework
- **Vitest** (`npm test` runs `vitest run`; `test:coverage` runs `vitest run --coverage`)
- Jest appears in `devDependencies` but is not the active runner — treat as legacy/unused unless confirmed otherwise
- Unit and integration tests, 18 `*.test.ts` files on disk, 330 tests passing

### Development Tools
- ESLint (recommended for consistency)
- VS Code with TypeScript extension

### IDE Recommendations
- VS Code with ESLint and TypeScript plugins
- Prettier for formatting

### Current Git Strategy
- Local repository active
- Branch: `main`

---

## 7. Build & Verification

### Build Command
```bash
npm run build
```

### Development Command
```bash
npm run dev
```

### Test Command
```bash
npm test
```

### Expected Results
- Build completes without errors
- All tests passing (330 tests)
- No TypeScript errors in strict mode

### Current Verification Status
- Build system operational
- Tests passing
- PWA verified
- ESLint configuration pending

---

## 8. Repository Health

### Architecture Maturity
- Foundation stable and audited
- Kernel patterns consistent
- Dependency rules enforced

### Documentation Coverage
- Architecture: Complete (5 documents)
- ADRs: Complete (10 records)
- AI handover: Complete (`.claude/` folder)

### Testing Maturity
- 330 tests passing
- Unit test coverage for kernels
- Integration test coverage

### Build Reliability
- Build succeeds consistently
- TypeScript strict mode enforced
- Tailwind CSS v4 integrated

### Technical Debt
- Minor: Inline style migration, test coverage gaps
- Medium: Git cleanup pending
- Major: Document Intelligence mid-implementation

### Maintainability
- Clean architecture patterns
- Consistent naming conventions
- Modular design enables independent changes

### Scalability
- Provider abstraction supports scaling
- Kernel model enables horizontal growth
- Event system enables parallel development

### Overall Readiness
Production-ready foundation with active feature development.

---

## 9. Known Limitations

### Authentication & Security
- Authentication UI and backend routes exist (`src/auth/`, `server/routes/auth.ts`, `server/middleware/authRateLimiter.ts`, `server/utils/apiKeyCrypto.ts`) — maturity/completeness not verified at source level in this pass
- API keys stored encrypted (WebCrypto API)
- Rate limiting on backend endpoints

### Cloud Features
- Cloud synchronization not yet implemented
- Offline-first with local storage only

### Enterprise Capabilities
- Multi-tenancy not implemented
- Audit logging not yet implemented
- RBAC designed but not enforced

### Mobile Support
- Native mobile apps not yet implemented
- Responsive web UI only

### Plugin Ecosystem
- Plugin architecture ready but no marketplace

### See Also
- `KNOWN_LIMITATIONS.md` for detailed limitations
- `FUTURE_ENHANCEMENTS.md` for future capabilities

---

## 10. Immediate Development Priorities

### Priority 1: Document Intelligence Cycle 1 (In Progress)
**Why**: Enables evidence extraction from user-uploaded documents, essential for completing the evidence pipeline.
**Status**: Active development (Document Intelligence, `src/document_intelligence/`)

### Priority 2: Architecture Stabilization (E01)
**Why**: Unblocks security foundation and refactoring tasks.
**Components**: T001 (CDM Resolution), T002 (Event Dispatcher), T003 (Secure Encryption)

### Priority 3: Security Foundation (E02)
**Why**: Essential for production deployment and user trust.
**Components**: T004 (API Keys), T005 (CSRF), T006 (Rate Limiting)

### Priority 4: Codebase Refactoring (E03)
**Why**: Improves maintainability and follows established patterns.
**Components**: T007, T008

---

## 11. Risks

### Architectural Drift
**Risk**: Future changes may violate established module boundaries.
**Mitigation**: Review against `ARCHITECTURE_RULES.md` before merging.

### Documentation Gaps
**Risk**: Implementation may outpace documentation.
**Mitigation**: Update docs as part of every significant change.

### Large Reviews
**Risk**: Monolithic changes difficult to review and debug.
**Mitigation**: Make small, incremental changes with clear commits.

### Dependency Upgrades
**Risk**: Newer versions may break established patterns.
**Mitigation**: Test thoroughly before upgrading; pin versions.

### Scalability Concerns
**Risk**: Performance may degrade with large datasets.
**Mitigation**: Profile before optimizing; design for horizontal scaling.

---

## 12. Handover Notes

### Essential Reading
1. Review `docs/architecture/01-Scholar-Platform-Constitution.md` for vision and principles
2. Review `docs/architecture/02-Scholar-System-Architecture.md` for system design
3. Review `docs/adr/ADR-0001-ScholarKernel.md` through `ADR-0010-MultiProviderAI.md` for decisions
4. Read `.claude/CLAUDE.md` for AI operating procedures
5. Read `.claude/ARCHITECTURE_RULES.md` for architectural constraints

### Do's
- ✅ Extend existing modules before creating new ones
- ✅ Follow established patterns and conventions
- ✅ Update documentation alongside code
- ✅ Make small, incremental changes
- ✅ Test thoroughly before considering work complete

### Don'ts
- ❌ Redesign completed architecture without approval
- ❌ Remove existing functionality
- ❌ Introduce breaking API changes
- ❌ Duplicate existing modules
- ❌ Bypass established abstractions

---

## 13. Related Documentation Reading Order

### For Understanding
1. `README.md` — Quick overview
2. `.claude/PROJECT_MEMORY.md` — Historical context
3. `docs/architecture/01-Scholar-Platform-Constitution.md` — Vision and principles
4. `docs/architecture/02-Scholar-System-Architecture.md` — Technical architecture
5. `.claude/ARCHITECTURE_RULES.md` — Non-negotiable rules

### For Development
6. `.claude/DEVELOPMENT_GUIDELINES.md` — Coding standards
7. `CHANGELOG.md` — Recent changes
8. `docs/adr/` — Architectural decisions
9. `.claude/HANDOVER.md` — This document

---

## 14. Definition of Successful Handover

A successful handover means:

- ✅ Repository builds successfully (`npm run build`)
- ✅ Architecture is understood and respected
- ✅ Documentation is complete and current
- ✅ Future contributors can work productively
- ✅ Development standards are established and followed
- ✅ Knowledge transfer is preserved in `.claude/` documents
- ✅ No regressions introduced in handover process