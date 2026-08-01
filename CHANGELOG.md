# CHANGELOG - Scholar Agentic Operating System

## Unreleased — Phase 0-2: foundation, storage lift, submission workflow (2026-08-01)

Merged via PRs #1, #2, #3. **Not deployed** — the repo has no deployment
pipeline; `.github/workflows/ci.yml` runs type-check, tests, build, and a
bundle-size check only.

### Added

- **Hybrid browser persistence** (`src/services/storageService.ts`) — IndexedDB
  primary with automatic, silent `localStorage` fallback, lifting the ~5 MB
  `localStorage` ceiling that blocked multi-document work. Compression above
  100 KB with a self-describing `z1:` prefix; `migrateToHybridStorage()` moves
  existing profiles across on first run. See
  `docs/adr/ADR-0013-HybridBrowserStorage.md`.
- **Multi-document type system** (`src/types/documentTypes.ts`,
  `DocumentTypeSelector.tsx`) — 10 academic document types with per-type
  metadata, section sets, word-count targets, and quality gates. Wired into
  Phase A intake and the QC suite.
- **Sci-fi UI foundation** (`src/components/SciFiComponents.tsx`) — 10 reusable
  components (Spinner, PhaseIndicator, GlassmorphicCard, ProgressBar,
  StatusIndicator, LoadingSkeleton, ProcessingOverlay, NeonButton, GlowBox,
  PhaseBadge) plus supporting animations in `src/index.css`. Design record in
  `docs/design/PHASE1_UI_REDESIGN.md`.
- **Research materials approval workflow** (`DataSourceApprovalPanel.tsx`) —
  filterable, expandable approval gate for Phase C data sources.
- **Agent Orchestration Dashboard** (`AgentOrchestrationDashboard.tsx`) —
  surfaces all 7 research agents with input-availability gating, per-agent
  status, and overall progress.
- **Submission workflow suite** (Phase 2) — `src/types/submissionTypes.ts`
  (submission records across 8 states, reviewer comments, response drafts,
  cover-letter templates, 7 readiness quality gates) plus four UI components:
  `CoverLetterGenerator`, `SubmissionChecklistBuilder`, `SubmissionTracker`,
  and `ReviewerResponseManager`.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) — type-check, test, build,
  bundle-size, on Node 20.x and 22.x.
- **Global test cleanup** (`src/testSetup.ts`) — registers
  `@testing-library/react`'s `cleanup()` in `afterEach` via vitest
  `setupFiles`.

### Changed

- Strict TypeScript enforcement; `server.ts` decomposed into route modules.
- `useProjectPersistence.ts` is now async, matching the new storage API.
- `DocumentExportPipeline.tsx` delegates to the existing, tested
  `documentExportService.ts` rather than reimplementing PDF/DOCX generation.

### Removed

- **46 files, 8,303 lines of unwired code** — `src/orchestrator`,
  `src/knowledge`, `src/lifecycle`, `src/publication`, `src/writing`,
  `src/collaboration`, `src/workspace`. Zero importers outside their own
  directories at the time of deletion. Test count 1207 → 1104; the entire delta
  is the deleted orchestrator suite, not lost coverage of live code.
  Rationale, restore instructions, and revisit criteria in
  `docs/adr/ADR-0012-KernelModuleRemoval.md`. **This shipped in Phase 0 without
  an ADR** — documented retroactively.

### Fixed

- CI Node matrix corrected 18.x → 20.x/22.x; PBKDF2 salt passed as `Uint8Array`
  rather than via an unnecessary `ArrayBuffer` conversion.
- Missing `default` exports on five lazy-loaded Phase 2 components, which broke
  `React.lazy()` under `tsc --noEmit`.
- `loadAllProjects()` could `setState` after unmount; now guarded by a
  `cancelled` flag set in the effect's cleanup.
- `AIControlCenter.step5Tabs.test.tsx` clicked the Refresh button while it was
  still `disabled` mid-scan, so the click was a no-op and the assertion
  compared a count to itself. Now waits for the mount-time scan to finish.

### Known gaps

- **Not deployed.** No hosting pipeline exists.
- **Duplication, unresolved**: `CoverLetterGenerator`,
  `SubmissionChecklistBuilder`, and part of `SubmissionTracker` overlap
  functionality already present in `SubmissionPackagingSuite.tsx` (cover-letter
  generation, pre-flight checklist, single-submission status tracking). Both
  are live in the Publishing tab. Consolidation is an open decision.
- Persistence is single-device; clearing browser data destroys projects.

## Unreleased — correctness-bug sweep, doc reconciliation (2026-08-01)

### Investigated

- User asked to fix remaining correctness bugs. The four items most recently
  flagged as open in the project's own docs — `LiteratureReviewAgent.fetchWebStudies()`,
  `IntegrityReviewerSkill.evaluateReportingCompliance()`, `ResearchQuestionAgent`'s
  `recommendedDatasets` stub, and the detection-evasion prompt language in
  `aiService.ts` — were confirmed **already fixed** in earlier sessions (each has
  its own passing regression test). `docs/planning/target-workflow.md` already
  recorded three of the four fixes; only `docs/planning/agent-ui-adapter-scoping.md`
  was stale (still described `fetchWebStudies()` as "still a stub") — corrected.
- A fresh, doc-independent sweep for stub/mock/simulated/hardcoded patterns across
  `src/services`, `src/agents`, `src/skills`, `src/components`, and `server.ts`
  found no further live fabrication bugs — every remaining hit was either an
  already-fixed-and-documented case or a legitimate use (ID generation, retry
  jitter).

### Fixed

- **`KnowledgeVaultWizard.tsx`'s three AI-metadata handlers (URL, DOI, media
  ingestion) named their real `project.aiSettings` value `mockSettings`.** It was
  never mock data — it's the same real settings object passed to a real
  `AIGateway.generate()` call — but the name could mislead a future reader into
  thinking the AI call was faked. Renamed to `resolvedAiSettings`; no behavior
  change.

## Unreleased — AI Configuration redesign (2026-07-31)

### Fixed — Local AI blocked by upgrade-insecure-requests; dead Validate button

- **Allowing localhost in `connect-src` did nothing on its own.** Helmet's
  default directives include `upgrade-insecure-requests`, which rewrites every
  `http://` request to `https://` before it is sent — so the browser never
  requested `http://localhost:11434`, it requested `https://localhost:11434`
  and got "An SSL error has occurred" against every runner port (seen in a
  user's Safari console). Local AI servers speak plain HTTP on loopback and
  have no certificate, so the upgrade can never succeed.

  The directive must be set to `null`, not merely omitted: helmet defaults to
  `useDefaults: true` and merges its defaults back over whatever is supplied,
  so leaving the key out silently reinstates it. Verified against helmet
  directly, then end-to-end in a browser.

- **"Validate & Continue" could appear completely dead.** Any throw landed in a
  `catch` that only called `console.error` — no message, no advance. It also
  called `healthCheckAll`, probing every local runner (~9 loopback probes at a
  3s timeout) plus every cloud provider holding a key, which was slow enough to
  look hung and tripped the server's own rate limiter (the 429s on
  `/api/generate` in the reported console). It now checks only the selected
  providers, settles each independently, always advances, and shows the reason
  when nothing connected.


### Fixed — API key entry was unusable (blocker)

- **You could not enter an API key for any provider.** Every keystroke ran
  `encryptDataAsync` (PBKDF2, 100,000 iterations, measured at ~55-62ms), and a
  hydration effect depending on `settings` then re-decrypted every
  key-requiring provider and replaced the visible plaintext wholesale —
  overwriting what had just been typed with a value one round-trip stale.
  Entering one 73-character key cost roughly 4s of encryption and 104s of
  decryption on the main thread while characters disappeared from the field.
  Expanding the catalog from 12 to 26 providers tripled the decrypt half,
  turning a slow path into a fully blocked one.

  Typing now performs no cryptography at all; encryption happens once, on
  blur, and is also forced before Test Connection and Continue so a key typed
  without leaving the field is never lost. Guarded by
  `AISetupWizard.keyEntry.test.tsx`.

- **Added a persistent Back control to every wizard step.** Going back
  previously meant finding a small "← Change AI Mode" text link in step 1's
  header, and the vault-unlock screen had no way back at all — picking the
  wrong providers meant reloading the page to escape.


### Fixed — follow-up round, from real user testing on the deployed site

- **The onboarding wizard still showed the old five stacked cards.** The
  redesign had only been applied to `AIControlCenter.tsx` (Settings), not to
  `AISetupWizard.tsx` — which is the page users actually land on at
  "Step 2: AI API Configuration". Both now use the same `AIModeAccordion`,
  so the desktop-only rules apply in onboarding too.
- **Local AI could never connect from the deployed site.** Production CSP had
  no localhost source in `connect-src`, so a user running Ollama was blocked
  by policy before the request left the browser — while Local AI was still
  offered as one of five modes. The runner ports from
  `localRunnerCatalog.ts` are now allowed, plus a port wildcard.
  Note this is necessary but not sufficient: Ollama also refuses cross-origin
  requests unless `OLLAMA_ORIGINS` is set, which the diagnostics now say.
- **OpenRouter failed validation on a free account.** It is listed under
  "Free tier" but defaulted to `openai/gpt-4o-mini`, a PAID model — verified
  against OpenRouter's own /models endpoint ($0.15/M prompt tokens) — so a
  free account with no credits was rejected on the first test. Now defaults
  to a `:free` model.
- **The wizard discarded the reason a connection failed**, rendering only
  "OFFLINE". It now shows the classified diagnosis and remedy.


### Fixed — connection failures

- **Qwen was unusable.** `/api/generate` had no `qwen` branch, so every
  non-streaming Qwen request returned `400 Unsupported provider: qwen`
  regardless of key validity, while `/api/stream-generate` handled it fine.
  Verified fixed against the live DashScope API (now returns a real 401 for a
  bad key instead of never leaving the server).
- **Bring-your-own-key Gemini was CSP-blocked in production.** Gemini is the
  only provider called directly from the browser, and
  `generativelanguage.googleapis.com` was missing from `connect-src` — so
  supplying your own key failed while leaving it blank worked.
- **Cohere streaming ignored the server-stored-key fallback**, using the raw
  request-body key instead of `activeApiKey` like every other provider.
- **Health checks never inspected `response.ok`**, flattening 401/429/400 into
  a single `"degraded — Unexpected response"` with the real message discarded.

### Added

- **26 cloud providers** (was 12) in the new `src/config/providerCatalog.ts`,
  a single source of truth shared by the browser bundle and `server.ts`. Adding
  a provider is now one entry and needs no adapter or server change.
  GitHub Models was researched and deliberately excluded — a live probe found
  it returning HTTP 410 `github_models_retirement_brownout`.
- **9 local runners** (`src/config/localRunnerCatalog.ts`): Ollama, LM Studio,
  Jan.ai, LocalAI, llama.cpp server, KoboldCPP, vLLM, Text Generation WebUI,
  OmniRoute — each with real install steps and runner-specific CORS guidance,
  which is the usual reason local AI appears not to connect.
- **Persistent encrypted API vault** (`src/services/apiVault.ts`) with two
  unlock modes: device (a non-extractable AES-GCM key in IndexedDB — opens
  with no prompt, unreadable by any script) or passphrase (never stored).
  Includes encrypted backup export/import for recovery.
- **Classified errors** (`src/services/aiErrors.ts`) reporting "Invalid API
  key", "Rate limit exceeded", "Quota exhausted" or "Blocked by the browser
  (CORS)" with a specific remedy. A `no-cors` probe definitively distinguishes
  a CORS refusal from an unreachable server.
- **Automatic failover** (`src/services/providerFailover.ts`) driven by error
  kind, honouring `Retry-After`, with per-provider cooldowns. Streaming keeps
  already-emitted text and asks the replacement provider to continue from it.
- **Hardware pre-check** (`src/services/hardwareProfile.ts` +
  `src/config/localModelCatalog.ts`) recommending local models against real
  memory limits, and stating plainly what a browser cannot detect
  (`navigator.deviceMemory` caps at 8 GB; video memory is undetectable).
- **Live "Test connection"** (`src/services/connectionTester.ts`) performing a
  real generation, then reporting a precise diagnosis and the models the key
  can actually use.

### Changed

- The five AI-mode cards became an accordion (`AIModeAccordion.tsx`). They
  previously collapsed to a single column of full-height cards below `md`, so
  a phone user scrolled five tall cards before reaching anything else.
- Smart Gateway and Local AI are no longer rendered below desktop — they
  require running a server program locally, which a phone cannot do. Mobile
  gets an honest on-device-AI explanation instead of a control that cannot work.
- The API Keys tab manages every catalogued provider. It previously listed six
  hardcoded providers, so Groq/Together/OpenRouter keys chosen during
  onboarding could never afterwards be viewed, retested or corrected.
- `aiGateway.ts` lost ~700 lines of duplicated adapters in favour of two
  factories driven by the catalogs. Legacy `AISettings.<provider>ApiKey`
  ciphertext still resolves, so no user migration is required.

### Security

- `isSafeOutboundBaseUrl` in `server.ts` restricts the user-supplied base URL
  (needed for Cloudflare's account-scoped address) to HTTPS public hosts,
  closing the SSRF surface that a free-form proxy target would otherwise open.

See `docs/adr/ADR-0011-AIProviderCatalogAndVault.md` for the full rationale.


## v1.0.0 - LTS Release

### Operating Systems

#### AI Operating System
- Multi-provider AI abstraction layer
- Provider support: OpenAI, Anthropic, Gemini, Ollama, LM Studio
- AIRouter with fallback, caching, telemetry
- ModelRegistry, TaskRouter, PolicyEngine

#### Knowledge Operating System
- KnowledgeKernel with storage interfaces
- KnowledgeRegistry for object management
- KnowledgeGraph for relationship management
- SemanticMemory for vector search
- KQL (Knowledge Query Language)
- ReasoningEngine with deductive/inductive/abductive reasoning

#### Writing Operating System
- WritingKernel for manuscript generation
- Outline generation with templates
- Section planning support

#### Publication Operating System
- PublicationKernel for journal management
- Journal metadata and recommendations
- Impact factor-based ranking

#### Workspace Operating System
- WorkspaceKernel for project management
- Multi-project support
- Lifecycle management

#### Collaboration Operating System
- CollaborationKernel for team management
- Team creation and membership
- User role management

### Architecture
- Clean Architecture compliant
- Kernel-based design
- Dependency Injection
- Event-driven ready

### Testing
- 330 automated tests passing (18 test files)
- Unit tests for all kernels
- Integration tests for OS modules

### Note
- Only the AI kernel (`src/ai`) is currently consumed outside its own module (by `src/research`); the other OS kernels, the orchestrator, and the agents are implemented and tested but not yet wired into `server.ts` or the React app. See `.claude/HANDOVER.md` §0.

### Documentation
- 5 Architecture Documents
- 10 Architecture Decision Records
- Developer Handbook
- API Reference Documentation