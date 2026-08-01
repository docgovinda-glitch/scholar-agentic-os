# 01 — System Inventory

Pure observation. No evaluation, no recommendations — those are in 02.
All figures taken at `main` (`4e46f2f`), 2026-08-01.

---

## 1. Shape of the codebase

`[OBSERVED]` — non-test TypeScript, by area:

| Area | Lines | Files | Test files |
|---|---:|---:|---:|
| `src/components` | 22,455 | 44 | 37 |
| `src/services` | 8,347 | 28 | 29 |
| `src/ai` | 6,086 | 37 | 2 |
| `src/document_intelligence` | 3,753 | 18 | 10 |
| `server/` | 3,584 | 15 | — |
| `src/skills` | 3,059 | 13 | 5 |
| `src/agents` | 2,231 | 16 | 10 |
| `src/research` | 2,173 | 28 | 1 |
| `src/config` | 1,724 | 6 | 3 |
| `src/core` | 591 | 9 | 0 |
| `src/hooks` | 580 | 4 | 4 |
| `src/utils` | 407 | 3 | 3 |
| `src/citation_compliance` | — | 17 | 1 |
| `src/auth` | 216 | 2 | 0 |
| `server.ts` | 470 | 1 | — |
| `src/App.tsx` | 788 | 1 | — |
| `src/types.ts` | 747 | 1 | — |

`[OBSERVED]` Suite: 106 files, 1,104 tests, all passing. `tsc --noEmit` clean,
`npm run build` clean.

`[OBSERVED]` The five largest components are `KnowledgeVaultWizard.tsx` (1,484),
`AIControlCenter.tsx` (1,450), `ManuscriptDraftingWorkspace.tsx` (1,330),
`UserProfileGate.tsx` (1,224), `ResearchIntakeWizard.tsx` (1,168).

---

## 2. Runtime topology

`[OBSERVED]` Three deployed pieces, from config files, not prose:

**Browser SPA** — React 19 + Vite 6 + Tailwind 4. Entry `src/App.tsx`. PWA
assets present (`manifest.json`, `sw.js`).

**Express server** (`server.ts` → `dist/server.cjs` via esbuild). Serves the
built SPA and a JSON API. `Dockerfile` runs `npm start` on port 3000.
`render.yaml` declares a Render web service `scholar-agentic-os`, `env: docker`,
`plan: starter`.

**Supabase** — `supabase/schema.sql` plus 12 Edge Functions:
`approve-registration`, `approve-password-reset`, `request-password-reset`,
`request-profile-update`, `send-approval-email`, and four outbound proxies
(`arxiv-proxy`, `who-proxy`, `imf-proxy`, `search-proxy`), with shared
`cors.ts`, `resend.ts`, `adminClient.ts`.

`[OBSERVED]` `netlify.toml` also exists, configured for a static SPA publish of
`dist` with a catch-all rewrite to `index.html`.

`[INFERRED]` The Netlify config and the Render service are alternative hosting
targets, not complementary ones — a static Netlify publish cannot serve the
Express API the SPA calls. Inferred from the absence of any API proxy or
redirect in `netlify.toml`.

`[OBSERVED]` No deployment step exists in CI. `.github/workflows/ci.yml` is the
only workflow: type-check, test, build, bundle-size check, on Node 20.x and
22.x.

`[INFERRED]` Deployment is therefore driven by Render's own git integration,
not by this repository's CI.

`[ASSUMPTION]` Whether the Render service is currently serving traffic cannot
be determined from the repository. A comment in `render.yaml` asserts it was
confirmed live via the Render API on 2026-07-31; that is a claim in a comment,
not evidence in code.

---

## 3. Server API surface

`[OBSERVED]` `server.ts` wires exactly four route registrars from
`server/routes/index.ts`:

```
registerHealthRoutes(app)
registerAdminRoutes(app)
registerParseRoutes(app, parseFileLimit, parseExternalLinkLimit, lookupDoiLimit)
registerAIRoutes(app, aiAbuseLimit, citationStyleRegistry)
```

`[OBSERVED]` AI endpoints (`server/routes/ai.ts`): `/api/generate`,
`/api/stream-generate`, and seven task-specific routes —
`generate/dissertation-grounding`, `data-discovery`, `journal-discovery`,
`extract-requirements`, `draft-section`, `quality-control`, `submission-pack`,
`citation-engine`.

`[OBSERVED]` Parse endpoints: `/api/parse-file`, `/api/parse-external-link`,
`/api/lookup-doi`.

`[OBSERVED]` **`server/routes/auth.ts` (1,088 lines) and
`server/routes/parser.ts` (259 lines) are exported by nothing and imported by
nothing.** `server/routes/index.ts` re-exports only `health`, `admin`, `parse`,
`ai`; `server.ts` imports only that barrel. Verified by reading both files in
full.

`[OBSERVED]` `auth.ts` defines ten endpoints (`/api/register`,
`/api/check-approval`, `/api/request-password-reset`, `/api/approve-reset`,
`/api/verify-and-sync-profile`, `/api/request-profile-update`,
`/api/approve-profile-update`, `/api/save-model-preferences`,
`/api/save-api-keys`, `/api/approve`) — none of them reachable.

`[INFERRED]` These are the pre-Supabase authentication implementation, orphaned
rather than removed when auth moved to Supabase. Inferred from the overlap
between these endpoint names and the Supabase Edge Function names in §2.

`[OBSERVED]` `users.json` (17 bytes) sits at the repo root and is still
referenced by `server.ts` (`USERS_DB_PATH`), by the dead `auth.ts`, by
`server/services/userDb.ts`, and by `scripts/migrate-users-to-supabase.ts`.

---

## 4. Data model

`[OBSERVED]` One aggregate root, `PaperProject` in `src/types.ts` (747 lines),
carrying ~45 top-level fields. Grouped by what they do:

- **Intake**: `title`, `objectives`, `researchQuestions`, `researchGap`,
  `methodology`, `field`, `keywords`, `articleType`, `outputFormat`,
  `documentType`, `dissertationMaterials`, `styleAspiration`
- **Authorship**: `authorName`, `orcidId`, `authorAffiliation`, `authorEmail`,
  and a parallel `coAuthor*` set
- **Workflow**: `currentPhase`, `furthestPhase` — both typed
  `"A"|"B"|"C"|"D"|"E"|"F"|"G"|"G1"|"G2"|"H"|"I"`
- **Artifacts**: `sections: Record<string, string>`, `versions`,
  `lockedSections`
- **Research state**: `groundingMap`, `dataSources`, `targetJournal`,
  `complianceRules`
- **Quality**: `qcReport`, `integrityReviewReport`, `submissionPack`
- **AI**: `aiSettings`, `modelPreferences` (7 per-task model slots),
  `usageLogs`, `costMetrics`, `styleLearningEnabled`, `aiUseDisclosure`

`[OBSERVED]` The manuscript body is `Record<string, string>` — section name to
raw text. There is no block, node, or paragraph model.

`[OBSERVED]` `WORKFLOW_PHASES` in `src/types.ts` defines the lettered A–I
sequence (`A: Intake`, `B: Grounding`, …). Enforcement is
`src/utils/phaseGating.ts` (49 lines).

---

## 5. Persistence

`[OBSERVED]` `src/services/storageService.ts`. IndexedDB (`scholar-agentic-os`,
v1, stores `projects` and `metadata`) with automatic `localStorage` fallback on
any failure. Compression above a 100 KB threshold via base64 with a `z1:`
prefix; `decompress()` passes through unprefixed values. `migrateToHybridStorage()`
moves legacy profiles. Project *metadata* is deliberately kept in
`localStorage` and read synchronously.

`[OBSERVED]` Consumed through `src/hooks/useProjectPersistence.ts`, which is
async and carries a `cancelled` flag in its load effect to suppress
post-unmount `setState`.

`[OBSERVED]` No server-side project storage. The Express API is stateless with
respect to manuscripts — it proxies AI and parsing only.

`[INFERRED]` Projects are therefore single-device. Nothing in the repo syncs
`PaperProject` across browsers or machines.

---

## 6. AI subsystem

`[OBSERVED]` Layered, with a catalog at the base:

| Layer | File | Lines |
|---|---|---:|
| Task orchestration | `src/services/aiService.ts` | 1,607 |
| Provider gateway | `src/services/aiGateway.ts` | 1,134 |
| Cloud provider catalog | `src/config/providerCatalog.ts` | 618 |
| Local runner catalog | `src/config/localRunnerCatalog.ts` | 227 |
| Encrypted key vault | `src/services/apiVault.ts` | 591 |
| Failover | `src/services/providerFailover.ts` | 358 |

`[OBSERVED]` 28 catalog entries in `providerCatalog.ts`, 11 in
`localRunnerCatalog.ts`. Both are consumed by the browser bundle *and* by
`server.ts`.

`[OBSERVED]` Four user-facing AI modes in `src/config/aiModes.ts`: `omniroute`
(self-hosted gateway with fallback), `cloud` (BYOK — OpenRouter, Gemini, Groq,
DeepSeek, Together), `local` (Ollama, LM Studio, custom endpoint), and a
managed default.

`[OBSERVED]` `src/ai/` is a separate 6,086-line subsystem with its own
sub-packages: `router`, `registry`, `providers`, `models`, `cache`, `quota`,
`telemetry`, `health`, `benchmark`, `discovery`, `hardware`, `errors`, `local`.
It has **2 test files across 37 source files**.

`[INFERRED]` `src/ai` and `src/services/aiGateway.ts` are two independent
implementations of provider abstraction. Inferred from both owning provider
registries, health checks, and routing, with no import edge from `aiGateway.ts`
into `src/ai/`.

---

## 7. Agents and skills

`[OBSERVED]` Two parallel registries:

- `src/agents/` — `registry.ts`, `executor.ts`, `pipeline.ts`, plus seven
  agents: `researchPlanner`, `literatureReview`, `knowledgeGap`,
  `researchQuestion`, `methodologyAdvisor`, `statisticalAnalysis`,
  `integrityReviewer`
- `src/skills/` — `registry.ts`, `executor.ts`, plus nine skills mirroring the
  agents almost one-to-one, with `humanizeSkill` and `manuscriptWriterSkill`
  additional

`[OBSERVED]` Agents delegate to skills. `researchPlanner.test.ts` is explicitly
titled "ResearchPlannerAgent -> ResearchPlanningSkill (native skill round
trip)".

`[OBSERVED]` Reached from the UI via `src/services/agentService.ts` and
`AgentOrchestrationDashboard.tsx`.

`[OBSERVED]` Execution is one-shot per agent: `executeAgent(id, input)`
returning a result. There is no queue, scheduler, retry manager, dependency
resolver, or persistence of agent runs.

---

## 8. Document intelligence and citation

`[OBSERVED]` `src/document_intelligence/` (3,753 lines) — parsers for PDF
(`pdf-parse`), DOCX (`mammoth`), TXT, Markdown; `headingDetection.ts`; a
`pipeline/` with a `stageRegistry`; `adapters/`, `model/`, `skills/`.

`[OBSERVED]` `src/citation_compliance/` — six formatters (APA 7, IEEE, MLA 9,
Chicago, Harvard, Vancouver) behind a `CitationStyleRegistry`, registered once
at server startup, plus BibTeX and RIS importers and a `CanonicalReference`
model. **1 test file across 17 source files.**

`[OBSERVED]` Export is `src/services/documentExportService.ts` — real DOCX via
`docx`, real selectable-text PDF via `pdfmake`, both built from one
`buildExportDocumentModel()`.

---

## 9. The gates

`[OBSERVED]` Three enforcement points, all in live code paths:

**Source approval.** `dataSources` carry a `status`. Four call sites filter on
`status === "approved"` before use — `aiService.ts:123` (AI context),
`documentExportService.ts:180` (reference list),
`manuscriptWriterAdapter.ts:46`, and the export model builder. Unapproved
sources cannot reach a manuscript or a bibliography.

**AI-use disclosure.** `PaperProject.aiUseDisclosure` with a `confirmedAt`
timestamp. `documentExportService.ts:192` emits `disclosureText` **only** when
`confirmedAt` is set. `ManuscriptEditorWorkspace.tsx` routes every export
through `requestDownload()`, which opens a confirmation modal unless
`aiUseDisclosure?.confirmedAt` is already present. Placement is immediately
before the references section.

**Phase gating.** `src/utils/phaseGating.ts` — `canEnterPhase()` and
`resolveFurthestPhase()`, applied in `App.tsx`.

---

## 10. Security posture

`[OBSERVED]` `helmet` with an explicitly configured CSP (`connect-src` extended
beyond defaults; `form-action` set). Four `rateLimit` configurations:
`aiAbuseLimit`, `parseFileLimit`, `parseExternalLinkLimit`, `lookupDoiLimit`.
Additional per-user and brute-force limiters exist in the dead `auth.ts`.

`[OBSERVED]` Provider keys are encrypted client-side (`apiVault.ts`,
device-bound or passphrase unlock, with backup/restore). A server-side fallback
path decrypts keys using `ENCRYPTION_KEY`; `server.ts:229` warns when it is
unset.

`[OBSERVED]` Secrets are declared `sync: false` in `render.yaml` —
`GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP`, `ADMIN_EMAIL`, `ENCRYPTION_KEY`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, plus the two Supabase values.

`[OBSERVED]` `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are Docker build
ARGs, baked into the client bundle.

`[INFERRED]` Row-level security in Supabase is therefore the only thing
protecting user data — the anon key is public by construction. Whether RLS is
correctly configured is in `supabase/schema.sql` and was not audited here.

---

## 11. Test distribution

`[OBSERVED]`

| Area | Test files | Source files |
|---|---:|---:|
| `hooks` | 4 | 4 |
| `utils` | 3 | 3 |
| `services` | 29 | 28 |
| `components` | 37 | 44 |
| `document_intelligence` | 10 | 18 |
| `agents` | 10 | 16 |
| `skills` | 5 | 13 |
| `config` | 3 | 6 |
| **`ai`** | **2** | **37** |
| **`research`** | **1** | **28** |
| **`citation_compliance`** | **1** | **17** |
| **`core`** | **0** | **9** |
| **`auth`** | **0** | **2** |

`[OBSERVED]` `vitest.config.ts` sets `setupFiles: ['./src/testSetup.ts']`,
which registers `@testing-library/react`'s `cleanup()` in `afterEach`.
`test.globals` is off, so this registration is required — without it RTL's
automatic cleanup never runs.

---

## 12. Deleted subsystem

`[OBSERVED]` Commit `4afb6c8` removed 46 files / 8,303 lines: all of
`src/orchestrator` (30 files, ~5,500 lines — workflow engine, executor,
registry, scheduler, queue, dependency resolver, retry and failure recovery,
approval gates, metrics, health monitor, audit, plus a 1,443-line test suite),
`src/knowledge` (11 files — knowledge graph, semantic memory, a `KQL` query
layer, reasoning and relationship engines), `src/lifecycle` (the 10-phase
`ResearchLifecycleEngine`), and the `publication`, `writing`, `collaboration`,
`workspace` kernels.

`[OBSERVED]` `git grep` at `4afb6c8~1`, excluding the modules' own
directories, finds no importer of any of them.

`[OBSERVED]` Test count moved 1,207 → 1,104; the 103-test delta is the deleted
orchestrator suite.
