# Scholar Core OS — Completion Baseline & Roadmap

This document establishes the authoritative completion baseline for **Scholar Core**, based on a comprehensive read-only audit of the codebase, type system, test suite, backend endpoints, core engines, and user workspaces.

---

## 1. Quality Baseline & Diagnostic Health

### 1.1 Test Suite Status (`npm test`)
- **Total Test Files**: 312
- **Passing Test Files**: 294 (94.2%)
- **Failing Test Files**: 18 (5.8%)
- **Individual Tests Passing**: 3,041 tests passed (0 individual test assertions failed).
- **Root Cause of Test Failures**:
  - All 18 failing test files fail due to a single syntax error during Vite/esbuild module transformation in `src/desk/assignment/services/submissionAuditService.ts:504-505` (`Unexpected "}"`).
  - When this syntax error is resolved in scratch execution, **100% of the 18 previously failing test files pass** (242 out of 242 tests passing in those suites).

### 1.2 TypeScript Compilation & Linting (`npm run lint`)
- **Contrast Verification (`scripts/verify-contrast.mjs`)**: **PASSED** (82 pairings verified, 0 failures, 100% WCAG compliance).
- **Content Security Policy Hash Verification (`scripts/verify-csp-hash.mjs`)**: **PASSED**.
- **Type Checking (`tsc --noEmit`)**:
  - Blocked initially by `src/desk/assignment/services/submissionAuditService.ts(505,1): error TS1128: Declaration or statement expected.`
  - Secondary type errors identified across the codebase (14 total):
    1. `src/desk/assignment/context/AssignmentContext.tsx` (3 errors): Missing export/import for `FlowAuditResult`.
    2. `src/desk/assignment/services/realScholarlyDiscoveryService.ts` (2 errors): Missing type `DiscoveredSourceDraft`.
    3. `src/services/store/pgProjectStore.ts` (7 errors): `row._sources`, `row._uploaded_sources`, `row._evidence` typed as `unknown` and referencing undeclared `record` variable in `rowToRecord`.
    4. `src/services/store/restProjectStore.ts` (2 errors): Missing `version` property in `ProjectRecord` initialization.

---

## 2. Backend Service & Endpoint Audit

### 2.1 Fully Implemented & Live
| Route Family | Base Path | Implementation Status | Data Source / Integration |
| :--- | :--- | :--- | :--- |
| **AI Gateway** | `/api/ai/*` | Production Ready | Unified routing across Gemini, OpenRouter, Anthropic, Local runners, with streaming & failover |
| **AI Access & BYOK** | `/api/ai-access/*` | Production Ready | Model catalog, provider verification, hardware telemetry, server-key isolation |
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
| **Conductor** | `src/app/conductor/` | **90%** | G0–G7 exit criteria calculators, gate signoff state machine, state hashing, rubric binding | Per-chapter independent gating for `long_form_chaptered` is documented as deferred |
| **Mesh / Multi-Agent** | `src/app/mesh/` | **40%** | Runtime harness (`executor.ts`), capability checks, 4 built-in agents (AG-14, AG-18, AG-25, AG-26) | `registerBuiltinAgents()` is never called at runtime; Conductor does not dispatch through Mesh runtime |
| **Rubric Compliance** | `src/app/rubric/` | **95%** | `fromAtlas.ts` compiles Output Type specs + journal requirements into rules; waiver engine | PRISMA-specific workflow gates and print/layout physical measurement rules not yet compiled |
| **Citation Compliance** | `src/citation_compliance/` | **98%** | 7 formatters (APA7, IEEE, MLA9, Chicago Author-Date, Chicago Notes, Harvard, Vancouver), BibTeX & RIS importers | Auto-registers on `getInstance()`. Clean and operational |
| **Document Intelligence**| `src/document_intelligence/` | **60%** | AST parsers for PDF, DOCX, TXT, MD, heading detector, parser registry | Upload routes (`vault.ts`, `parse.ts`, `assignment.ts`) use duplicated inline parsers instead of unified registry |

---

## 4. Workspace Readiness Matrix (`src/desk/`)

| Workspace | Output Types | Completion | State Architecture | Backend Integration Status |
| :--- | :--- | :---: | :--- | :--- |
| **Coursework Engine** | `OT-01`, `OT-02` | **92%** | Real (`AssignmentContext`) | Hydrates from `getProject()`, saves via `saveIntakeAnswers()`, streams via SSE, offline PEEL fallback |
| **Journal Article** | `OT-10` | **85%** | Real (`ResearchContext`) | 25 stages defined; Stages 1–19 live with real endpoints; Stages 20–25 use backend stubs |
| **Research Proposal** | `OT-19` | **25%** | Hardcoded Mock State | Mounts with static state; no hydration from DB; calls stubbed study section endpoint |
| **Thesis & Dissertation**| `OT-09`, `OT-07` | **25%** | Hardcoded Mock State | Mounts with static state; no hydration from DB; calls stubbed viva simulation endpoint |
| **Presentation Studio** | `OT-22` | **40%** | Ephemeral State | Interactive canvas works, but state is not tied to `projectId`; saves to unscoped API |
| **Knowledge Vault** | `/vault` | **90%** | Real Dual Engine | Supabase `user_vault_items` with RLS + encrypted IndexedDB fallback |
| **AI Access Control** | `/ai-access` | **95%** | Real State | Fully wired to `/api/ai-access` and `/api/admin/ai`; BYOK keys kept client-side |

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

### Phase 2: Proposal & Thesis Workspace Hydration & Live Engines
- [ ] Refactor `ProposalWorkspace.tsx` to hydrate from `getProject(projectId)` and persist changes via `saveIntakeAnswers()`.
- [ ] Connect `POST /api/projects/:id/proposal/study-section-simulate` to the real AI Gateway (`callLLM` / `generateContent`) using NIH/NSF evaluation prompts.
- [ ] Connect `POST /api/projects/:id/proposal/aims-audit` to a real structural aims parser.
- [ ] Refactor `ThesisWorkspace.tsx` to hydrate from `getProject(projectId)` and persist chapter structure.
- [ ] Connect `POST /api/projects/:id/thesis/viva-simulate` to an AI-driven oral defense simulator with dynamic external examiner personas.
- [ ] Connect `POST /api/projects/:id/thesis/chapter-audit` to cross-chapter consistency analysis.

### Phase 3: Presentation Studio Project Binding & Unification
- [ ] Bind `PresentationWorkspace.tsx` to `projectId`, loading and storing decks within project state (`answers.presentation_deck` or scoped table).
- [ ] Connect `POST /api/projects/:id/presentation/generate-deck` to use `extractSlidesFromAcademicText` or the AI gateway rather than static slides.
- [ ] Connect `POST /api/projects/:id/presentation/qa-simulate` to an interactive audience Q&A model.

### Phase 4: Journal Article Pipeline Completion (Stages 20–25)
- [ ] Wire Stage 23 (`final_editor`) to the active tone and paraphrasing engine.
- [ ] Wire Stage 24 (`publication_readiness`) to compute real pre-flight checks from Conductor Gate G7 and Rubric compliance reports.
- [ ] Wire Stage 25 (`export`) directly to the canonical document exporter (`server/routes/project.ts` export handler).

### Phase 5: Engine Unification (Mesh & Document Intelligence)
- [ ] Wire `document_intelligence/parserRegistry` across all file upload routes (`vault.ts`, `parse.ts`, `assignment.ts`, `presentations.ts`) to eliminate duplicate parser code.
- [ ] Connect Conductor and background tasks to `app/mesh` agent manifests (`ag14CitationManager`, `ag18ReadabilityAnalyst`, `ag25PrivacyGuard`, `ag26WorkflowCoordinator`).
