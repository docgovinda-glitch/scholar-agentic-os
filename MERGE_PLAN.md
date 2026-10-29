# Production Merge & Deployment Plan (`MERGE_PLAN.md`)

> [!IMPORTANT]
> **Why PRs #73–#79 Are Not Yet on `origin/main` (`206deb6`)**:
> - PRs **#71** (`a6fd892`) and **#72** (`206deb6`) had `base: main` and are **live on `origin/main`**.
> - PRs **#73–#79** were originally opened as a stacked chain (`#74 -> #73`, `#75 -> #74`, ..., `#79 -> #78`). When "Merge" was clicked on `#74`–`#79` in the GitHub UI, GitHub merged each child branch into its parent feature branch rather than into `main`.
> - Reconciled branch `fix/credential-encryption-and-honest-byok-ui` (rebased cleanly onto `origin/main` `206deb6`) has been opened as **PR #80** (`https://github.com/docgovinda-glitch/scholar-agentic-os/pull/80`) targeting `base: main`, containing all work from Steps 3–9 plus every Section 2 and Section 3 fix from this review round.

> [!WARNING]
> **Mandatory Dependency Chain (`PR #76 → PR #77 → Hotfix 2 / PR #73`)**:
> 1. **Hotfix 2 (`PR #73`)** moves login (`POST /api/auth/login`) and identifier availability checks (`POST /api/auth/check-availability`) to Express. Those endpoints **depend on `PR #77`'s hardened IP rate limiter** (`server/src/middleware/rateLimit.ts`) to prevent brute-force and account enumeration after `anon` RPC privileges are revoked.
> 2. **`PR #77`** enables `app.set("trust proxy", 1)` and parses `X-Forwarded-For` from the right-most untrusted hop with Cloudflare CIDR verification, which **depends on `PR #76`'s `proxy-addr` upgrade**.
> 3. Therefore, **`PR #76` and `PR #77` MUST land before or together with `Hotfix 2 (PR #73)`**.

---

## Summary Matrix of All Deployment Steps

| Step | PR / Branch | Base Branch | Rebase Status onto `origin/main` (`206deb6`) | Depends On | Required Env Vars before Merge | Prod Changes (App / DB / Edge Fn) |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **PR #71** (`hotfix/containment-authz-memory-ssrf`) | `main` | **Merged (`a6fd892`)** | None | `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `MAX_UPLOAD_MB=10` | Express App only |
| **2** | **PR #72** (`fix/ci-blocking-and-node22-alignment`) | `main` | **Merged (`206deb6`)** | Step 1 | GitHub Actions: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `RENDER_DEPLOY_KEY` (`DATABASE_URL` removed from `deploy.yml`) | CI/CD workflows + Vitest `.env` isolation |
| **3** | **PR #74** (`fix/containment-followup-clamp-and-ssrf-tests`) | `main` | **Rebased & Verified** | Step 1 | `MAX_UPLOAD_MB=10` (code clamps `Math.min(raw, 10)` even if env is `25`) | Express App (`uploadGuard.ts` hard 10 MB ceiling) + `HOTFIX_DEPLOY.md` |
| **4** | **PR #76** (`fix/dependency-audit-and-exceljs`) | `main` | **Rebased & Verified** | Step 2 | None | Express App (`package.json`, `package-lock.json`, `spreadsheetParser.ts` → `exceljs`) |
| **5** | **PR #77** (`fix/rate-limit-trust-proxy-and-memory-caps`) | `main` | **Rebased & Verified** | **Step 4 (`PR #76`)** | None | Express App (`server.ts` `trust proxy = 1`, `rateLimit.ts` right-most hop + Cloudflare CIDR check, `presentations.ts` `MAX_MEMORY_DECKS=100`) |
| **6** | **Hotfix 2 / PR #73** (`hotfix/db-storage-rpc-lockdown`) | `main` | **Rebased & Verified** *(SQL unverified against live Supabase — no local Docker)* | **Step 4 (`PR #76`) + Step 5 (`PR #77`)** | Render: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CLOUDFLARE_TURNSTILE_SECRET_KEY`<br>Edge Fn: `RESEND_API_KEY`, `ADMIN_EMAIL` | **1.** Express + SPA (`POST /api/auth/login`, `check-availability`, `signed-url`, `AccountSettingsScreen.tsx` notice)<br>**2.** SQL migration `20261028000000_hotfix2_db_storage_rpc_lockdown.sql`<br>**3.** Edge Fn `request-profile-update` (`410 Gone`) |
| **7** | **PR #75** (`fix/remove-supabase-fallbacks-and-harden-proxy`) | `main` | **Rebased & Verified** | Step 2 | **MANDATORY**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **must** be set in both Render Env and GitHub Actions Secrets (app & build now fail closed if missing) | Express App + Vite build (`env.ts`, `supabaseRest.ts`, `supabaseProxy.ts`, `deploy.yml`) |
| **8** | **PR #78** (`fix/ai-routes-auth-challenge-and-timeouts`) | `main` | **Rebased & Verified** | Step 5 | **MANDATORY**: Set `LLM_CHALLENGE_SECRET` (32-byte random hex/base64) and `MAIN_ADMIN_EMAIL` in Render Env | Express App (`ai.ts`, `llm.ts`, `auth.ts`, `requireAdmin.ts`, `server.ts` graceful shutdown, 15s outbound timeouts, SSE abort) |
| **9** | **PR #79** (`fix/credential-encryption-and-honest-byok-ui`) | `main` | **Rebased & Verified** | Step 6 | Render: `MASTER_KEY` (32-byte base64) | **1.** Express + SPA (`vault.ts` `encryptCloudToken`, removal of server-side BYOK writes, honest BYOK UI copy)<br>**2.** SQL migration `20261028010000_purge_plaintext_credentials.sql` |
| **10** | **Credential Rotation & History Scrub (`ROTATION_RUNBOOK.md`)** | `main` | Scheduled at Project End | Steps 1–9 | Fresh rotated values for all 7 leaked secrets (`ROTATION_RUNBOOK.md`) | Rotate all 7 credentials, re-wrap `platform_provider_credentials`, wipe `user_cloud_integrations`, run `git filter-repo` |

---

## Detailed Per-Step Execution, Verification & Rollback Guide

### Step 1 & Step 2 — PR #71 & PR #72 (Already Merged on `origin/main` at `206deb6`)
- **Status**: Merged into `main`.
- **Action Required Now**: Run the post-deploy checks in [`HOTFIX_DEPLOY.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/HOTFIX_DEPLOY.md) Section 2 against `https://scholar.gkshah.com.np`, and delete the unused `DATABASE_URL` secret from GitHub Actions (`gh secret delete DATABASE_URL -R docgovinda-glitch/scholar-agentic-os`).

---

### Step 3 — PR #74 (`fix/containment-followup-clamp-and-ssrf-tests`)
- **Base Branch**: `main` | **Rebase Status**: Clean on `206deb6`.
- **Prod Changes**:
  - Updates [`server/src/middleware/uploadGuard.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/uploadGuard.ts) so `HARD_MAX_UPLOAD_MB_CEILING = 10` (`Math.min(raw, 10)`). Even if `MAX_UPLOAD_MB=25` is set in Render's environment, uploads above `10 MB` are rejected with HTTP `413`.
  - Adds SSRF depth tests (IPv4-mapped IPv6 `::ffff:127.0.0.1`, octal `0177.0.0.1`, hex `0x7f000001`, decimal `2130706433`, redirect hop to loopback, redirect loop cap) and updates `HOTFIX_DEPLOY.md`.
- **Required Env Vars**: `MAX_UPLOAD_MB=10` (recommended in Render Dashboard, enforced in code regardless).
- **Post-Deploy Checks**:
  - Run `HOTFIX_DEPLOY.md` Check 4 (11 MB upload → `413` with `"maxUploadMb": 10`), Check 5 (SSRF → `400`), and Check 6b (real 1-page PDF → `200`).
- **Rollback Step**: Render Dashboard 1-click rollback to `206deb6` (stateless, zero DB changes).

---

### Step 4 — PR #76 (`fix/dependency-audit-and-exceljs`)
- **Base Branch**: `main` | **Rebase Status**: Clean on `206deb6`.
- **Explicit Dependency**: Must land before **Step 5 (`PR #77`)**.
- **Prod Changes**:
  - Patches `proxy-addr`, `multer`, `body-parser`, `undici`, `@tiptap/*`, `prosemirror-view`, `@xmldom/xmldom`, and `zod`.
  - Replaces vulnerable `xlsx` package with `exceljs` in [`src/document_intelligence/parser/parsers/spreadsheetParser.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/document_intelligence/parser/parsers/spreadsheetParser.ts).
- **Required Env Vars**: None.
- **Post-Deploy Checks**:
  - `curl -sS https://scholar.gkshah.com.np/api/health` → `200 OK`.
  - Upload a valid `.xlsx` and `.csv` file via `/api/vault/parse-file` with `Authorization: Bearer ${ALICE_TOKEN}` → `200 OK`.
- **Rollback Step**: Render Dashboard 1-click rollback to previous deploy (stateless, zero DB changes).

---

### Step 5 — PR #77 (`fix/rate-limit-trust-proxy-and-memory-caps`)
- **Base Branch**: `main` | **Rebase Status**: Clean on `206deb6`.
- **Explicit Dependency**: Depends on **Step 4 (`PR #76`)** (`proxy-addr` upgrade) and is a **mandatory prerequisite for Step 6 (`Hotfix 2 / PR #73`)**.
- **Prod Changes**:
  - Sets `app.set("trust proxy", 1)` in `server.ts`.
  - Updates `getBaseIp(req)` in [`server/src/middleware/rateLimit.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/rateLimit.ts#L143-L195) to inspect `X-Forwarded-For` from the **right-most hop** appended by Render, trusting `CF-Connecting-IP` (or `hops[hops.length - 2]`) **only** when the peer connecting to Render is verified to be within Cloudflare's published IPv4/IPv6 CIDR ranges (`isCloudflareIp`).
  - Removes `User-Agent` from rate-limit bucket keys, caps `store` at `10,000` entries with `.unref()` on cleanup interval, and caps `memoryDecks` in `presentations.ts` at `100` entries.
- **Required Env Vars**: None.
- **Post-Deploy Checks**:
  ```bash
  # Send 6 rapid unauthenticated requests to /api/auth/verify-signup with rotating User-Agent and spoofed X-Forwarded-For:
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21; do
    curl -sS -o /dev/null -w "Attempt $i -> %{http_code}\n" \
      -X POST "https://scholar.gkshah.com.np/api/auth/verify-signup" \
      -H "User-Agent: RotateBot/$i" \
      -H "X-Forwarded-For: 203.0.113.$i" \
      -H "Content-Type: application/json" \
      -d '{}'
  done
  # Expected: Attempts 1..20 return 400; Attempt 21 returns 429 Too Many Requests.
  ```
- **Rollback Step**: Render Dashboard 1-click rollback to Step 4 deploy (stateless, zero DB changes).

---

### Step 6 — Hotfix 2 / PR #73 (`hotfix/db-storage-rpc-lockdown`)
- **Base Branch**: `main` | **Rebase Status**: Clean on `206deb6`.
- **Verification Caveat**: Marked **`UNVERIFIED AGAINST SUPABASE`** because Docker/Colima are not installed locally (`supabase start` could not be run). Verified via schema/column tests (`sqlRunbooksVerification.test.ts`) and Express/client unit tests (`hotfix2Lockdown.test.ts`).
- **Explicit Dependency**: Requires **Step 4 (`PR #76`)** and **Step 5 (`PR #77`)** to be live first.
- **Prod Changes (Strict 3-Substep Order from `HOTFIX2_DEPLOY.md`)**:
  1. **6a — Deploy Express + SPA on Render First**: Adds `POST /api/auth/login` (identical `401` error message + constant-path GoTrue timing), `POST /api/auth/check-availability`, `GET /api/projects/:id/files/:fileId/signed-url`, and the `TICKET-SEC-01` notice in `AccountSettingsScreen.tsx`.
  2. **6b — Take Encrypted `pg_dump` Backup & Apply SQL Migration in Supabase SQL Editor**: Run [`supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql) (enables RLS on `project_research_gaps`, `project_titles`, `project_journal_candidates`; sets all storage buckets `public = false`; drops `project_files_*` policies while keeping `id_documents_*_own` policies; revokes `PUBLIC, anon, authenticated` `EXECUTE` on the 6 account RPCs + `submit_id_document` with **zero** `CREATE OR REPLACE FUNCTION`).
  3. **6c — Redeploy `request-profile-update` Edge Function**:
     ```bash
     npx supabase functions deploy request-profile-update --project-ref gfjhsijrwodjvkisouzw
     ```
     (Returns `HTTP 410 Gone` with `code: "PROFILE_UPDATE_DISABLED"` and never generates or returns `verificationKey`.)
- **Required Env Vars**:
  - Render: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `CLOUDFLARE_TURNSTILE_SECRET_KEY`.
  - Supabase Edge Functions: `RESEND_API_KEY`, `ADMIN_EMAIL`.
- **Post-Deploy Checks**:
  1. Run all 4 verification `SELECT` queries in [`HOTFIX2_DEPLOY.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/HOTFIX2_DEPLOY.md) Section 5.
  2. Confirm direct `anon` RPC call is rejected with `401`/`403`:
     ```bash
     curl -sS -i -X POST "https://gfjhsijrwodjvkisouzw.supabase.co/rest/v1/rpc/email_for_username" \
       -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
       -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
       -H "Content-Type: application/json" \
       -d '{"lookup_username":"admin"}'
     # Expected: HTTP 401/403 permission denied for function email_for_username
     ```
  3. Confirm `POST https://scholar.gkshah.com.np/api/auth/login` signs in a valid test account (`200 OK`) and returns identical `401` responses for unknown username vs. wrong password without leaking the resolved email.
  4. Confirm `request-profile-update` returns `HTTP 410 Gone`.
- **Rollback Step**:
  - If rolling back the Render app to Step 5, **first** run the Emergency Rollback SQL in `HOTFIX2_DEPLOY.md` Section 7 (`GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;`) so browser login RPCs do not fail. (**Warning**: running that rollback SQL re-opens `F-14` PII enumeration.)

---

### Step 7 — PR #75 (`fix/remove-supabase-fallbacks-and-harden-proxy`)
- **Base Branch**: `main` | **Rebase Status**: Clean on `206deb6`.
- **Prod Changes**:
  - Removes hardcoded `https://gfjhsijrwodjvkisouzw.supabase.co` URL and `eyJ...` anon key fallbacks from `src/config/env.ts`, `server/src/supabaseRest.ts`, `server/routes/supabaseProxy.ts`, and `.github/workflows/deploy.yml`.
  - Enforces subpath allowlist (`/auth/v1`, `/rest/v1`, `/storage/v1`, `/realtime/v1`, `/functions/v1`), IP rate limiting, and `rejectUnauthorized: true` TLS verification in `server/routes/supabaseProxy.ts`.
- **Required Env Vars**:
  - **Render Environment**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **MUST** be set (passed as Docker build args and runtime env vars).
  - **GitHub Actions Secrets**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` **MUST** be set (`gh secret list -R docgovinda-glitch/scholar-agentic-os`).
- **Post-Deploy Checks**:
  - `curl -sS -o /dev/null -w "%{http_code}\n" "https://scholar.gkshah.com.np/api/supabase/admin/v1/Forbidden"` → `403 Forbidden`.
  - Load `https://scholar.gkshah.com.np` in browser and verify frontend initializes without missing-env error.
- **Rollback Step**: Render Dashboard 1-click rollback to Step 6 deploy (stateless, zero DB changes).

---

### Step 8 — PR #78 (`fix/ai-routes-auth-challenge-and-timeouts`)
- **Base Branch**: `main` | **Rebase Status**: Clean on `206deb6`.
- **Prod Changes**:
  - Mounts `requireAuth` on `POST /api/ai/search`, `POST /api/ai/deep-research`, and `POST /api/ai/agent`, and binds `makeChallengeToken` strictly to `req.user.id` (ignoring `x-user-id` header).
  - Requires dedicated `LLM_CHALLENGE_SECRET` in production (domain-separated from `SUPABASE_SERVICE_ROLE_KEY`).
  - Fixes double-prefixed `/api/projects/:id/journal-compliance-report` route (`F-16`).
  - Aligns `MAIN_ADMIN_EMAIL` and `ADMIN_EMAIL` across `requireAdmin.ts`, `render.yaml`, and `.env.example` (`F-15`).
  - Adds `AbortSignal.timeout(15_000)` to outbound `fetch()` calls, `SIGTERM`/`SIGINT` graceful shutdown in `server.ts`, and `req.on("close")` SSE stream abort in `draftRoutes.ts` (`F-17`).
- **Required Env Vars**:
  - **Render Environment**: Set `LLM_CHALLENGE_SECRET` (`openssl rand -base64 32`) and confirm `MAIN_ADMIN_EMAIL` (or `ADMIN_EMAIL`) is set before merging.
- **Post-Deploy Checks**:
  - `curl -sS -o /dev/null -w "%{http_code}\n" -X POST "https://scholar.gkshah.com.np/api/ai/search" -H "Content-Type: application/json" -d '{"query":"test"}'` → `401 Unauthorized`.
  - `curl -sS -o /dev/null -w "%{http_code}\n" -X POST "https://scholar.gkshah.com.np/api/ai/agent" -H "Content-Type: application/json" -d '{}'` → `401 Unauthorized`.
  - Authenticated `POST /api/ai/agent` followed by `POST /api/ai/generate` with the returned `challengeToken` → `200 OK`.
- **Rollback Step**: Render Dashboard 1-click rollback to Step 7 deploy (stateless, zero DB changes).

---

### Step 9 — PR #79 (`fix/credential-encryption-and-honest-byok-ui`)
- **Base Branch**: `main` | **Rebase Status**: Clean on `206deb6`.
- **Important Security Caveat (`F-01` Dependency)**:
  - `encryptCloudToken` in [`server/routes/vault.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/vault.ts#L13-L37) derives its AES-256-GCM key from `MASTER_KEY` / `CREDENTIAL_MASTER_KEY` (falling back to an HMAC of `SUPABASE_SERVICE_ROLE_KEY`). Because both `MASTER_KEY`/`ENCRYPTION_KEY` and `SUPABASE_SERVICE_ROLE_KEY` were leaked in `F-01`, **encryption at rest only provides real protection against an external attacker after Step 10 (`ROTATION_RUNBOOK.md`) rotates those keys**.
- **Prod Changes**:
  1. **9a — Deploy Express + SPA on Render**:
     - Removes all server-side reads/writes to `public.api_credentials` (`storeProviderKey` / `forgetProviderKey` in `supabaseAuthService.ts` become local no-ops; BYOK keys remain purely in browser `sessionStorage`/`localStorage`).
     - Updates UI disclosures in `AiSettingsPanel.tsx` and `UserProfileGate.tsx` to state honestly that personal BYOK keys stay in browser storage for the session and are transmitted over HTTPS to the Scholar Core backend on each AI request to relay the call to the upstream provider.
     - Encrypts Google Drive, OneDrive, Zotero, and Mendeley OAuth tokens in `public.user_cloud_integrations` via `encryptCloudToken` (`enc:v1:...`) and strips `access_token`/`refresh_token` from `GET /api/vault/cloud/connections`.
  2. **9b — Apply SQL Migration in Supabase SQL Editor**:
     - Run [`supabase/migrations/20261028010000_purge_plaintext_credentials.sql`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/migrations/20261028010000_purge_plaintext_credentials.sql) to delete all existing plaintext rows in `public.api_credentials` and `public.user_cloud_integrations` and drop direct client policies on `public.user_cloud_integrations`, forcing users to reconnect cloud integrations cleanly.
- **Required Env Vars**:
  - Render: `MASTER_KEY` (32-byte base64 key).
- **Post-Deploy Checks**:
  - Run `PROD_CHECKS.md` Check `2.3` in Supabase SQL Editor and confirm `has_unencrypted_plaintext_rows = false` for both `api_credentials` and `user_cloud_integrations`.
- **Rollback Step**: Render Dashboard 1-click rollback to Step 8 deploy (`decryptCloudToken` is backward-compatible; purged plaintext tokens require user reconnection either way).

---

### Step 10 — End-of-Project Credential Rotation & Git History Scrub (`ROTATION_RUNBOOK.md`)
- **When**: At project end per owner decision on `F-01`.
- **Procedure**: Follow [`ROTATION_RUNBOOK.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/ROTATION_RUNBOOK.md) Steps 1–6 and Section 5 (`git filter-repo`), then send [`USER_NOTICE.md`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/USER_NOTICE.md) once the Pre-Send Verification Checklist in `USER_NOTICE.md` is 100% green.

