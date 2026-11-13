# System Map

A navigational map of the repository: where things live and where to start when changing something. Behaviour is described in [`docs/`](docs/README.md); this file only points at files.

## 1. Top level

| Path | Contents |
| :--- | :--- |
| `server.ts` | Express entry: helmet and CSP, header redaction, Supabase proxy, body parsers, route registration, Vite middleware (dev) or static `dist/` (prod), process guards, graceful shutdown |
| `server/` | API: `routes/` (HTTP modules), `src/` (middleware, AI engine, research, discovery, services, utils), `services/briefScannerGraph.ts` (LangGraph), `utils/llm.ts` and `utils/ssrfGuard.ts`, `db/` |
| `src/` | The React SPA plus code shared with the server (see section 3) |
| `supabase/` | `schema*.sql`, `migrations/`, `functions/` (Deno Edge Functions) |
| `ml-style-engine/` | Offline Python corpus, training scripts and exported model |
| `e2e/` | Playwright specs and the stand-in AI server (`stub-ai/`) |
| `scripts/` | Verification, operations and migration scripts |
| `public/`, `index.html`, `manifest.json`, `sw.js` | Static assets, SPA shell (with the hashed inline theme script), PWA manifest and legacy service worker |
| `.github/workflows/` | `ci.yml`, `e2e.yml`, `slide-parity.yml`, `deploy.yml`, `uptime.yml` |
| `.claude/`, `.agents/`, `.husky/` | Agent definitions and skills (single-brain guardian), an IDE assistant rule file, the pre-commit hook (`npm run lint`) |
| `Dockerfile`, `render.yaml` | Container build and Render service |
| `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.test.json`, `playwright.config.ts` | Tooling |
| `README.md`, `CLAUDE.md`, `SETUP.md`, `RUNBOOK.md`, `SYSTEM_MAP.md`, `CHANGELOG.md`, `docs/` | Documentation; the other root `.md` files are dated records ([`docs/README.md`](docs/README.md)) |

## 2. Server

| Path | Contents |
| :--- | :--- |
| `server/routes/index.ts` | Re-exports every `register*Routes` |
| `server/routes/{health,auth,admin,ai,aiRun,aiAccess,studio,project,drafting,search,vault,presentations,supabaseProxy}.ts` | Route modules ([`docs/API.md`](docs/API.md)) |
| `server/routes/project/` | Per-workflow routers: `agentic/` (journal), `assignment/` (coursework), `thesis.ts`, `proposal.ts`, `presentation.ts`, `presentationCards.ts`, `claims.ts`, `evidence.ts`, `files.ts`, `activity.ts`, `parse.ts`, `mesh.ts`, `journal_compliance.ts`, `submissions.ts`, `core/` (manuscript, gates, export, shared helpers) |
| `server/src/aiEngine/` | `omniRouter`, `userRouter`, `adminRouter`, `credentialVault`, `userKeyVault`, `creditEngine`, `creditPolicy`, `quotaEngine`, `entitlements`, `providerHealth`, `auditLog`, `adminUsers`, `userAdmin`, `opportunityAgent` |
| `server/src/ai/` | `routerBridge` (request chain), `clientAiConfig`, `aiEndpointGuard`, `aiRouteErrors`, `premium`, `premiumPort` |
| `server/src/services/` | `scholarBrain.ts` (the only AI brain), `semanticRagEngine.ts` |
| `server/src/research/`, `server/src/discovery/` | Web search, deep research, citation validation, scholarly retrieval, live search, blueprint scout |
| `server/src/middleware/` | `auth`, `requireAdmin`, `rateLimit`, `captchaVerify`, `rejectClientCredentials`, `uploadGuard`, `errorHandler`, `asyncHandler` |
| `server/src/utils/` | `citationLockScrubber`, `scholarlyVoiceGuard`, `sectionBudget`, `sectionScaffold`, `wordBudgetAllocator` |
| `server/src/supabaseRest.ts`, `syncRelational.ts`, `concurrency/projectLock.ts` | Data API client, relational mirroring, per-project lock |

## 3. Client and shared code (`src/`)

| Path | Contents |
| :--- | :--- |
| `main.tsx` | SPA entry: `/admin/*` (lazy) and `/*` (`DeskApp`) |
| `desk/` | UI by feature; `DeskApp.tsx` routes, `DeskShell.tsx` generic shell, `ProjectListScreen.tsx`, workspaces `assignment/`, `thesis/`, `workspace/` (journal studio), `journal/`, `proposal/`, `presentation/`, plus `vault/`, `aiAccess/`, `ai/`, `auth/`, `account/`, `admin/`, `dashboard/`, `setup/`, `regions/`, `api/` (typed client) |
| `app/` | Engines: `atlas` (output-type catalog), `conductor` (project store and gates), `mesh`, `citation`, `manuscript`, `review`, `coherence`, `rubric`, `studio`, `journal`, `anonymization`, `coverLetter`, `export` |
| `domain/` | Pure models and zod schemas |
| `features/` | `slides` (Gamma engine, Presentation Studio steps), `coursework` (style engine, legacy components), `drafting`, `sources`, `understand` |
| `platform/` | `gateway/`, `router/`, `warden/` |
| `services/` | Supabase client and auth, vault, project store clients (`store/`), crypto, offline queue, capabilities, AI settings, hardware and local-runner probes |
| `citation_compliance/` | Formatters (APA 7, IEEE, MLA 9, Chicago, Chicago notes, Harvard, Vancouver), validation, CSL engine, BibTeX and RIS importers |
| `document_intelligence/` | Parsers registered at server start (`registerDefaultParsers`) |
| `config/` | Provider, model and local-runner catalogs; account schema |
| `shared/`, `utils/`, `hooks/`, `components/`, `layouts/`, `types/` | Cross-cutting helpers (brief parsing is in `utils/briefQuestions.ts`, `briefSourceQueries.ts`, `briefExtractor.ts`), hooks, shared UI, layouts, generated DB types |
| `index.css` | Design tokens and base styles |
| `__tests__/` | Repository-level tests: `singleBrainGuardian`, `render.costGuard`, `authIntegration`, and others |

## 4. Supabase (`supabase/`)

- `schema.sql`, `schema_ai_engine.sql`, `schema_store.sql`, `schema_user_settings.sql`: base schemas.
- `migrations/`: timestamped SQL, applied in order; see [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md).
- `functions/`: `search-proxy`, `arxiv-proxy`, `who-proxy`, `imf-proxy`, `request-profile-update`, shared helpers in `_shared/`.

## 5. Scripts (`scripts/`)

| Group | Files |
| :--- | :--- |
| Lint gates | `verify-contrast.mjs`, `verify-csp-hash.mjs`, `verify-no-pure-black.mjs`, `verify-no-raw-hex-classes.mjs` |
| Build | `verify-chunk-budget.mjs`, `slide-parity/`, `verify-scholar-presentation-mega.mjs` |
| Database | `db/replay-migrations.sh`, `db/schema-diff.sh`, `db/schema-fingerprint.sql`, `db/supabase-stub.sql`, `verify-local-supabase.sh`, `apply-*-migration.ts`, `migrate-jsonb-to-relational.ts`, `create_bucket.ts` |
| Operations | `smoke-prod.mjs`, `smoke-prod.sh`, `verify-deployment-readiness.sh`, `rewrap-platform-credentials.ts`, `reset-all-vaults.ts`, `migrate-users-to-supabase.ts`, `seedAiRegistry.ts`, `e2e-setup.mjs` |

## 6. Where to start

| Task | Start here |
| :--- | :--- |
| New or changed HTTP endpoint | `server/routes/` module, then [`docs/API.md`](docs/API.md) |
| New AI capability | A method on `scholarBrain` (read `.claude/skills/single-brain-guardian/SKILL.md` first) |
| Provider or model change | `src/config/providerCatalog.ts`, `modelCatalog.ts`; adapters in `src/platform/gateway/adapters.ts` |
| Coursework stage | `src/desk/assignment/stages/` and `server/routes/project/assignment/` |
| Journal stage | `src/desk/workspace/types.ts` (stage list) and `server/routes/project/agentic/` |
| Slide layout or theme | `src/features/slides/gamma/geometry.ts`, `theme.ts` ([`docs/presentation-studio.md`](docs/presentation-studio.md)) |
| Output type | `src/app/atlas/catalogData.ts` |
| Design token | `src/index.css`, then `npm run verify:contrast` |
| Database change | New timestamped file in `supabase/migrations/`, then [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) |
| Deploy or CI | `.github/workflows/`, `render.yaml`, [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
