# Scholar System Architecture

**Status**: Phase 0 cleanup complete. This document reflects actual live architecture as of 2026-08-01.

## System Overview

Scholar is a browser-local research assistant built with React + TypeScript on the frontend, and Express on the backend. The system is organized around the research workflow phases (A–I), with clear separation between:

1. **Live components**: Actually wired into the application and tested (the product)
2. **Helper layers**: Libraries consumed by live code (configuration, utilities)
3. **Backend services**: Express routes and AI integration

The architecture is fundamentally **client-side-first**: user research data lives in browser `localStorage` + `IndexedDB`, not in a backend database. The server provides stateless API routes for file parsing, AI generation, and external API proxy services.

## Live Architecture (What Runs)

### Frontend (React Components)

**Research workflow UI** (`src/components/`):
- Research intake wizard
- Knowledge vault manager
- Manuscript drafting workspace
- Quality control suite
- Citation center
- Submission packaging UI
- AI setup wizard
- Phase-gated navigation

**Phase model**: Lettered A–I (defined in `src/types.ts`), NOT the numbered 10-phase model. Phases are gated by user progression through the UI.

### AI Integration (`src/services/aiService.ts` + `src/services/aiGateway.ts`)

**Multi-provider AI**: 
- 26 cloud providers (OpenAI, Anthropic, Google, Cohere, Mistral, etc.) + 9 local runners (Ollama, LM Studio, Vllm, etc.)
- Single source of truth: `src/config/providerCatalog.ts` (cloud) + `src/config/localRunnerCatalog.ts` (local)
- Consumed by both browser bundle and server
- Error-kind-classified failover via `src/services/providerFailover.ts`

**API Key Vault** (`src/services/apiVault.ts`):
- AES-GCM encryption with PBKDF2 (100k iterations)
- Device-bound keys in IndexedDB or passphrase-locked
- Never rendered after entry
- Keys stay in client or server environment variables, never in logs

### Agents & Skills (`src/agents/` + `src/skills/`)

**Research agents** (8 total):
- ResearchPlannerAgent
- LiteratureReviewAgent
- KnowledgeGapAgent
- ResearchQuestionAgent
- MethodologyAdvisorAgent
- StatisticalAnalysisAdvisor
- IntegrityReviewerAgent
- ManuscriptWriterAgent

**Skills framework** (pluggable skill registry):
- Callable standalone skills (ResearchPlanner, LiteratureReview, etc.)
- Agents use skills + routing to orchestrate workflows
- AgentExecutor manages timeout, retries, cancellation

**Live wiring**: Agents are called by QualityControlSuite, ManuscriptDraftingWorkspace, and ResearchIntelligenceDashboard. Rest of the orchestrator infrastructure is scaffolding (not live).

### Literature & Data Retrieval (`src/services/`)

**Live retrieval services** (real API calls, no hallucination):
- `literatureRetrievalService.ts`: Crossref, OpenAlex, PubMed, Semantic Scholar
- `datasetRetrievalService.ts`: DataCite
- `journalRetrievalService.ts`: Journal metadata
- `citationService.ts` + `citationEnrichmentService.ts`: Real DOI/PMID/ISBN lookup

### Citation Compliance (`src/citation_compliance/`)

**6 citation formatters**:
- APA 7th edition
- IEEE
- MLA 9th edition
- Chicago
- Harvard
- Vancouver

**Formatters are tested** and used by live export routes.

### Document Intelligence (`src/document_intelligence/`)

**Parser suite**:
- PDF parser (pdf-parse)
- DOCX parser (mammoth)
- TXT parser (plain text)
- Markdown parser

**Output**: Canonical Document Model (CDM) with structured content, headings, metadata.

**Used by**: Server `/api/parse-file` route (live).

### Persistence

**User research data**:
- All project state serializes to `localStorage` JSON blob (`phd_profile_state_<username>`)
- Vault files (PDFs, parsed content) go to `IndexedDB` via IndexedDB Vault (Phase 1 planned split)
- ~5MB localStorage ceiling (Phase 1 lifts this to 50+ MB via compression + IndexedDB)

**Supabase**:
- Auth only (email/password + Google OAuth)
- Profiles table for metadata
- Edge functions for mail/proxy services
- **No research data ever reaches Supabase in current design**

## Backend Service Layer

### Express Server (`server.ts`)

**Middleware**:
- Helmet for security headers (CSP includes Vite HMR in dev)
- Rate limiters (abuse-rate-limit for AI routes, parse-file limit for file upload, lookup-doi limit)
- Body parsers (50MB limit for uploads)

**Routes** (stateless):
- `GET /api/health` — liveness check
- `GET /admin/approve-scholar` — admin approval flow (email token)
- `POST /api/parse-file` — file upload + parsing
- `POST /api/parse-external-link` — scrape + parse URL
- `POST /api/lookup-doi` — DOI metadata lookup
- `POST /api/stream-generate` — streamed AI generation
- `POST /api/generate` — full AI generation (various tasks)
- `POST /api/generate/<task>` — 7 specialized routes (dissertation-grounding, data-discovery, journal-discovery, extract-requirements, draft-section, quality-control, submission-pack, citation-engine)

**Services**:
- `aiService.ts` wired in browser AND server (shared multi-provider logic)
- Document parsers (pdf-parse, mammoth, xlsx)
- Citation formatters (all 6 implemented)

### Client-Side Dev Server

- Vite in middleware mode (dev)
- Hot module replacement (HMR) via WebSocket
- No production server (Netlify static hosting for published apps)

## Deleted Subsystems (Phase 0 Cleanup)

The following **were implemented but never wired into the running product** and have been removed to reduce technical debt:

- `src/knowledge/` — knowledge graph, semantic memory, KQL, reasoning engine
- `src/orchestrator/` — multi-agent orchestrator scaffolding (partial, never called)
- `src/lifecycle/` — 10-phase research lifecycle engine (documentation describes this, but UI uses A–I instead)
- Five "Kernel" classes (`KnowledgeKernel`, `WritingKernel`, `PublicationKernel`, `WorkspaceKernel`, `CollaborationKernel`) — type stubs for planned subsystems
- `src/collaboration/`, `src/workspace/`, `src/writing/`, `src/publication/` — type/stub layers
- `server/data/` — unused Postgres data layer (user store, migrations, db pool) — no server-side user data in current design
- `database_schema.sql`, `users.json` — legacy/stale files
- Jest + ts-jest devDependencies (use Vitest instead)

## Type Safety & Tooling

- **TypeScript strict mode**: Enabled for all new code; test files excluded from `noImplicitAny` to permit test-style function parameters
- **Test runner**: Vitest (not Jest), 107 test files, 1207 tests, all passing
- **Build**: Vite for client (ES modules), esbuild for server (CommonJS)
- **Linting**: `npm run lint` (tsc --noEmit)

## Deployment

- **Dev**: `npm run dev` (tsx server.ts + Vite HMR)
- **Build**: `npm run build` (vite build + esbuild server)
- **Start**: `node dist/server.cjs` (CJS bundle, no ESM interop)
- **Hosting**: Netlify (static) for frontend, Node hosting (render.yaml provided) for backend

## Security Posture

**Strong**:
- Helmet CSP with `upgrade-insecure-requests` for local runner mitigation
- Rate limiting on all expensive routes
- AES-GCM vault for keys (non-extractable device keys or passphrase-locked)
- RLS-oriented Supabase schema
- No key material in logs

**XSS Risk**:
- High blast radius: keys + all research data in page origin's storage
- Mitigated by: CSP, server-side tier (future)

**CSRF Risk**:
- GET /admin/approve-scholar state-changing (email link ergonomics vs CSRF hygiene)
- Prefetchers can approve scholars
- Mitigation: add POST + CSRF token or email verification UI in future

## Architectural Constraints (Binding)

1. **Student cloud provisioning**: Phases 0–2 incur $0 backend cost; students provision their own Supabase projects, AI API keys, cloud storage
2. **Mandatory human approval gates**: Every AI contribution is gated by explicit human sign-off (edit history, timestamps, attribution)
3. **Assignment-submission ready output**: Final manuscripts polished, humanized, ready for journal submission with <5 min review
4. **Multi-document-type support**: 10 academic writing types with custom workflows, checks, and guidance (Phase 1)
5. **Custom format learning**: Users upload institution formats; system learns and adapts (Phase 2)

## Integrity Discipline (Product Invariant)

- Real retrieval everywhere (no invented citations or data)
- Disclosed AI use (exportable disclosure statement, per-section provenance)
- Human verdicts on all high-stakes decisions (agent confidence, compliance warnings, submission readiness)
- Verifiable citations (DOI/PMID lookup against live registries)

This discipline survives every redesign and is non-negotiable.

---

**Next**: See `docs/adr/` for architectural decision records. See `.claude/HANDOVER.md` for current priorities and task state.
