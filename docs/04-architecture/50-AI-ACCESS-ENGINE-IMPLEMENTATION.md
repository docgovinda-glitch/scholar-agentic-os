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

**Not yet wired into a live generation call.** This pass builds and tests
the router and exposes it via `POST /api/ai-access/route`, which computes
and returns a decision. It does not yet replace the existing manual
single-provider choice in `AiSetupScreen`/`src/desk/api.ts`'s
`refinePassage()` call path — that integration is real remaining work,
deliberately not done in this pass to avoid changing a live, working
generation path without dedicated end-to-end testing time. See §9.

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

- **Omni Router is not yet the live routing path.** `AiSetupScreen` still
  drives a single manually-chosen provider for actual generation calls. The
  router is built, tested, and reachable via API, but replacing the live
  path is separate follow-up work.
- **User-facing "Connect a provider" UI writes to `user_ai_connections`
  metadata is not yet triggered automatically from `AiSetupScreen`'s
  existing save flow** — `POST /api/ai-access/connections` exists and is
  tested, but nothing calls it yet when a user actually saves a BYOK key or
  confirms a local runtime in the existing setup screen. Until that call is
  added, the AI Access page's "connected providers" list will under-report
  what a user has actually configured.
- **`DeskShell`'s deeper `Header` region** was wired with an "AI Access"
  entry (§1) but the mobile Pocket surface (`src/desk/pocket/`) was not
  touched — AI Access is a desktop-only entry point for now.
- **No payment/subscription integration.** Premium entitlement is
  admin-grantable only (`POST /api/admin/ai/entitlements/grant`) — there is
  no Stripe or billing-provider wiring, matching the AI Access brief's own
  scope (Section 13 describes admin actions, not a checkout flow).
- **Provider health monitoring is passive.** `provider_health` is a real,
  RLS-protected table with public read access, but nothing yet populates it
  on a schedule — no health-check cron/worker was built in this pass.

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
