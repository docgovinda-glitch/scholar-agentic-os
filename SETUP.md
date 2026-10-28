# SETUP.md — Local Development, Clean Build & Baseline Verification

> [!IMPORTANT]
> **Phase 1 Deliverable.** Reproducible local setup and empirical baseline metrics recorded on **Node.js `v22.14.0`** (`npm 10.9.2`, matching `Dockerfile`'s `node:22-alpine`) from a clean clone using only `.env.example` pointed at a throwaway local endpoint (`http://127.0.0.1:54321`).

---

## 1. Prerequisites

| Requirement | Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | **`22.x` LTS** (verified on `v22.14.0`) | **Required.** Matches `Dockerfile` (`node:22-alpine`) and `@types/node: ^22.14.0`. Do **not** use Node 20 (lacks global `WebSocket` required by `@supabase/supabase-js` RealtimeClient). |
| **npm** | `10.x+` (ships with Node 22) | Uses lockfile-exact `npm ci`. |
| **Docker** *(for container builds)* | Docker Engine / Desktop / OrbStack / Colima | *Note*: Not installed on the current macOS workstation (`Darwin x86_64 24.6.0`); container verification commands are provided below. |
| **Supabase** *(optional for local dev)* | Local Supabase CLI (`http://127.0.0.1:54321`) or throwaway project | If omitted in `development` mode, the server falls back to an atomic local JSON store at `data/.scholar_local_store.json`. In `production` mode (`NODE_ENV=production`), `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or `DATABASE_URL`) are required or the server fails fast at startup. |

---

## 2. One-Command Local Setup & Verification

Run the following block from a clean terminal using Node 22:

```bash
# 1. Clone and enter repository
git clone https://github.com/docgovinda-glitch/scholar-agentic-os.git
cd scholar-agentic-os

# 2. Create .env from .env.example pointing to a local/throwaway Supabase URL (never production)
#    IMPORTANT: Clear VITE_CAPTCHA_SITE_KEY="" for local dev/tests; .env.example sets a non-empty
#    placeholder ("YOUR_CLOUDFLARE_TURNSTILE_SITE_KEY") which enables Turnstile enforcement and
#    causes 19 signup unit tests to fail if left populated.
cp .env.example .env && \
  sed -i.bak \
    -e 's|https://YOUR_PROJECT_REF.supabase.co|http://127.0.0.1:54321|g' \
    -e 's|YOUR_ANON_KEY|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.throwaway-local-anon|g' \
    -e 's|YOUR_SERVICE_ROLE_KEY|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.throwaway-local-service-role|g' \
    -e 's|VITE_CAPTCHA_SITE_KEY="YOUR_CLOUDFLARE_TURNSTILE_SITE_KEY"|VITE_CAPTCHA_SITE_KEY=""|g' \
    .env && rm -f .env.bak

# 3. Clean install, lint (tsc + contrast + CSP hash), test, and build production bundles
npm ci && npm run lint && npm test && npm run build

# 4. Start the production bundle locally and verify /api/health
NODE_ENV=production PORT=3000 npm start
```

For interactive development with Vite HMR on `http://localhost:3000`:
```bash
npm run dev
```

---

## 3. Manual Steps Required (Gotchas Discovered in Phase 1)

1. **`.env.example` Placeholder Trap (`VITE_CAPTCHA_SITE_KEY`)**:
   - `.env.example` line 72 sets `VITE_CAPTCHA_SITE_KEY="YOUR_CLOUDFLARE_TURNSTILE_SITE_KEY"`.
   - `getCaptchaConfig()` in [`src/services/captchaService.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/captchaService.ts#L18-L26) checks `enabled: Boolean(siteKey)`. Any non-empty string enables CAPTCHA enforcement in `signUp()`, causing 19 unit tests across 3 test files to fail with `"Please complete the CAPTCHA challenge before creating your account."` when `.env` is present.
   - **Manual step**: Set `VITE_CAPTCHA_SITE_KEY=""` in `.env` for local development and test runs.
2. **Production Mode Fail-Fast Guard**:
   - Running `NODE_ENV=production node dist/server.cjs` without `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or `DATABASE_URL`) intentionally throws `[FATAL: Durable Persistence Required]` on the first store access ([`src/services/store/projectStore.ts:149-155`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/store/projectStore.ts#L149-L155)).
3. **Database Schema Initialization (When Using a Fresh/Throwaway Supabase Project)**:
   - There is no single unified bootstrap command in `package.json`. For a fresh Supabase instance, you must apply the base schemas (`supabase/schema.sql`, `supabase/schema_store.sql`, `supabase/schema_ai_engine.sql`, `supabase/schema_user_settings.sql`), push `supabase/migrations/*.sql`, run `npx tsx scripts/create_bucket.ts` (creates private `project-files` bucket), and run `npm run seed:ai-registry` (seeds `ai_providers` and `ai_models`).
4. **Docker Build Args for Vite**:
   - Because Vite inlines `VITE_*` variables at build time, `docker build` requires `--build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=...` (see [`Dockerfile:31-36`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/Dockerfile#L31-L36)).

```bash
# Docker build & run (when Docker daemon is installed):
docker build \
  --build-arg VITE_SUPABASE_URL="http://127.0.0.1:54321" \
  --build-arg VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.throwaway-local-anon" \
  --build-arg VITE_CAPTCHA_SITE_KEY="" \
  -t scholar-agentic-os:local .

docker run --rm -p 3000:3000 --env-file .env scholar-agentic-os:local
```

---

## 4. Environment Variables Inventory (Documented & Undocumented)

### 4.1 Undocumented Environment Variables (Present in Code / `render.yaml`, Missing from `.env.example`)

| Variable | Referenced In | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `PORT` | [`server.ts:39`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L39), [`render.yaml:46`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L46) | `3000` | TCP port the Express HTTP/WS server binds to (`0.0.0.0:$PORT`). |
| `NODE_ENV` | [`server.ts:96,340,451`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L96), [`projectStore.ts:132,149`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/store/projectStore.ts#L132) | `development` (unset) | Controls Helmet CSP (`production` only), static `dist/` serving vs. Vite dev middleware, and fail-fast durable storage enforcement. |
| `MAX_UPLOAD_MB` | [`server.ts:255`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server.ts#L255), [`render.yaml:53`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L53) | `25` | Maximum request body size (MB) for `express.json()` and `express.urlencoded()`. *(Note: Multer instances in `vault.ts`, `files.ts`, and `assignment/helpers.ts` currently hardcode 30 MB / 50 MB instead of reading this var).* |
| `SUPABASE_URL` | [`auth.ts:40`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/auth.ts#L40), [`supabaseRest.ts:38`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/supabaseRest.ts#L38), [`assignment/helpers.ts:82`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/project/assignment/helpers.ts#L82), [`adminClient.ts:10`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/_shared/adminClient.ts#L10) | Falls back to `VITE_SUPABASE_URL` | Server-side / Edge Function Supabase project URL. Note inconsistent precedence: `supabaseRest.ts` prefers `SUPABASE_URL || VITE_SUPABASE_URL`, while `auth.ts` prefers `VITE_SUPABASE_URL || SUPABASE_URL`, and `projectStore.ts` only checks `VITE_SUPABASE_URL`. |
| `SUPABASE_TARGET_URL` | [`supabaseProxy.ts:14`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/routes/supabaseProxy.ts#L14) | Falls back to `VITE_SUPABASE_URL` | Explicit upstream URL for `/api/supabase/*` reverse proxy when `VITE_SUPABASE_URL` is set to a relative proxy URL. |
| `SUPABASE_JWT_SECRET` | [`auth.ts:155`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/middleware/auth.ts#L155), [`llm.ts:34`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/utils/llm.ts#L34) | Unset | When set, `auth.ts` verifies HS256 Supabase JWTs locally via HMAC (`verifyLocalJwt`) instead of making an HTTP call to GoTrue `/auth/v1/user`. Also used as a fallback secret for `LLM_CHALLENGE_SECRET`. |
| `LLM_CHALLENGE_SECRET` | [`llm.ts:32`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/utils/llm.ts#L32) | Falls back to `SUPABASE_SERVICE_ROLE_KEY` -> `SUPABASE_JWT_SECRET` -> hardcoded string | HMAC-SHA256 secret used to sign/verify HTTP 426 Warden consent challenge tokens (`x-llm-challenge-token`). |
| `ENABLE_SERVER_AI` | [`llm.ts:189`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/utils/llm.ts#L189) | Enabled unless `"false"` | When set to `"false"`, disables server-side AI execution in `llm.ts`. |
| `OPENALEX_MAILTO` | [`discovery.ts:142`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/discovery/discovery.ts#L142), [`liveSearch.ts:122`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/server/src/discovery/liveSearch.ts#L122) | Unset | Contact email appended (`?mailto=...`) to server-side OpenAlex API requests for polite-pool rate limits. |
| `ADMIN_EMAIL` | [`render.yaml:59`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/render.yaml#L59), [`adminClient.ts:19`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/supabase/functions/_shared/adminClient.ts#L19) | `""` | Recipient email for `request-profile-update` Edge Function notifications. **Note discrepancy**: `render.yaml` declares `ADMIN_EMAIL` while `requireAdmin.ts` and `.env.example` read `MAIN_ADMIN_EMAIL`! |
| `SUPABASE_DB_URL` | [`scripts/apply-*.ts`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/apply-citation-migration.ts#L8), [`scripts/reset-all-vaults.ts:54`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/scripts/reset-all-vaults.ts#L54) | Unset | Alternative env var name for `DATABASE_URL` in CLI migration/reset scripts. |
| `DISABLE_HMR` | [`vite.config.ts:20-22`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/vite.config.ts#L20-L22) | Unset | When `"true"`, disables Vite HMR and file watching. |
| `USE_REAL_STORE_IN_TESTS` | [`projectStore.ts:132`](file:///Users/pobpkf/Documents/Scholar%20Core/scholar-agentic-os/src/services/store/projectStore.ts#L132) | Unset | Forces `projectStore.ts` to resolve Supabase REST / Postgres store during `NODE_ENV=test`. |

### 4.2 Documented Environment Variables (Present in `.env.example`)
- **Supabase & Persistence**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.
- **Security & Auth**: `VITE_CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`, `MASTER_KEY`, `ENCRYPTION_KEY`, `MAIN_ADMIN_EMAIL`.
- **AI & Search**: `GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP`, `AI_GATEWAY_PHASE_ENDPOINTS`, `AI_GATEWAY_GENERAL_PROXY`, `VITE_OPENALEX_API_KEY`, `TAVILY_API_KEY`.
- **Email & Branding**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`, `VITE_APP_NAME`, `VITE_API_BASE_URL`.

---

## 5. Phase 1 Baseline Metrics (Recorded on Node `v22.14.0`)

### 5.1 Build & Verification Timings

| Step | Command | Wall Time | Result |
| :--- | :--- | :--- | :--- |
| **Clean Dependency Install** | `npm ci` | `18.06s` | `0` exit — 787 packages added (`npm audit` reported 52 vulnerabilities: 1 critical, 14 high, 32 moderate, 5 low). |
| **Lint, Typecheck & Security Hash** | `npm run lint` (`tsc --noEmit && verify-contrast.mjs && verify-csp-hash.mjs`) | `24.64s` | `0` exit — TypeScript clean, Light/Dark contrast ratios passed, `INLINE_THEME_SCRIPT_CSP_HASH` verified. |
| **Production Build** | `npm run build` (`vite build` + `esbuild server.ts`) | `11.78s` (`vite`: `9.31s`, `esbuild`: `~2.47s`) | `0` exit — 2,468 modules transformed into `dist/`. |
| **Test Suite (`.env.example` verbatim)** | `npx vitest run` (with `VITE_CAPTCHA_SITE_KEY="YOUR_..."`) | `108.92s` | **339 test files passed, 3 failed** (`3,422 passed`, `19 failed`, `0 skipped` out of `3,441` tests). |
| **Test Suite (`VITE_CAPTCHA_SITE_KEY=""`)** | `npx vitest run` | `~105s` | **342 test files passed, 0 failed** (`3,441 passed`, `0 failed`, `0 skipped` out of `3,441` tests). |

### 5.2 Production Bundle Sizes (`dist/`)
- **Total `dist/` directory**: `12.0 MB`
- **Server bundle**:
  - `dist/server.cjs`: `1.8 MB`
  - `dist/server.cjs.map`: `3.6 MB`
- **Frontend assets (`dist/assets/`, `6.2 MB` total uncompressed across 74 chunks, all `<500 kB`)**:
  - Largest JS chunks:
    - `PresentationWorkspace-BMbAjmpG.js`: `430.13 kB` (`103.88 kB` gzip)
    - `xlsx-CkFp8p6R.js`: `429.53 kB` (`143.08 kB` gzip)
    - `assignment-services-CwhXa519.js`: `406.95 kB` (`116.03 kB` gzip)
    - `tiptap-jS-8loa5.js`: `381.92 kB` (`122.15 kB` gzip)
    - `mammoth-deps-Gy4lIAvx.js`: `381.30 kB` (`88.46 kB` gzip)
    - `docx-DO3WKAAc.js`: `352.70 kB` (`101.56 kB` gzip)
    - `AssignmentWorkspace-ZnXvkPvb.js`: `334.74 kB` (`91.76 kB` gzip)
    - `ResearchWorkspace-BvQKY2OH.js`: `251.85 kB` (`61.42 kB` gzip)
    - `react-q9wl7I2y.js`: `251.07 kB` (`79.99 kB` gzip)
    - `index-CVyjfrTP.js`: `248.85 kB` (`70.63 kB` gzip)
    - `supabase-kPbh7bwL.js`: `215.54 kB` (`55.86 kB` gzip)
    - `KnowledgeVault-CBQ4nT5S.js`: `206.34 kB` (`42.03 kB` gzip)
  - Main CSS bundle:
    - `index-CpnOzE5z.css`: `345.24 kB` (`40.30 kB` gzip)

### 5.3 List of Failing / Skipped Tests
- **Skipped tests**: **0** across the entire 3,441-test suite.
- **Failing tests when `.env` is copied verbatim from `.env.example` (19 tests across 3 files, all caused by `VITE_CAPTCHA_SITE_KEY="YOUR_CLOUDFLARE_TURNSTILE_SITE_KEY"` enabling Turnstile in test env; all 19 pass when `VITE_CAPTCHA_SITE_KEY=""`)**:
  1. `src/services/__tests__/supabaseAuthService.test.ts > signUp > creates the auth user with automatic account activation`
  2. `src/services/__tests__/supabaseAuthService.test.ts > signUp > never sends authentic_id — institutional ID was removed completely`
  3. `src/services/__tests__/supabaseAuthService.test.ts > signUp > sends the confirmation link to the app's own /verify-email route`
  4. `src/services/__tests__/supabaseAuthService.test.ts > signUp > allows affiliation to be sent as an empty string — Institution is optional`
  5. `src/services/__tests__/supabaseAuthService.test.ts > signUp > surfaces a Supabase Auth error`
  6. `src/services/__tests__/supabaseAuthService.test.ts > signUp > treats Supabase's obfuscated fake-user response (empty identities) as an already-registered email, not a fresh signup`
  7. `src/services/__tests__/supabaseAuthService.test.ts > signUp > treats a non-empty identities array as a genuine new signup`
  8. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > keeps submit disabled until all required fields are valid`
  9. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > allows submission with Institution left blank — it is optional`
  10. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > re-checks availability once more at submit time as a defense against a check that never ran`
  11. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > shows a confirmation that the account was created`
  12. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > passes the structured phone and role fields through to signUp`
  13. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > accepts scholar@gmail.com — no Gmail-only or provider-specific restriction`
  14. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > accepts scholar@yahoo.com — no Gmail-only or provider-specific restriction`
  15. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > accepts scholar@outlook.com — no Gmail-only or provider-specific restriction`
  16. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > accepts scholar@protonmail.com — no Gmail-only or provider-specific restriction`
  17. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > accepts scholar@tribhuvan.edu.np — no Gmail-only or provider-specific restriction`
  18. `src/desk/__tests__/DeskAuthGate.test.tsx > registration > accepts scholar@my-research-lab.org — no Gmail-only or provider-specific restriction`
  19. `src/services/__tests__/selfServiceAuthConflict6.test.ts > Conflict #6 — Access Control & Registration (Direct Supabase Auth vs. Approval Queue) > 1. Self-service registration passes profile data directly to Supabase Auth without approval gate`

### 5.4 Runtime Health & Empirical Memory Profile (`NODE_ENV=production node dist/server.cjs` on Node `v22.14.0`)

- **Health Check Response (`GET /api/health`)**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-10-28T06:39:10.710Z",
    "persistenceMode": "supabase-rest",
    "persistenceDurable": true
  }
  ```
- **Memory Profile (25 MB / 23.84 MiB PDF Upload to `POST /api/vault/parse-file`)**:
  - **Idle RSS (after boot)**: `125,680 KB` (**`122.73 MiB`**)
  - **Peak RSS during 25 MB PDF upload & `pdf-parse` extraction**: `514,376 KB` (**`502.32 MiB`**)
  - **Post-upload RSS (300ms after response)**: `510,640 KB` (**`498.67 MiB`**)
  - **Peak Delta over Idle**: **`+379.59 MiB`** (`15.9x` file size expansion in RSS across Multer buffer + `pdfjs-dist` worker heap + extracted string copies)
  - **Upload Parse Latency**: `9,046 ms` (extracted `22,915,743` characters, HTTP `200`)
  - **Critical Observation vs. 512 MiB Render Free Plan**: A single 25 MB text-heavy PDF upload reaches **`502.32 MiB` RSS**, leaving less than **`10 MiB`** of headroom below Render's 512 MiB OOM kill limit.

