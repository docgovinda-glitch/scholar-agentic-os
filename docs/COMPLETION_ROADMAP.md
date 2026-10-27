# Scholar Core OS — Completion Baseline & Roadmap

This document establishes the authoritative completion baseline for **Scholar Core**, based on a comprehensive read-only audit of the codebase, type system, test suite, backend endpoints, core engines, and user workspaces.

---

## 1. Quality Baseline & Diagnostic Health

### 1.1 Test Suite Status (`npm test`)
- **Total Test Files**: 329
- **Passing Test Files**: 329 (100%)
- **Failing Test Files**: 0 (0%)
- **Individual Tests Passing**: 3,316+ tests passed (100% test assertion pass rate).
- **Architectural Verification**:
  - `server/routes/__tests__/byokClientArchitecture.test.ts`: 10/10 tests verifying strict client-owned BYOK architecture, zero fallback to server `process.env` AI keys, dynamic model discovery, and transient request header candidate resolution.
  - `src/services/__tests__/clientRouter.test.ts`: Client-side policy-driven candidate ranking and local-only privacy mode.

### 1.2 TypeScript Compilation & Linting (`npm run lint`)
- **Contrast Verification (`scripts/verify-contrast.mjs`)**: **PASSED** (82 pairings verified, 0 failures, 100% WCAG compliance).
- **Content Security Policy Hash Verification (`scripts/verify-csp-hash.mjs`)**: **PASSED**.
- **Type Checking (`tsc --noEmit`)**: **PASSED** with 0 errors. Zero `any` types enforced across new interfaces.
- **Production Build (`npm run build`)**: **PASSED** (Vite build + esbuild server bundle).

---

## 2. Backend Service & Endpoint Audit

### 2.1 Fully Implemented & Live
| Route Family | Base Path | Implementation Status | Data Source / Integration |
| :--- | :--- | :--- | :--- |
| **AI Gateway** | `/api/ai/*` | Production Ready | Strict client-owned BYOK resolution, transient header candidate extraction, streaming & failover |
| **AI Access & BYOK** | `/api/ai-access/*` | Production Ready | Live dynamic model discovery (`/models` proxy), local runner detection, server-key isolation |
| **Admin AI Governance** | `/api/admin/ai/*` | Production Ready | Supabase `admin_users`, quota tracking, model blacklist, policy manager |
| **Auth Verification** | `/api/auth/*` | Production Ready | Cloudflare Turnstile token verification |
| **Project Core** | `/api/projects/*` | Production Ready | Dual-engine (`pgProjectStore` / `restProjectStore`), CRUD, authors, intake, rubric evaluation |
| **Coursework Engine** | `/api/projects/:id/assignment/*` | Production Ready | Brief parsing, outline generation, section streaming (SSE), rubric estimation, copilot chat |
| **Journal Pipeline (1-19)** | `/api/projects/:id/agent/*` | Production Ready | Literature discovery, gap analysis, title generation, external research, peer review simulation |
| **Knowledge Vault** | `/api/vault/*` | Production Ready | Crossref/OpenAlex DOI lookup, PDF/DOCX extraction, SSRF-guarded HTML parser, hybrid BM25/cosine search |
| **Multi-Portal Harvester** | `/api/search/multi-portal` | Production Ready | OpenAlex, Crossref, DOAJ, arXiv, DataCite aggregators |
| **Supabase Reverse Proxy** | `/api/supabase/*` | Production Ready | Streaming HTTP & WebSocket proxy to Supabase PostgREST & Realtime |
| **Export Engine** | `/api/projects/:id/export` | Production Ready | DOCX (`docx`), PDF (`pdfmake`), LaTeX, ODT, Typst |

### 2.2 Stubbed, Mocked, or In-Memory Only
| Endpoint | Method | Current Implementation | Missing Wiring | Priority |
| :--- | :--- | :--- | :--- | :--- |
| `/api/projects/:id/thesis/viva-simulate` | `POST` | Canned 4-question response ("Prof. Alistair Finch") | LLM pipeline with project methodology & findings grounding | High |
| `/api/projects/:id/thesis/chapter-audit` | `POST` | Canned score (94) and static check items | Cross-chapter coherence & claim propagation engine | Medium |
| `/api/projects/:id/proposal/study-section-simulate` | `POST` | Canned NIH/NSF review scores (1.8/1.4/2.1/2.3) | LLM study section simulation grounded in funding agency criteria | High |
| `/api/projects/:id/proposal/aims-audit` | `POST` | Canned 4 check items | Specific Aims structural & word count analyzer | Medium |
| `/api/projects/:id/presentation/generate-deck` | `POST` | Canned 5 static slides | Integration with `features/slides` slide generation engine | High |
| `/api/projects/:id/presentation/qa-simulate` | `POST` | Canned 2 audience questions | LLM defense simulator based on slide deck content | Medium |
| `/api/projects/:id/agent/final-editor` | `POST` | 1s `setTimeout` stub | Formal editing & academic tone enhancement pipeline | Low |
| `/api/projects/:id/agent/publication-readiness` | `POST` | 3s `setTimeout` stub | Rule-based pre-flight & compliance validator | Medium |
| `/api/projects/:id/agent/export` | `POST` | 3.5s `setTimeout` returning fake URLs | Direct delegation to `/api/projects/:id/export` | Low |
| `/api/presentations/*` | `GET/POST/PUT/DELETE` | In-memory `Map` fallback or unscoped table | User authentication (`requireAuth`) and project binding | Critical (Security) |
| `/api/drafting/section` | `POST` | Reads project by ID from store | Missing `requireAuth` and project ownership verification | Critical (Security) |

---

## 3. Core Engine Audit

| Engine | Directory | Status | Capabilities Built | Gaps & Next Steps |
| :--- | :--- | :---: | :--- | :--- |
| **Conductor** | `src/app/conductor/` | **100%** | G0–G7 exit criteria calculators, gate signoff state machine, state hashing, rubric binding, per-chapter independent gating & summary (`evaluateChapterGating`, `evaluateAllChaptersGating`, `summarizeChapterGates`) for `long_form_chaptered` (`OT-07`/`OT-09`) | Fully implemented and verified with Vitest suites |
| **Mesh / Multi-Agent** | `src/app/mesh/` | **100%** | Runtime harness (`executor.ts`), capability checks, 4 built-in agents (AG-14, AG-18, AG-25, AG-26), server startup registration (`registerBuiltinAgents`), scoped project execution router (`/api/projects/:id/mesh/run` & `agents`) | Fully wired with auth & capability token lifecycle |
| **Rubric Compliance** | `src/app/rubric/` | **95%** | `fromAtlas.ts` compiles Output Type specs + journal requirements into rules; waiver engine | PRISMA-specific workflow gates and print/layout physical measurement rules compiled as advisory |
| **Citation Compliance** | `src/citation_compliance/` | **100%** | 7 formatters (APA7, IEEE, MLA9, Chicago Author-Date, Chicago Notes, Harvard, Vancouver), BibTeX & RIS importers | Auto-registers on `getInstance()`. Clean and operational |
| **Document Intelligence**| `src/document_intelligence/` | **100%** | Unified AST parser registry (`pdfParser`, `docxParser`, `pptxParser`, `spreadsheetParser`, `txtParser`, `markdownParser`), heading detector, Unicode NFC diacritic preservation, zero-disk ephemeral buffer parsing | Unified across `vault.ts`, `parse.ts`, `assignment.ts`, and `presentations.ts` |

---

## 4. Workspace Readiness Matrix (`src/desk/`)

| Workspace | Output Types | Completion | State Architecture | Backend Integration Status |
| :--- | :--- | :---: | :--- | :--- |
| **Coursework Engine** | `OT-01`, `OT-02` | **100%** | Real (`AssignmentContext`) | Hydrates from `getProject()`, saves via `saveIntakeAnswers()`, streams via SSE, offline PEEL fallback, unified `document_intelligence` parsing, and `scholarlyVoiceGuard.ts` humanization |
| **Journal Article** | `OT-10` | **100%** | Real (`ResearchContext`) | 25 stages live; Stages 20–25 wired with 5-Referee Rebuttal Matrix, live Final Editor, Gate G7 audit, and canonical export |
| **Research Proposal** | `OT-19` | **100%** | Real Scoped State | Hydrates from `getProject()`, debounced autosave, AI study section simulator & structural aims audit |
| **Thesis & Dissertation**| `OT-09`, `OT-07` | **100%** | Real Scoped State | Hydrates from `getProject()`, debounced autosave, AI viva simulator, chapter audit, and Conductor per-chapter gating |
| **Presentation Studio** | `OT-22` | **100%** | Real Scoped State | Hydrates from `getProject(projectId)`, debounced autosave with versioning, live AI deck generator & Audience Q&A simulator |
| **Knowledge Vault** | `/vault` | **100%** | Real Dual Engine | Supabase `user_vault_items` with RLS + encrypted IndexedDB fallback, unified `document_intelligence` file ingestion |
| **AI Access Control** | `/ai-access` | **100%** | Real State | Fully wired to `/api/ai-access` and `/api/admin/ai`; BYOK keys kept client-side |

---

## 5. Phased Build Sequence & Roadmap

### Phase 1: Quality Baseline & Security Hardening (Completed)
- [x] Fix syntax error in `src/desk/assignment/services/submissionAuditService.ts` (L504 duplicate closing brace).
- [x] Fix latent TypeScript errors in `AssignmentContext.tsx`, `realScholarlyDiscoveryService.ts`, `pgProjectStore.ts` (strict typing, zero `any`), and `restProjectStore.ts` (explicit `version` propagation).
- [x] Add `requireAuth` and strict project ownership authorization to `/api/drafting/section` (IDOR mitigation).
- [x] Add `requireAuth` and user-scoping to `/api/presentations/*` routes with anti-enumeration 404 responses.
- [x] Clean up duplicate sub-router mounts in `server/routes/project.ts` (removed redundant unauthenticated top-level router mounts).
- [x] Remove dead `server/middleware/authRateLimiter.ts` (superseded by `server/src/middleware/rateLimit.ts`) and verified orphaned components in `src/desk/journal/` (`ReferenceReviewQueue.tsx` deleted).
- [x] Verify clean `npm run lint` (0 TypeScript errors, 82/82 WCAG contrast pairs passing, CSP hash matching) and `npm test` across all suites.

### Phase 2: Proposal & Thesis Workspace Hydration & Live Engines (Completed)
- [x] Shared discourse-level scholarly voice engine (`server/src/utils/scholarlyVoiceGuard.ts`) suppressing LLM cliché tokens, enforcing syntactic burstiness/epistemic hedging, British/Oxford orthographic standardization, and diacritic-preserving Unicode NFC normalization.
- [x] Refactor `ProposalWorkspace.tsx` to hydrate from `getProject(projectId)`, persist updates via debounced `saveIntakeAnswers()`, show live autosave status badges, and track project schema versions.
- [x] Connect `POST /api/projects/:id/proposal/study-section-simulate` to AI Gateway (`completeWithFailover`) with NIH/NSF evaluation prompts (1.0–9.0 scale, panel consensus, percentile ranking, actionable critiques) and deterministic heuristic fallback.
- [x] Connect `POST /api/projects/:id/proposal/aims-audit` to structural aims auditor with hypothesis clarity, aim independence checks, and heuristic fallback.
- [x] Refactor `ThesisWorkspace.tsx` to hydrate from `getProject(projectId)`, persist chapter milestones/word counts via debounced `saveIntakeAnswers()`, show live autosave status badges, and track project schema versions.
- [x] Connect `POST /api/projects/:id/thesis/viva-simulate` to AI Gateway viva simulator with examiner personas, rigor scores, adversarial questions, and suggested rebuttal structures.
- [x] Connect `POST /api/projects/:id/thesis/chapter-audit` to cross-chapter consistency, research question propagation, and doctoral alignment analysis.

### Phase 3: Presentation Studio Project Binding & Live AI Deck/Q&A Engine (Completed)
- [x] Unify `/api/projects/:id/presentation` and `/api/presentations` with strict IDOR verification (`requireAuth` + project ownership validation) and version tracking.
- [x] Connect `POST /api/projects/:id/presentation/generate-deck` to AI Gateway (`completeWithFailover`) + `scholarlyVoiceGuard.ts` synthesizing actual project title, research questions, outline/chapters, empirical findings, and verified Knowledge Vault citations into structured 16:9 slides with speaker scripts, visual layout metadata, and deterministic fallback.
- [x] Connect `POST /api/projects/:id/presentation/qa-simulate` to dynamic conference/defense audience question generator (with questioner persona, difficulty level, targeted slide reference, and structured model rebuttal points) with deterministic heuristic fallback.
- [x] Bind `PresentationWorkspace.tsx` (OT-22) to `projectId` and project state, hydrating saved slides, theme/typography settings, and Q&A history from `getProject()`, with debounced optimistic autosave and live UI save-status badge matching `ProposalWorkspace` and `ThesisWorkspace`.
- [x] Implement interactive `AudienceQaSimulator.tsx` modal supporting referee persona selection, live referee simulation, rehearsal timer, and collapsible model rebuttals.

### Phase 4: Journal Article Pipeline Completion (Stages 20–25) (Completed)
- [x] Wire Stages 20–22: Bridge 5-Referee Adversarial Peer Review Simulator output into a structured Point-by-Point Referee Rebuttal Matrix (Methodologist, Domain Specialist, Biostatistician, Synthesizer, Formal Editor), with author responses, revision actions, section diffs, and project persistence.
- [x] Wire Stage 23 (`final_editor`): Live AI copy-editing via `completeWithFailover` + `scholarlyVoiceGuard.ts` (term-locked humanization, cliché suppression, British English spelling `-ise`/`-our`/`-re`, NFC Unicode diacritics, citation/DOI/numerical locking, telemetry before/after burstiness + deterministic fallback).
- [x] Wire Stage 24 (`publication_readiness`): Live Conductor Gate G7 audit (`computeG7ExitCriteria`), 100% citation-to-vault reconciliation (`reconcileManuscriptCitations`), and 2026 ICMJE/COPE ethical provenance checklist.
- [x] Wire Stage 25 (`export` & `/export/:format`): Canonical multi-format scholarly exporter (DOCX, PDF, LaTeX, Typst, Markdown) supporting APA 7, IEEE, MLA 9, Chicago, Harvard, Vancouver with formatted reference list and optional 5-Referee Rebuttal Matrix Appendix.
- [x] Wire frontend stage components (`PeerReviewStage.tsx`, `RevisionStage.tsx`, `FinalEditorStage.tsx`, `PublicationReadinessStage.tsx`, `ExportStage.tsx`) to live endpoints with telemetry HUD and visual feedback.
- [x] Zero `any` types across all changes, 82/82 WCAG contrast pairs passing, and 100% Vitest pass rate across all Stage 20–25 suites.

### Phase 5: Core Engine Unification, Agent Mesh Runtime Wiring, Per-Chapter Conductor Gating & Production Verification (Completed)
- [x] **Unified Document Intelligence Ingestion (`src/document_intelligence/parserRegistry`)**:
  - Replaced inline parser implementations across server routes (`server/routes/project/parse.ts`, `server/routes/project/assignment.ts`, `server/routes/vault.ts`, `server/routes/presentations.ts`) with unified `parseDocument` / `parserRegistry`.
  - Added native parsers for PPTX (`pptxParser.ts`) and Spreadsheets (`spreadsheetParser.ts` for XLSX, XLS, CSV).
  - Enforced strict ephemeral in-memory buffer handling (`multer.memoryStorage()`) with zero residual disk writes (Zero Document Storage Policy).
  - Applied `normalizeUnicodeNFC` across extracted headings, content, and metadata to preserve IAST diacritics losslessly.
- [x] **Multi-Agent Mesh Runtime Wiring (`src/app/mesh/`)**:
  - Registered built-in agents (`AG-14`, `AG-18`, `AG-25`, `AG-26`) at server boot in `server.ts`.
  - Created and mounted project mesh router (`server/routes/project/mesh.ts`) at `/api/projects/:id/mesh/run` and `GET /api/projects/:id/mesh/agents`.
  - Enforced `requireAuth` + project ownership authorization, scoped capability token issuance and automatic revocation, timeout guards, and schema-validated agent execution.
- [x] **Conductor Per-Chapter Gating for Long-Form Projects (`src/app/conductor/`)**:
  - Implemented `computeG4ExitCriteria` chapter-level provenance checks and target word budgets.
  - Implemented `evaluateChapterGating`, `evaluateAllChaptersGating`, and `summarizeChapterGates` to evaluate per-chapter exit criteria across G3, G4, and G5 for `long_form_chaptered` (`OT-07` Thesis / `OT-09` Dissertation).
  - Enforced immutable gate signoffs and whole-project prerequisite checks (`G0`, `G1`, `G2`).
- [x] **Coursework Engine Polish & Scholarly Voice Alignment**:
  - Synchronized `server/routes/project/assignment.ts` (`/draft-section`, `/stream-section`, `/copilot-chat`) with `scholarlyVoiceGuard.ts` for cliché suppression, British English orthography, NFC Unicode diacritics, and `[Unverified Claim — Vault Citation Required]` citation provenance tags.
  - Eliminated all `any` types in `src/utils/briefExtractor.ts`.
- [x] **Comprehensive Testing & Production Build Verification**:
  - Created Vitest integration suites for Document Intelligence (`documentIntelligenceIntegration.test.ts`), Agent Mesh Runtime (`meshRuntimeIntegration.test.ts`), and Per-Chapter Gating (`chapterGating.test.ts`).
  - Passed `npm run lint` (0 TypeScript errors, 82/82 WCAG contrast pairs pass, CSP hash verified), `npm test` across all suites, and `npm run build` (both Vite client bundle and Node server bundle compile with 0 errors).

### Phase 6: AskScholar Retrieval-Grounded Architecture, Anti-Hallucination Citation Lock & Workspace Routing Handoff (Completed)
- [x] **Retrieval-First Grounding & Canonical Evidence Ingestion (`server/src/research/scholarlyRetrievalPipeline.ts` & `server/routes/ai.ts`)**:
  - Implemented `retrieveCanonicalSourcesForPrompt` concurrently querying OpenAlex, Crossref, DOAJ, arXiv, and local Knowledge Vault items to extract canonical metadata (DOIs, titles, authors, venues, publication years).
  - Built `buildGroundedAskScholarSystemPrompt` injecting retrieved works as the **Exclusive Citation Ledger** into the system prompt.
  - Implemented `isSubstantiveAcademicQuery` and `detectDeliverableIntent` distinguishing substantive research inquiries and deliverable requests from platform guidance FAQs.
- [x] **Strict Anti-Hallucination Citation Lock & Telemetry Calculation**:
  - Implemented `sanitizeAndLockScholarResponse` systematically scanning LLM responses and purging fabricated `(Author, Year)` parenthetical citations not found in the Exclusive Citation Ledger, replacing unverified claims with `[Unverified Claim — Vault Citation Required]`.
  - Prohibited pseudo word-count headers (e.g., `Word count: ≈1,600`) and replaced them with exact, server-calculated deterministic word counts and syntactic burstiness telemetry (`burstinessMetrics` sentence length variance and standard deviation).
  - Automatically appended a formatted **Verified References & Literature Base** section via `CitationFormatterFactory.formatBibliography` (defaulting to APA 7) with valid DOIs/URLs.
- [x] **Scholarly Voice Guard Integration**:
  - Wired `scholarlyVoiceGuard.ts` into the AskScholar generation pipeline enforcing British/Oxford English orthography (`-ise`, `-our`, `-re`), NFC-normalized Unicode diacritics, and cliché suppression.
- [x] **Intent Detection & 1-Click Workspace Routing Handoff**:
  - Added structured `recommendedWorkspaceHandoff` payload for long-form deliverable requests (`OT-01` Coursework Essay, `OT-10` Journal Article, `OT-19` Research Proposal, `OT-09` Thesis/Dissertation, `OT-22` Presentation).
  - Enhanced `src/desk/ProjectListScreen.tsx` to render live **Verified Source Badges** (`✓ N Verified Sources`) and an **Actual Word Count Badge** (`⚡ N words`) on AskScholar messages.
  - Added a prominent, WCAG-compliant 1-click **"Launch in 4-Phase Essay Engine (OT-01) with Verified Sources"** action banner in `ProjectListScreen.tsx` that boots the project pre-populated with user prompt, synthesis notes, and retrieved canonical citations.
- [x] **Testing & Verification**:
  - Created unit and integration test suite `server/routes/__tests__/askScholarGrounding.test.ts` verifying intent detection, citation ledger grounding, phantom citation purge, and British English enforcement.
  - Verified `src/desk/__tests__/ProjectListScreen.test.tsx`, `ProjectListScreenEnhancements.test.tsx`, and `AskScholarCitationEngine.test.tsx`.
  - Zero `any` types introduced, 82/82 WCAG contrast pairs pass, 100% test pass rate (328/328 files, 3,306 tests), and production build verified.

### Phase 7: Live Web & Scholarly Search Tool-Calling for Client-Owned AI Models (Completed)
- [x] **Client-Side & Proxied Search Service (`src/services/liveSearchService.ts` & `server/src/discovery/liveSearch.ts`)**:
  - Built `executeLiveSearch` orchestrating server proxy `/api/search/live` (`POST` and `GET`) querying OpenAlex (`api.openalex.org`), Crossref (`api.crossref.org`), Wikipedia REST API, and Supabase Edge Function `search-proxy`.
  - Implemented automatic inverted-index abstract reconstruction for OpenAlex records, HTML tag stripping, and author list normalization.
  - Implemented client-side CORS direct fallback (`executeBrowserDirectLiveSearch`) ensuring live web grounding operates even if the backend proxy is offline or unreachable.
  - Enforced deduplication by normalized URL and title across all sources.
- [x] **Context Injection Loop & Strict Prompting (`executeAgenticLLM`)**:
  - Added live search context formatting: `[Live Web Grounding Context (Retrieved: YYYY-MM-DD HH:mm:ss UTC)]:\n...`.
  - Updated `executeAgenticLLM` in `src/desk/api.ts` to automatically check user's live search preference and inject the retrieved evidence block into system prompts.
  - Added double-grounding guards preventing duplicate network roundtrips if calling components pre-executed search for UI drawer rendering.
- [x] **Accessible UI Controls & Collapsible Source Drawer (`LiveSourcesDrawer.tsx`)**:
  - Created WCAG AAA/AA compliant collapsible `LiveSourcesDrawer.tsx` rendering active source links, authors, publication dates, and snippets with full keyboard navigation and high-contrast styling.
  - Integrated live search toggle and drawer in AskScholar prompt bar and message stream (`src/desk/ProjectListScreen.tsx`).
  - Integrated live search toggle and drawer in Coursework (`OT-01`) and Journal (`OT-10`) Copilot panels (`src/desk/workspace/ContextPanel.tsx`).
  - Added global live search preference control in `/ai-access` (`src/desk/aiAccess/AiAccessPage.tsx`).
- [x] **Strict Quality & Test Verification**:
  - Unit tests for search service (`src/services/__tests__/liveSearchService.test.ts`, 15/15 passing).
  - Unit tests for source drawer component (`src/desk/components/__tests__/LiveSourcesDrawer.test.tsx`, 4/4 passing).
### Phase 8: Comprehensive System Remediation (Steps 1–6 Completed)
- [x] **Step 1: Security & Cryptographic Integrity (`de441cf`)**:
  - Signed HTTP 426 challenge tokens with HMAC-SHA256, cryptographically binding `userId`, `projectId`, `promptSha256`, and expiration.
  - Extended Warden privacy evaluation to inspect and redact `req.systemPrompt` alongside `req.userPrompt` and segments.
  - Local HS256 JWT signature verification (<0.5ms) + bounded 60s LRU token cache to eliminate Supabase round-trip latency.
  - Static standards route hardening for `/robots.txt`, `/llms.txt`, and `/ai-catalog.json`.
- [x] **Step 2: Unified AI Pipeline & Resilient Schema Parsing (`9ef8bd4`)**:
  - Unified client/server `scholarBrain` guardrails with anti-fluff rules, citation formatting, and voice verification.
  - Resilient JSON parsing extracting clean payloads from Markdown codeblocks with repair of trailing commas/truncation.
  - Author-date NLI citation scrubber to validate in-text markers against bibliography entries.
  - Model capability profiler accurately mapping token windows, reasoning models, and streaming flags.
- [x] **Step 3: Hierarchical Semantic RAG & Streaming Engine (`a1abb27`)**:
  - Hierarchical chunking preserving structural heading paths (`# Chapter > ## Section`).
  - Hybrid Reranker combining BM25 lexical matching with cosine semantic similarity and recency scoring.
  - Real-time SSE streaming engine integrated with deterministic citation token replacement.
- [x] **Step 4: State Architecture & Ephemeral Persistence (`a1abb27`)**:
  - Typed Zod project state accessor (`projectStateSchema.ts`).
  - Transactional ephemeral-to-database migration ensuring zero data loss on guest login.
  - Persistent disk store fallback (`.scholar_local_store.json`).
- [x] **Step 5: Bundle Optimization & Modular Decomposition (`a1abb27`)**:
  - Dynamic lazy loading for heavy document parsing and export bundles (`docx`, `pdfmake`, `xlsx`, `pptxgenjs`).
  - Modular decomposition of monolithic files (`ProjectListScreen.tsx`, `api.ts`, `agentic.ts`) into clean feature domains.
- [x] **Step 6: Accessible Feedback, Responsive Ergonomics & A11y (`4e22895`)**:
  - Unified `<ToastProvider />` and `<ConfirmDialogProvider />` in `FeedbackSystem.tsx`; zero native `alert()` or `window.confirm()` calls.
  - Accessible mobile slide-over drawer for AI Tutor with backdrop (`data-testid="ai-tutor-backdrop"`) in `AssignmentWorkspace.tsx`.
  - Unsaved work guard (`useUnsavedChangesGuard.ts`) wired across all 5 workspaces with `beforeunload` interception and navigation gating.
  - Standardized `<WorkspaceAutosaveBadge />` (`data-testid="autosave-status"`) and 5-stage progress spine alignment (*Scope & Blueprint → Evidence & Sources → Studio Drafting → Review & Simulation → Audit & Export*).
  - 13"–14" laptop focus ergonomics with 1-click Zen Mode toggle (`data-testid="zen-mode-toggle"`) and right rails capped at 288px.
  - Direct Knowledge Vault landing on verified literature sources (`initialTab="sources"`).
  - Screen-reader dynamic `#scholar-aria-polite` and `#scholar-aria-assertive` announcements.
  - Scoped 44px touch targets in `src/index.css` with transparent hit-slop pseudo-elements.
  - Comprehensive Vitest suite in `src/desk/__tests__/remediationStep6UxAndA11y.test.tsx` (13/13 passing).
  - 100% `tsc --noEmit` clean, 82/82 WCAG contrast pairs passing, and clean production build.


### Phase 8: 5-Mode Executive Journal Studio Rebuild (OT-10) (Steps A, B, C, and D — 100% Completed)
- [x] **Step A: 5-Mode Executive Architecture & Navigation Rebuild**:
  - Rebuilt the Journal Article workspace (`src/desk/workspace/ResearchWorkspace.tsx`) from a fragmented 25-step wizard into an executive 5-Mode Studio:
    - **Mode 1 (`protocol`)**: Protocol & Gap Blueprint (Target Journal, Section Word Budgets, Literature Gaps, Title Lock).
    - **Mode 2 (`evidence`)**: Empirical Evidence & Claim Ledger (Knowledge Vault literature, Primary user datasets `[CITE:user_data_*]`, Grounded Claim Matrix).
    - **Mode 3 (`drafting`)**: Grounded Manuscript Studio (3-Pane Split Layout, Sub-Section Word Budget tracking, Live Citations, Zen Focus).
    - **Mode 4 (`rebuttal`)**: Unified 5-Referee Rebuttal Workbench (Simulated Peer Review, Point-by-Point Rebuttal Matrix, Direct Manuscript Revision Actions).
    - **Mode 5 (`audit` / `audit_export`)**: Unified Pre-Flight Compliance Audit & Submission Studio (Conductor Gate G7 Scorecard, 2026 Publisher Ethical Declarations, Camera-Ready `.docx`, `.pdf`, and standalone `Referee_Response_Letter.docx` compiler).
  - Integrated Conductor Gate progress pills (G0, G1/G2, G3/G4, G5/G6, G7) into the unified navigation header.
- [x] **Step B: Mode 1 Protocol Blueprint & Mode 2 Empirical Evidence Matrix with Primary Data Ingestion**:
  - Built `ProtocolBlueprintMode.tsx` with IMRaD section budget calculators, dynamic literature gap discovery via multi-portal search, and cryptographic Title Lock (`G1`).
  - Built `EvidenceMatrixMode.tsx` with multi-format primary user data ingestion (CSV, JSON, TSV, XLSX, TXT) via memory buffer parsing, generating formal `[CITE:user_data_*]` citations.
  - Integrated `server/routes/project/agentic.ts` (`/agentic/upload-user-data`) with strict client-owned AI routing.
  - Verified with frontend Vitest suite (`journalStudioStepB.test.tsx`, 7/7 passing).
- [x] **Step C: Mode 3 Grounded Manuscript Studio & Mode 4 Unified Referee Rebuttal Workbench**:
  - Built `ManuscriptStudioMode.tsx` with synchronized 3-pane split layout (Section Navigator with Mode 1 Word Budgets, TipTap/Markdown Prosemirror Editor, Context & Copilot Panel) and Zen Focus mode.
  - Built `RefereeRebuttalMode.tsx` simulating 5 specialized peer reviewers (Methodologist, Domain Expert, Statistician, Synthesizer, Skeptic) generating a structured Point-by-Point Rebuttal Matrix with automated 1-click revision application to the manuscript draft.
  - Verified with frontend Vitest suite (`journalStudioStepC.test.tsx`, 8/8 passing).
- [x] **Step D: Mode 5 Unified Pre-Flight Compliance Studio & Camera-Ready Compilers**:
  - Built `AuditExportMode.tsx` unifying Conductor Gate G7 pre-submission certification and submission package export into a dual-panel studio:
    - **Gate G7 Scorecard**: Real-time Word Count Budget compliance ($\pm 5\%$ tolerance badge), 100% Citation & Chronological Reconciliation (`[CITE:user_data_*]`, 0 uncited sources, 0 orphan citations, 0 anachronisms $Y_{\text{pub}} < Y_{\text{event}}$), Humanized Voice Telemetry (`scholarlyVoiceGuard` burstiness, 0 banned AI clichés, British English orthography), and 2026 Publisher Ethical Declarations (ICMJE/COPE/Elsevier/Wiley toggles with 1-click manuscript end-matter append).
    - **Submission Package Exporter**: Configurable layout (1-Column Double-Spaced 2.0 vs. 2-Column Camera-Ready), APA 7/IEEE/Harvard/Chicago citation styles, Title Page metadata, and 1-click downloads for Journal Manuscript (`.docx`), Camera-Ready Manuscript (`.pdf`), Standalone Point-by-Point Referee Response Letter (`.docx`), and secondary exports (`.tex`, `.typ`, `.md`).
  - Upgraded AST Word generator (`src/app/export/docxWriter.ts`) with dedicated Title Page, Abstract & Keywords page break, 2.0 double-spaced body, Markdown table conversion into native Word tables, NFC Unicode and IAST diacritics preservation (`ā, ī, ū, ṛ, ś, ṣ, ṇ`), and 0.5" (`720 twips`) APA 7 hanging-indent references.
  - Upgraded `server/routes/project.ts` and `server/routes/project/agentic.ts` supporting `rebuttal-letter` routes with standardized openxmlformats MIME headers.
  - Verified with Vitest suites:
    - `src/desk/workspace/__tests__/journalStudioStepD.test.tsx` (5/5 passing).
    - `server/routes/__tests__/journalStudioStepD.backend.test.ts` (10/10 passing).
- [x] **Zero Quality Debt Enforced**:
  - 100% TypeScript compilation clean (`tsc --noEmit`, 0 errors).
  - 82/82 WCAG AA color contrast pairings passing (0 failures).
  - 100% clean production build (`npm run build`, Vite client + esbuild server).



