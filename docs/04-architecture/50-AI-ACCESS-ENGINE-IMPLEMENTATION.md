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

**Local** is a real, valid tier the router can rank and recommend, but
Studio's `refine()` pipeline has no local-runtime execution path (only
cloud adapters) — a known, stated gap, not a silent failure. When Auto
mode's choice or every fallback is `local`, the client shows a clear
message ("Studio doesn't support local execution yet — connect a cloud,
BYOK, or Premium AI source") instead of sending a request the server
cannot resolve.

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

**Known, accepted gap in this wiring:** the Premium path's provider call
does not go through the same 428-consent-required retry flow the
Free/BYOK/manual path does (`GatewayDenied`/`StudioConsentRequiredError`).
If a Warden consent check denies a Premium provider call, `runPremiumRefine`
currently treats it as a generic provider failure (tries the next Premium
fallback, then a 502) rather than surfacing a resumable consent prompt.
Scholar's own Premium-pool credentials are operator-owned, not a user's,
so this has not yet caused an observed problem, but it is a real
inconsistency with the Free/BYOK path's UX and is flagged here rather than
silently left for someone to discover.

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

Remaining gaps:

- **Local has no execution path in Studio.** The Omni Router can rank and
  recommend a local runner like any other tier, but `refine()`'s pipeline
  only calls cloud adapters. `StudioPanel` skips a local choice/fallback
  and tells the user to connect a cloud/BYOK/Premium source instead of
  sending a request the server can't resolve. See §7a.
- **Premium's provider call bypasses the Warden consent-retry flow** that
  Free/BYOK/manual requests use — see §7a's "known, accepted gap" note.
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
  against every one of 18 admin routes: 401 with no session, 403 for a
  real authenticated non-admin, pass-through for a real admin (58 tests,
  `server/routes/__tests__/admin.authz.test.ts`).
  `server/routes/aiAccess.ts` scopes every query to the token-verified
  user id, never a client-supplied one (6 tests).
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
