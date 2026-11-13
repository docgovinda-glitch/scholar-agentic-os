# CLAUDE.md — Scholar Agentic OS

Project memory for Claude Code. Keep it short and accurate; update it when commands, layout, or deploy rules change.

## SINGLE-BRAIN ARCHITECTURE INVARIANT

`server/src/services/scholarBrain.ts` is the ONLY AI brain, powering every workspace (OT-01, OT-07, OT-10, OT-15, OT-22). Only it may import `server/utils/llm.ts`; routes and services import `callOpenRouterJSON` / `callOpenRouterText` / `streamOpenRouterJSON` from `scholarBrain.ts` (logged wrappers, not bare re-exports). No workspace may add its own prompt engine, regex outline generator or subject-to-theory lookup table. New AI capability = new method on `scholarBrain`. Always follow `.claude/agents/single-brain-guardian.md` and `.claude/skills/single-brain-guardian/SKILL.md`.

**Permanently banned** (enforced by `src/__tests__/singleBrainGuardian.test.ts`, which fails `npm test`): the Quantum literature catalog (`quantumComputingCatalog` / `QUANTUM_COMPUTING_CATALOG`), the Zappos/Schein canned outline (any `Zappos` string in `src/desk/**` or `server/routes/project/assignment/**`), keyword-to-framework tables (e.g. "Bilateral Economic Interdependence Model"), and any direct `utils/llm` import outside `scholarBrain.ts`. Target frameworks come only from AI output or the student's own edits.

## Coursework (OT-01) pipeline

Four phases plus submission; everything is derived from the student's brief, never from a subject template.
1. **Phase 01 Extract** (`AssignmentExtractStage.tsx`, `extractRoutes.ts`): paste or upload (`.pdf/.docx/.txt/.md`; the `File` goes straight to the handler and the input is reset). **Save & Build** saves, then runs the AI extract and understand steps so Phase 02 opens populated. Word count ignores course codes (`stripCourseCodes`: `QNT-4020` is never `4020`).
2. **Phase 02 Understand** (`AssignmentUnderstandStage.tsx`): brief-derived summary (`buildBriefSummary`), sub-question rows with the brief's own marks and proportional word targets (`parseBriefQuestions` + `allocateWordsByMarks`), grading criteria (`parseMarkingCriteria`), thesis selector. Parsers live in `src/utils/briefQuestions.ts` and start from `normalizeBriefLayout` (PDF text: a marks bracket split over lines, or title + marks + prompt on one line, is rejoined/split so both layouts parse the same). Sub-parts sit inside their question: totals, percentages and word budgets count main questions only (a stem's marks cover its parts). The rubric is read from its own heading (grade bands and question rows are skipped). The working thesis comes from the AI's line of argument, else `briefGroundedStances` (`src/domain/assignment/briefThesis.ts`: the brief's title and question titles; no subject tables). Titles use `deriveDocumentTitle` (banner and inline metadata stripped). Until the student approves sources, only prescribed-in-brief sources count as approved.
3. **Phase 03 Sources** (`AssignmentSourcesStage.tsx`, `realScholarlyDiscoveryService.ts`, `sourcesRoutes.ts`): 3-5 keyword phrases from the brief (`buildSourceSearchQueries`, never the raw prompt); OpenAlex + Crossref + Semantic Scholar + DOAJ/DataCite/arXiv via `Promise.allSettled` with timeouts; references named in the brief are listed first with a `Prescribed in Brief` badge; a printed reference list in the brief is parsed into full entries (`parsePrescribedBibliography`). Every query carries the brief's subject word and papers without it are dropped (`briefDomainTerms`, `scoreSourceRelevance`). Author names go through `parsePersonName` (never "al., A. e.", never inverted).
4. **Phase 04 Drafting** (`AssignmentDraftingStage.tsx`, `draftingRoutes.ts`): one section per main question of the brief (stem and sub-parts together; `groupBriefQuestions`), and no question is ever dropped (`ensureEveryQuestionHasSection`, also applied to AI outlines). Any outline (AI ones too) is aligned to one section per marked question first (`alignOutlineToQuestions`: Part-grouped outlines are re-shaped, never duplicated). Budgets come from `applyMarksBudget` (`src/domain/assignment/outlineBudget.ts`): marks-weighted, clean multiples of 5 (10 from 1,000 words), remainder on the largest body section, exact sum to `targetWordCount`; applied to every AI-written outline too. `/stream-section` takes `allocatedWords` (capped by `remainingEssayWords`), asks for ±5%, requests one rewrite if short and trims long drafts at a sentence boundary; each section gets a contract (`server/src/utils/sectionContract.ts`): every lettered sub-part, the citations the question names, its place in the report and the chosen writing style (`server/src/utils/sectionBudget.ts`). Refinement actions show only once a section has text. If every AI provider is out of credit, `/stream-section` sends a clearly labelled offline scaffold (`server/src/utils/sectionScaffold.ts`, built only from the section prompt, key points and approved sources) instead of dropping the request; failed revisions never overwrite existing text. The scaffold is shown beside the section with Try again / Insert, never saved as the section's text or counted as drafted words. The SSE stream opens (headers flushed, `: keep-alive` every 5 s; `server/src/utils/sectionStream.ts`) before the model call, after the 426 hand-off check (`handOffBeforeStream`); later failures are `{ error, recoverable: true }` events. Paragraphs survive end to end: the prompt asks for 2-4 blank-line paragraphs, chunks keep whitespace, and `src/shared/proseParagraphs.ts` regroups a single long block. No `[Unverified Claim]` tag is ever written into prose; unmatched citations are removed. Exports (`exportText.ts`) never print the raw prompt, list only cited + prescribed sources (deduplicated) and render real italics. Saved projects are cleaned of legacy template text on load (`legacyPurge.ts`). The approved sources are compiled into a `ReferencesCard` (alphabetical in the project style, copy/edit) and appended to the compiled draft. Per-question word counts the student types in Phase 02 are kept exactly (`applyQuestionWordTargets`); sub-parts get their own short titles and a single-prompt question never gets a child heading that repeats its title.

## Retrieval, Ask Scholar and hand-off

- **One retrieval path.** `src/shared/retrieval/providers.ts` is the only code that calls OpenAlex, Crossref, Semantic Scholar, Europe PMC and ERIC (also DOAJ, DataCite, arXiv, DOI and venue lookups; `discovery.ts`, `webSearchEngine.ts`, the harvesters, vault and reference routes, `blueprintScout` all delegate to it). `server/src/retrieval/retrievalService.ts` (`retrieveSources`) is the live-search entry (`/api/search/live`, Deep Research); the client `liveSearchService.ts` only calls that route and verifies the records (no browser-side provider fallback). Low-credibility domains live in `src/shared/retrieval/credibility.ts`. Providers never write filler snippets: no abstract means an empty snippet.
- **Ask routing** (search / chat / deep research) is one policy, `src/shared/askRouting.ts`, used by the server and the browser: the default is to ground the answer; only greetings, rewriting the user's own text, code and arithmetic skip search.
- **Ask prompts** belong to `scholarBrain.askSystemPrompt` (`server/src/services/askPrompts.ts`, including the platform fact sheet). There are no canned platform answers and no code-writing refusal.
- **Deep Research** stage 4 is a real model cross-check (`analyseEvidence`); when it cannot run the stage is reported `skipped`, never as completed.
- **Threads** persist in Supabase `ask_threads` (`server/src/askThreads/threadStore.ts`; migration `20261113120000_ask_threads.sql`, apply with the Supabase CLI). Documents attached in a conversation are kept with the thread and re-sent on follow-ups.
- **Hand-off** to OT-01/10/15/22 is `buildWorkspaceHandoff` (`src/domain/handoff/workspaceHandoff.ts`): conversation, documents, sources and style. Raw image bytes are not carried (the analysis stays in the conversation).

## What this is

A full-stack academic research/writing platform ("Scholar Core"): thesis, journal manuscript, proposal, assignment/coursework, presentation and peer-review workflows driven by AI agents, with a citation engine and a "Universal Vault" of sources. One Node process serves both the API and the React SPA.

Production: https://scholar.gkshah.com.np (Render, Docker, free plan).

## Commands

Node 22 (Dockerfile and every GitHub workflow; Node 20 has no global `WebSocket`). Use `npm ci` for installs.

```bash
npm ci                     # install (lockfile-exact)
npm run dev                # tsx server.ts → Express + Vite middleware (HMR) on :3000
npm run lint               # tsc --noEmit + contrast, CSP-hash, no-pure-black, no-raw-hex-class checks (== .husky/pre-commit & CI gate)
npm run typecheck          # typecheck only (tsc --noEmit)
npm test                   # vitest run (whole suite, ~3 min)
npx vitest run path/to/file.test.ts   # single file — prefer this while iterating
npm run build              # vite build → dist/, chunk-budget check (<500 kB), esbuild server.ts → dist/server.cjs
npm start                  # node dist/server.cjs (after build)
npm run verify:contrast    # WCAG checks over tokens in src/index.css
npm run verify:csp-hash    # inline theme script in index.html must match hash in server.ts
```

Known baseline: ~18 tests in 5 files fail without real credentials/network (`authIntegration`, `liveNetworkDiagnostics`, `productionFinalAcceptance`, `AddSourceModal`, `selfServiceAuthConflict6`). Don't "fix" them by mocking away their purpose; just confirm your change doesn't add new failures.

## Architecture

```
server.ts                 Express entry: helmet/CSP, rate limit, body limits, route registration,
                          Vite middleware in dev, static dist/ in prod, /api/health
server/routes/            HTTP routes (index.ts exports register*Routes); project/ holds per-workflow
                          routers (agentic/, assignment/, thesis, proposal, presentation, journal_compliance…)
server/src/aiEngine/      userKeyVault (a user's own keys, MASTER_KEY-wrapped), admin/user admin, opportunity agent
server/src/ai/            routerBridge (chain per request from the x-ai-keyring header), aiEndpointGuard (SSRF)
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
src/platform/             router/ (the one AI engine: adapters, fallback, key rotation, model listing/curation),
                          completion.ts (the Completer app modules receive), warden/ (policy/classification, used by the mesh)
src/citation_compliance/  Formatters (APA7, IEEE, MLA9, Chicago, Harvard, Vancouver) + BibTeX/RIS importers
src/services/             Client services (auth, vault, store, offline, crypto, serverWarmup …)
supabase/                 schema*.sql, migrations/ (timestamped), functions/ (Deno Edge Functions,
                          excluded from tsconfig)
```

- Path alias `@/*` → repo root (not `src/`).
- Server code imports shared modules from `src/` (citation formatters, document_intelligence, mesh agents) — keep those modules free of browser-only APIs.
- **Supabase**: Auth (GoTrue), Postgres with RLS, private storage buckets, Edge Functions (Resend email, search proxies). The server persists through Supabase's HTTPS Data API (`server/src/supabaseRest.ts`) using `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; `DATABASE_URL` direct Postgres is an optional fallback only.
- **AI**: AI Access has two tiers, Local and BYOK (Premium is "Coming soon" in the UI and has no code). One engine, `src/platform/router`; every workspace reads one central setting (keys + model per provider). 37 cloud providers (`src/config/providerCatalog.ts`) and the local runners map onto the router (`providerMap`); models are listed live from the provider (`/api/ai/models`), never named in code, and a provider with no chosen model uses the best one it lists ("auto"). The server also reads the signed-in user's saved keys (`accountAi`), so a new device works on its first request. App modules (`src/app/*`) take a `Completer` (`src/platform/completion.ts`): the server builds it in `server/src/ai/browserHandoff.ts`, the browser in `src/desk/ai/completer.ts`. LangChain/LangGraph for graph workflows. Request bodies must never carry provider credentials (`rejectClientCredentials`); a user's own key reaches the server only as transient `x-ai-*` headers on AI routes (`routeUsesClientAi` in `src/desk/api/client.ts`).
- Deeper docs (kept in step with the code; update them in the same PR as the change): `docs/README.md` (index), `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA-MODEL.md`, `docs/WORKFLOWS.md`, `docs/AI-SYSTEM.md`, `docs/AI-CALL-MAP.md`, `docs/UI-UX.md`, `docs/DEVELOPMENT.md`, `docs/DEPLOYMENT.md`, `SYSTEM_MAP.md`, `SETUP.md`, `RUNBOOK.md`. Security history (dated records, not current behaviour): `AUDIT.md`, `ROTATION_RUNBOOK.md`, `HOTFIX*_DEPLOY.md`.

## Slides & Keynotes (Presentation Studio, OT-22)

- Live route: `/presentation` (also mounted for OT-22 projects) → `src/desk/presentation/PresentationWorkspace.tsx` → steps `Step01Understand`, `Step02Design`, `Step03StudioCanvas` (aliased `Step03EditSlides`), `Step04Delivery` (aliased `Step04Present`) in `src/features/slides/components/`. `/presentation` works signed-out, which is handy for checking changes in a browser.
- Step 01 is a Gamma-style outline: upload or topic -> `POST /api/projects/:id/presentation/outline` (`scholarBrain.presentationOutline`; with no AI a brief-grounded outline from `src/shared/presentationBrief.ts`), editable cards (`OutlineBuilder.tsx`: title, visual type, bullets, reorder, add, delete, regenerate). Only a slide-count selector (6/8/10/12/15) remains. Titles come from `deriveDocumentTitle` (never an institution banner) and every extractor applies `cleanBriefText` / `stripCourseCodes`. Proceed builds slides via `generate-deck` with the outline (assertion-evidence copy) or `composeDeckFromOutline`. Step 02 adds `VisualPlanner.tsx` (the presenter picks Smart Diagram / Comparison Table / Multi-Card Grid / Custom Image per slide; nothing is drawn or numbered silently). Step 03 has the 7-layout switcher, typed `+ Add Card / Block` menu (`gamma/blocks.ts`) and `Write with AI` (`POST .../presentation/write-block`).
- All slide rendering goes through `src/features/slides/gamma/`:
  - `content.ts`: layout-independent `CardContent` + 10 Gamma layouts (incl. `table`). `getCardContent` derives content from legacy `blocks`; `writeCardContent` stores content and regenerates blocks (fingerprinted so copilot/Ask Scholar block edits still win).
  - `geometry.ts`: each layout → positioned primitives on a 1280×720 canvas. **Both** the web renderer (`GammaCard.tsx`) and `.pptx` export (`pptxExport.ts`, lazy-loaded pptxgenjs) draw these same boxes; change a layout here, not in a component.
  - `theme.ts`: curated deck themes (hex tokens, no `#000000`; default `scholar-paper` #F8F7F4 / `scholar-ink` #171717) + adapter for legacy library/custom themes.
  - `composer.ts`: offline deck builder; uses only figures present in the user's text. Server AI path: `server/routes/project/presentation.ts` + `presentationCards.ts` (zod-validated cards, ungrounded figures dropped).
- Never add invented metrics, citations or p-values to generators, fallbacks or demo content.

## UI conventions

- React 19 + TypeScript, Tailwind CSS v4 via `@tailwindcss/vite` (no tailwind.config; tokens live in `src/index.css` `@theme` / `:root`).
- Use semantic CSS tokens (`--bg-*`, `--surface-*`, `--text-*`, `--border-*`, `--accent*`, `--state-*`, `--theme-*`), not raw hex colors; lint rejects `#000000` and raw hex Tailwind classes (`bg-[#…]`) in app code. Dark mode = `data-theme="dark"` / `.dark` (custom variant). Changing a token must still pass `verify:contrast`.
- Icons: `lucide-react`; animation: `motion`; editor: TipTap.
- If you edit the inline theme script in `index.html`, update `INLINE_THEME_SCRIPT_CSP_HASH` in `server.ts` (lint will fail otherwise).
- Heavy libs are split via `manualChunks` in `vite.config.ts`; lazy-load large features.

## Deployment

- `main` is production. `.github/workflows/ci.yml` and `e2e.yml` run on every PR. `.github/workflows/deploy.yml` on push to `main`: `npm ci` → `npm run lint` → `npm audit --omit=dev --audit-level=high` → `npm test` → `npm run build`, then triggers the Render deploy hook (`RENDER_DEPLOY_KEY`), waits until `/api/health` reports the commit, runs `/api/health?deep=1` and the production smoke suite (if its secrets exist). `uptime.yml` checks `/api/health?deep=1` every 15 minutes.
- `render.yaml`: single Docker web service (`Dockerfile`, two-stage node:22-alpine), `plan: free` (cold starts, 512 MB RAM — keep `MAX_UPLOAD_MB` small), `autoDeploy: false` (deploys are triggered by `deploy.yml`), `healthCheckPath: /api/health`. Secrets are `sync: false` (set in the Render dashboard).
- `VITE_*` vars are baked in at build time (Docker build args). Anything secret must never be prefixed `VITE_`.
- Supabase migrations / Edge Functions are deployed separately (Supabase CLI), not by Render.

## Environment

Template: `.env.example` (all real `.env*` files are gitignored). Full inventory and what each variable does: `SETUP.md` §4. Keys the code reads: Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`), crypto and security (`MASTER_KEY`, `LLM_CHALLENGE_SECRET`, `MAIN_ADMIN_EMAIL`, `VITE_CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY`), AI and search (`TAVILY_API_KEY`, `SERPER_API_KEY`, `BRAVE_SEARCH_API_KEY`, `OPENALEX_API_KEY`, `ALLOW_SERVER_LOCAL_AI`, `ENABLE_SERVER_AI`), runtime (`PORT`, `NODE_ENV`, `MAX_UPLOAD_MB`). Email keys (`RESEND_*`, `ADMIN_EMAIL`) are Supabase Edge Function secrets.

## Rules

1. **Never** read out, log, modify, or commit `.env` files or secret values. When you need env info, list key names only.
2. **Never** push directly to `main`. Work on a branch; before pushing run `npm run lint` (must pass) and the relevant tests; run `npm run build` when touching build config, server entry, or imports shared between client and server.
3. Strict TypeScript: no `any` without justification, no `@ts-ignore` to silence real errors. Validate external input with zod.
4. Keep components small and modular; put pure logic in `src/domain` / services, not in components. Add or update tests next to the code (`__tests__/`).
5. Security-sensitive areas (auth middleware, RLS/migrations, credentialVault, ssrfGuard, CSP, proxies) need extra care: preserve fail-closed behavior and add a test for the change.
6. New DB changes go in a new timestamped file under `supabase/migrations/`; never edit an applied migration.
