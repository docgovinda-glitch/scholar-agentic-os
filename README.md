# Scholar Agentic Operating System

An AI-assisted research workspace for PhD scholars and academic researchers: literature grounding, data-source discovery, journal matching, compliance auditing, manuscript co-drafting, and submission tracking, backed by a multi-provider AI gateway and a citation/academic-compliance engine.

New to this repo? Read `START_HERE.md` first, then `.claude/HANDOVER.md` for the current, verified state of the codebase.

## What's actually running

The live application is a React 19 SPA (`src/App.tsx`) talking to an Express backend (`server.ts` + `server/`):

- **Frontend**: hash-routed single-page app with a lettered phase workflow (`A`–`I`, with `G1`/`G2` sub-phases — grounding, source discovery, journal matching, compliance setup, manuscript co-drafting, quality control, submission tracking). Defined in `src/types.ts`, driven from `src/components/`.
- **Backend**: Express (`server.ts`, with routes modularized to `server/routes/`) — AI generation proxying, DOCX/PDF/XLSX/TXT parsing, DOI lookup, health checks, admin approval flow.
- **Auth**: Supabase Auth (email/password + Google OAuth), React Context + localStorage session, AES-GCM client-side encryption for API keys (`src/services/apiVault.ts`).
- **Data**: Browser-local only (Phase 0–2): `localStorage` (5MB ceiling, Phase 1 lifts to 50+ MB) + `IndexedDB` (vault files). Optional cloud sync via student-provisioned Supabase (Phase 3+).
- **AI**: `src/services/aiService.ts` + `src/services/aiGateway.ts` route requests through 26 cloud providers (OpenAI, Anthropic, Google, Claude, Mistral, etc.) + 9 local runners (Ollama, LM Studio, Vllm, Llamacpp). Single source of truth: `src/config/providerCatalog.ts` and `src/config/localRunnerCatalog.ts`.
- **Citations**: `src/citation_compliance/` — APA 7th, IEEE, MLA 9th, Chicago, Harvard, and Vancouver formatters and importers (BibTeX/RIS).

## Architecture

**Phase 0 Status** (2026-08-01): Foundation cleanup complete. Dead subsystems removed; live architecture cleaned and documented.

The repo now contains only:
- **Live components**: React UI, Express backend, AI services, agents (partially wired), skills framework
- **Helper libraries**: Document parsers, citation formatters, provider catalogs, type definitions
- **Tests**: 107 test files, 1207 passing tests

**Deleted dead weight**: 
- 5 unused kernel classes (KnowledgeKernel, WritingKernel, PublicationKernel, WorkspaceKernel, CollaborationKernel)
- `src/knowledge/` (knowledge graph, semantic memory, KQL, reasoning engine)
- `src/orchestrator/` (partial multi-agent scaffolding)
- `src/lifecycle/` (10-phase model, superseded by A–I phases in UI)
- `server/data/` (unused Postgres layer)
- Jest/ts-jest (use Vitest instead)

**Live agents** (`src/agents/` + `src/skills/`):
- ResearchPlanner, LiteratureReview, KnowledgeGap, ResearchQuestion, MethodologyAdvisor, StatisticalAnalysis, IntegrityReviewer, ManuscriptWriter
- Partially wired: called by QualityControlSuite, ManuscriptDraftingWorkspace, ResearchIntelligenceDashboard
- Phase 1 will wire orchestrator to thread agent outputs end-to-end

See `docs/architecture/02-Scholar-System-Architecture.md` for the current verified state and `docs/blueprint/REDEVELOPMENT_BLUEPRINT.md` for the 18-month roadmap (Phase 0–6).

## Getting Started

**Prerequisites**: Node.js v20+

```bash
npm install
cp .env.example .env   # set GEMINI_API_KEY, and DATABASE_URL if you need Postgres-backed features
npm run dev             # starts the Express server (tsx server.ts), which wraps Vite's dev server
```

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server (`tsx server.ts`) |
| `npm run build` | Vite client build + esbuild server bundle to `dist/` |
| `npm start` | Run the built server (`dist/server.cjs`) |
| `npm run lint` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Run the test suite (Vitest) |
| `npm run test:coverage` | Vitest with coverage |

As of this writing (Phase 0 complete): 0 TypeScript errors, 106 test files / 1104 tests passing, production build succeeds. Full CI pipeline enabled (GitHub Actions: test + typecheck + build on every push to main/develop/claude/* branches).

### Deployment

See `DEPLOYMENT_README.md` for the Render (backend + Postgres) + Netlify (frontend) production setup, matching `render.yaml` and `netlify.toml`.

## Development Workflow

This repo follows an extend-before-create philosophy: check whether an existing module already covers what you need before adding a new one. See `.claude/ARCHITECTURE_RULES.md` for the non-negotiable structural rules and `.claude/DEVELOPMENT_GUIDELINES.md` for coding standards. `AGENTS.md` covers the same ground in a more scannable form for AI coding agents.

## Documentation Map

- `START_HERE.md` — onboarding quick-start and directory map
- `.claude/HANDOVER.md` — current verified repository state, what's wired in vs. not, immediate priorities
- `.claude/ROADMAP.md` / `.claude/FUTURE_ENHANCEMENTS.md` / `.claude/KNOWN_LIMITATIONS.md` — where the project is headed and what's missing
- `docs/architecture/` — platform constitution, system/domain architecture, engineering standards (describes the kernel/OS design intent)
- `docs/adr/` — architecture decision records
- `docs/development/` — sprint guide, code review checklist, definition of done, implementation backlog
- `docs/*_architecture.md` — point-in-time technical audit reports on specific subsystems (auth, backend API, UI, core framework, document intelligence, integration); each notes what it verified against the code at the time it was written
- `CHANGELOG.md` — release history

## Known Limitations

See `.claude/KNOWN_LIMITATIONS.md` for the full list. Headlines: no cloud sync (local Postgres/localStorage only), no RBAC enforcement, no plugin marketplace, and the kernel/orchestrator/agent disconnection described above.
