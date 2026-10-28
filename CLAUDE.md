# CLAUDE.md — Scholar Agentic OS

Project memory for Claude Code. Keep it short and accurate; update it when commands, layout, or deploy rules change.

## What this is

A full-stack academic research/writing platform ("Scholar Core"): thesis, journal manuscript, proposal, assignment/coursework, presentation and peer-review workflows driven by AI agents, with a citation engine and a "Universal Vault" of sources. One Node process serves both the API and the React SPA.

Production: https://scholar.gkshah.com.np (Render, Docker, free plan).

## Commands

Node 22 (Dockerfile) / Node 20 (CI). Use `npm ci` for installs.

```bash
npm ci                     # install (lockfile-exact)
npm run dev                # tsx server.ts → Express + Vite middleware (HMR) on :3000
npm run lint               # tsc --noEmit + contrast check + CSP-hash check  (== pre-commit hook & CI gate)
npx tsc --noEmit           # typecheck only
npm test                   # vitest run (whole suite, ~3 min)
npx vitest run path/to/file.test.ts   # single file — prefer this while iterating
npm run build              # vite build → dist/  +  esbuild server.ts → dist/server.cjs
npm start                  # node dist/server.cjs (after build)
npm run verify:contrast    # WCAG checks over tokens in src/index.css
npm run verify:csp-hash    # inline theme script in index.html must match hash in server.ts
```

Known baseline: ~18 tests in 5 files fail without real credentials/network (`authIntegration`, `liveNetworkDiagnostics`, `productionFinalAcceptance`, `AddSourceModal`, `selfServiceAuthConflict6`). Don't "fix" them by mocking away their purpose; just confirm your change doesn't add new failures.

`generate:knowledge` / `validate:knowledge` / `check:knowledge` point at `.claude/scripts/*.js`, which do not exist in the repo — those scripts are currently dead.

## Architecture

```
server.ts                 Express entry: helmet/CSP, rate limit, body limits, route registration,
                          Vite middleware in dev, static dist/ in prod, /api/health
server/routes/            HTTP routes (index.ts exports register*Routes); project/ holds per-workflow
                          routers (agentic/, assignment/, thesis, proposal, presentation, journal_compliance…)
server/src/aiEngine/      Two-router AI access: omniRouter, userRouter/adminRouter, credentialVault
                          (MASTER_KEY-wrapped provider creds), credits/quotas/entitlements, provider health
server/src/middleware/    auth (Supabase JWT via service role), requireAdmin, captchaVerify, rateLimit,
                          uploadGuard, rejectClientCredentials, errorHandler
server/src/research|discovery|services/  scholarly retrieval, deep research, RAG, scholarBrain
server/services/briefScannerGraph.ts     LangGraph workflow
server/utils/ssrfGuard.ts                use for ANY server-side fetch of a user-supplied URL
src/main.tsx              SPA entry; routes /admin/* (lazy) and /* → src/desk/DeskApp.tsx
src/desk/                 Main UI by feature (thesis, journal, assignment, vault, aiAccess, auth, …)
src/app/                  Client-side engines: mesh/ (agent registry + executor, ag## agents),
                          conductor/, citation/, manuscript/, review/, coherence/, studio/ …
src/domain/               Pure domain models/schemas (zod) — no React, no I/O
src/platform/             gateway/ (AI provider adapters) and warden/ (policy/classification)
src/citation_compliance/  Formatters (APA7, IEEE, MLA9, Chicago, Harvard, Vancouver) + BibTeX/RIS importers
src/services/             Client services (auth, vault, store, offline, crypto, serverWarmup …)
supabase/                 schema*.sql, migrations/ (timestamped), functions/ (Deno Edge Functions,
                          excluded from tsconfig)
```

- Path alias `@/*` → repo root (not `src/`).
- Server code imports shared modules from `src/` (citation formatters, document_intelligence, mesh agents) — keep those modules free of browser-only APIs.
- **Supabase**: Auth (GoTrue), Postgres with RLS, private storage buckets, Edge Functions (Resend email, search proxies). The server persists through Supabase's HTTPS Data API (`server/src/supabaseRest.ts`) using `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; `DATABASE_URL` direct Postgres is an optional fallback only.
- **AI**: Gemini (`@google/genai`) by default, plus BYOK and admin-managed provider pools; LangChain/LangGraph for graph workflows. Clients must never send provider credentials to the server (`rejectClientCredentials`).
- Deeper docs: `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA-MODEL.md`, `docs/WORKFLOWS.md`, `docs/AI-SYSTEM.md`, `docs/UI-UX.md`, `SYSTEM_MAP.md`, `SETUP.md`. Security context: `AUDIT.md`, `ROTATION_RUNBOOK.md`, `HOTFIX*_DEPLOY.md`.

## UI conventions

- React 19 + TypeScript, Tailwind CSS v4 via `@tailwindcss/vite` (no tailwind.config; tokens live in `src/index.css` `@theme` / `:root`).
- Use semantic CSS tokens (`--bg-*`, `--text-*`, `--border-*`, `--theme-*`), not raw hex colors. Dark mode = `data-theme="dark"` / `.dark` (custom variant). Changing a token must still pass `verify:contrast`.
- Icons: `lucide-react`; animation: `motion`; editor: TipTap.
- If you edit the inline theme script in `index.html`, update `INLINE_THEME_SCRIPT_CSP_HASH` in `server.ts` (lint will fail otherwise).
- Heavy libs are split via `manualChunks` in `vite.config.ts`; lazy-load large features.

## Deployment

- `main` is production. `.github/workflows/deploy.yml` on push to `main`: `npm ci` → `npm run lint` → `npm test` → `npm run build`, then triggers the Render deploy hook and pings `/api/health`.
- `render.yaml`: single Docker web service (`Dockerfile`, two-stage node:22-alpine), `plan: free` (cold starts, 512 MB RAM — keep `MAX_UPLOAD_MB` small), `autoDeploy: true`, `healthCheckPath: /api/health`. Secrets are `sync: false` (set in the Render dashboard).
- `VITE_*` vars are baked in at build time (Docker build args). Anything secret must never be prefixed `VITE_`.
- Supabase migrations / Edge Functions are deployed separately (Supabase CLI), not by Render.

## Environment

Template: `.env.example` (all real `.env*` files are gitignored). Keys: Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`), AI (`GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP`, `AI_GATEWAY_*`, `TAVILY_API_KEY`, `VITE_OPENALEX_API_KEY`), crypto (`MASTER_KEY`, `ENCRYPTION_KEY`), captcha (`VITE_CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`), email (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`), app (`APP_URL`, `VITE_APP_NAME`, `VITE_API_BASE_URL`, `MAIN_ADMIN_EMAIL`).

## Rules

1. **Never** read out, log, modify, or commit `.env` files or secret values. When you need env info, list key names only.
2. **Never** push directly to `main`. Work on a branch; before pushing run `npm run lint` (must pass) and the relevant tests; run `npm run build` when touching build config, server entry, or imports shared between client and server.
3. Strict TypeScript: no `any` without justification, no `@ts-ignore` to silence real errors. Validate external input with zod.
4. Keep components small and modular; put pure logic in `src/domain` / services, not in components. Add or update tests next to the code (`__tests__/`).
5. Security-sensitive areas (auth middleware, RLS/migrations, credentialVault, ssrfGuard, CSP, proxies) need extra care: preserve fail-closed behavior and add a test for the change.
6. New DB changes go in a new timestamped file under `supabase/migrations/`; never edit an applied migration.
