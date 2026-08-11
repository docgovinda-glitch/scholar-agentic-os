# AI Access & Scholar AI Engine — Implementation Record

> **Doc ID:** 50 · **Status:** Implemented (partial — see §9) · **Depends on:** `41`, `46`, `49`

This document describes what is actually built and deployed, as of this
implementation pass — not a target architecture. Where doc `41`
(AI-ARCHITECTURE) or `49` (ADMIN-ARCHITECTURE) describe a broader future
vision, this doc records the real, current-state slice of it that exists in
code today, matching doc `46` §18's own "current state" convention rather
than restating those docs' aspirational content as if it were done.

---

## 1. Product surface

Four user-facing AI access tiers (Local, Free, BYOK, Premium), never
requiring the user to understand or configure the routing engine behind
them. The user-facing page is **AI Access** (`src/desk/aiAccess/AiAccessPage.tsx`),
reachable from Desk's project list header and, once inside a project, from
`DeskShell`'s header. It shows tier status, connected providers, a
browser-estimated hardware profile with a local-model size recommendation,
and — for Premium — quota and credit balance. It never presents "Omni
Router" as something to configure.

Provider connection itself (entering a BYOK key, picking a model) is
unchanged: it stays in the existing `AiSetupScreen`
(`src/desk/setup/AiSetupScreen.tsx`), which predates this work. AI Access is
the status view on top of it, not a second setup flow.

`AiSetupScreen` doubles as the first-login onboarding step (docs
25-ONBOARDING-ARCHITECTURE.md's "AI Setup", gated by
`src/desk/setup/useAiSetupStatus.ts`) — a later pass made that gate's
"already configured" signal server-trusted rather than only a key on this
device: `GET /api/ai-access/status` (connections or an active entitlement,
from ANY device) is checked as a fallback before asking a returning user to
set up AI again. The onboarding variant also explains the four tiers'
cost/privacy/difficulty honestly, gives a hardware-aware recommendation
(reusing `recommendLocalModel` below, not a second implementation), and ends
with an "AI setup complete" summary rather than silently trusting that
something got configured. See docs 25's own status note for the full
first-login journey this fits into.

## 2. Provider & Model Registry

`public.ai_providers` / `public.ai_models` (`supabase/schema_ai_engine.sql`)
are the DB-backed registry. They are seeded from — not a hand-maintained
duplicate of — the existing static catalogs:

- `src/config/providerCatalog.ts` (25 BYOK cloud providers)
- `src/config/localRunnerCatalog.ts` (9 local runners)

via `scripts/seedAiRegistry.ts` (`npm run seed:ai-registry`), safe to re-run
(upsert on primary key). The static catalogs remain the source of truth for
request-shape details the AI Gateway needs at runtime (`baseUrl`,
`chatPath`, `apiStyle`); the registry adds the admin-configurable,
Premium/Free-eligibility facts the static files don't carry (`enabled`,
`premium_eligible`, `free_eligible`, `last_verified_at`). Read access is
public (RLS `select using (true)`) so the AI Access page can render the
catalog signed out; writes are admin-only through `server/routes/admin.ts`.

## 3. Credential custody — two different models, deliberately

**User BYOK credentials never reach the server.** This is unchanged from
before this work, and unchanged on purpose: doc `46` §5.3 and §18 name
server-side custody of a user's own key as "the single clearest violation
of the target posture," already retired once
(`resolveApiKey`/`decryptServerKey`). Keys stay in the browser's encrypted
`localStorage` (`src/services/userAiSettings.ts`). `public.user_ai_connections`
(new) records only that a connection exists — provider, tier, status, model
count — never the credential.

**Scholar's own Premium-pool provider keys are stored server-side,
encrypted.** This is a different case: an operator credential, not a user
secret, and doc `41`/Section 10 of the AI Access brief requires it.
`public.platform_provider_credentials` holds each credential under real
AES-256-GCM envelope encryption (`src/services/crypto`, previously written
but unused): a fresh Content Encryption Key per credential, wrapped under a
server-held `MASTER_KEY`. The table has zero RLS policies — reachable only
via `service_role`, i.e. only from `server/src/aiEngine/credentialVault.ts`,
called only from admin routes. `listCredentials()` (used by the admin panel)
selects only `masked_preview` and status columns; it never touches the
encrypted columns, so a credential list request cannot leak ciphertext even
by accident.

## 4. Hardware Profiler

`src/services/hardwareProfiler.ts`. Honest about what a browser can and
cannot know: `navigator.deviceMemory` is capped/bucketed by the browser
itself and unavailable outside Chromium; there is no browser API for VRAM
at all. Every returned profile carries `detectionMethod: "browser-api"`, and
the UI labels every number as an estimate. Local runtime/model detection
reuses the existing `src/services/localRunnerProbe.ts` rather than
re-solving its CORS/mixed-content handling. `recommendLocalModel()` is a
pure, rule-based RAM → size-class mapping — it never predicts a tokens/sec
figure, since nothing here has run an actual benchmark.

## 5. Scholar AI Engine (server/src/aiEngine/)

| Module | Responsibility |
|---|---|
| `credentialVault.ts` | Premium-pool credential encrypt/store/decrypt (§3) |
| `entitlements.ts` | Premium plan/status/expiry; `isEntitlementActive()` is pure |
| `quotaEngine.ts` | Effective limits = plan defaults, individual fields overridden by admin `user_quota_overrides` |
| `creditEngine.ts` | TS wrapper around the atomic SQL functions (§6) |
| `omniRouter.ts` | Pure provider/model selection (§7) |
| `auditLog.ts` | Every admin mutation writes `admin_audit_log` |
| `opportunityAgent.ts` | AI Opportunity Agent research (§8) |

`server/src/supabaseRest.ts` is a shared, generic PostgREST client — the
same HTTPS-to-Supabase's-Data-API pattern
`src/services/store/restProjectStore.ts` established, generalized so twelve
new tables didn't each hand-roll fetch/timeout/error handling.

## 6. Credits — atomicity lives in the database, not the server

`deduct_credits`/`grant_credits` (`supabase/schema_ai_engine.sql`) are
`SECURITY DEFINER` Postgres functions, not a server-side
read-then-write. PostgREST has no multi-statement transactions
(`restProjectStore.ts`'s own documented trade-off), so a naive server-side
"read balance, check, write balance, write ledger" has a real
double-spend race: two concurrent requests can both read the same balance
and both pass. Wrapping the whole operation in one function with
`select ... for update` makes it one transaction with a row lock. `EXECUTE`
is revoked from `anon`/`authenticated` and granted only to `service_role` —
verified live against the production database, not merely written in the
migration. Functionally verified end-to-end against production (grant,
successful deduction, deduction correctly blocked at the daily limit, ledger
integrity), then the test data was removed.

Daily/monthly counters reset lazily (checked and zeroed the first time
they're touched after their window elapses) — no cron job required.

## 7. Omni Router

`server/src/aiEngine/omniRouter.ts`. Deliberately pure: capability matching
(does this model do vision? is this the user's connected provider?) and
health/quota lookups happen in the caller
(`server/routes/aiAccess.ts`'s `/route` handler), which assembles a
`RoutingCandidate[]` from `user_ai_connections`, `provider_health`, and the
Quota Engine, then calls `selectProvider()` for the ordering decision alone.
Tier preference is cheapest/most-private-first (local → free → byok →
premium) for ordinary tasks, and free/byok/premium-first for
multimodal/long-context tasks where local models are least likely to have
the needed capability. A `down` health status excludes a candidate outright;
`degraded` sorts behind `healthy` within the same tier. Premium is only ever
selected when `premiumQuotaRemaining` is a positive number — `null` (no
entitlement) or `0` (exhausted) both exclude it, with an exhausted-quota
response naming that specifically rather than folding it into a generic "no
source" message. 13 tests cover one source, many sources, fallback on
down/degraded health, quota exhaustion with and without a fallback source,
the `no-cloud` privacy restriction, and zero sources.

**Wired into the live generation call.** A later pass (§7a) connected this
router to the real `POST /api/studio/refine` execution path, replacing the
single manually-chosen provider as the default. `POST /api/ai-access/route`
remains the read-only decision-preview endpoint the client calls first.

### 7a. Live wiring — Omni Router in the real generation path

`server/src/aiEngine/routingCandidates.ts` (`assembleRoutingCandidates`) is
the one place that builds a real `RoutingCandidate[]` from
`user_ai_connections`, `user_entitlements` + Quota Engine, `provider_health`,
and — for Premium — real rows in `platform_provider_credentials` (never the
placeholder `"scholar-premium-pool"` id an earlier draft of the Premium path
used, which was not an executable provider). Both `POST /api/ai-access/route`
(preview) and the live execution path below call this same function, so the
two can never disagree about what "available" means.

**Premium** (`server/routes/studio.ts`'s `runPremiumRefine`): the client
sends `useEngine: "premium"` with no `provider`/`apiKey`. The server never
trusts that flag as a grant — it independently re-derives entitlement,
quota, and the Omni Router's decision from the database, pre-checks the
request's estimated cost against the plan's per-task limit
(`estimateMaxCreditsForInput`, `creditPolicy.ts`) before calling any
provider, and on success computes the real cost from actual token usage
(`creditsForUsage`) and calls the existing atomic `deduct_credits` RPC
(`creditEngine.ts`) exactly once. A provider failure tries the next
Premium fallback (bounded, ranked by `provider_health`) without deducting;
exhausting all fallbacks returns an error, never a silent success. Every
attempt (success or failure) updates `provider_health`
(`recordProviderSuccess`/`recordProviderFailure`).

**Free / BYOK** (`src/desk/regions/StudioPanel.tsx`, "Auto" mode, the
default): the client calls `POST /api/ai-access/route` for the router's
pick, then — for a non-Premium choice — reads ITS OWN locally-stored key
for that specific provider (`readProviderKey`, never the server) and
supplies it directly to `refinePassage()`, same as the pre-existing manual
path always did; the server still never holds a Free/BYOK credential. If
no key is stored on this device for the chosen provider (e.g. the
connection exists from a different device), the client tries the next
router-ranked fallback rather than sending a request that cannot succeed.
An "Advanced" mode preserves the original manual provider+key dropdown
for when Auto has nothing usable, or the user just wants to pick.

**Local** executes for real (a later pass — see §7b) — `StudioPanel`
attempts a chosen local candidate directly in the browser rather than
skipping it.

**Transparency** ("Why this AI?"): `StudioRefineResult` carries `usage`
(provider/model/token estimates, for any level that called a provider) and,
for Premium, `aiSource` (tier/provider/model/`creditsUsed`). `StudioPanel`
shows both the router's pre-execution reasoning and, once a result exists,
what actually ran — provider, model, tier, and credits spent — never an
API key or other internal.

Priority 7's live routing test matrix (16 scenarios: single/multiple free
providers, local+free, BYOK+free, Premium available/unavailable, quota
available/exhausted, provider unavailable/removed/invalid credential,
cross-user isolation, quota/entitlement tampering, forced Premium without
entitlement, failed generation with no deduction, and concurrent-request
deduction) is split across
`server/routes/__tests__/aiAccess.routingMatrix.test.ts` (decision-preview
scenarios) and `server/routes/__tests__/studio.premium.test.ts` (execution
scenarios) — see the header comment in the former for the exact mapping.
Concurrent double-spend prevention is pinned at the JS-call-shape level
only (one atomic RPC call per request, unique request id, no local
read-modify-write of a balance); the actual guarantee is Postgres's
`for update` row lock inside `deduct_credits()`, which a mocked-fetch unit
test cannot exercise — that guarantee was verified live against production
in the pass that built it (§6), not re-verified here.

Premium's provider call now goes through the same 428-consent-required
retry flow Free/BYOK/manual requests use — see §7b, which closed the gap
this paragraph used to describe.

### 7b. Local execution, and Premium's Warden/consent fix

**Local runs entirely in the browser, not through the server.** A local
runtime (Ollama, LM Studio, …) listens on the USER's own machine — Scholar's
server has no network path to it at all, so unlike Free/BYOK/Premium, local
execution cannot be server-mediated even transiently. `src/desk/regions/
localStudioExecution.ts` calls `refine()` (`src/app/studio/studio.ts`)
directly from the browser — the exact same pipeline `server/routes/
studio.ts` uses server-side (`refine()` → `complete()`
(`platform/gateway/gateway.ts`) → the Warden → an adapter), not a second
implementation. This works because that whole chain is isomorphic — no
Node-only import anywhere in it, confirmed by
`src/platform/__tests__/architecture.test.ts`, which already confines every
outbound `fetch()` under `src/platform` to `gateway/adapters.ts` regardless
of which runtime calls into it. `adapters.ts` gained two local-runner
adapter classes (`OllamaAdapter` for the native API, one shared
OpenAI-compatible adapter for the other eight catalogued runners — see
`src/config/localRunnerCatalog.ts`) with a 120s generation timeout and,
deliberately, no auth header of any kind: a local runtime has no credential
to send.

Local still goes through the same Warden classify/policy gate every other
tier does — the policy matrix doesn't exempt "local," and this work didn't
add an exemption. What differs is WHERE consent is remembered:
`src/app/studio/sessionPolicyStore.ts` (a plain in-memory `Map` keyed by
session id, no Node-only dependency) is imported directly into the browser
bundle for this, as its own separate instance scoped to a `local:` prefixed
key — granting local consent is a same-tab, in-memory decision with no
server round trip, exactly matching the durability class the SERVER's own
copy of this store already has (in-memory, not durable across a restart —
see that file's own comment).

Model discovery reuses `probeRunner()` (`src/services/localRunnerProbe.ts`,
the same function `AiSetupScreen` already uses) rather than a second
detector. A runtime that doesn't answer, or answers with zero loaded
models, produces a specific error (`LocalRunnerUnavailableError` /
`LocalModelMissingError`, the latter carrying the runner's own install
guidance) rather than a generic failure — and `StudioPanel` falls back to
the next router-ranked candidate on any local failure short of a consent
decision, rather than stopping the whole request (a privacy-restricted
candidate list has no cloud candidate to fall back to, so this never
overrides a `no-cloud` preference).

**Premium's Warden/consent fix:** `runPremiumRefine` (`server/routes/
studio.ts`) now checks for a `GatewayDenied` in its per-candidate `catch`
BEFORE treating the failure as "this provider is down." A
consent-required denial returns the identical `428 {error:
"consent_required", reason, provider}` shape the manual Free/BYOK path
already used; a hard deny (e.g. a restricted scope) returns `403 {error:
"denied"}`. Neither deducts credits, and neither is retried against the
next Premium fallback within the same request — the client's existing
consent-prompt UI (already built for Free/BYOK) grants consent via
`POST /api/studio/consent` and calls `/api/studio/refine` again, same as
it always did; nothing about the client's retry path needed to change.

### 7c. Tier-aware Warden policy (final AI execution hardening)

§7b shipped local execution still asking for the SAME "send this to a cloud
provider?" consent prompt every cloud tier gets, because the Warden's policy
matrix (`platform/warden/policy.ts`) classified purely by content class
(`user_content` → "ask"), with no notion of tier or data path at all. That
prompt was misleading for local: nothing was ever going to leave the
device, so asking the user to "allow" a cloud transfer that was never going
to happen was not a privacy safeguard, it was noise that could train users
to click through consent prompts without reading them.

The fix is narrowly scoped, not a global "disable Warden for local"
switch. A `local?: boolean` field was threaded through the existing request
objects at every layer already in the call chain — no new module, no
second policy engine:

`EgressRequest` (`platform/warden/types.ts`) → `evaluate()`
(`platform/warden/warden.ts`) → `decideForClass()` (`platform/warden/
policy.ts`) → `CompletionRequest` (`platform/gateway/types.ts`) →
`evaluateAndResolvePrompt()` (`platform/gateway/gateway.ts`) →
`StudioRefineInput` (`app/studio/types.ts`) → `refineWithModel()`
(`app/studio/studio.ts`) → `refineLocally()` (`desk/regions/
localStudioExecution.ts`, the only caller that ever sets it `true`).

`decideForClass()` checks `local` in exactly one place: inside the
existing `if (decision === "ask")` branch. When the configured decision for
the request's egress class is `"ask"` AND the request is local, it now
returns `"allow"` with a reason string that accurately states the actual
data path — `"<provider> runs on your computer. Your prompt and response
are sent directly to your selected local AI runtime and are not sent to
Scholar's AI servers for generation."` — instead of throwing a
`GatewayDenied(reason, requiresConsent: true)` for the UI to turn into a
consent prompt. Every other branch of `decideForClass()` is untouched: a
restricted scope (`policy.restrictedScopes`) still denies unconditionally,
and the `egressClass === "restricted"` hard-deny still returns `"deny"`
regardless of `local` — being local is not a general exemption, only an
answer to the one question ("does this need cloud-transfer consent?") that
doesn't apply to it. `warden.test.ts` has a dedicated
`"Warden: tier-aware policy (local execution)"` suite asserting exactly
this: local + `user_content` → allow with the on-device reason text, local
+ restricted (both content-level and scope-level) → still deny, and a
non-local request from the same provider id is completely unaffected
(regression coverage for the "no leakage between local and non-local calls
to the same provider id" property).

Free/BYOK/Premium never set `local`, so `decideForClass()`'s behavior for
them is byte-for-byte what it was before this pass — the consent-ask,
remember-per-provider flow is unchanged.

**Local fallback vs. denial, re-verified.** `StudioPanel.tsx`'s Auto-mode
candidate loop still draws the line the same way it did in §7b: any
`refineLocally()` failure that is NOT a `GatewayDenied` (unreachable
runtime, no model loaded, a mid-generation error) falls through to the next
router-ranked candidate; a `GatewayDenied` — now only ever a hard `deny`
for local, since "ask" no longer applies — is re-thrown and stops the
request rather than being silently routed around. `desk/__tests__/
localStudioExecution.test.ts` adds direct coverage for the case
`StudioPanel`'s own UI doesn't have a control for yet (marking a scope
restricted): a restricted-scope local request throws the real
`GatewayDenied` with `requiresConsent: false`, before any call reaches the
local runtime's chat endpoint at all.

**"Why this AI?" now reports per-tier fields, not one summary line.**
`StudioPanel.tsx`'s expandable panel produces `Source` / `Runtime` (local)
or `Provider` (every other tier) / `Model` / `Processing` (local: "On your
computer — this passage was never sent to Scholar's servers.") or `Credits
used` (Premium only). No tier's panel claims a guarantee its actual
execution path doesn't provide, and no field ever renders a credential —
covered by `StudioPanel.test.tsx` assertions for both the local and
Premium cases.

## 8. AI Opportunity Agent

`server/src/aiEngine/opportunityAgent.ts`. Admin-triggered
(`POST /api/admin/ai/opportunities/research`), never autonomous — every
finding lands with `status='new'` and requires an explicit admin
approve/reject/ignore before it means anything.

Reuses two already-cost-controlled pieces rather than adding new ones:

- Search goes through the existing `supabase/functions/search-proxy` Edge
  Function, whose own header documents a MANDATORY rule: Tavily's
  basic/advanced search only, never its open-ended-cost Research endpoint.
  This module never holds a Tavily key.
- Synthesis uses the same raw Gemini `generateContent` call
  `server/routes/parse.ts` already makes for OCR, against the existing
  `GEMINI_API_KEY`.

The synthesis prompt enforces Section 17's safety rules directly: official
sources only, "unclear" over a guessed "allowed" for multi-user permission,
no invented dollar values or dates, and an explicitly correct empty result
when nothing genuine was found. 7 tests cover empty search results, a
correctly-empty model response, a well-formed finding, a malformed entry
missing a required field (filtered out, not stored), markdown-fenced model
output, unparseable model output (treated as zero findings, not an error),
and that no Tavily key is ever sent from this module.

## 9. Known gaps — stated plainly, not silently

Resolved by the live-wiring pass (§7a) and no longer gaps:
Omni Router now IS the live routing path for `POST /api/studio/refine`
(Auto mode is `StudioPanel`'s default); `AiSetupScreen`'s save/forget flow
now calls `POST /api/ai-access/connections` (with a live
`POST /api/ai-access/verify-provider-key` check before a newly-entered key
is allowed to appear connected) and `DELETE .../connections/:providerId`.

Resolved by the execution-and-privacy-consistency pass (§7b) and no longer
gaps: Local now executes for real, entirely client-side; Premium's provider
call now goes through the same Warden 428-consent-required/403-denied flow
Free/BYOK/manual requests use.

Resolved by the final-execution-hardening pass (§7c) and no longer a gap:
local's Warden consent prompt no longer asks the same way a cloud
provider's does — the policy is now tier-aware and answers the
cloud-transfer "ask" automatically for local requests, with the reason
shown to the user accurately describing the on-device data path. A
restricted scope or a hard `deny` still applies to local exactly as it does
to any other tier; this was an answer to one specific misleading question,
not a general local exemption.

Remaining gaps:

- **`DeskShell`'s deeper `Header` region** was wired with an "AI Access"
  entry (§1) but the mobile Pocket surface (`src/desk/pocket/`) was not
  touched — AI Access is a desktop-only entry point for now.
- **No payment/subscription integration.** Premium entitlement is
  admin-grantable only (`POST /api/admin/ai/entitlements/grant`) — there is
  no Stripe or billing-provider wiring, matching the AI Access brief's own
  scope (Section 13 describes admin actions, not a checkout flow).
- **Provider health monitoring is reactive only.** `recordProviderSuccess`/
  `recordProviderFailure` (`server/src/aiEngine/providerHealth.ts`) update
  `provider_health` from the outcome of real requests as they happen; there
  is still no scheduled/background health-check cron or worker probing
  providers independently of live traffic. This was a deliberate scope
  decision (Priority 8: "minimal only — no large monitoring system"), not
  an oversight.
- **Local execution has no `stream()` and no cancellation** — a deliberate
  non-goal of both the execution-and-privacy-consistency pass and the
  final-execution-hardening pass, not an oversight. Both local adapters
  implement only `complete()`; Studio's `refine()` (the only caller) never
  calls `gateway.stream()` for any tier, so a streaming parser would be
  untested, speculative code. Likewise, nothing in Studio today can cancel
  an in-flight request, local or otherwise; a 120s generation timeout
  bounds a hung local process, but there is no mid-flight abort button.
  Neither is a regression — no tier had either capability before either
  pass. Both remain real, legitimate future enhancements if Studio ever
  grows a streaming UI, but implementing them now, ahead of that need,
  would be speculative.

## 10. Database objects added

See `supabase/schema_ai_engine.sql` for the authoritative, commented
definition of every table, index, RLS policy, and function. Summary:
`ai_providers`, `ai_models`, `user_ai_connections`, `hardware_profiles`,
`admin_users`, `premium_plans`, `user_entitlements`, `user_quota_overrides`,
`credit_balances`, `credit_ledger`, `ai_usage_ledger`, `provider_health`,
`platform_budgets`, `platform_provider_credentials`, `ai_opportunities`,
`opportunity_reviews`, `admin_audit_log`, plus the `deduct_credits`/
`grant_credits` functions.

## 11. Environment variables

See `.env.example`'s "Scholar AI Engine" section. New: `MASTER_KEY`
(Premium-pool credential envelope encryption — distinct from the legacy,
unrelated `ENCRYPTION_KEY`). No new variable was needed for the Opportunity
Agent — it reuses `GEMINI_API_KEY` and the already-deployed `search-proxy`
function's own `TAVILY_API_KEY` secret.

## 12. Security properties verified, not merely asserted

- `requireAdmin` (`server/src/middleware/requireAdmin.ts`) checked live
  against every one of 24 admin routes: 401 with no session, 403 for a
  real authenticated non-admin, pass-through for a real admin (73 tests,
  `server/routes/__tests__/admin.authz.test.ts`).
  `server/routes/aiAccess.ts` scopes every query to the token-verified
  user id, never a client-supplied one (6 tests).
- **Who is an admin is itself now visible and manageable, not just
  enforced.** `admin_users` (`supabase/schema_ai_engine.sql`) is the sole
  authorization source of truth for `requireAdmin` — RLS with zero
  policies, unreachable by any client-held key, only the server's
  service-role key can touch it. Before this pass, the only way to see or
  change that roster was a raw SQL statement in the Supabase dashboard.
  `server/src/aiEngine/adminUsers.ts` (`listAdmins`/`grantAdmin`/
  `revokeAdmin`) and a new "Admins" tab in `AdminPanel.tsx` make it
  visible and editable — but only through the same `requireAdmin`-gated
  `/api/admin/ai/admins` routes as everything else, so granting admin
  status is itself an admin-only, audited action (`writeAuditLog`), never
  a new hole. An admin can never revoke their own access through this UI
  (`server/routes/admin.ts`'s `DELETE /admins/:userId` rejects
  `userId === actor(req)` with 400) — the only other way to edit
  `admin_users` is raw SQL, so a self-revoke risks a total lockout with no
  path back in; this rule exists to make that impossible, not to protect
  any individual admin. 9 tests (`server/routes/__tests__/
  admin.admins.test.ts`) cover the roster-profile join, a duplicate grant
  returning a clear 409 rather than a raw 500, and the self-revoke block.
- `deduct_credits`/`grant_credits`: `EXECUTE` confirmed restricted to
  `service_role` + `postgres` only, via a live query against
  `information_schema.routine_privileges` — not just written in the
  migration and assumed correct.
- Credential vault: round-trip encryption verified (plaintext never
  appears in the outbound wire payload; decrypts back to the original),
  and `listCredentials()`'s PostgREST `select=` parameter confirmed to
  request only metadata columns.
- Live wiring (§7a): a client-supplied `useEngine: "premium"` is never
  trusted as a grant — entitlement/quota/decision are always re-derived
  server-side, and a spoofed body claiming quota, entitlement, or an
  `aiSource` has no effect (pinned test). Credits are deducted exactly once
  per successful generation and never on a failed/rejected one, across
  every provider-fallback path. Cross-user isolation holds for the routing
  decision itself, not just data reads: one user's connections/entitlement
  never leak into another's `POST /api/ai-access/route` response, even
  when both have rows in the same tables. An undecryptable (present but
  corrupt) Premium credential fails closed — treated like "not configured,"
  never a crash or a charge.
- Execution-and-privacy-consistency pass (§7b): a local generation makes no
  call to Scholar's own API beyond the routing-decision preview (pinned
  test — `global.fetch` asserted never called with `/api/studio/refine`
  during local execution); neither local adapter sends any auth header, so
  there is no credential to leak because none is ever built. Premium's
  consent-required/denied paths deduct nothing (pinned for both, plus the
  pre-existing forced-Premium-without-entitlement and quota-bypass tests,
  unaffected by this change) and are never silently retried against a
  different Premium provider.

## 13. Admin plane: dedicated `/admin`, permission scopes, user management

Doc `49`'s target architecture describes a fully separate admin plane —
different deployment, different credentials, a signed one-way registry.
That is out of proportion for this product's actual operational scale (see
doc `49` §1's own "two people, not an SRE" framing) and remains future
work; what shipped here is the practical middle ground the product needed
now: a genuinely isolated *entry point* on the same deployment, plus real
per-admin permission scoping and the user-management capabilities doc `49`
§2's "User management" row calls for, which didn't exist in any form
before this pass.

**Isolation: `/admin` is its own page, not a button.** Before this pass,
`AiAccessPage.tsx` — reachable by every signed-in user, by design, since
it's each user's own AI-connection status view — conditionally rendered an
"Admin" button for whoever `checkIsAdmin()` said was an admin. That button
and its `AdminPanel` import are gone from that file entirely. The panel now
lives only behind `src/admin/AdminApp.tsx`, mounted at `/admin` by a
pathname check in `main.tsx` (the same lazy-pathname pattern Desk itself
used to live behind, per that file's own comment — no router library
added for one extra destination). Three consequences:

- No user-facing link anywhere in Desk points at `/admin` — reaching it
  requires typing the URL.
- Vite code-splits `AdminApp` into its own chunk (`AdminApp-*.js`, ~28KB);
  an ordinary user's bundle never downloads the admin panel's code at all.
- A non-admin who does land on `/admin` — signed out, or signed in but not
  in `admin_users` — sees a plain `404 — page not found.`, not an "access
  denied" that would confirm an admin system exists at that URL. `AdminApp`
  reuses the same browser Supabase session Desk uses (one client,
  localStorage-backed, same origin) — an admin already signed in elsewhere
  in the browser skips straight to the server's `/whoami` check; anyone
  else gets a plain username+password form, the same `signIn()` every
  Scholar account already uses (an admin's admin-ness is a property of
  their normal account, not a second credential).

As every admin surface's own comment already said before this pass: the
component being reachable proves nothing on its own — it's
`server/routes/admin.ts`'s checks that matter. That remains true; this
work makes the *client* isolation match it, since "any signed-in user can
open the container the admin button lives in" was never actually a hole,
but it was still worth closing so the admin surface isn't visible
scaffolding in a bundle every user downloads.

**Permission scopes, and a hardcoded root admin that can't be locked
out.** `admin_users` (schema in `schema_ai_engine.sql`) gained a `scopes
text[]` column — six named permissions (`manage_providers`,
`manage_premium`, `manage_budget`, `manage_opportunities`, `manage_users`,
`manage_admins`; the full list and what each unlocks lives in
`server/src/middleware/requireAdmin.ts`'s `SCOPES`/`SCOPE_LABELS`).
`requireAdmin` still answers "is this user an admin at all" (any row, any
scopes, including none — enough for the read-only dashboard/usage/audit
views); every mutating route additionally calls
`requireScopeInline(req, res, scope)`, which reads the `req.adminInfo` the
router-level `requireAdmin` already populated rather than re-querying. An
admin the main admin granted zero scopes to can see everything read-only
and change nothing.

`MAIN_ADMIN_EMAIL` (server env var, `.env.example`) names one account that
is never a row in `admin_users` at all — `isMainAdmin()` compares it
against the verified token's own email on every request and, on a match,
short-circuits to every scope without touching the database. This exists
for one reason: `admin_users` has no way to bootstrap or recover itself —
the `/admins` routes are the only non-SQL way to edit that table, and every
one of them requires `manage_admins` to already be held by someone. Without
an identity outside that table, the roster could be edited into a state
with zero admins and no path back in short of raw SQL. The main admin is
that identity — permanent by construction, not merely convention.

The self-lockout rule from the original admin-roster pass generalizes the
same way: an admin can revoke or re-scope anyone except themselves
(`DELETE /admins/:userId`, `PATCH /admins/:userId/scopes`, and the new
`PATCH /users/:userId/status` / `DELETE /users/:userId` all reject
`userId === actor(req)`), so no admin can accidentally strip their own
access with nothing left standing to reverse it.

**User management — search, suspend/restore, permanent deletion.**
`server/src/aiEngine/userAdmin.ts` is new. `searchUsers()` matches on
`profiles.username`/`full_name` (a direct `ilike` query) and, for an
email-shaped query, on email via GoTrue's admin user-list endpoint (paged
and filtered in memory — the Admin API doesn't expose a reliable
server-side email filter across Supabase versions, and this product's user
count doesn't need anything fancier yet), merging both by user id.

Suspend/restore (`setAccountStatus`) writes `profiles.account_status`
(the enum has existed since `schema.sql`, but nothing ever wrote it from
an admin action before this). This is now a REAL control, not merely a
UI toggle: `requireAuth` (`server/src/middleware/auth.ts`) checks
`account_status` on every authenticated request, not only the login
screen's own client-side check — a suspended account's still-valid
Supabase JWT previously reached every server route untouched, so "suspend"
was cosmetic against any client that skipped the login screen. The check
fails OPEN on a lookup error or a missing/malformed profile row (a
transient Supabase hiccup must not lock out every authenticated user in
the product, and the blast radius of that fail-open window is far smaller
than the alternative) — only an actual, present, non-`'active'` string
blocks a request.

`hardDeleteUser()` is irreversible by design and treated that way: the
client requires typing the account's current email before the button
enables, and the server independently re-verifies that exact email against
GoTrue's own record for that id (`getGoTrueUser`) before calling GoTrue's
admin delete endpoint — never trusting the client's cached copy of who a
user id belongs to. Deletion cascades through every table with
`on delete cascade references auth.users(id)`.

**Weekly credit window.** Alongside the existing daily/monthly windows,
`credit_balances` gained `weekly_used`/`weekly_reset_at`, and
`deduct_credits()` gained a `p_weekly_limit` parameter using the same
lazy-reset pattern (`date_trunc('week', now())`, ISO week/Monday start) as
the daily and monthly checks it sits between. `premium_plans` and
`user_quota_overrides` both gained `weekly_credits`; `getEffectiveQuota()`
resolves it the same override-then-plan-default way as every other quota
field. The Premium admin tab's quota-override form (previously nonexistent
in the UI at all — the `/quota-overrides` route existed server-side with
no client caller) now sets monthly/weekly/daily together, reached through
a real user search rather than a raw user-id paste field.

**Schema migration is written, not yet applied to production.** This
session has no Supabase service-role credential or direct database
connection — every table/column addition and the `deduct_credits`
replacement are appended to `supabase/schema_ai_engine.sql` under its own
"ADMIN ROSTER v2" heading, written idempotently (`add column if not
exists`, `create or replace function`) so it's safe to run once against a
database that already has the rest of this file applied. **Whoever has the
production Supabase SQL Editor needs to run the new block at the bottom of
that file, and set `MAIN_ADMIN_EMAIL` in Render's environment, before any
of this section's features work in production** — until then, the code
paths that touch the new columns/parameter will error (or, in
`isAccountBlocked`'s and `getAdminInfo`'s explicitly fail-open designs,
silently no-op) rather than corrupt anything.

**Tests.** `requireAdmin.test.ts` (+23: main-admin bypass never queries
`admin_users`, `isMainAdmin`/`isValidScope`/`getAdminInfo` directly,
`requireScope`/`requireScopeInline` pass/fail on every combination).
`auth.test.ts` (+7: suspended/restricted/deleted accounts 403, active and
restored accounts pass, missing-row and lookup-error fail open).
`userAdmin.test.ts` (new, 10: profile/email search matching and merging,
GoTrue-list failure doesn't lose profile matches, suspend/restore audit
actions, delete confirmation match/mismatch/lookup-failure). `admin.
admins.test.ts` (+7: scope validation on grant, scope editing, self-scope-
edit blocked). `admin.users.test.ts` (new, 9: search/suspend/restore/
delete business logic, self-action blocked for status and delete).
`admin.authz.test.ts` (+ new "scope boundary" `describe.each`: a real
admin with zero scopes gets 403 on every one of the 16 scope-gated routes
— the existing "any real admin passes" coverage used a full-scope admin
and would not have caught a missing `requireScopeInline` call).
`AdminApp.test.tsx` (new, 7: login/not-found/authorized routing, failed
and successful sign-in, sign-out). `quotaEngine.test.ts`/
`creditEngine.test.ts` extended for `weeklyCredits`/`weekly_limit_exceeded`.
