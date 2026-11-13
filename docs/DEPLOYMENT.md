# Deployment

How the application is built, shipped and verified. Day-to-day operations (rollback, health checks, auth rate limits) are in [`../RUNBOOK.md`](../RUNBOOK.md).

## 1. Shape

Production is https://scholar.gkshah.com.np: Cloudflare (DNS, Turnstile) in front of one Render Docker web service on the free plan, backed by a Supabase project. The container runs `node dist/server.cjs`, which serves the API, the Supabase proxy and the static SPA.

```text
Browser -> Cloudflare -> Render web service (Docker, Node 22)
                           |-- /api/*          Express routes
                           |-- /api/supabase/* streaming proxy -> Supabase
                           `-- everything else  static dist/ (SPA)
Supabase: Auth, Postgres (RLS), Storage, Edge Functions
```

## 2. Dockerfile

Two stages on `node:22-alpine`, sized for the free plan's cold starts and 512 MB RAM:

1. **builder**: `npm ci --ignore-scripts`, `npm run build` (`dist/` assets plus `dist/server.cjs`). `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_CAPTCHA_SITE_KEY` are build `ARG`s turned into `ENV`, because Vite inlines `VITE_*` values at build time.
2. **runtime**: production `node_modules` only (`npm ci --omit=dev`; `server.cjs` is bundled with `--packages=external`), the `dist/` folder, `NODE_ENV=production`, `PORT=3000`, runs as the non-root `node` user, `CMD ["node", "dist/server.cjs"]`. `HUSKY=0` in both stages.

Local image: `docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... --build-arg VITE_CAPTCHA_SITE_KEY= -t scholar-agentic-os:local .` then `docker run --rm -p 3000:3000 --env-file .env scholar-agentic-os:local`.

## 3. Render (`render.yaml`)

- One `web` service `scholar-agentic-os`, `env: docker`, `plan: free`, `autoDeploy: false`, `healthCheckPath: /api/health`.
- Fixed values: `PORT=3000`, `NODE_ENV=production`, `MAX_UPLOAD_MB=10`.
- Secrets set in the Render dashboard (`sync: false`): `MAIN_ADMIN_EMAIL`, `ADMIN_EMAIL`, `ENCRYPTION_KEY`, `MASTER_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.
- Variables the code reads that are not in the blueprint can be added in the dashboard when needed, notably `LLM_CHALLENGE_SECRET` (required in production for browser-run AI challenges), `SUPABASE_JWT_SECRET`, `ALLOW_SERVER_LOCAL_AI`, `ENABLE_SERVER_AI`, `OPENALEX_MAILTO`, `OPENALEX_API_KEY` and search keys. Full list: [`../SETUP.md`](../SETUP.md) §4.
- `VITE_*` variables are baked in at build time; a change needs a rebuild. Never put a secret in a `VITE_` variable.
- The free plan sleeps after about 15 minutes idle; the client wakes it early with `src/services/serverWarmup.ts`.
- In production the server refuses to start unless durable storage is configured (`VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, or `DATABASE_URL`).

## 4. GitHub workflows (`.github/workflows/`)

| Workflow | Trigger | What it does |
| :--- | :--- | :--- |
| `ci.yml` "CI" | Pull requests to `main`, manual | `npm ci`, `npm run lint`, `npm audit --omit=dev --audit-level=high`, `npm test`, `npm run build` (Node 22, placeholder Supabase values) |
| `e2e.yml` "E2E" | Pull requests, manual | Local Supabase from the CLI, `scripts/db/replay-migrations.sh`, `scripts/e2e-setup.mjs`, stub AI server, `npx playwright test`, production smoke suite against the local app |
| `ai-routing.yml` "AI routing" | Pull requests and pushes to `main` that touch AI code, manual | Typecheck and the fast AI suites: router, live models, failover, keyring and account keys, URL screening, the single-brain guardian, and the Journal Writer routes |
| `db-migrate.yml` "Database migrations" | Changes under `supabase/migrations`, manual | Validates file names (timestamp, unique) and that applied migrations are never edited (pull requests); on `main`, if `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` secrets exist, shows `supabase db push --dry-run` and then applies the pending migrations; without the secrets it validates and skips with a notice |
| `slide-parity.yml` | Pull requests (path-filtered), manual | `node scripts/slide-parity/run.mjs` compares web and `.pptx` rendering |
| `deploy.yml` "Production Deployment & Verification" | Push to `main`, manual | Job `verify`: lint, audit, tests, build. Job `deploy` (environment `Production`): POSTs the Render deploy hook when the `RENDER_DEPLOY_KEY` secret exists; waits up to 20 minutes until `/api/health` reports the pushed commit (or a newer one containing it); `GET /api/health?deep=1`; runs `scripts/smoke-prod.mjs` only if the smoke secrets exist (`SMOKE_SUPABASE_SERVICE_ROLE_KEY`, `SMOKE_A_EMAIL`, …), otherwise skips with a warning |
| `uptime.yml` | Every 15 minutes (cron), manual | Up to three attempts at `GET /api/health?deep=1`; a failing run notifies the repository owner |

`main` is production; never push to it directly. Render builds the newest `main`, so when several merges land together an earlier run may report a newer commit; that is normal.

## 5. Supabase

- **Server access**: the server reaches Supabase over HTTPS (Data API, Auth, Storage) with `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; `DATABASE_URL` (direct Postgres) is an optional fallback. The browser talks to Supabase through `/api/supabase/*` or directly with the anon key, as configured by `VITE_SUPABASE_URL`.
- **Schema**: `supabase/schema.sql`, `schema_ai_engine.sql`, `schema_store.sql`, `schema_user_settings.sql`, then `supabase/migrations/*.sql` in timestamp order. Prove changes on a throwaway local database with `scripts/db/replay-migrations.sh "<local url>"` (it refuses hosted URLs). Apply to production with the Supabase CLI (`supabase db push`) or the Management API, then record them; migrations are not deployed by Render. The `db-migrate.yml` workflow applies pending migrations on `main` when its secrets are set (see §4). See [`../RUNBOOK.md`](../RUNBOOK.md) §4.
- **Storage**: private buckets `project-files`, `vault-files` and `id-documents` ([`DATA-MODEL.md`](DATA-MODEL.md) §3); `scripts/create_bucket.ts` creates `project-files` if missing.
- **Edge Functions** (`supabase/functions/`, deployed with `supabase functions deploy <name>`): `search-proxy`, `arxiv-proxy`, `who-proxy`, `imf-proxy` (stateless search proxies) and `request-profile-update` (currently disabled: returns 410). Shared helpers in `_shared/` (`adminClient.ts`, `cors.ts`, `resend.ts`). They are excluded from `tsconfig.json`.
- **Auth settings** (dashboard): enable the email provider; set the Site URL to the production domain and add redirect URLs for `/verify-email` and `/reset-password/confirm`; Google sign-in needs the Google provider configured. Current rate-limit values are in [`../RUNBOOK.md`](../RUNBOOK.md) §6.

## 6. Verifying a deploy

```bash
curl -s https://scholar.gkshah.com.np/api/health
curl -s "https://scholar.gkshah.com.np/api/health?deep=1"
```

Expect `status: "healthy"`, `persistenceMode: "supabase-rest"`, `commit` equal to the short SHA of `main`, and (deep) `checks.database: "ok"`. A database that cannot be reached returns 503 with `status: "degraded"`. For a full functional pass run `scripts/smoke-prod.sh` as described in the runbook.

## 7. Other hosts

Nothing is Render-specific except `render.yaml` and the `RENDER_GIT_COMMIT` variable used for the reported `commit` (`GIT_COMMIT` is also read). Any Docker host that passes the three `VITE_*` build args, sets the runtime variables in section 3 and exposes `/api/health` can run the image.
