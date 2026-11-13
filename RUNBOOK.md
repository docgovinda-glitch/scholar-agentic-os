# Operations Runbook (`RUNBOOK.md`)

How to deploy, check, roll back and change Scholar Core in production. Secrets are always referred to by **name**; values live in the Render dashboard, GitHub secrets, Supabase, or the operator's own `chmod 600` env file. Never in the repo.

Production: https://scholar.gkshah.com.np (Render web service, Docker, free plan) · Database/Auth: Supabase project (Pro plan; daily backups).

---

## 1. Deploy

1. Open a PR from a branch. Never push to `main`.
2. CI on the PR must pass:
   - `ci.yml` "Lint, test, build, audit": `npm run lint`, `npm audit --omit=dev --audit-level=high`, `npm test`, `npm run build`;
   - `e2e.yml` "Playwright end-to-end", which runs against a local Supabase started by the CLI.
3. Merge. On push to `main`, `.github/workflows/deploy.yml` does the following:
   - runs the same gates;
   - calls the Render deploy hook (`RENDER_DEPLOY_KEY` secret);
   - waits until `/api/health` reports the pushed commit, or a newer `main` commit that already contains it;
   - runs `GET /api/health?deep=1`;
   - runs the production smoke suite, but only if the `SMOKE_*` secrets and `SMOKE_SUPABASE_SERVICE_ROLE_KEY` exist (they are not set today).
4. Render runs one deploy at a time and builds the newest `main`. When several PRs merge close together, earlier workflow runs are cancelled or report the newer commit. Both are normal.

## 2. Check production

```bash
curl -s https://scholar.gkshah.com.np/api/health
```

```bash
curl -s "https://scholar.gkshah.com.np/api/health?deep=1"
```

Expected:
- `status: "healthy"`;
- `persistenceMode: "supabase-rest"`;
- `commit` is the short SHA of `main`;
- with `deep=1`, `checks.database: "ok"`. If the database is unreachable, the response is a 503 with `"degraded"`.

Full functional check (auth, ownership, uploads, SSRF guard, RPC lockdown, decks). It needs two test accounts and the Supabase service key in the environment:

```bash
set -a; . ~/.scholar-agent.env; set +a; bash scripts/smoke-prod.sh
```

The env file supplies `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMOKE_A_EMAIL`/`SMOKE_A_PASSWORD` and `SMOKE_B_EMAIL`/`SMOKE_B_PASSWORD`. In the agent sandbox, also set `NODE_USE_ENV_PROXY=1` and `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. The suite cleans up the project and deck it creates.

Uptime: `.github/workflows/uptime.yml` checks `/api/health?deep=1` every 15 minutes and fails the workflow when it is down (GitHub emails the owner about failed scheduled runs by default).

## 3. Roll back

The code is stateless on Render, so rolling back is just redeploying an earlier commit:

1. Render dashboard → service → **Events / Deploys** → pick the last good deploy → **Rollback**. Alternatively, revert the bad PR with a new PR, which is better because `main` then matches production.
2. Confirm with `/api/health` that `commit` equals the old SHA, then run the smoke suite.

Database changes do not roll back with the code. Every migration applied in production is listed in `STATUS.md` §1 along with its rollback note.

## 4. Database changes

- New changes go in a new timestamped file in `supabase/migrations/`. Never edit an applied migration.
- Prove the change on a fresh database first:

  ```bash
  bash scripts/db/replay-migrations.sh
  ```

  It runs against the local Supabase only and refuses hosted URLs. CI runs it in `e2e.yml`.
- Apply to production with the Supabase CLI (`supabase db push`), or through the Management API SQL endpoint (`POST /v1/projects/{ref}/database/query`) with the operator's `SUPABASE_ACCESS_TOKEN`. Then record the migration in `supabase_migrations.schema_migrations` and in `STATUS.md` §1, with its rollback.
- Before any destructive change, snapshot the affected policies, grants and row counts. Full `pg_dump` needs direct Postgres access, which the agent sandbox does not have. The restore path is Supabase's daily backups.

## 5. Environment variables

- **Render** (dashboard → Environment): server secrets, all with `sync: false` in `render.yaml`. The names are listed in `CLAUDE.md` § Environment.
- **`VITE_*` variables are baked in at build time.** Never put a secret in a `VITE_` variable.
- Adding a variable doesn't take effect until the next deploy. Re-run the health check afterwards.

## 6. Auth settings (Supabase)

Current rate limits per 5 minutes per IP:

| Setting | Value |
| :--- | :--- |
| `rate_limit_otp` (sign-ups, OTP, magic links, password reset) | 300 (raised 2026-10-30) |
| `rate_limit_token_refresh` (includes password sign-in) | 150 |
| `rate_limit_verify` | 30 |
| `rate_limit_email_sent` | 30 |

The server also caps `/api/auth/login` at 5 per 5 minutes per IP (`server/src/middleware/rateLimit.ts`).

To change a limit:
1. Send `PATCH /v1/projects/{ref}/config/auth` with the field.
2. Read it back with `GET` on the same endpoint.
3. Note the change in `STATUS.md`.

## 7. When something breaks

| Symptom | First check |
| :--- | :--- |
| `/api/health` 5xx or timeout | Render dashboard → Logs. On the free plan a cold start can take up to ~1 minute. |
| `deep=1` → `database: unreachable` | Supabase status page; `SUPABASE_SERVICE_ROLE_KEY` / `VITE_SUPABASE_URL` on Render |
| Sign-in fails for everyone | Turnstile keys (`VITE_CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`); Supabase Auth logs; rate limits (§6) |
| AI features fail for one user | Their AI Access setup. Server AI runs only on the user's own key, sent per request. A local model can only run in the browser (`docs/AI-CALL-MAP.md`). |
| Deploy workflow red but site fine | Usually "wait until the new commit is live" timing out. Compare `/api/health` `commit` with `main`. |

## 8. Where things are recorded

- `STATUS.md`: task checklist, production change ledger with rollbacks, PR ledger.
- `PRODUCT_AUDIT.md`: product findings (P0/P1) and their fix PRs.
- `ROTATION_RUNBOOK.md`: credential rotation, including the agent's own credentials (§7).
- `CHANGELOG.md`: user-visible changes.

## 9. Tests

| What | Command | Where it runs |
| :--- | :--- | :--- |
| Typecheck, contrast, CSP hash, no pure black, no raw hex classes | `npm run lint` | pre-commit, CI |
| Unit and route tests | `npm test` (or `npx vitest run <file>`) | CI (`ci.yml`) |
| Build with chunk budget (< 500 kB per chunk) | `npm run build` | CI |
| End-to-end (Playwright) on a local Supabase, with a stand-in AI | see `e2e/README.md` | CI (`e2e.yml`) on every PR |
| Production smoke suite (uses two test accounts) | `scripts/smoke-prod.sh` | by hand after a deploy, or in `deploy.yml` when the `SMOKE_*` secrets exist |

The end-to-end suite covers sign-in, project privacy, each workspace (open, save, reload, no demo data, AI drafting with and without the user's AI), Journal versions and export, the Presentation studio, accessibility (axe, WCAG 2.1 A/AA) at 375/768/1280 px and keyboard focus.

