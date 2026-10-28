# Phase 2 — Production Health & Security Audit (`AUDIT.md`)

**Repository**: `https://github.com/docgovinda-glitch/scholar-agentic-os.git`  
**Audit Date**: 2026-10-28  
**Baseline Commit (`main`)**: `bb6d482` (`main`) + Hotfix PR [#71](https://github.com/docgovinda-glitch/scholar-agentic-os/pull/71) (`d7d0746` on `hotfix/containment-authz-memory-ssrf`)  
**Mode**: Read-only inspection + programmatic Express router extraction + static SQL/git-history analysis. No production Supabase connections were made.

---

## Executive Summary of Findings

| ID | Severity | Category | Title | Who Can Exploit | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | **BLOCKER** | 6. Git History Secrets | **7 live production secrets committed in git history** (`28cfaa5:INFRASTRUCTURE_REFERENCE.md`, `01f851f:scripts/setup-infrastructure.md`): Postgres password (`DATABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `Cloudflare API Key`, `GitHub PAT`, `RENDER_DEPLOY_KEY`, `ENCRYPTION_KEY` | Anonymous (public repo clone) | **S** (Rotate) / **M** (History scrub) | **Open — Rotate Immediately** |
| **F-02** | **BLOCKER** | 2. Supabase Exposure | **3 tables missing `ENABLE ROW LEVEL SECURITY` (`project_research_gaps`, `project_titles`, `project_journal_candidates`)** — full read/write/delete via public `VITE_SUPABASE_ANON_KEY` | Anonymous | **S** | **Open** |
| **F-03** | **BLOCKER** | 2. Supabase Exposure | **`project-files` Storage bucket policies allow anonymous full read/write/update/delete** (`USING (bucket_id = 'project-files')` with no `auth.uid()` or project ownership check) | Anonymous | **S** | **Open** |
| **F-04** | **BLOCKER** | 3. Auth / Edge Functions | **`request-profile-update` Edge Function returns `verificationKey` in HTTP response when `RESEND_API_KEY` is unset or email delivery fails**, enabling account email takeover | Authenticated user | **S** | **Open** |
| **F-05** | **BLOCKER** | 1. Route Inventory / OOM | **Unauthenticated heavy file parsing (`POST /api/vault/parse-file`) + 50 MB upload limits can OOM-kill the 512 MB Render container** (502 MiB peak RSS observed on single 25 MB PDF) | Anonymous | **M** | **Mitigated in PR #71** |
| **F-06** | **BLOCKER** | 1. Route Inventory / IDOR | **Service-role project routes missing project ownership checks** (`assignment/*`, `agentic/*`, `files`, `activity`, `parse-file`, `editor/*`, `critiques/:id/waive`) | Authenticated user | **M** | **Mitigated in PR #71** |
| **F-07** | **BLOCKER** | 2. Supabase Exposure | **Hardcoded production Supabase URL & anon key fallbacks** (`src/config/env.ts`, `server/src/supabaseRest.ts`, `server/routes/supabaseProxy.ts`, `.github/workflows/deploy.yml`) | Operator / CI / Dev misconfig | **S** | **Open (Scheduled Phase 3)** |
| **F-08** | **HIGH** | 1. Route Inventory / Auth | **`POST /api/ai/search`, `POST /api/ai/deep-research`, and `POST /api/ai/agent` lack `requireAuth`**, and `/api/ai/agent` signs `llmChallenge` tokens using unverified `req.headers["x-user-id"]` | Anonymous / Any user | **S** | **Open** |
| **F-09** | **HIGH** | 7. Reliability / Rate Limit | **`rateLimit.ts` keys buckets by `${ip}:${User-Agent}` and `server.ts` lacks `app.set("trust proxy", 1)`**, allowing trivial rate-limit bypass & memory growth by rotating `User-Agent` | Anonymous | **S** | **Open** |
| **F-10** | **HIGH** | 2. Supabase Exposure | **`/api/supabase/*` reverse proxy mounted before rate limiter & body parser, forwards all subpaths, and disables TLS verification (`rejectUnauthorized: false`) on WebSocket upgrades** | Anonymous / Network MITM | **S** | **Open** |
| **F-11** | **HIGH** | 4. Data Claims vs. Reality | **Plaintext credentials stored in `api_credentials.encrypted_api_key` and `user_cloud_integrations` (`access_token`/`refresh_token`), plus browser BYOK key + secret co-located in `localStorage`** | DB / XSS attacker | **M** | **Open** |
| **F-12** | **HIGH** | 5. Dependencies | **52 npm audit vulnerabilities (1 Critical, 14 High)** including `proxy-addr` (Critical IP spoofing), `xlsx` (High Prototype Pollution + ReDoS on server upload path, no upstream fix), `multer` (6 CVEs), `@tiptap/core` & `prosemirror-view` (DOM XSS) | Anonymous / Authenticated user | **M** | **Open** |
| **F-13** | **HIGH** | 3. Auth | **`LLM_CHALLENGE_SECRET` falls back to `SUPABASE_SERVICE_ROLE_KEY` and then a hardcoded static string** (`server/utils/llm.ts:31-35`); `verifyLocalJwt` (`auth.ts:101`) skips `role`/`aud` verification | Authenticated user | **S** | **Open** |
| **F-14** | **HIGH** | 2. Supabase Exposure | **6 `SECURITY DEFINER` RPCs granted to `anon` (`email_for_username`, `email_for_phone_e164`, `email_for_identifier`, `check_*_available`) allow unauthenticated email/phone/username enumeration** | Anonymous | **S** | **Open** |
| **F-15** | **MEDIUM** | 3. Auth / Config Drift | **Admin email configuration split across 3 mechanisms**: `MAIN_ADMIN_EMAIL` (`requireAdmin.ts`, `render.yaml`), `ADMIN_EMAIL` (`.env.example`), and hardcoded `'docgovinda@gmail.com'` in SQL RLS policies | Admin / Operator | **S** | **Open** |
| **F-16** | **MEDIUM** | 1. Route Inventory | **Double-prefixed route mount bug**: `GET /api/projects/:id/compliance/api/projects/:id/journal-compliance-report` (`journal_compliance.ts:15` mounted at `/:id/compliance` in `project.ts:121`) | Any user (broken feature) | **S** | **Open** |
| **F-17** | **MEDIUM** | 7. Reliability | **18 outbound `fetch()` calls lack `AbortSignal.timeout()`**, no `SIGTERM`/`unhandledRejection` handlers, SSE stream lacks `req.on("close")` abort, and `memoryDecks` Map is unbounded | Any user / Upstream hang | **M** | **Open** |
| **F-18** | **MEDIUM** | 8. Hosting Fit | **Render Free (512 MB RAM, 15m spin-down) + Supabase Free (500 MB DB, 1 GB Storage, 7d pause, 0 backups)** leaves <20 MB headroom on heavy exports/parses and has no automated DB backup | Production workload | **S** | **Decision Needed** |
| **F-19** | **MEDIUM** | 9. Test Hygiene | **Vitest loads local `.env` during test runs (`dotenv.config()`)**, causing unmocked tests to make live network requests; `USE_REAL_STORE_IN_TESTS=1` and route authz matrix are not in CI | Developer / CI | **S** | **Open** |

---

## 1. Programmatic Route Inventory

Generated programmatically by importing `app` from [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts) and traversing `app._router.stack` (`267` total route registrations across all sub-routers).

### 1.1 Summary by Route Family (Post-PR #71 State)

| Mount Prefix / Router | File | Route Count | Auth Middleware | Ownership Check | Body / Upload Limit | Rate Limit | Audit Verdict |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `ALL /api/supabase/*` | [supabaseProxy.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/supabaseProxy.ts#L49-L121) | 1 (wildcard) | Passed to upstream Supabase | Upstream RLS (where enabled) | **Unbounded stream (`req.pipe`)** | **NONE** (mounted before `/api` limiter) | **FLAGGED (`F-10`)** |
| `GET /api/health` | [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L96-L98) | 1 | Public (`none`) | N/A | `10mb` JSON | `generalApiLimiter` (120/min) | Public healthcheck (shallow — `F-17`) |
| `POST /api/auth/verify-signup` | [auth.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/auth.ts#L22-L42) | 1 | Public (`none` — Turnstile verify) | N/A | `100kb` (`express.json()`) | `authEndpointLimiter` (20/15m) | Public signup CAPTCHA check |
| `/api/admin/ai/*` | [admin.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/admin.ts#L64-L66) | 41 | `requireAuth` + `requireAdmin` (+ `requireScopeInline` on mutations) | Admin scope check (`SCOPES`) | `10mb` JSON | `generalApiLimiter` (120/min) | OK |
| `GET /api/ai/status` | [ai.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/ai.ts#L145-L198) | 1 | **NONE** | Reads caller headers | `10mb` JSON | `aiGenerationLimiter` (30/min) | Public status probe |
| `POST /api/ai/search` | [ai.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/ai.ts#L204-L219) | 1 | **NONE (Missing `requireAuth`)** | **NONE** | `10mb` JSON | `aiGenerationLimiter` (30/min) | **FLAGGED (`F-08`)** |
| `POST /api/ai/deep-research` | [ai.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/ai.ts#L225-L290) | 1 | **NONE (Missing `requireAuth`)** | **NONE** | `10mb` JSON | `aiGenerationLimiter` (30/min) | **FLAGGED (`F-08`)** |
| `POST /api/ai/agent` | [ai.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/ai.ts#L297-L760) | 1 | **NONE (Missing `requireAuth`)** | Trusts `req.headers["x-user-id"]` for challenge signing | `10mb` JSON | `aiGenerationLimiter` (30/min) | **FLAGGED (`F-08`)** |
| `/api/studio/*` | [studio.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/studio.ts#L309-L492) | 5 | `requireAuth` (`server.ts:111`) | Session-scoped (`req.user.id`) | `10mb` JSON | `aiGenerationLimiter` + `studioLimit` (30/min) | OK |
| `/api/projects/:id/claims/*` | [claims.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/claims.ts#L33-L132) | 6 | `requireAuth` | `loadOwnedProject` | `10mb` JSON | `projectLimit` (120/min) | OK |
| `/api/projects/:id/evidence(-ledger)/*` | [evidence.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/evidence.ts#L43-L273) | 16 (8×2) | `requireAuth` | `loadOwnedProject` | `10mb` JSON | `projectLimit` (120/min) | OK |
| `/api/projects/:id/activity` | [activity.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/activity.ts#L10-L38) | 1 | `requireAuth` | `loadOwnedProject` (added in PR #71) | `10mb` JSON | `generalApiLimiter` (120/min) | Fixed in PR #71 |
| `/api/projects/:id/files` | [files.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/files.ts#L15-L120) | 2 | `requireAuth` | `loadOwnedProject` (added in PR #71) | `MAX_UPLOAD_MB` (10 MB) | `generalApiLimiter` (120/min) | Fixed in PR #71 |
| `/api/projects/:id/agent(ic)/*` | [agentic/index.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/agentic/index.ts) | 66 (33×2) | `requireAuth` | `getProjectSafe` checks `ownerId === callerId` (added in PR #71) | `10 MB` + `heavyParseConcurrencyGuard` on `/upload-user-data` | `aiGenerationLimiter` (30/min) | Fixed in PR #71 |
| `/api/projects/:id/assignment/*` | [assignment/index.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/assignment/index.ts) | 19 | `requireAuth` | `getProjectSafe` checks `ownerId === callerId` (added in PR #71) | `10 MB` + `heavyParseConcurrencyGuard` on `/parse-brief` | `aiGenerationLimiter` (30/min) | Fixed in PR #71 |
| `/api/projects/:id/thesis/*` | [thesis.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/thesis.ts#L208-L637) | 4 | `requireAuth` | `loadOwnedProject` | `10mb` JSON | `generalApiLimiter` (120/min) | OK |
| `/api/projects/:id/proposal/*` | [proposal.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/proposal.ts#L192-L517) | 3 | `requireAuth` | `loadOwnedProject` | `10mb` JSON | `generalApiLimiter` (120/min) | OK |
| `/api/projects/:id/presentation/*` | [presentation.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/presentation.ts#L314-L767) | 4 | `requireAuth` | `loadOwnedProject` | `10mb` JSON | `generalApiLimiter` (120/min) | OK |
| `/api/projects/:id/parse-file/*` | [parse.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/parse.ts#L21-L260) | 3 | `requireAuth` | `loadOwnedProject` (added in PR #71) | `10 MB` + `heavyParseConcurrencyGuard` + `safeFetchHtml` | `generalApiLimiter` (120/min) | Fixed in PR #71 |
| `/api/projects/:id/compliance/*` | [journal_compliance.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/journal_compliance.ts#L15) | 1 | `requireAuth` | `loadOwnedProject` | `10mb` JSON | `projectLimit` (120/min) | **Broken path (`F-16`)** |
| `/api/projects/:id/mesh/*` | [mesh.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/mesh.ts#L66-L137) | 2 | `requireAuth` | `loadOwnedProject` | `10mb` JSON | `generalApiLimiter` (120/min) | OK |
| `/api/projects` & `/api/projects/:id/*` (core, manuscript, gates, export, submissions) | [project.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project.ts#L124-L734), [manuscriptAndGateRoutes.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/core/manuscriptAndGateRoutes.ts#L76-L880), [submissions.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/submissions.ts#L13-L75) | 49 | `requireAuth` (`app.use("/api/studio", requireAuth)` in `server.ts:111` only covers `/api/studio`; `app.use("/api/projects", router)` covers `/api/projects*`; `/api/atlas/*` and `/api/user/saved-authors` also covered) | `loadOwnedProject` / `currentUserId(req)` | `10mb` JSON | `projectLimit` (120/min) | Wait: see `/api/atlas/*` note below! |
| `GET /api/atlas/output-types(:id)` | [project.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project.ts#L328-L347) | 2 | Public catalog metadata (`none`) | N/A (read-only static catalog) | `10mb` JSON | `projectLimit` (120/min) | Public catalog |
| `/api/user/saved-authors*` | [project.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project.ts#L473-L515) | 3 | `requireAuth` (added in PR #71) | `user_id=eq.${currentUserId(req)}` | `10mb` JSON | `projectLimit` (120/min) | Fixed in PR #71 |
| `POST /api/drafting/section` | [drafting.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/drafting.ts#L15-L95) | 1 | `requireAuth` | Caller-supplied prompt (`req.user.id`) | `10mb` JSON | `aiGenerationLimiter` (30/min) | OK |
| `/api/ai-access/*` | [aiAccess.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/aiAccess.ts#L28-L250) | 10 | `requireAuth` | `userId(req)` (`req.user.id`) | `10mb` JSON | `generalApiLimiter` (120/min) | OK |
| `/api/search/*` & `/api/discovery/*` | [search.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/search.ts#L18-L215) | 8 (4×2) | `requireAuth` (added in PR #71) | Filtered by caller / public scholarly APIs | `10mb` JSON | `generalApiLimiter` (120/min) | Fixed in PR #71 (note: `GET /api/search?q=` still queries `project_claims` via service role without owner filter — see `F-08b`) |
| `/api/vault/*` & `POST /api/lookup-doi` | [vault.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/vault.ts#L25-L965), [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L139) | 10 | `requireAuth` (added in PR #71) | `req.user.id` | `10 MB` + `heavyParseConcurrencyGuard` + `safeFetchHtml` | `generalApiLimiter` (120/min) | Fixed in PR #71 |
| `/api/presentations/*` | [presentations.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/presentations.ts#L26-L520) | 7 | `requireAuth` | `getOwnedDeckOr404` (`user_id === req.user.id`) | `10 MB` + `heavyParseConcurrencyGuard` on `/parse-document` | `generalApiLimiter` (120/min) | Fixed in PR #71 |

### 1.2 Findings from Route Inventory

#### `F-08` (HIGH): Unauthenticated AI Search, Deep Research, and Agent Endpoints + Challenge Token Spoofing
- **Evidence**:
  - [server/routes/ai.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/ai.ts#L204-L322): `POST /api/ai/search`, `POST /api/ai/deep-research`, and `POST /api/ai/agent` are registered on a router mounted at `app.use("/api/ai", router)` without `requireAuth`.
  - In [server/routes/ai.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/ai.ts#L314):
    ```ts
    const userId = (req as any)?.user?.id || (req.headers && req.headers["x-user-id"]) || "anonymous";
    ```
    `makeChallengeToken` signs `userId` into an HMAC challenge token (`signLlmChallenge`) using `req.headers["x-user-id"]`.
  - Additionally, in [server/routes/search.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/search.ts#L35-L45), `GET /api/search?q=...` (now behind `requireAuth` in PR #71) queries `project_claims` using the service-role key (`content=ilike.*${encodeURIComponent(query)}*&limit=10`) without filtering `project_id` to projects owned by `req.user.id`.
- **Who can exploit**: Anonymous users (`POST /api/ai/*` to consume server `TAVILY_API_KEY` quota or forge `llmChallenge` tokens for arbitrary `userId`s); any authenticated user (`GET /api/search?q=` to search another user's `project_claims` text).
- **Proposed Fix**:
  1. Mount `requireAuth` on `POST /api/ai/search`, `POST /api/ai/deep-research`, and `POST /api/ai/agent`, and remove the `req.headers["x-user-id"]` fallback in `makeChallengeToken`.
  2. Scope `GET /api/search` (`server/routes/search.ts:35-45`) to `project_id=in.(...)` owned by `req.user.id`.
- **Effort**: **S**

#### `F-16` (MEDIUM): Broken Double-Prefixed Mount Path on Journal Compliance Report
- **Evidence**: [server/routes/project.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project.ts#L121) mounts `router.use("/:id/compliance", journalComplianceRouter(projectLimit))` inside `/api/projects`, while [server/routes/project/journal_compliance.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/journal_compliance.ts#L15) declares `router.get("/api/projects/:id/journal-compliance-report", ...)`. The resulting Express path is `/api/projects/:id/compliance/api/projects/:id/journal-compliance-report`.
- **Who can exploit**: N/A (functional bug — callers to `/api/projects/:id/journal-compliance-report` or `/api/projects/:id/compliance` get `404`).
- **Proposed Fix**: Change `journal_compliance.ts:15` to `router.get("/", ...)` or mount it directly on `router.get("/:id/journal-compliance-report", ...)` in `project.ts`.
- **Effort**: **S**

### 1.3 Proposed Automated Authz-Matrix Test (`server/routes/__tests__/authzMatrix.test.ts`)
To prevent future regressions where new routes bypass `requireAuth` or `loadOwnedProject`, add a table-driven test in Phase 3 that:
1. Introspects `app._router.stack` at test startup to enumerate every `(method, path)` pair under `/api/*`.
2. Asserts every route not in an explicit `PUBLIC_ALLOWLIST` (`GET /api/health`, `POST /api/auth/verify-signup`, `GET /api/atlas/output-types`, `GET /api/atlas/output-types/:id`, `GET /api/ai/status`) returns HTTP `401` when called without an `Authorization` header.
3. For every route containing `:id` under `/api/projects/:id*` or `/api/presentations/:id*`, seeds a resource owned by `USER_A`, authenticates as `USER_B`, and asserts the route returns `404` or `403` (never `2xx` or `500`).

---

## 2. Supabase Exposure & Migration Drift Audit (Part B Static Analysis + Part C.2)

### 2.1 Part B Static Analysis: Base Schemas (4) + Migrations (28) Ordering & Conflicts
Because Docker is not yet installed locally (pending confirmation on the bracketed `Docker approval` choice), we ran a static SQL parser across all 4 base schemas (`schema.sql`, `schema_ai_engine.sql`, `admin_schema.sql`, `user_authors_schema.sql`) and all 28 migration files in `supabase/migrations/` in lexicographical order. Applying them sequentially on a clean database fails at **5 ordering/conflict points**:

1. **Missing Base `CREATE TABLE public.projects`**:
   - **Evidence**: Neither `schema.sql` nor any early migration contains `CREATE TABLE public.projects`! Yet `migrations/20260817000000_normalized_research_schema.sql:6` (`project_id text not null references public.projects(project_id) on delete cascade`), `migrations/20260818000000_add_authors_to_projects.sql:1` (`ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS authors`), and `migrations/20260924180000_project_cascade_delete.sql:19` (`ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY`) all assume `public.projects` already exists.
   - **Root Cause**: `public.projects` is created at runtime by `pgProjectStore.ts` (`ensureSchema()`) or was created manually in the Supabase SQL Editor before migrations began.
2. **Forward Reference to `public.user_vaults` Before Creation**:
   - **Evidence**: `migrations/20260821170000_universal_vault.sql` creates `user_vault_items`, whereas `user_vaults` is not created until `migrations/20260825_universal_vault_v2.sql:5`.
3. **Conflicting Schema Definitions for `project_sources` and `project_evidence`**:
   - **Evidence**:
     - `project_sources` is created in `20260817000000_normalized_research_schema.sql:5` (with `id text primary key`), recreated in `20260818162000_agentic_schema.sql:4` (with `id uuid primary key default gen_random_uuid()`), and recreated a third time in `20261009103516_normalize_project_state.sql:16`! Because `CREATE TABLE IF NOT EXISTS` is used, whichever migration ran first determines whether `project_sources.id` is `text` or `uuid`.
     - `project_evidence` is created in `20260818162000_agentic_schema.sql:23` (`id uuid primary key`) and again in `20261009103516_normalize_project_state.sql:30` (`id text primary key`).
4. **Duplicate Policy Creation Without `DROP POLICY IF EXISTS`**:
   - **Evidence**: `migrations/20260812180000_two_router_architecture.sql:52` runs `create policy "premium_requests_insert_own" on public.premium_requests` without `drop policy if exists`, which collides with `migrations/20260812120000_premium_request_integrity.sql:33` (`drop policy if exists "premium_requests_insert_own"` followed by `create policy "premium_requests_insert_own"`). Worse, `20260812180000` (which sorts *after* `20260812120000`) **weakens** the stricter `with check` from `20260812120000` if applied after it!
5. **`supabase/admin_schema.sql` References Tables (`system_settings`, `usage_logs`, `abuse_flags`) Not Created in Base Schemas**:
   - **Evidence**: [supabase/admin_schema.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/admin_schema.sql#L6-L31) alters `public.profiles` and creates policies on `public.system_settings`, `public.usage_logs`, and `public.abuse_flags` assuming they already exist.

### 2.2 Complete Table & RLS Inventory (`44` Tables)

| Table (`public.*`) | Created In | RLS Enabled? | Policies (`anon` / `authenticated`) | Audit Status |
| :--- | :--- | :---: | :--- | :--- |
| `profiles` | `schema.sql` | Yes | `SELECT`, `UPDATE` own (`auth.uid() = id`); trigger blocks `account_status` self-update (`20260814000000`); `admin_schema.sql` adds `SELECT`/`UPDATE` for hardcoded `'docgovinda@gmail.com'` | **Check prod policies (`F-15`)** |
| `api_credentials` | `schema.sql` | Yes | `ALL` own (`auth.uid() = user_id`) | Stores plaintext in `encrypted_api_key` (`F-11`) |
| `user_saved_authors` | `user_authors_schema.sql` | Yes | `SELECT`, `INSERT`, `UPDATE`, `DELETE` own (`auth.uid() = user_id`) | OK |
| `ai_providers` | `schema_ai_engine.sql` | Yes | `SELECT` all (`using (true)`) | OK (public catalog) |
| `ai_models` | `schema_ai_engine.sql` | Yes | `SELECT` all (`using (true)`) | OK (public catalog) |
| `user_ai_connections` | `schema_ai_engine.sql` | Yes | `ALL` own (`auth.uid() = user_id`) | OK (metadata only) |
| `hardware_profiles` | `schema_ai_engine.sql` | Yes | `ALL` own (`auth.uid() = user_id`) | OK |
| `admin_users` | `schema_ai_engine.sql` | Yes | `0` policies (service-role only) | OK |
| `premium_plans` | `schema_ai_engine.sql` | Yes | `SELECT` all (`using (true)`) | OK |
| `user_entitlements` | `schema_ai_engine.sql` | Yes | `SELECT` own (`auth.uid() = user_id`) | OK |
| `user_quota_overrides` | `schema_ai_engine.sql` | Yes | `SELECT` own (`auth.uid() = user_id`) | OK |
| `credit_balances` | `schema_ai_engine.sql` | Yes | `SELECT` own (`auth.uid() = user_id`) | OK |
| `credit_ledger` | `schema_ai_engine.sql` | Yes | `SELECT` own (`auth.uid() = user_id`) | OK |
| `ai_usage_ledger` | `schema_ai_engine.sql` | Yes | `SELECT` own (`auth.uid() = user_id`) | OK |
| `provider_health` | `schema_ai_engine.sql` | Yes | `SELECT` all (`using (true)`) | OK |
| `platform_budgets` | `schema_ai_engine.sql` | Yes | `0` policies (service-role only) | OK |
| `platform_provider_credentials` | `schema_ai_engine.sql` | Yes | `0` policies (service-role only) | OK |
| `ai_opportunities` | `schema_ai_engine.sql` | Yes | `0` policies (service-role only) | OK |
| `opportunity_reviews` | `schema_ai_engine.sql` | Yes | `0` policies (service-role only) | OK |
| `admin_audit_log` | `schema_ai_engine.sql` | Yes | `0` policies (service-role only) | OK |
| `premium_requests` | `20260812180000` | Yes | `SELECT`, `INSERT`, `UPDATE` (withdraw) own (`auth.uid() = user_id`) | Policy order conflict (`20260812120000` vs `20260812180000`) |
| `ai_resources` | `20260812180000` | Yes | `0` policies (service-role only) | OK |
| `plan_resources` | `20260812180000` | Yes | `0` policies (service-role only) | OK |
| `project_sources` | `20260817000000` | Yes | `0` policies (service-role only) | Schema type conflict (`text` vs `uuid`) |
| `project_evidence_items` | `20260817000000` | Yes | `0` policies (service-role only) | OK |
| `project_claims` | `20260817000000` | Yes | `0` policies (service-role only) | OK |
| `project_claim_bindings` | `20260817000000` | Yes | `0` policies (service-role only) | OK |
| `project_claim_binding_evidence` | `20260817000000` | Yes | `0` policies (service-role only) | OK |
| **`project_research_gaps`** | `20260817000001` | **NO (`false`)** | **NONE — WIDE OPEN TO `anon` & `authenticated`** | **BLOCKER (`F-02`)** |
| **`project_titles`** | `20260817000001` | **NO (`false`)** | **NONE — WIDE OPEN TO `anon` & `authenticated`** | **BLOCKER (`F-02`)** |
| **`project_journal_candidates`** | `20260817000001` | **NO (`false`)** | **NONE — WIDE OPEN TO `anon` & `authenticated`** | **BLOCKER (`F-02`)** |
| `project_evidence` | `20260818162000` | Yes | `0` policies (service-role only) | Schema type conflict (`uuid` vs `text`) |
| `manuscript_sections` | `20260818162000` | Yes | `0` policies (service-role only) | OK |
| `peer_review_critiques` | `20260818162000` | Yes | `0` policies (service-role only) | OK |
| `manuscript_versions` | `20260818163000` | Yes | `0` policies (service-role only) | OK |
| `project_activity` | `20260820114917` | Yes | `SELECT` own via `projects.owner_id = auth.uid()` | OK |
| `project_files` | `20260820114917` | Yes | `SELECT`, `INSERT` own via `projects.owner_id = auth.uid()` | OK (table has RLS, but storage bucket does NOT — see `F-03`) |
| `user_vault_items` | `20260821170000` | Yes | `SELECT`, `INSERT`, `UPDATE`, `DELETE` own (`auth.uid() = user_id`) | OK |
| `user_vaults` | `20260825` | Yes | `SELECT`, `INSERT`, `UPDATE`, `DELETE` own (`auth.uid() = user_id`) | OK |
| `user_cloud_integrations` | `20260825` | Yes | `SELECT`, `INSERT`, `UPDATE`, `DELETE` own (`auth.uid() = user_id`) | Plaintext OAuth tokens (`F-11`) |
| `projects` | Runtime / `20260924180000` | Yes (`20260924180000`) | `DELETE` own (`owner_id = auth.uid()`); `SELECT`/`INSERT`/`UPDATE` via service role | Verify prod RLS enabled (`PROD_CHECKS.md`) |
| `assignment_projects` | `20260927183000` | Yes | `ALL` own via `projects.owner_id = auth.uid()` | OK |
| `project_answers` | `20261009103516` | Yes | `0` policies (service-role only) | OK |
| `project_uploaded_sources` | `20261009103516` | Yes | `0` policies (service-role only) | OK |

### 2.3 Findings on Supabase Exposure

#### `F-02` (BLOCKER): Three Tables Missing `ENABLE ROW LEVEL SECURITY` (`project_research_gaps`, `project_titles`, `project_journal_candidates`)
- **Evidence**: [supabase/migrations/20260817000001_agentic_pipeline.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260817000001_agentic_pipeline.sql#L6-L38) creates `public.project_research_gaps`, `public.project_titles`, and `public.project_journal_candidates`, and never runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in that file or any subsequent migration.
- **Who can exploit**: **Anonymous** (anyone with the public `VITE_SUPABASE_ANON_KEY` bundled into the frontend JS can read, modify, or delete all rows across all users' projects via `/api/supabase/rest/v1/project_research_gaps`, etc.).
- **Proposed Fix**: New migration enabling RLS on all three tables (`ALTER TABLE public.project_research_gaps ENABLE ROW LEVEL SECURITY;`, etc.) with zero anon policies (since the Express server accesses them via `SUPABASE_SERVICE_ROLE_KEY`).
- **Effort**: **S**

#### `F-03` (BLOCKER): `project-files` Storage Bucket Policies Allow Anonymous Read/Write/Delete Across All Projects
- **Evidence**: [supabase/migrations/20260820130000_project_files_bucket.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260820130000_project_files_bucket.sql#L2-L25):
  ```sql
  INSERT INTO storage.buckets (id, name, public) VALUES ('project-files', 'project-files', true) ON CONFLICT (id) DO NOTHING;
  CREATE POLICY "project_files_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'project-files');
  CREATE POLICY "project_files_select" ON storage.objects FOR SELECT USING (bucket_id = 'project-files');
  CREATE POLICY "project_files_update" ON storage.objects FOR UPDATE USING (bucket_id = 'project-files');
  CREATE POLICY "project_files_delete" ON storage.objects FOR DELETE USING (bucket_id = 'project-files');
  ```
- **Who can exploit**: **Anonymous** (any caller with `VITE_SUPABASE_ANON_KEY` can list, download, overwrite, or delete every uploaded file in `project-files` across all projects).
- **Proposed Fix**: Since all legitimate uploads and metadata queries go through `server/routes/project/files.ts` using `SUPABASE_SERVICE_ROLE_KEY`, set `public = false` (or restrict `INSERT`/`UPDATE`/`DELETE` to `service_role` / project owners via `(storage.foldername(name))[1] IN (SELECT project_id FROM public.projects WHERE owner_id = auth.uid())`) and drop the four unrestricted policies.
- **Effort**: **S**

#### `F-10` (HIGH): `/api/supabase/*` Reverse Proxy Bypasses Rate Limiters, Forwards All Upstream Paths, and Disables TLS Verification on WebSocket Upgrades
- **Evidence**:
  - [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L43): `registerSupabaseProxy(app)` is registered at line 43, **before** `app.use("/api", generalApiLimiter)` at line 104.
  - [server/routes/supabaseProxy.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/supabaseProxy.ts#L51-L120): Streams arbitrary methods and subpaths (`req.url`) with no path allowlist and no body limit.
  - [server/routes/supabaseProxy.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/supabaseProxy.ts#L156): `registerSupabaseWsProxy` passes `rejectUnauthorized: false` to `tls.connect()`, disabling TLS certificate verification for upstream WebSocket connections.
- **Who can exploit**: Anonymous (unthrottled proxy abuse against Supabase Auth/REST/Storage); network MITM between Render and Supabase on WebSocket upgrades.
- **Proposed Fix**:
  1. Remove hardcoded fallback URL `https://gfjhsijrwodjvkisouzw.supabase.co` (`F-07`).
  2. Restrict proxied subpaths to an explicit allowlist (`/auth/v1/`, `/rest/v1/`, `/storage/v1/`, `/functions/v1/`).
  3. Apply rate limiting to `/api/supabase/auth/v1/*` and `/api/supabase/functions/v1/*`.
  4. Change `rejectUnauthorized: false` to `rejectUnauthorized: true` in `registerSupabaseWsProxy`.
- **Effort**: **S**

#### `F-14` (HIGH): Six `SECURITY DEFINER` RPCs Granted to `anon` Enable Unauthenticated Account & PII Enumeration
- **Evidence**:
  - `email_for_username(text)` ([supabase/schema.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/schema.sql#L65-L79))
  - `email_for_phone_e164(text)` and `email_for_identifier(text)` ([supabase/migrations/20260815180000_unified_login_functions.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260815180000_unified_login_functions.sql#L19-L83))
  - `check_username_available(text)`, `check_email_available(text)`, `check_phone_available(text)` ([supabase/migrations/20260815120000_duplicate_identifier_detection.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260815120000_duplicate_identifier_detection.sql#L16-L85))
  - All 6 functions run as `SECURITY DEFINER` (bypassing `profiles` RLS) and grant `EXECUTE` to `anon, authenticated`. Worse, `email_for_username`, `email_for_phone_e164`, and `email_for_identifier` return the user's **plaintext email address** to any unauthenticated caller who knows or guesses a username or phone number!
- **Who can exploit**: **Anonymous** (via `POST /api/supabase/rest/v1/rpc/email_for_identifier` with zero rate limiting because `/api/supabase` bypasses Express rate limiters).
- **Proposed Fix**: Move identifier-to-email resolution and availability checks behind an Express endpoint protected by Turnstile CAPTCHA + strict IP rate limiting (`authRateLimit`), and `REVOKE EXECUTE ON FUNCTION ... FROM public, anon, authenticated; GRANT EXECUTE ... TO service_role;`.
- **Effort**: **S**

---

## 3. Authentication & Authorization Audit

### `F-04` (BLOCKER): `request-profile-update` Edge Function Leaks `verificationKey` in HTTP Response
- **Evidence**: [supabase/functions/request-profile-update/index.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/request-profile-update/index.ts#L102-L132):
  - When `RESEND_API_KEY` is missing (`lines 125-131`), returns HTTP `200` with `verificationKey` in the JSON body.
  - When Resend returns an error (`lines 102-110`), returns HTTP `500` with `verificationKey` in the JSON body (`{ error: ..., verificationKey }`), **after** already storing the hash in `profiles.pending_profile_update` (`lines 69-77`).
- **Who can exploit**: Any authenticated user (can change their account email to an arbitrary unverified address or trigger an email failure and read `verificationKey` directly from the HTTP response).
- **Proposed Fix**: Remove `verificationKey` from all HTTP responses in `supabase/functions/request-profile-update/index.ts` and fail closed (`503`) before writing `pending_profile_update` if `RESEND_API_KEY` is not configured.
- **Effort**: **S**

### `F-13` (HIGH): `LLM_CHALLENGE_SECRET` Reuses `SUPABASE_SERVICE_ROLE_KEY` (with Static Fallback) & `verifyLocalJwt` Skips `role`/`aud` Verification
- **Evidence**:
  1. [server/utils/llm.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/utils/llm.ts#L31-L35):
     ```ts
     const LLM_CHALLENGE_SECRET =
       process.env.LLM_CHALLENGE_SECRET ||
       process.env.SUPABASE_SERVICE_ROLE_KEY ||
       process.env.SUPABASE_JWT_SECRET ||
       "scholar-core-ephemeral-challenge-secret";
     ```
     Using `SUPABASE_SERVICE_ROLE_KEY` as an HMAC key for client-facing challenge tokens violates key separation, and falling back to a hardcoded string (`"scholar-core-ephemeral-challenge-secret"`) allows offline token forgery when env vars are missing.
  2. [server/src/middleware/auth.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/auth.ts#L101-L141): `verifyLocalJwt` checks `header.alg === "HS256"`, `payload.exp`, and `payload.sub`, but does **not** verify `payload.aud === "authenticated"` or `payload.role === "authenticated"`.
  3. [server/src/middleware/auth.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/auth.ts#L226-L260): `isAccountBlocked(result.user.id)` queries `profiles` via PostgREST on **every authenticated request** even on a `tokenCache` hit, adding 1 network round-trip per API call and failing open on error.
- **Who can exploit**: Authenticated user / token holder.
- **Proposed Fix**:
  1. Require a dedicated `LLM_CHALLENGE_SECRET` (or derive a domain-separated key via `crypto.hkdfSync("sha256", serviceRoleKey, "", "scholar-llm-challenge-v1", 32)`) and generate `crypto.randomBytes(32).toString("hex")` at boot if unconfigured in dev/test rather than a static string.
  2. In `verifyLocalJwt`, assert `payload.role === "authenticated"` and `payload.aud === "authenticated"`.
  3. Cache `account_status` alongside `user` inside `tokenCache` (5-minute TTL) so `requireAuth` does not hit PostgREST on every cached request.
- **Effort**: **S**

### `F-15` (MEDIUM): Admin Identity Configuration Split Across 3 Unsynchronized Places
- **Evidence**:
  - [server/src/middleware/requireAdmin.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/requireAdmin.ts#L67) and [render.yaml](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L22) read `process.env.MAIN_ADMIN_EMAIL`.
  - [.env.example](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/.env.example#L51) documents `ADMIN_EMAIL` (never read anywhere in the codebase).
  - [supabase/admin_schema.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/admin_schema.sql#L13) and [supabase/migrations/20260418000001_fix_rls_security.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260418000001_fix_rls_security.sql#L19) hardcode `'docgovinda@gmail.com'` in Postgres RLS policies.
- **Who can exploit**: Operator misconfiguration / stale admin email retaining RLS privileges in Postgres even if `MAIN_ADMIN_EMAIL` is changed on Render.
- **Proposed Fix**: Standardize on `MAIN_ADMIN_EMAIL` in `.env.example`, and replace hardcoded email strings in Postgres RLS policies with `EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())`.
- **Effort**: **S**

---

## 4. Data Claims vs. Reality Audit

| Security / Privacy Claim | Source of Claim | Actual Implementation in Code | Verdict |
| :--- | :--- | :--- | :--- |
| **Platform AI keys encrypted with AES-256-GCM envelope encryption** | [46-SECURITY-ARCHITECTURE.md](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/docs/04-architecture/46-SECURITY-ARCHITECTURE.md), [credentialVault.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/aiEngine/credentialVault.ts#L10-L23) | `platform_provider_credentials` uses [src/services/crypto/crypto.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/crypto/crypto.ts#L57-L95) (`aes-256-gcm`, random 12-byte IV, 32-byte per-row CEK wrapped under `process.env.MASTER_KEY`). | **TRUE** (provided `MASTER_KEY` is set in Render env) |
| **User BYOK API keys "Never sent to our server"** | [src/services/userAiSettings.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/userAiSettings.ts#L14-L16) & [L83-L84](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/userAiSettings.ts#L83-L84) | While `user_ai_connections` in Postgres only stores metadata (`provider_id`, `tier`, `status`), the browser **sends the user's plaintext BYOK API key to the Express server on every AI call** via `x-api-key` / `x-gemini-key` / `x-openrouter-key` / `x-anthropic-key` headers or `req.body.apiKey` ([server/utils/llm.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/utils/llm.ts#L190-L260), [server/routes/aiAccess.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/aiAccess.ts#L100-L155)). | **FALSE (Transmitted to Express server on every request)** |
| **User BYOK keys encrypted at rest in browser `localStorage`** | [src/services/userAiSettings.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/userAiSettings.ts#L36-L37) | Ciphertext is stored in `localStorage["scholar-provider-keys"]` and the raw AES decryption key is stored right next to it in `localStorage["scholar-device-secret"]` (`lines 86-95`). Any XSS (e.g., via Tiptap/ProseMirror paste vulnerabilities) can read both and decrypt all stored BYOK keys. | **COSMETIC OBFUSCATION (`F-11`)** |
| **`api_credentials.encrypted_api_key` stores encrypted keys** | [supabase/schema.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/schema.sql#L91-L101) (`encrypted_api_key text not null`) | [src/services/supabaseAuthService.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/supabaseAuthService.ts#L645-L653) (`saveApiKeys`) writes **raw plaintext API keys** directly into `encrypted_api_key: apiKeys[provider]` with `api_key_hash: ""`! | **FALSE — Plaintext in DB (`F-11`)** |
| **Cloud integration OAuth tokens (`user_cloud_integrations`) protected at rest** | [supabase/migrations/20260825_universal_vault_v2.sql](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20260825_universal_vault_v2.sql#L40-L53) | [src/services/vault/cloudDriveService.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/vault/cloudDriveService.ts#L51-L130) and [server/routes/vault.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/vault.ts#L803-L878) store Google Drive and OneDrive `access_token` and `refresh_token` in **plaintext** in `user_cloud_integrations` and allow the browser to `SELECT *` via RLS. | **FALSE — Plaintext OAuth tokens in DB (`F-11`)** |

---

## 5. Dependency Vulnerability Audit (`npm audit`)

Running `npm audit --json` across the `903` total packages (`306` production, `582` dev) reported **52 vulnerabilities (`1` Critical, `14` High, `32` Moderate, `5` Low)**:

| Package | Severity | Prod / Dev | CVEs / Advisories | Reachability in Scholar Core | Remediation |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **`proxy-addr`** | **CRITICAL** | **Prod** (via `express`) | `GHSA-jqcg-44mw-7w3h` (IP spoofing via IPv4-mapped IPv6 trust subnet) | **Reachable** once `trust proxy` is enabled on Express for rate limiting (`req.ip`). | `npm audit fix` (updates `proxy-addr` / `express` transitive tree) — **Effort: S** |
| **`xlsx` (`0.18.5`)** | **HIGH** | **Prod (Direct)** | `GHSA-4r6h-8v6p-xvw6` (Prototype Pollution), `GHSA-5pgg-2g8v-p4x9` (ReDoS) | **Directly reachable on 4 upload endpoints** (`vault.ts`, `project/parse.ts`, `evidenceRoutes.ts`, `presentations.ts`) parsing user-uploaded `.xlsx`/`.csv` files in the main Node process! | **No upstream fix on npm for `xlsx`**. Replace `xlsx` with `exceljs` (or `@e965/xlsx` patched build) — **Effort: M** |
| **`multer` (`2.1.1`)** | **HIGH** | **Prod (Direct)** | 6 advisories (`GHSA-wc9g-mqfw-jrwm`, `GHSA-qfvm-cv95-jqjf`, `GHSA-535w-7cp7-47q4`, `GHSA-q7qp-rjg7-q26m`, `GHSA-3pph-fpjx-jg34`, `GHSA-qvfw-j98x-7q72` — DoS via crafted field names, FD leaks, async `fileFilter` crash) | **Directly reachable** on all 6 file upload endpoints. | `npm audit fix` (upgrades `multer` to patched release) — **Effort: S** |
| **`body-parser`** | **HIGH** | **Prod** (via `express`) | `GHSA-27r3-jxmh-p828` (DoS via trailing bytes after compressed body), `GHSA-v422-hmwv-36x6` | **Directly reachable** on every JSON/urlencoded POST/PUT/PATCH route (`server.ts:75-76`). | `npm audit fix` — **Effort: S** |
| **`undici`** | **HIGH** | **Prod** | 19 advisories including `GHSA-w293-vg96-wgc3` & `GHSA-2m5v-pch6-74hx` (TLS validation bypass), `GHSA-4w7w-5xrc-9h26` (cache poisoning), `GHSA-xjj6-f33q-929c` (DoS) | Used by `@supabase/supabase-js` and Node HTTP clients. | `npm audit fix` — **Effort: S** |
| **`@tiptap/*` (28 pkgs) & `prosemirror-view`** | **HIGH** | **Prod (Direct, Client)** | `GHSA-cp6q-959q-f8rh` (`mergeAttributes` `__proto__` DOM XSS), `GHSA-j95f-988m-3j2f` (Markdown ReDoS), `GHSA-c8x8-7fp4-3x9w` (`prosemirror-view` paste XSS) | **Directly reachable** in the rich-text manuscript editor when pasting or rendering AI/collaborator markdown, exposing `localStorage` tokens and BYOK keys! | `npm audit fix` (updates `@tiptap/*` and `prosemirror-view`) — **Effort: S** |
| **`@xmldom/xmldom`** | **HIGH** | **Prod** (via `docx` / parsers) | 10 advisories (`GHSA-w2rr-34g9-rvrj`, `GHSA-965w-775f-mr7g` quadratic memory DoS, ReDoS, XML injection) | Reachable during DOCX/XML parsing and generation. | `npm audit fix` — **Effort: S** |
| **`zod`** | **HIGH** | **Prod (Direct)** | `GHSA-mrhx-c7xc-m3w5` (Memory exhaustion validating oversized constrained collections) | Used across `src/domain/schemas/projectSchemas.ts` on API inputs. | `npm audit fix` — **Effort: S** |
| **`fast-uri`, `nanoid`, `qs`, `protobufjs`** | **HIGH / MOD** | **Prod / Transitive** | SSRF normalization (`fast-uri`), infinite loop (`nanoid`, `protobufjs`), array-limit bypass (`qs`) | Transitive dependencies (`express` uses `qs` for query parsing). | `npm audit fix` — **Effort: S** |
| **`vite`, `vitest`, `@vitest/mocker`, `postcss`, `source-map-js`, `brace-expansion`, `vite-plugin-pwa`** | **HIGH / MOD / LOW** | **Dev / Build only** | Dev-server / test-runner advisories | Not shipped in production `dist/server.cjs` runtime bundle. | `npm audit fix` — **Effort: S** |

---

## 6. Git History Secrets Audit

### `F-01` (BLOCKER): Seven Live Production Credentials Committed in Git History
- **Evidence** (values strictly redacted per guardrail; verified via `git log --all --full-history -- INFRASTRUCTURE_REFERENCE.md scripts/setup-infrastructure.md`):
  - Commit `01f851f` (2026-08-04, *"Infrastructure authorization: GitHub Actions, Render, Cloudflare, Supabase"*) added `scripts/setup-infrastructure.md` (252 lines).
  - Commit `28cfaa5` (2026-08-04, *"Add infrastructure reference card and setup checklist"*) added `INFRASTRUCTURE_REFERENCE.md` (201 lines).
  - Both files were later removed from the working tree in commits `643bf1f` and `6c5943a`, **but remain permanently accessible in git history** (`git show 28cfaa5:INFRASTRUCTURE_REFERENCE.md` and `git show 01f851f:scripts/setup-infrastructure.md`) in the public GitHub repository `docgovinda-glitch/scholar-agentic-os`:
    1. **Supabase Postgres Superuser Password & `DATABASE_URL`** (`INFRASTRUCTURE_REFERENCE.md:L24, L51, L72, L123`; `scripts/setup-infrastructure.md:L10, L35, L164`)
    2. **`SUPABASE_SERVICE_ROLE_KEY`** (`INFRASTRUCTURE_REFERENCE.md:L25, L54`; `scripts/setup-infrastructure.md:L37`)
    3. **`RESEND_API_KEY`** (`INFRASTRUCTURE_REFERENCE.md:L28, L55`; `scripts/setup-infrastructure.md:L11, L41`)
    4. **Cloudflare API Key & Zone ID** (`INFRASTRUCTURE_REFERENCE.md:L31-L32`; `scripts/setup-infrastructure.md:L12-L13`)
    5. **GitHub Personal Access Token (`GitHub PAT`)** (`INFRASTRUCTURE_REFERENCE.md:L34`; `scripts/setup-infrastructure.md:L14`)
    6. **Render Deploy Key (`RENDER_DEPLOY_KEY`)** (`INFRASTRUCTURE_REFERENCE.md:L69`)
    7. **`ENCRYPTION_KEY`** (64-char hex key, `INFRASTRUCTURE_REFERENCE.md:L42, L61`)
  - Additionally, commit `f5d8457` (and current `HEAD` in `.github/workflows/deploy.yml`, `src/config/env.ts`, `server/src/supabaseRest.ts`) contains the production `VITE_SUPABASE_ANON_KEY` JWT (`role: "anon"`, `ref: "gfjhsijrwodjvkisouzw"`).
- **Who can exploit**: **Anonymous** (anyone on the internet who clones `https://github.com/docgovinda-glitch/scholar-agentic-os.git` has full superuser Postgres access, Supabase service-role access, Cloudflare DNS/WAF control, GitHub PAT access, Resend email sending access, and Render deploy trigger access).
- **Proposed Fix**:
  1. **Immediate Human Action (Before Any Other Step)**: Rotate all 7 credentials in their respective dashboards (Supabase Database Password, Supabase Service Role Key / API keys, Resend API Key, Cloudflare API Token, GitHub PAT, Render Deploy Hook/API Key, and `ENCRYPTION_KEY` / `MASTER_KEY`) and update Render & Supabase environment variables.
  2. **History Scrub (After Rotation & Coordination)**: Use `git filter-repo --invert-paths --path INFRASTRUCTURE_REFERENCE.md --path scripts/setup-infrastructure.md` (requires human approval for force-push and GitHub support cache purge).
- **Effort**: **S** (Rotation) / **M** (History rewrite)

---

## 7. Reliability & Operational Resilience Audit

### `F-09` (HIGH): Rate Limiter Bypass via `User-Agent` Rotation & Missing `trust proxy`
- **Evidence**:
  1. [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts): Does **not** call `app.set("trust proxy", 1)`. Behind Cloudflare and Render's load balancer, `req.ip` resolves to the internal proxy peer IP rather than the client IP.
  2. [server/src/middleware/rateLimit.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/rateLimit.ts#L103-L108):
     ```ts
     const uaPart = getUserAgent(req);
     const key = limitBy === "ip+user" && userPart ? `${ipPart}:${userPart}:${uaPart}` : `${ipPart}:${uaPart}`;
     ```
     Every rate-limit bucket key includes the raw `User-Agent` header! Any script that sends a random `User-Agent` per request gets a brand-new counter on every request (completely bypassing `authEndpointLimiter`, `aiGenerationLimiter`, and `generalApiLimiter`) AND inserts a new entry into the unbounded `store` `Map` (`line 29`), causing an in-memory leak between the 60-second cleanup intervals (`line 38`).
  3. Furthermore, `setInterval` at [server/src/middleware/rateLimit.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/rateLimit.ts#L38-L45) does not call `.unref()`, keeping the Node event loop alive in CLI/test scripts.
- **Who can exploit**: Anonymous.
- **Proposed Fix**:
  1. Set `app.set("trust proxy", 1)` in `server.ts` (after upgrading `proxy-addr` via `npm audit fix`).
  2. Remove `uaPart` (`User-Agent`) from the rate-limit key in `rateLimit.ts`; key by `req.user?.id || req.ip` and cap `store.size` at `10_000` entries (LRU eviction) with `.unref()` on the cleanup timer.
- **Effort**: **S**

### `F-17` (MEDIUM): Shallow `/api/health`, Missing Outbound Timeouts (18 `fetch` Calls), Missing Graceful Shutdown, Unbounded `memoryDecks` Map, and Unaborted SSE Streams
- **Evidence**:
  1. **Shallow `/api/health`**: [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L96-L98) returns `{ status: "ok" }` without checking whether Supabase/Postgres is reachable or whether required env vars (`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are configured.
  2. **18 Outbound `fetch()` Calls Without Timeouts**:
     - [server/routes/vault.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/vault.ts#L296-L889): 6 `fetch()` calls (Crossref, DataCite, Semantic Scholar, Mendeley, Google Drive, Microsoft Graph) have no `signal: AbortSignal.timeout(...)`.
     - [server/src/discovery/discovery.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/discovery/discovery.ts#L61-L246) & [liveSearch.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/discovery/liveSearch.ts#L126-L267): 9 `fetch()` calls (OpenAlex, Crossref, DOAJ, DataCite, Wikipedia, Supabase `search-proxy` Edge Function) have no timeout.
     - [server/src/supabaseRest.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/supabaseRest.ts#L58), [creditEngine.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/aiEngine/creditEngine.ts#L13), [userAdmin.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/aiEngine/userAdmin.ts#L39): No timeout on PostgREST / RPC / GoTrue admin calls.
  3. **Missing Graceful Shutdown & Process Error Handlers**: [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L190-L195) registers no `SIGTERM`, `SIGINT`, `unhandledRejection`, or `uncaughtException` handlers.
  4. **SSE Disconnect Cleanup**: [server/routes/project/assignment/draftRoutes.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/assignment/draftRoutes.ts#L170-L250) (`POST /stream-section`) streams SSE responses without wiring `req.on("close")` to an `AbortController` passed to the LLM stream.
  5. **Unbounded `memoryDecks` Map**: [server/routes/presentations.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/presentations.ts#L52) keeps `export const memoryDecks = new Map<string, DeckRecord>()` with no size cap or TTL when Supabase is unavailable or when fallback decks are stored in [server/routes/project/presentation.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/presentation.ts#L479).
- **Who can exploit**: Any authenticated user / slow upstream third-party API.
- **Proposed Fix**: Add default `AbortSignal.timeout(15_000)` to `supabaseRest.ts` and all scholarly/cloud API fetches; add `SIGTERM`/`SIGINT` graceful shutdown (`httpServer.close()`); cap `memoryDecks` at 100 entries; wire `req.on("close")` abort in SSE routes; add optional `?deep=1` readiness probe to `/api/health`.
- **Effort**: **M**

---

## 8. Hosting Fit Analysis (Render Free + Supabase Free vs. Actual Footprint)

| Resource Dimension | Render Free Web Service Limit | Supabase Free Plan Limit | Scholar Core Actual Footprint (Measured) | Fit Verdict & 10x Load Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Memory (RAM)** | **512 MB** hard cgroup limit (OOM-kill on exceed) | N/A | **188 MiB** idle RSS; **~280–360 MiB** on 10 MB PDF parse (post-PR #71 cap); **502 MiB** on 25 MB PDF (pre-PR #71) | **TIGHT FIT**: With PR #71's 10 MB cap + `heavyParseConcurrencyGuard(1)`, single requests stay under ~360 MiB, leaving ~150 MiB headroom. Without PR #71, a single 25 MB upload crashes the server. Upgrading Render to **Starter (\$7/mo, 512 MB dedicated, 0 spin-down)** or **Standard (\$25/mo, 2 GB RAM)** is strongly recommended if concurrent heavy exports/parses are expected. |
| **Availability / Cold Starts** | Spins down after **15 min** of inactivity; **~50–60s cold start**; 750 free instance hours/month | Pauses entire project after **7 days** of inactivity | SPA + API + WebSocket proxy all served by Render container | **POOR FIT FOR PRODUCTION**: First visitor after 15 min idle waits ~60s; if 7 days pass with no Supabase API traffic, the database pauses completely until manually resumed in the Supabase dashboard. |
| **Database Size** | Ephemeral local disk (wiped on every deploy/spin-down) | **500 MB** Postgres database | Stores `projects` JSONB, `manuscript_versions`, `project_evidence` with **768-dim `vector(768)` embeddings** (~3.1 KB per evidence chunk) | **MODERATE RISK**: ~100,000 vector embeddings + manuscript version snapshots will exhaust the 500 MB limit, putting the DB into read-only mode. |
| **File Storage & Egress** | N/A | **1 GB** Storage, **5 GB** uncached egress/month | `project-files` and `id-documents` buckets | ~100 uploaded 10 MB PDFs exhaust the 1 GB free storage tier. |
| **Backups & Point-in-Time Recovery** | N/A | **NONE on Free Plan** (daily backups require Pro \$25/mo) | All user manuscripts, citations, and credit ledgers live in Supabase Postgres | **HIGH RISK**: Zero automated backups on Supabase Free Tier. Requires a scheduled `pg_dump` GitHub Action or upgrading Supabase to Pro. |

*(Note: Per constraints, [src/__tests__/render.costGuard.test.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/__tests__/render.costGuard.test.ts) enforces `plan: free` in `render.yaml` and was not modified.)*

---

## 9. Test Hygiene & Coverage Audit

### `F-19` (MEDIUM): `.env` Leakage into Vitest Runs & Unexercised Real-Store Path
- **Evidence**:
  1. [server.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L12) and [server/utils/llm.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/utils/llm.ts#L12) call `dotenv.config()` unconditionally at module import time. During `npx vitest run`, Vitest workers load the developer's local `.env` (`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
  2. When we ran [server/routes/__tests__/userDataUploadAndAgentic.test.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/__tests__/userDataUploadAndAgentic.test.ts), `evidenceRoutes.ts:696` attempted a **live outbound HTTPS `POST` to the `.env` Supabase URL** (`Could not insert user dataset into Supabase project_evidence: TypeError: fetch failed`) because `global.fetch` was not mocked in that test and `.env` injected `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`!If `.env` pointed at production, running `npx vitest run` locally would **write test fixtures directly into production `project_evidence`**!
  3. [src/services/store/projectStore.ts](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/store/projectStore.ts#L140-L155) skips `pgProjectStore` and `restProjectStore` whenever `process.env.VITEST` is set unless `USE_REAL_STORE_IN_TESTS=1`, meaning 100% of CI runs test only the in-memory `Map` store, which is why the `project_sources` (`text` vs `uuid`) schema drift in `supabase/migrations/` went undetected.
- **Who can exploit**: Developer / CI accidentally mutating configured `.env` database during `vitest` runs.
- **Proposed Fix**:
  1. Guard `dotenv.config()` in `server.ts` and `server/utils/llm.ts` with `if (!process.env.VITEST && process.env.NODE_ENV !== "test")`, or add a global Vitest `setupFiles` hook that clears `VITE_SUPABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` unless `USE_REAL_STORE_IN_TESTS=1` is explicitly set, and throws if `global.fetch` is called against a non-localhost URL in unit tests.
- **Effort**: **S**

---

## 10. Ordered Phase 3 Remediation Plan (Small, Separate PRs)

Each PR below is scoped to a single concern, independently testable, and ordered by severity and blast radius:

| Order | PR Branch / Title | Findings Addressed | Scope & Verification | Effort |
| :---: | :--- | :--- | :--- | :---: |
| **Step 0 (Human)** | **Credential Rotation & Prod Checks** | `F-01`, `F-02`, `F-03` | Rotate the 7 leaked credentials from commits `28cfaa5` / `01f851f` (Postgres password, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, Cloudflare API Key, GitHub PAT, `RENDER_DEPLOY_KEY`, `ENCRYPTION_KEY`) and run the read-only queries in [PROD_CHECKS.md](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/PROD_CHECKS.md). | **S** |
| **PR 1 (Open: [#71](https://github.com/docgovinda-glitch/scholar-agentic-os/pull/71))** | `hotfix/containment-authz-memory-ssrf` | `F-05`, `F-06` | `requireAuth` on `/api/vault/*`, `/api/search/*`, `/api/discovery/*`, `/api/lookup-doi`, `/api/user/saved-authors`; ownership checks on all service-role project routes; unified `10 MB` upload cap (`413`); server-wide `heavyParseConcurrencyGuard(1)` (`503` + `Retry-After: 5`); `ssrfGuard` on both `parse-url` routes. **3,491 passing tests.** | **M (Done)** |
| **PR 2** | `fix/supabase-rls-storage-and-rpcs` | `F-02`, `F-03`, `F-04`, `F-14`, `F-15` | 1. New migration enabling RLS on `project_research_gaps`, `project_titles`, and `project_journal_candidates`.\n2. Lock down `project-files` storage bucket policies (`20260820130000`) to project owners / `service_role` and set `public = false`.\n3. Revoke `anon` execute on the 6 account-enumeration `SECURITY DEFINER` RPCs (`email_for_*`, `check_*_available`) and route through rate-limited Express endpoint.\n4. Replace hardcoded `'docgovinda@gmail.com'` in RLS policies with `admin_users` lookup.\n5. Remove `verificationKey` from HTTP responses in `supabase/functions/request-profile-update/index.ts`. | **S** |
| **PR 3** | `fix/remove-supabase-fallbacks-and-harden-proxy` | `F-07`, `F-10` | 1. Remove hardcoded `gfjhsijrwodjvkisouzw.supabase.co` URL and anon key fallbacks in `src/config/env.ts`, `server/src/supabaseRest.ts`, `server/routes/supabaseProxy.ts`, and `.github/workflows/deploy.yml` (fail closed at startup/build).\n2. Enforce subpath allowlist, rate limiting, and `rejectUnauthorized: true` in `server/routes/supabaseProxy.ts`. | **S** |
| **PR 4** | `fix/ai-routes-auth-and-challenge-secret` | `F-08`, `F-13`, `F-15`, `F-16` | 1. Add `requireAuth` to `POST /api/ai/search`, `POST /api/ai/deep-research`, and `POST /api/ai/agent`; remove `req.headers["x-user-id"]` spoofing in `makeChallengeToken`; scope `GET /api/search` `project_claims` query to caller's projects.\n2. Domain-separate `LLM_CHALLENGE_SECRET` (remove static fallback), check `role === "authenticated"` in `verifyLocalJwt`, and cache `account_status` in `tokenCache`.\n3. Fix double-prefixed `/journal-compliance-report` path (`F-16`) and align `MAIN_ADMIN_EMAIL` in `.env.example`. | **S** |
| **PR 5** | `fix/rate-limit-trust-proxy-and-reliability` | `F-09`, `F-17` | 1. Enable `app.set("trust proxy", 1)` in `server.ts`, remove `User-Agent` from `rateLimit.ts` keys, cap `rateLimit` store size, and `.unref()` cleanup timer.\n2. Add `AbortSignal.timeout(15_000)` to all 18 outbound `fetch()` calls, add `SIGTERM`/`SIGINT` graceful shutdown, wire `req.on("close")` SSE abort, and cap `memoryDecks`. | **M** |
| **PR 6** | `fix/credential-encryption-and-dependencies` | `F-11`, `F-12` | 1. Encrypt `api_credentials.encrypted_api_key` and `user_cloud_integrations` (`access_token`/`refresh_token`) server-side using `src/services/crypto/crypto.ts` (`MASTER_KEY` envelope encryption) or drop unused `api_credentials` writes.\n2. Run `npm audit fix` to patch `proxy-addr`, `multer`, `body-parser`, `undici`, `@tiptap/*`, `prosemirror-view`, `@xmldom/xmldom`, and `zod`; replace `xlsx` with `exceljs`. | **M** |
| **PR 7** | `test/vitest-env-isolation-and-authz-matrix` | `F-19`, CI drift (`R-08`) | 1. Prevent `dotenv.config()` from loading `.env` during `vitest` runs and block unmocked non-localhost `fetch()` calls in unit tests.\n2. Add automated `server/routes/__tests__/authzMatrix.test.ts` inspecting `app._router.stack`.\n3. Update `.github/workflows/ci.yml` from Node `20` to Node `22` to match `Dockerfile`. | **S** |
| **PR 8** | `fix/reconcile-supabase-migrations` | Section 2.1 Migration Drift | Add `00000000000000_baseline_projects.sql` (`CREATE TABLE IF NOT EXISTS public.projects`), reconcile `project_sources.id` / `project_evidence.id` column types against production schema output from `PROD_CHECKS.md`, and fix `premium_requests_insert_own` policy idempotency. | **M** |

