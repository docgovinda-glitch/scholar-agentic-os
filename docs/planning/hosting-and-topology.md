# Hosting, Cost, and Topology Plan

**Status: PENDING ARCHITECTURE DECISION — NOT APPROVED, NOT IMPLEMENTED.** Nothing in this document has been built. It replaces the "self-hosted Express + Postgres" assumption baked into the earlier production-readiness execution plan with a no-self-managed-server direction. See §5 for what that changes in the old plan, and §6 for a proposed (not decided) build order.

> **AMENDED (2026-07-22) — the "no backend server, ever" principle below is now "client-side by default, with one documented exception."** The project owner has accepted a thin, stateless fetch/search proxy as a deliberate, narrowly-scoped exception (agents, skills, AI calls, and drafting still all run client-side; users still bring their own keys; there is still no per-user server cost). The exact bright-line scope of that exception — what the proxy may and may never do — is recorded in `.claude/HANDOVER.md`'s "Standing Boundary Rule" section, not here; read that before touching anything server-side. This is a deliberate stopgap ("I may buy a shared server later... this eventually folds into real hosting, not a permanent architectural fork" — the project owner's own framing), not a reversal of the client-side-first direction. Every "no backend, ever" or "no self-managed server" statement below should be read with this amendment in mind; they're left in place as the historical record of the original constraint, not rewritten.

---

## 1. Hosting Model

**Constraint driving this**: no backend server to run or pay for, ever. A domain will be purchased; everything else must fit on free tiers.

- **Frontend**: static hosting — Vercel, Netlify, or Cloudflare Pages, all of which have workable free tiers for a static/SPA build, served on the purchased custom domain. `vite build` already produces a static `dist/` bundle; the frontend half of this repo (`src/App.tsx`, `src/components/`, `src/services/`) is not fundamentally incompatible with static hosting — it's the currently-required Express process (`server.ts`) that is.
- **No persistent server we run.** No Express process, no Render web service, no container to keep warm. `render.yaml` (which currently provisions exactly that) becomes dead configuration under this direction — see §5.
- **The one thing that still needs to live off the user's device** (per the topology in §2): account/profile/admin-config data. That goes to a free-tier Backend-as-a-Service, not our own server — see §3.

Static hosts (Vercel/Netlify/Cloudflare Pages) all support custom domains and free TLS on their free tiers as a baseline expectation; none of them require picking one over the others for that reason alone. The meaningful differentiator for this project is whether we end up needing *any* serverless/edge function (see §4's "leftover" bucket) — Cloudflare Pages Functions, Netlify Functions, and Vercel Functions all offer a free tier for that too, so this doesn't force the hosting choice either. Recommend picking whichever of the three the domain registrar/DNS setup makes most convenient; it's a low-stakes choice compared to the BaaS decision below.

---

## 2. Topology

Per the direction: **the entire application — UI, the 8 scholarly agents, the Skills Framework, and AI calls under all 5 Gateway tiers — runs client-side, in the user's browser, on the user's device.** Only account/profile data and admin-config (sponsored placements, tier-4 affiliate) live in the BaaS. There is no self-managed backend server in this topology.

This is a significant change from the currently-running app, which proxies most AI generation calls and all file-parsing through `server.ts`. §4 breaks down exactly what that means for the existing 2,933 lines.

---

## 3. Backend-as-a-Service: Supabase vs. Firebase

> **Superseded in part (2026-07-22)**: the password-reset details below (the `tempPasscodeHash`/`resetApproved` fields in the "Existing `users.json` shape" row, and the "admin-approval-by-email-link" framing in the Bottom line) describe the admin-approval-gated reset flow that was originally built. That flow has since been replaced by Supabase's built-in self-service `resetPasswordForEmail`/`updateUser` flow (no admin-approval step) — see `.claude/HANDOVER.md`'s Document Authority Order section and its "Password-reset switch" entry for the current design. The Supabase-vs-Firebase recommendation itself is unaffected; only this one piece of supporting detail is stale. Left in place, not rewritten, for history.

### Recommendation: **Supabase**

The deciding factor is how directly it maps onto what already exists, not a general "which BaaS is better" judgment — for a different project Firebase could easily be the right call.

| Factor | Supabase | Firebase |
|---|---|---|
| **Data model migration** | Supabase *is* hosted Postgres. `database_schema.sql`'s two tables (`admin_approvals`, `model_preferences`, including the `FOREIGN KEY`/`UNIQUE` constraints) can likely run close to verbatim against a Supabase project. | Firestore is a document store. The same two tables would need to be redesigned as collections/subcollections — not hard given how small and flat this schema already is, but it's a real redesign, not a lift-and-shift. |
| **Existing `users.json` shape** | Maps directly to rows in a `profiles`/`admin_approvals` table with the same columns (`username`, `fullName`, `email`, `phone`, `affiliation`, `authenticId`, `is_approved`, `activationKeyHash`, plus the runtime-only `tempPasscodeHash`/`resetApproved` fields used by the password-reset flow). | Maps to a `users` collection with the same fields as document properties — also fine, just a different mental model (no relational `UNIQUE(username, provider)` constraint equivalent without extra work). |
| **Auth approach** | Supabase Auth (email/password, magic link, OAuth) plus Postgres Row Level Security (RLS) can express the existing "signup → pending → admin clicks an emailed approval link → approved" gate as a boolean column checked by an RLS policy. The current hand-rolled PBKDF2 hashing (`src/utils/crypto.ts`) becomes unnecessary — Supabase Auth owns password storage. | Firebase Auth covers the same ground (email/password, OAuth) with broadly similar free-tier terms. The custom "admin must approve" gate would live as a Firestore field checked in security rules — functionally equivalent, just a different rules language (Firestore Security Rules vs. Postgres RLS/SQL). |
| **Admin-config storage (sponsored placements, tier-4 affiliate)** | One more Postgres table (`sponsored_placements`) — trivial addition, and Supabase's dashboard **Table Editor** is itself usable as a bare-bones non-coder admin UI for it with zero extra code (see `sponsored-placements.md` §3 for the fuller recommendation). | One more Firestore collection — same idea, though Firebase's console document editor is arguably less spreadsheet-friendly for a non-technical admin than Supabase's table view. |
| **"Thin glue" server needs** (sending the approval-email via Resend, and the CORS-proxy needs identified in §4) | Supabase Edge Functions (Deno-based) are available on the free tier and are the natural place for this. | Firebase Cloud Functions historically required upgrading to the pay-as-you-go **Blaze** plan to make outbound network calls (e.g., calling the Resend API) even at low volume — this is the sharpest practical difference between the two options. **Verify current Firebase pricing before ruling this out** — plan details change, and this constraint may have loosened; treat it as a strong signal, not a certainty, until checked against Firebase's current docs. |
| **Free-tier durability** | Supabase's free tier has historically auto-paused a project after a period (roughly a week) of no API activity, requiring a manual un-pause from the dashboard. For a low-traffic academic tool this is a real, recurring annoyance worth planning around (e.g., a scheduled low-frequency health-check ping to keep it warm, or just accepting the occasional manual un-pause). | Firebase's free ("Spark") tier doesn't have an equivalent project-pausing behavior, which is a genuine point in its favor for a low-traffic app. |

**Bottom line**: Supabase wins primarily on "the existing schema and the existing DEPLOYMENT_README.md narrative (Postgres + admin-approval-by-email-link) both translate almost directly," and secondarily on Edge Functions being usable on the free tier without a plan upgrade for the small amount of server-side glue this app will still need. The auto-pause behavior is the one real downside worth planning around, not a reason to switch. **Verify current free-tier terms for both providers before committing** — pricing/limits pages change, and the qualitative comparison above (relational vs. document model, RLS vs. security rules, Edge Functions vs. Cloud Functions plan requirements) is the durable part of this reasoning; exact quotas are not.

---

## 4. `server.ts` Breakdown (2,933 lines, current)

Reconciling the existing monolith against the new topology — every route, sorted into where its logic goes:

### Moves client-side (AI-calling logic) — ~1,400 lines
`/api/stream-generate`, `/api/generate`, and the eight phase-specific endpoints (`/api/generate/dissertation-grounding`, `data-discovery`, `journal-discovery`, `extract-requirements`, `draft-section`, `quality-control`, `submission-pack`, `citation-engine`). This is the bulk of the file. Under the new topology, these become direct browser→provider calls through the AI Gateway tiers (see `ai-gateway.md`), keyed by whichever tier the user has configured, instead of being proxied through our Express process.

**Real caveat, not a formality**: `src/services/aiGateway.ts` *already* calls some providers directly from the browser today (Ollama's `/api/chat` and `/api/tags`, and a Gemini health-check ping) — but it also currently proxies several providers' actual generation calls through our own `/api/generate`/`/api/stream-generate` (`fetch("/api/generate", ...)` appears at 7 separate call sites in `aiGateway.ts`). Direct-browser CORS support is not uniform across providers and needs verification per provider before this move is complete, not assumed:
- **Ollama / LM Studio (local)**: already proven working directly from the browser. CORS is governed by the *local* service's own config (Ollama needs `OLLAMA_ORIGINS` set to allow the hosted site's origin) — this is a setup-instruction detail for the AI Gateway doc's Tier 1/5, not a blocker.
- **Google Gemini**: browser-only usage (API key as a query param / header) is a commonly supported pattern for this API — reasonably confident this works direct-from-browser, but confirm against current docs.
- **Anthropic (Claude)**: historically requires an explicit `anthropic-dangerous-direct-browser-access` header to allow direct browser calls (Anthropic gates this deliberately, since it means the user's key is exposed client-side) — the header's name alone signals it's supported-but-discouraged-by-default; needs a live check.
- **OpenAI**: the least certain of the four. Historically the least permissive about direct browser CORS access to its API. **This needs an explicit, early feasibility check** — if it doesn't support it, a thin serverless/edge function proxy (not a persistent server — see the distinction drawn in §5) would be needed for OpenAI specifically, or OpenAI support would need to be dropped/deprioritized for the BYOK tiers.
- **OpenRouter**: explicitly positions itself as supporting client-side/browser usage as one of its intended use cases — reasonably confident this works without a proxy.

### Moves to the BaaS (auth/user/admin logic) — ~1,050 lines

> **Superseded in part (2026-07-22)**: this list still names `/api/request-password-reset`/`/api/approve-reset` and describes an "admin-approval-gate" reset design. That design was replaced by Supabase's self-service `resetPasswordForEmail` flow — see `.claude/HANDOVER.md`'s Document Authority Order section. The Edge Functions this section anticipated (`request-password-reset`, `approve-password-reset`) were built per this original plan but are now dead code pending removal, not the live path.

`/api/check-approval`, `/api/request-password-reset`, `/api/approve-reset`, `/api/register`, `/api/verify-and-sync-profile`, `/api/save-model-preferences`, `/api/save-api-keys`, `/api/approve`, `/api/request-profile-update`, `/api/approve-profile-update`, plus the supporting `users.json` read/write helpers and the inline `encryptServerKey`/`decryptServerKey` (AES-256-CBC) functions near the top of the file. This entire block is superseded by Supabase Auth + Postgres (§3) — the hand-rolled password hashing, activation-key emailing, and admin-approval-gate logic all have direct Supabase equivalents (Auth for the password/session part, an RLS-checked `is_approved` column plus an Edge Function to send the approval email via Resend for the rest).

**Express itself may not be needed at all** once this block and the AI-calling block both move — that's the user's own framing, and the numbers above bear it out: roughly (1,400 + 1,050) / 2,933 ≈ 84% of the file's routes fall into those two buckets.

### Left over — doesn't cleanly fit either bucket, ~450–500 lines
This is the part worth being honest about rather than waving away:

- **`/api/parse-file`** (DOCX/PDF/TXT/Markdown parsing + BibTeX/RIS import, ~165 lines of route logic plus the parser modules it calls into): the current implementation depends on Node-oriented libraries. Whether this can genuinely move client-side is a per-library question, not a given — `xlsx` (SheetJS) and `mammoth` both have browser-compatible builds and could plausibly run entirely client-side; the current PDF path uses `pdf-parse` (a Node-wrapper), which would need to be swapped for a browser-native library (e.g., Mozilla's `pdf.js`, which is what actually powers in-browser PDF viewing elsewhere on the web) rather than assumed to "just work" unmodified. This is real re-implementation work, not a relocation.
- **`/api/parse-external-link`** (~55 lines): fetches an arbitrary user-supplied URL server-side and extracts text. This **cannot** move client-side as-is — arbitrary third-party websites do not, in general, send CORS headers permitting a browser page on our domain to fetch their content directly. This specifically needs *some* server-side hop, but it can be a tiny, stateless serverless/edge function (see the distinction below), not a persistent process.
- **`/api/lookup-doi`** (~60 lines, calls the public CrossRef API): plausibly CORS-permissive for direct browser GETs (many citation tools call CrossRef client-side), but not confirmed here — verify before assuming it moves client-side for free. **Resolved (2026-07-22)**: confirmed via a real empirical browser test — Crossref is directly callable, no proxy needed. See `target-workflow.md` §5.
- **`/api/agents` + `/api/agents/execute`** (~35 lines, the newly-wired `AgentRegistry`/`AgentExecutor`/Skills Framework): this is pure in-memory JS/TS logic with no Node-only dependency — it should move client-side cleanly and is explicitly what the topology in §2 calls for. This is also why the in-progress agent-skill-wiring work (see `.claude/HANDOVER.md`) is paused: the `createAgentContext()` function it extends currently lives in `server.ts` and will need to be re-homed into client-side code once this direction is confirmed.

**The important distinction for the leftover bucket**: "needs a server-side hop for CORS reasons" is not the same as "needs the backend server we said we don't want." A single stateless serverless/edge function (Vercel Functions, Netlify Functions, or Cloudflare Pages Functions — whichever platform hosts the static site) that does nothing but proxy a URL fetch or a DOI lookup, invoked on-demand with no persistent process and no state, is a different thing architecturally from the current 2,933-line always-running Express server, and fits the "no backend server to run or pay for" constraint as stated. This plan does not currently assume such a function is needed for parse-file/DOI-lookup (those may turn out to have client-side or CORS-permissive paths) — but `/api/parse-external-link` almost certainly does need one, and that should be scoped honestly rather than assumed away.

> **ACCEPTED (2026-07-22): this is no longer a hypothetical.** `docs/planning/target-workflow.md` §5/§7 empirically confirmed exactly this pattern is needed for two more cases beyond `/api/parse-external-link`: the arXiv API (confirmed CORS-blocked) and generic authoritative-web-search + full-text page fetching (all four generic search APIs tested need a proxy; government/NGO pages themselves need one too, for the same reason `/api/parse-external-link` does). The project owner has accepted one shared stateless fetch/search proxy as the single documented exception to client-side-only, covering all of these cases together rather than one bespoke function per source. Its exact bright-line scope (fetch-and-return only; never storage, auth, or session state) is recorded in `.claude/HANDOVER.md`'s Standing Boundary Rule — that's the authoritative scope definition, not this paragraph. Note this proxy's accepted scope is fetch/search only — whether OpenAI's provider traffic (the still-unresolved CORS question below in this same §4, and in `ai-gateway.md`) ever gets routed through this same proxy is a separate, not-yet-made decision, not an automatic inclusion.

---

## 5. Native App Path (Not Building Now)

Scope for this pass is web-only (responsive, mobile-browser-functional), but the architecture should not foreclose wrapping into iOS/Android/desktop later via something like Capacitor (mobile) or Tauri (desktop) without a rewrite. What today's direction helps or hurts:

- **Helps**: an entirely client-side app with no dependency on our own server is *exactly* the shape Capacitor/Tauri want — both work by wrapping a web build in a native shell and expect the app's logic to already be self-contained in the frontend. Moving AI calls and agent execution client-side now is directly the right prerequisite for that later step, not wasted work.
- **Helps**: BaaS auth (Supabase Auth) has official client SDKs usable from a Capacitor/Tauri-wrapped app the same way as from a browser — no rework needed there either.
- **Hinders / needs attention later, not now**: local-router tiers (1 and 5) assume a browser calling `localhost` — inside a Capacitor/Tauri shell this changes shape slightly (native apps have different networking permission models per platform), but this is a "revisit when wrapping" detail, not something to design around today.
- **Hinders / needs attention later, not now**: any serverless/edge function built for the CORS-proxy leftover bucket (§4) will need a stable public URL reachable from a native shell too — trivial in practice (it's just an HTTPS endpoint), flagged only so it isn't forgotten.

No action needed in this pass beyond keeping these two "helps" properties true as the rest of this plan gets built.

---

## 6. Cross-Reference: Existing Production-Readiness Plan

The original plan assumed a self-hosted Express + PostgreSQL server (`ARCH-1`/`ARCH-2` were framed as "wire the already-built `server/data`/`server/routes` tree in, since it's better architecture"). **That assumption is superseded.** The direction is now no self-managed server at all — Supabase (or a chosen equivalent) replaces both the dead `server/` tree and the live inline logic in `server.ts`. Going through the full original backlog:

| ID | Original framing | Status under this plan | Reasoning |
|---|---|---|---|
| **ARCH-1** | Resolve the dual-backend split (wire `server/data`/`routes`/`services` in) | **MOOT** | There's no backend to consolidate into — both the dead tree and the live `server.ts` logic are being replaced by the BaaS + client-side topology, not reconciled with each other. |
| **ARCH-2** | Replace ephemeral `users.json` with durable storage | **RE-SCOPED, still the right concern** | The underlying problem (durable user storage) is still real and still needs solving — just via Supabase Postgres instead of wiring up `server/data/db.ts`. Same problem, different solution. |
| ARCH-3 | Decide fate of the kernel/orchestrator layer | **STILL APPLIES, independent of this plan** | Orthogonal to hosting — this is about whether `src/knowledge`/`writing`/`publication`/`workspace`/`collaboration`/`orchestrator` get wired in or archived, which doesn't change based on where the server lives. Still open, still blocking §3's agent-roster question. |
| ARCH-4 | Reconcile the two phase/workflow models | **STILL APPLIES** | Unrelated to hosting. |
| ARCH-5 | Close out ADR-001 (dual CDM model) | **STILL APPLIES** | Unrelated to hosting. |
| ARCH-6 | Decompose monolithic `server.ts`/`App.tsx` | **MOOT for `server.ts`, STILL APPLIES for `App.tsx`** | `server.ts` is being dismantled, not decomposed — there's nothing to refactor once its logic is redistributed per §4. `App.tsx`'s 1,734-line size is a separate, still-real concern. |
| ARCH-7 | Remove AI-Studio scaffold leftovers | **STILL APPLIES** | Unrelated to hosting. |
| **SEC-1** | Add request schema validation | **RE-SCOPED** | Still needed, but the target shifts from `server.ts`'s `req.body` handling to whatever serverless/edge functions remain (§4's leftover bucket) plus Supabase RLS policies as the primary access-control layer. |
| **SEC-2** | Add CORS policy + helmet | **MOOT** | These are Express-specific hardening measures for a persistent server process we're no longer running. |
| **SEC-3** | Consolidate duplicate encryption, remove hardcoded fallback key | **MOOT** | Both the `server.ts` inline implementation and the dead `server/utils/apiKeyCrypto.ts` go away with `server.ts`'s auth logic. Supabase Auth owns credential storage instead; any client-side API-key encryption (for BYOK keys, if they need to sync via the BaaS) should reuse the already-built `src/utils/crypto.ts` AES-GCM/PBKDF2 functions, not a server-side scheme. |
| SEC-4 | Remediate `xlsx` high-severity CVE | **STILL APPLIES, arguably higher priority now** | If Excel parsing moves client-side (§4), a vulnerable parsing library now runs in every user's browser on every upload rather than in one controlled server process — same fix, larger blast radius if left unaddressed. |
| SEC-5 | Close rate-limiting gaps | **RE-SCOPED** | Express-level rate limiting is moot; the equivalent concern becomes Supabase's own rate limiting/RLS on auth endpoints (largely inherited for free) plus, if it exists, whatever serverless function handles the CORS-proxy leftover bucket. |
| SEC-6 | Add structured audit logging | **RE-SCOPED** | Moves to whatever logging Supabase provides for Auth/DB events, plus edge-function logs — not an Express concern anymore. |
| SEC-7 | Add `.dockerignore` | **MOOT** | No Docker image to build without a server to containerize. |
| **DEPLOY-1** | Stand up CI (`tsc`/`vitest`/`build`) | **STILL APPLIES, unchanged** | Nothing about this depends on hosting model — still valuable, still missing. |
| **DEPLOY-2** | Harden the `Dockerfile` | **MOOT** | No server process to containerize. |
| **DEPLOY-3** | Align `render.yaml`/`DEPLOYMENT_README.md` with reality | **MOOT, replace instead of align** | Both documents describe a Render+Postgres deployment that no longer exists in this direction; they should be replaced with static-host + Supabase deployment docs, not corrected in place. |
| **DEPLOY-4** | Validate required env vars at startup | **RE-SCOPED** | "Startup" no longer means an Express process booting — becomes a client-side check (e.g., a clear in-app message when a required Supabase/AI-provider config is missing) rather than a server-side fail-fast. |
| **DEPLOY-5** | Deepen `/api/health` | **MOOT** | No server process to health-check; Supabase/the static host both have their own status pages. |
| QUAL-1 – QUAL-4 | Strict TS mode, ESLint, logging cleanup, TODO triage | **STILL APPLY, unchanged** | Independent of hosting model. |
| TEST-1 – TEST-5 | Test-coverage gaps, CI coverage gate | **STILL APPLY, largely unchanged; TEST-2 re-scoped** | TEST-2 ("integration tests for `server.ts`'s HTTP surface") re-scopes to testing the client-side AI-gateway/agent code paths and whatever serverless functions remain, instead of Express routes. The rest (component tests, coverage gate) are unaffected. |
| PERF-1 | Code-splitting | **STILL APPLIES, more important now** | An entirely-client-side app with AI-calling logic bundled in makes initial bundle size more consequential, not less. |
| PERF-2 | JSON-file storage bottleneck | **MOOT** | No JSON file once Supabase owns storage. |
| PERF-3 | Verify AI response caching | **STILL APPLIES, re-scoped** | Now a client-side caching question (e.g., browser storage) rather than server-side. |
| UX-1 – UX-3 | Accessibility, phase-naming, loading states | **STILL APPLY, unchanged** | Independent of hosting model. |
| DX-1 | Fix agents-connectivity doc error | **STILL APPLIES, unchanged** (and largely already corrected in later commits) | Independent of hosting model. |
| DX-2 – DX-5 | Logging library, `generate:knowledge` scripts, `.gitignore` cruft, circular-dep checks | **STILL APPLY, unchanged** | Independent of hosting model. |

**Plainly stated**: the original plan's Critical-priority items (`ARCH-1`, `ARCH-2`, `SEC-1`, `SEC-2`, `SEC-3`, `DEPLOY-1` through `DEPLOY-5`) were almost entirely about hardening a self-hosted Express + Postgres server that this direction removes. Roughly half of the original Critical/High backlog is now moot outright; the real, still-live concerns underneath them (durable storage, input validation, CI) get re-solved through Supabase/static-hosting mechanisms instead of Express hardening. The parts of the old plan that had nothing to do with hosting (kernel/orchestrator decision, phase-model reconciliation, type safety, test coverage, accessibility) are entirely unaffected and remain exactly as prioritized.

---

## 7. Proposed Build Sequence (Recommendation Only — Not Decided)

Full implementation of everything in this document, `ai-gateway.md`, and `sponsored-placements.md` is a lot of surface area to take on at once. Proposed phasing, for discussion:

1. **Foundation first**: static hosting + Supabase migration (§3, §4's "moves to BaaS" bucket). Nothing else in this plan works without this — the AI Gateway tiers need somewhere for BYOK keys to optionally sync from, and sponsored placements need the admin-config store to exist. Also the point where the early **CORS feasibility spike** (§4: does OpenAI, specifically, actually allow direct-browser calls?) should happen — it's cheap to check and materially changes how confidently the next phase can be scoped.
2. **AI Gateway Tiers 2 and 3** (free-tier BYOK, heavy BYOK): lowest technical risk of the five tiers — both are "user already has or gets their own key, we just call the provider directly," reusing most of the existing `aiGateway.ts` provider-adapter code with the `/api/generate` proxy calls replaced by direct calls per §4's per-provider findings.
3. **Sponsored placements**: the reusable slot component + the single admin-config table, built once the BaaS from Phase 1 exists to store it in. Independent of the AI Gateway tiers, so this could also run in parallel with Phase 2 rather than strictly after it.
4. **AI Gateway Tiers 1, 4, and 5** (local router manual install, affiliate signup, heavy local compute): highest complexity and/or highest dependency on things outside this codebase's control — Tier 1 requires writing non-trivial user-facing setup documentation for a manual local install, Tier 4 depends on actual affiliate-program business/legal setup happening (explicitly out of scope per the direction, but the placement mechanism from Phase 3 is a prerequisite), and Tier 5 carries the most technical uncertainty (WebGPU/WASM maturity, hardware gating). Sequencing these last isn't about them being unimportant — it's that they're the most likely to need revision once real usage data exists from Phases 1–3.

This is a recommendation to discuss, not a commitment — no implementation has started on any phase.
