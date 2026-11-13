# Development Guide

Local setup, commands, tests and conventions. First-time environment details are in [`../SETUP.md`](../SETUP.md); operations are in [`../RUNBOOK.md`](../RUNBOOK.md).

## 1. Prerequisites

- Node 22 (the Dockerfile and every GitHub workflow use 22; Node 20 has no global `WebSocket`) and npm 10+. Install with `npm ci` (lockfile-exact).
- A Supabase project, or a local Supabase (CLI) for end-to-end work. Without Supabase configured, a non-production server falls back to an on-disk project store (`data/.scholar_local_store.json`) and sign-in will not work.
- Optional: Ollama, LM Studio or another local runner for local-AI work; Python with scikit-learn only if you retrain `ml-style-engine/`.

## 2. Environment

`cp .env.example .env`. `.env*` files are git-ignored except `.env.example`; never commit or print secret values. `.env.example` lists these keys: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `TAVILY_API_KEY`, `MASTER_KEY`, `ENCRYPTION_KEY`, `VITE_CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `MAIN_ADMIN_EMAIL`. The code also reads others; the full inventory with defaults is in [`../SETUP.md`](../SETUP.md) §4.

For local work leave `VITE_CAPTCHA_SITE_KEY` empty: the placeholder value in `.env.example` turns Turnstile on and breaks the sign-up tests.

## 3. Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | `tsx server.ts`: Express plus Vite middleware (HMR) on port 3000; `PORT` overrides |
| `npm run lint` | `tsc --noEmit`, `verify-contrast`, `verify-csp-hash`, `verify-no-pure-black`, `verify-no-raw-hex-classes` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` (whole suite, several minutes) |
| `npx vitest run <path>` | One file or folder; prefer this while iterating |
| `npm run test:coverage` | Vitest with V8 coverage |
| `npm run test:e2e` | Playwright (see [`../e2e/README.md`](../e2e/README.md)) |
| `npm run build` | `vite build`, `scripts/verify-chunk-budget.mjs` (no JS chunk over 500 kB; `CHUNK_BUDGET_KB` overrides), then esbuild to `dist/server.cjs` |
| `npm start` | `node dist/server.cjs` (after a build) |
| `npm run clean` | Remove `dist/` and `server.js` |
| `npm run verify:contrast`, `verify:csp-hash`, `verify:chunks` | Individual checks |
| `npm run verify:slide-parity` | Renders the web and `.pptx` slides and compares them (`scripts/slide-parity/`, also a CI workflow) |
| `npm run seed:ai-registry` | Seed `ai_providers` / `ai_models` from the code catalogs |
| `npm run migrate:users-to-supabase` | One-off user migration script |

`.husky/pre-commit` runs `npm run lint`. `package.json` has no `prepare` script, so enable the hook once per clone with `npx husky`.

`scripts/` also holds operational tools (`smoke-prod.mjs`/`.sh`, `verify-deployment-readiness.sh`, `verify-local-supabase.sh`, `db/replay-migrations.sh`, `db/schema-diff.sh`, `rewrap-platform-credentials.ts`, `reset-all-vaults.ts`, `create_bucket.ts`); read the header comment of each before running it, and never point them at production without the procedure in [`../RUNBOOK.md`](../RUNBOOK.md).

## 4. Tests

- Unit and route tests live in `__tests__/` folders next to the code (`src/**`, `server/**`); Vitest 4 with jsdom, Testing Library and `src/testSetup.ts`. `e2e/**` is excluded from Vitest.
- `src/__tests__/singleBrainGuardian.test.ts` fails the suite if the single-brain rules are broken ([`AI-SYSTEM.md`](AI-SYSTEM.md) §1).
- Some tests need real credentials or network and fail without them (`authIntegration`, `liveNetworkDiagnostics`, `productionFinalAcceptance`, `AddSourceModal`, `selfServiceAuthConflict6`). Do not mock away their purpose; confirm your change adds no new failures.
- Database SQL is exercised by `scripts/db/replay-migrations.sh` against a local Supabase (never hosted).
- End-to-end specs: sign-in, privacy, every workspace, AI drafting with a stand-in AI server (`e2e/stub-ai/server.mjs`), Presentation Studio, accessibility and keyboard.
- GitHub workflows: `ci.yml` (lint, `npm audit --omit=dev --audit-level=high`, test, build on PRs to `main`), `e2e.yml`, `slide-parity.yml`, `deploy.yml`, `uptime.yml` ([`DEPLOYMENT.md`](DEPLOYMENT.md)).

## 5. Conventions

- Strict TypeScript: no `any` without a reason, no `@ts-ignore` to hide a real error. `@/*` maps to the repository root, not `src/`. Validate external input with zod.
- Keep components small; put pure logic in `src/domain/` or services; add or update tests beside the code.
- Server code imports shared modules from `src/` (formatters, `document_intelligence`, mesh agents, platform gateway); keep them free of browser-only APIs.
- AI: add capability as a method on `scholarBrain` only; never import `server/utils/llm.ts` elsewhere; never add subject templates, canned outlines or keyword-to-framework tables.
- Any server-side fetch of a user-supplied URL goes through `server/utils/ssrfGuard.ts`.
- Request bodies must never carry provider credentials; a user's key is a transient `x-ai-*` header on AI routes only.
- UI: semantic tokens only ([`UI-UX.md`](UI-UX.md)); lazy-load heavy features; heavy libraries are split in `vite.config.ts`.
- Do not store raw proprietary full texts beyond what a feature needs; the Vault keeps structured metadata and the parsed text required for the feature.
- Comments explain why the current code works, not its history.
- Database changes: a new timestamped file in `supabase/migrations/`; never edit an applied migration; prove it with `scripts/db/replay-migrations.sh` on a local database.
- Security-sensitive areas (auth middleware, RLS and migrations, `credentialVault`, `ssrfGuard`, CSP, proxies): preserve fail-closed behaviour and add a test.
- Docs: update the matching file in `docs/` in the same pull request as the behaviour change.

## 6. Branch and release flow

Work on a branch, never directly on `main`. Before pushing run `npm run lint` and the relevant tests, plus `npm run build` when touching build config, `server.ts` or code shared between client and server. Open a pull request; CI must pass. Merging to `main` deploys ([`DEPLOYMENT.md`](DEPLOYMENT.md)).
