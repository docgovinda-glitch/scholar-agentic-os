# Setup

How to run Scholar Core locally and what each environment variable does. Commands and conventions are in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md); deployment is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Secrets are always referred to by name here; never commit or print values.

## 1. Prerequisites

| Requirement | Version | Notes |
| :--- | :--- | :--- |
| Node.js | 22.x | Matches the Dockerfile (`node:22-alpine`), CI and `@types/node` ^22. Node 20 has no global `WebSocket` |
| npm | 10+ | Use `npm ci` |
| Supabase | A project or the local Supabase CLI | Required for sign-in and durable projects. Without it, a non-production server uses an on-disk store (`data/.scholar_local_store.json`) |
| Docker | Optional | Only for container builds |

## 2. First run

```bash
git clone https://github.com/docgovinda-glitch/scholar-agentic-os.git
cd scholar-agentic-os
npm ci
cp .env.example .env
# edit .env: Supabase values at minimum; leave VITE_CAPTCHA_SITE_KEY empty for local work
npm run dev            # http://localhost:3000 (Express + Vite HMR)
```

To exercise the production bundle locally: `npm run build && NODE_ENV=production PORT=3000 npm start` (production mode needs `VITE_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY`, or `DATABASE_URL`, otherwise the server throws "Durable Persistence Required" at start). Check `GET /api/health`.

## 3. Things that trip people up

1. **CAPTCHA placeholder**: `.env.example` sets `VITE_CAPTCHA_SITE_KEY` to a non-empty placeholder, which enables Turnstile and breaks the sign-up tests. Set it to an empty string locally.
2. **Database schema**: there is no single bootstrap command. For a fresh local or throwaway Supabase, run `scripts/db/replay-migrations.sh "<postgres url>"`: it applies `supabase/schema.sql`, `schema_ai_engine.sql`, `schema_store.sql`, `schema_user_settings.sql`, then every migration in order. It refuses hosted Supabase URLs. A local project needs `psql`.
3. **`VITE_*` are build-time**: changing one needs a rebuild (`npm run dev` restart, or a new Docker build). Docker builds need `--build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... --build-arg VITE_CAPTCHA_SITE_KEY=...`.
4. **Local AI models**: a deployed server cannot reach a model on your machine. A local server can (development default), or set `ALLOW_SERVER_LOCAL_AI=true`. Otherwise local models run from the browser.
5. **Some tests need real credentials or network** and fail without them (`authIntegration`, `liveNetworkDiagnostics`, `productionFinalAcceptance`, `AddSourceModal`, `selfServiceAuthConflict6`).
6. **Upload size**: `MAX_UPLOAD_MB` defaults to 10 and is clamped to 10.

## 4. Environment variables

Names the code reads, grouped by purpose. "Server" variables are read by `server.ts` and `server/`; "Client" variables are inlined by Vite.

### 4.1 Supabase and persistence

| Variable | Side | Purpose |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Both | Supabase project URL (client config, and the server's Data API and proxy target). Falls back to `SUPABASE_URL` on the server |
| `VITE_SUPABASE_ANON_KEY` | Client | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Service-role key for the Data API, token verification and admin. Never expose it to the browser |
| `DATABASE_URL` | Server | Optional direct Postgres connection (fallback store; used by some scripts) |
| `SUPABASE_URL`, `SUPABASE_TARGET_URL` | Server | Alternate names for the upstream used by auth and the proxy |
| `SUPABASE_JWT_SECRET` | Server | Optional local HS256 JWT validation |
| `SUPABASE_DB_URL`, `SUPABASE_ANON_KEY` | Scripts | Used by `scripts/` helpers |
| `VITE_DISABLE_REALTIME` | Client | `true` disables Supabase Realtime |

### 4.2 Security and accounts

| Variable | Purpose |
| :--- | :--- |
| `MASTER_KEY` (alias `CREDENTIAL_MASTER_KEY` for the vault route) | Wraps per-credential keys for platform credentials, saved user keys and cloud OAuth tokens |
| `ENCRYPTION_KEY` | Listed in `.env.example` and the blueprint; read only by `scripts/migrate-users-to-supabase.ts` |
| `LLM_CHALLENGE_SECRET` | HMAC secret for browser-run AI challenges; at least 16 characters and required in production (a random value is used outside production) |
| `MAIN_ADMIN_EMAIL` (fallback `ADMIN_EMAIL`) | Super-admin account for `/api/admin/ai/*` |
| `VITE_CAPTCHA_SITE_KEY` | Turnstile site key (client); empty disables CAPTCHA |
| `CAPTCHA_SECRET_KEY` (alias `CLOUDFLARE_TURNSTILE_SECRET_KEY`) | Turnstile secret (server) |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity sign-in button |

### 4.3 AI and search

| Variable | Purpose |
| :--- | :--- |
| `ENABLE_SERVER_AI` | Set to `false` to disable server AI execution |
| `ALLOW_SERVER_LOCAL_AI` | `true` lets the server call local runners at its own `localhost`; `false` forbids it; unset means allowed outside production |
| `ALLOW_PRIVATE_AI_ENDPOINTS` | `true` lets users name private-address AI base URLs (otherwise https and public only) |
| `TAVILY_API_KEY`, `SERPER_API_KEY`, `BRAVE_SEARCH_API_KEY` | Web-search backends for `/api/ai/search` and deep research (Tavily is also a secret of the `search-proxy` Edge Function) |
| `OPENALEX_API_KEY`, `OPENALEX_MAILTO` | OpenAlex polite-pool identification for server-side discovery |

The server never uses a server-held env key to serve a normal user request. User keys arrive per request; Premium keys are stored encrypted in the database through the admin panel.

### 4.4 Runtime and build

| Variable | Purpose |
| :--- | :--- |
| `PORT` | HTTP port (default 3000) |
| `NODE_ENV` | `production` enables the CSP and the durable-persistence requirement; `test` under Vitest |
| `MAX_UPLOAD_MB` | Upload ceiling in MB (default 10, maximum 10) |
| `RENDER_GIT_COMMIT`, `GIT_COMMIT` | Reported as `commit` by `/api/health` |
| `DISABLE_HMR` | `true` disables Vite HMR and file watching |
| `CHUNK_BUDGET_KB` | Overrides the 500 kB per-chunk build budget |
| `USE_REAL_STORE_IN_TESTS` | Forces the real project store under test |

### 4.5 Email (Supabase Edge Functions)

`RESEND_API_KEY`, `RESEND_FROM_EMAIL` and `ADMIN_EMAIL` are Edge Function secrets (`supabase secrets set ...`); `server.ts` does not send email.

### 4.6 End-to-end and smoke scripts

`E2E_A_EMAIL`, `E2E_A_PASSWORD`, `E2E_B_EMAIL`, `E2E_B_PASSWORD`, `E2E_BASE_URL`, `E2E_STUB_AI_URL`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, `STUB_AI_PORT` ([`e2e/README.md`](e2e/README.md)); `SMOKE_A_EMAIL`, `SMOKE_A_PASSWORD`, `SMOKE_B_EMAIL`, `SMOKE_B_PASSWORD`, `SMOKE_BASE_URL` (`scripts/smoke-prod.mjs`); `PARITY_BASE_URL`, `PARITY_CHROMIUM`, `PLAYWRIGHT_CHROMIUM` (`scripts/slide-parity/`).

## 5. Verify the setup

```bash
npm run lint && npm test && npm run build
```

`npm test` takes a few minutes; run `npx vitest run <path>` while iterating. A healthy server answers `GET /api/health` with `status: "healthy"` and, once Supabase is configured, `persistenceMode: "supabase-rest"`.
