# Scholar Core (`scholar-agentic-os`) — Production Deployment Status Ledger (`STATUS.md`)

**Single Source of Truth Rule (Standing Rule 0)**:
1. Re-read `STATUS.md` and the relevant source/doc files at the start of every task and before writing any report.
2. Every factual claim in any report must cite `file:line` or paste raw command output. Anything not verified directly from code or command output must be labeled **`unverified`**.
3. No production Supabase connections (`gfjhsijrwodjvkisouzw`), no merges, no force-pushes, and never print secret values.

---

## 1. Current Production & `origin/main` State

- **Current `origin/main` HEAD**: `cbf38da` (`cbf38da8934a6aa0d8e6654063bb253729b64e78`, `Merge pull request #80 from docgovinda-glitch/fix/credential-encryption-and-honest-byok-ui`, head commit `0d5b0df`, merged `2026-10-29T04:58:43Z` by `docgovinda-glitch`).
- **Render Production Service (`srv-d9lgbn710e5c73dl8sk0`, `https://scholar.gkshah.com.np`)**: **Running PR `#80` (`cbf38da`)** — deployed manually by owner on `2026-10-29` *(owner confirming exact Render deploy SHA via Render Dashboard → Events / Deploys; run `POST_DEPLOY_80.md` to verify all 7 live behaviors)*.
- **Supabase Network Restrictions (`gfjhsijrwodjvkisouzw`)**: **ON (`2026-10-29`)** — only the owner's workstation IP (`/32`) is permitted for direct Postgres TCP connections (`5432`/`6543`); Render, Edge Functions, and CI use HTTPS Data API (`PostgREST` / `GoTrue` / `Storage`) exclusively.
- **Database Migrations (`20261028000000_hotfix2` & `20261028010000_purge`)**: **NOT APPLIED — MARKED `UNVERIFIED`** until Section 3 local Docker Supabase checks pass (`./scripts/verify-local-supabase.sh`).

---

## 2. Pull Request & Branch Ledger (Verified via `gh pr list` & `git log`)

| PR # | Head Branch | Base Branch | State / Merged? | Merge / Head SHA | Merged By (`gh`) | On `origin/main`? | Exact Contents |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **#71** | `hotfix/containment-authz-memory-ssrf` | `main` | **MERGED** (`2026-10-28T10:02:52Z`) | `5a642a0` (`d7d0746`, `9d32796`) | `docgovinda-glitch` | **YES** | Part A + A2 containment: `requireAuth` on `/api/vault/*` & `/api/search/live`, project ownership checks (`F-05`, `F-06`), 10 MB default upload guard, heavy-parse concurrency guard (`max=1`), `ssrfGuard`, initial `SYSTEM_MAP.md`/`SETUP.md`/`AUDIT.md`/`PROD_CHECKS.md`. |
| **#72** | `hotfix/db-storage-rpc-lockdown` | `main` | **MERGED** (`2026-10-28T10:03:17Z`) | `206deb6` (`8e7ee02`, `bc77d97`) | `docgovinda-glitch` | **YES** | Hotfix 2 v1: `POST /api/auth/login` v1, `POST /api/auth/check-availability`, `GET /api/projects/:id/files/:fileId/signed-url`, `20261028000000_hotfix2_db_storage_rpc_lockdown.sql` v1 *(SQL NOT APPLIED to prod)*, `ROTATION_RUNBOOK.md`, `scripts/rewrap-platform-credentials.ts`. |
| **#73** | `chore/ci-and-test-safety-rails` | `hotfix/db-storage-rpc-lockdown` *(stacked)* | Merged into parent branch (`2026-10-28T10:26:33Z`) | `65a2c78` (`e0db4bd`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | Task 4.1: Node 22 CI alignment, `render.yaml` `autoDeploy: false`, Vitest `.env`/network isolation (`src/test/vitestSetup.ts`), `authzMatrix.test.ts`. |
| **#74** | `fix/upload-clamp-and-ssrf-depth` | `chore/ci-and-test-safety-rails` *(stacked)* | Merged into parent branch (`2026-10-28T10:27:12Z`) | `58e3745` (`bd20086`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | Task 4.2: Hard upload clamp in `uploadGuard.ts`, SSRF depth tests, positive controls in `HOTFIX_DEPLOY.md`. |
| **#75** | `fix/ai-routes-auth-and-challenge-secret` | `fix/upload-clamp-and-ssrf-depth` *(stacked)* | Merged into parent branch (`2026-10-28T10:27:43Z`) | `8b76100` (`043bedb`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | Task 4.3: `requireAuth` on `/api/ai/*`, `LLM_CHALLENGE_SECRET` domain separation, JWT `role`/`aud` verification, double-prefixed compliance route fix. |
| **#76** | `fix/dependencies-and-replace-xlsx` | `fix/ai-routes-auth-and-challenge-secret` *(stacked)* | Merged into parent branch (`2026-10-28T10:47:40Z`) | `8ee0f4a` (`447a50e`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | PR 4.4: Replace unpatched `xlsx` with `exceljs`, upgrade `proxy-addr`, `multer`, `@tiptap/*`, `prosemirror-view`, `undici`, `zod`. |
| **#77** | `fix/rate-limit-trust-proxy-and-reliability` | `fix/dependencies-and-replace-xlsx` *(stacked)* | Merged into parent branch (`2026-10-28T10:48:34Z`) | `2266eae` (`cbae123`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | PR 4.5: `trust proxy = 1`, rate limiter hardening, 15s outbound `AbortSignal.timeout`, SSE `req.on("close")` stream abort, graceful `SIGTERM`/`SIGINT` shutdown, `memoryDecks` cap. |
| **#78** | `fix/remove-supabase-fallbacks-and-harden-proxy` | `fix/rate-limit-trust-proxy-and-reliability` *(stacked)* | Merged into parent branch (`2026-10-28T10:48:58Z`) | `152d7a0` (`2807e91`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | PR 4.6: Remove hardcoded Supabase URL/anon fallbacks (`F-07`) and harden `/api/supabase` proxy (`F-10`). |
| **#79** | `fix/credential-encryption-and-honest-byok-ui` | `fix/remove-supabase-fallbacks-and-harden-proxy` *(stacked)* | Merged into parent branch (`2026-10-28T10:56:38Z`) | `aeff13c` (`70368e5`) | `docgovinda-glitch` | **YES** *(via `#80` `cbf38da`)* | PR 4.7: AES-256-GCM cloud OAuth token encryption, stop server `api_credentials` writes, honest BYOK UI copy (`F-11`). |
| **#80** | `fix/credential-encryption-and-honest-byok-ui` | `main` | **MERGED & DEPLOYED** (`2026-10-29T04:58:43Z`) | `cbf38da` (`0d5b0df`) | `docgovinda-glitch` | **YES (LIVE)** | Consolidated `#73`–`#79` rebased on `206deb6` + reconciliation fixes: Cloudflare right-most hop CIDR IP verification (`rateLimit.ts`), `10 MB` hard upload ceiling (`uploadGuard.ts`), constant-path GoTrue timing on `/api/auth/login`, `REVOKE`-only Hotfix 2 SQL v2 *(SQL unapplied)*, `20261028010000_purge` v1 *(SQL unapplied)*, `COMPROMISE_CHECKS.md`, `USER_NOTICE.md`, `MERGE_PLAN.md`. |
| **#81** | `claude/jolly-mayer-k74uad` | `main` | **OPEN** (`2026-10-29T05:10:56Z`) | `a90623a` | — | **NO** | Feature PR by docgovinda-glitch / Claude: Slides & Keynotes Gamma-style card studio with native .pptx export (+ CI unblock). |
| **#82** | `fix/post-80-verification-login-purge-notices` | `main` | **OPEN** *(ready for review)* | Recorded on push | — | **NO** | Post-`#80` follow-up: `POST_DEPLOY_80.md`, `STATUS.md`, single-use Turnstile passthrough on `POST /api/auth/login` + `5 req / 5 min` per-IP cap + `Sb-Forwarded-For` + uniform GoTrue `429` handling (`server/routes/auth.ts`), fail-closed `LLM_CHALLENGE_SECRET` in production (`server/utils/llm.ts`), `/api/vault/cloud/connections` + `CredentialResetNotice` + `security_credential_reset_notices` (`F-11`), `journalExportService.ts:106` CI timer fix, `scripts/verify-local-supabase.sh`, reconciled `COMPROMISE_CHECKS.md` / `USER_NOTICE.md` / `MERGE_PLAN.md` (with 37-provider spend-cap table). |

---

## 3. Canonical Finding Table (`F-01`–`F-19`, Exact Match to `AUDIT.md:12-32`)

`AUDIT.md` has **19 canonical findings** (`F-01` through `F-19`) and has **never been renumbered** in git (`git log --oneline origin/main -- AUDIT.md`: `9d32796`, `8e7ee02`, `0d5b0df`).

| Canonical ID (`AUDIT.md`) | Severity | Title (`AUDIT.md:13-31`) | Current Live / Repo Status |
| :---: | :---: | :--- | :--- |
| **`F-01`** | **BLOCKER** | 7 live production secrets committed in git history (`28cfaa5:INFRASTRUCTURE_REFERENCE.md`, `01f851f:scripts/setup-infrastructure.md` on `2026-08-04`) | **Accepted risk — owner decision, rotation scheduled at project end (`ROTATION_RUNBOOK.md`)**; direct Postgres mitigated by **Supabase Network Restrictions = ON (`2026-10-29`)** |
| **`F-02`** | **BLOCKER** | 3 tables missing `ENABLE ROW LEVEL SECURITY` (`project_research_gaps`, `project_titles`, `project_journal_candidates`) | Migration `20261028000000_hotfix2` on `main` (`cbf38da`) — **NOT APPLIED (`UNVERIFIED` pending Section 3 Docker checks)** |
| **`F-03`** | **BLOCKER** | `project-files` Storage bucket policies allow anonymous full read/write/update/delete; `id-documents` public flag | App signed-URL endpoint live on `main` (`#72`/`#80`); SQL migration on `main` — **NOT APPLIED (`UNVERIFIED` pending Section 3 Docker checks)** |
| **`F-04`** | **BLOCKER** | `request-profile-update` Edge Function returns `verificationKey` in HTTP response when email delivery fails (`TICKET-SEC-01`) | SPA `TICKET-SEC-01` notice live on `main` (`cbf38da`); Edge Function `410 Gone` in `main` — **needs `supabase functions deploy request-profile-update`** |
| **`F-05`** | **BLOCKER** | Unauthenticated heavy file parsing (`POST /api/vault/parse-file`) + 50 MB upload limits can OOM-kill 512 MB Render container | **LIVE on `main` (`#71` `5a642a0` + `#80` `cbf38da` hard `10 MB` code ceiling)** |
| **`F-06`** | **BLOCKER** | Service-role project routes missing project ownership checks (`assignment/*`, `agentic/*`, `files`, `activity`, `parse-file`, `editor/*`, `critiques/:id/waive`) | **LIVE on `main` (`#71` `5a642a0`)** |
| **`F-07`** | **BLOCKER** | Hardcoded production Supabase URL & anon key fallbacks (`server/routes/supabaseProxy.ts`, `.github/workflows/deploy.yml`) | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-08`** | **HIGH** | `POST /api/ai/search`, `POST /api/ai/deep-research`, and `POST /api/ai/agent` lack `requireAuth`; `llmChallenge` signed with unverified `x-user-id` | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-09`** | **HIGH** | `rateLimit.ts` keys buckets by `${ip}:${User-Agent}` and `server.ts` lacks `app.set("trust proxy", 1)` | **LIVE on `main` (`#80` `cbf38da`: `trust proxy = 1` + right-most hop Cloudflare CIDR check)** |
| **`F-10`** | **HIGH** | `/api/supabase/*` reverse proxy mounted before rate limiter, forwards all subpaths, disables TLS verification (`rejectUnauthorized: false`) on WS | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-11`** | **HIGH** | Plaintext credentials stored in `api_credentials.encrypted_api_key` and `user_cloud_integrations` (`access_token`/`refresh_token`) | `encryptCloudToken` + stop server `api_credentials` writes **LIVE on `main` (`#80` `cbf38da`)**; `/api/vault/cloud/connections` + `CredentialResetNotice` in **PR `#81`**; purge SQL **`UNVERIFIED` pending Section 3 Docker checks** *(full cryptographic protection requires `F-01` rotation)* |
| **`F-12`** | **HIGH** | 52 `npm audit` vulnerabilities including `proxy-addr` (Critical), `xlsx` (High, unpatched), `multer`, `@tiptap/core`, `prosemirror-view` | **LIVE on `main` (`#80` `cbf38da`: `xlsx` replaced with `exceljs`, `0` vulnerabilities)** |
| **`F-13`** | **HIGH** | `LLM_CHALLENGE_SECRET` falls back to `SUPABASE_SERVICE_ROLE_KEY` / static string; `verifyLocalJwt` skips `role`/`aud` verification | JWT `role`/`aud` check + HMAC domain separation **LIVE on `main` (`#80` `cbf38da`)**; strict production refusal to fall back to `SUPABASE_SERVICE_ROLE_KEY` in **PR `#81`** |
| **`F-14`** | **HIGH** | 6 `SECURITY DEFINER` RPCs granted to `anon` (`email_for_username`, `email_for_phone_e164`, `email_for_identifier`, `check_*_available`) | Server login & availability endpoints **LIVE on `main` (`#72`/`#80`)** + Turnstile/rate-limit hardening in **PR `#81`**; `REVOKE`-only SQL **`UNVERIFIED` pending Section 3 Docker checks** |
| **`F-15`** | **MEDIUM** | Admin email configuration split across `MAIN_ADMIN_EMAIL`, `ADMIN_EMAIL`, and hardcoded SQL policies | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-16`** | **MEDIUM** | Double-prefixed route mount bug: `GET /api/projects/:id/compliance/api/projects/:id/journal-compliance-report` | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-17`** | **MEDIUM** | Outbound `fetch()` calls lack `AbortSignal.timeout()`, no `SIGTERM` handler, SSE lacks `req.on("close")` abort (`SYSTEM_MAP.md` `R-08`), `memoryDecks` unbounded | **LIVE on `main` (`#80` `cbf38da`)** |
| **`F-18`** | **MEDIUM** | Render Free (512 MB RAM, 15m spin-down) + Supabase Free (no backups, 7d pause) | **Owner decided**: Render stays on Free; Supabase upgraded to Pro + Network Restrictions ON + manual encrypted `pg_dump` before migrations |
| **`F-19`** | **MEDIUM** | Vitest loads local `.env` during test runs (`dotenv.config()`) and makes live network requests; Node 20/22 CI drift | **LIVE on `main` (`#80` `cbf38da`)** + `journalExportService.ts:106` async timer CI fix in **PR `#81`** |

---

## 4. Deliverables Ledger

| Deliverable Path | Last Commit on `origin/main` | Updated in PR `#81`? | Verification Status |
| :--- | :---: | :---: | :--- |
| [`SYSTEM_MAP.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/SYSTEM_MAP.md) | `0d5b0df` (merged in `cbf38da`) | No | Verified against repo (`R-08` cross-referenced with `F-17`) |
| [`SETUP.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/SETUP.md) | `9d32796` (merged in `5a642a0`) | No | Verified in Phase 1 clean build + Docker `/api/health` baseline |
| [`AUDIT.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/AUDIT.md) | `0d5b0df` (merged in `cbf38da`) | No | Canonical `F-01`–`F-19` ledger |
| [`PROD_CHECKS.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/PROD_CHECKS.md) | `0d5b0df` (merged in `cbf38da`) | Yes | Static column verification passed (`sqlRunbooksVerification.test.ts`); **live Postgres execution `UNVERIFIED` pending Docker** |
| [`COMPROMISE_CHECKS.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/COMPROMISE_CHECKS.md) | `0d5b0df` (merged in `cbf38da`) | Yes (exact file:line citations) | Static column verification passed (`sqlRunbooksVerification.test.ts`); **live Postgres execution `UNVERIFIED` pending Docker** |
| [`HOTFIX_DEPLOY.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/HOTFIX_DEPLOY.md) | `bd20086` (merged in `cbf38da`) | No | Verified via `hotfixContainment.test.ts` (60 tests) |
| [`HOTFIX2_DEPLOY.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/HOTFIX2_DEPLOY.md) | `0d5b0df` (merged in `cbf38da`) | Yes | App endpoints tested (`hotfix2Lockdown.test.ts`); **SQL migration `UNVERIFIED` pending Docker** |
| [`POST_DEPLOY_80.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/POST_DEPLOY_80.md) | *(New in PR `#81`)* | **Yes (New)** | Live HTTP & UI checks for PR `#80` (`cbf38da`); zero production DB queries |
| [`ROTATION_RUNBOOK.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/ROTATION_RUNBOOK.md) | `0d5b0df` (merged in `cbf38da`) | No | Scheduled at project end (`F-01` owner decision) |
| [`USER_NOTICE.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/USER_NOTICE.md) | `0d5b0df` (merged in `cbf38da`) | Yes (git-verified dates) | Every date & SHA verified against `git log --all`; draft ready for owner review |
| [`MERGE_PLAN.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/MERGE_PLAN.md) | `0d5b0df` (merged in `cbf38da`) | Yes (`#80` live + 37-provider caps) | Reflects `#80` live deploy, `MASTER_KEY` existing-value rule, and 37-provider spend-cap table |
| [`STATUS.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/STATUS.md) | *(New in PR `#81`)* | **Yes (New)** | Single source of truth ledger (Standing Rule 0) |
| [`scripts/verify-local-supabase.sh`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/verify-local-supabase.sh) | *(New in PR `#81`)* | **Yes (New)** | Automates Section 3 local Supabase verification (all 5 ordering workarounds + 4 checks) |
| [`supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql) | `0d5b0df` (merged in `cbf38da`) | No (`REVOKE`-only v2 on `main`) | **`UNVERIFIED AGAINST SUPABASE`** — do NOT apply until Section 3 Docker checks pass |
| [`supabase/migrations/20261028010000_purge_plaintext_credentials.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20261028010000_purge_plaintext_credentials.sql) | `0d5b0df` (merged in `cbf38da`) | Yes (`security_credential_reset_notices`) | **`UNVERIFIED AGAINST SUPABASE`** — do NOT apply until count-only `SELECT`, PR `#81` deploy, & Section 3 Docker checks pass |

---

## 5. Open Decisions & Blocking Prerequisites

1. **Confirm Live Render Deploy SHA & Run `POST_DEPLOY_80.md`**:
   - Confirm in **Render Dashboard → `scholar-agentic-os` (`srv-d9lgbn710e5c73dl8sk0`) → Events / Deploys** that the **`Live`** deploy badge shows `cbf38da` (or `0d5b0df`), and run `POST_DEPLOY_80.md` Checks 0–7.
   - Note: If both Render `CLOUDFLARE_TURNSTILE_SECRET_KEY` and Supabase Auth CAPTCHA are enabled simultaneously, `POST /api/auth/login` in `cbf38da` will burn the single-use Turnstile token before GoTrue validates it — merge PR `#81` immediately (after setting `LLM_CHALLENGE_SECRET` on Render) to eliminate that double-spend.
2. **Raise Supabase Auth Sign-In Rate Limit (`Authentication → Rate Limits`)**:
   - Raise **Rate limit for sign-ups and sign-ins** from default `30 / 5 min` to **`300 / 5 min`** on Supabase Pro (`MERGE_PLAN.md` & Section 5 calculation).
3. **Set `LLM_CHALLENGE_SECRET` on Render Before Merging PR `#81`**:
   - Generate a fresh secret (`openssl rand -hex 32`) and add `LLM_CHALLENGE_SECRET` in Render Dashboard → Environment (`MASTER_KEY` MUST stay on its **EXISTING** value).
4. **Deploy `request-profile-update` Edge Function (`F-04`)**:
   - Run `npx supabase functions deploy request-profile-update --project-ref gfjhsijrwodjvkisouzw` so direct HTTP calls return `HTTP 410 Gone` (`POST_DEPLOY_80.md` Check 6B).
5. **Local Docker / Colima Verification (Blocking Both SQL Migrations)**:
   - Inside the Antigravity sandbox, `brew install colima docker` hit `HTTP 403 Forbidden` from `forward.http.proxy:3128` when fetching `https://go.dev/dl/go1.24.13.darwin-amd64.tar.gz` (required because Homebrew dropped Intel `x86_64` bottles in September 2026).
   - Run `brew install colima docker libpq && ./scripts/verify-local-supabase.sh` in native macOS `Terminal.app` (outside the sandbox proxy) before applying `20261028000000_hotfix2` or `20261028010000_purge`.
