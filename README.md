# Scholar Agentic Operating System

An AI-assisted research workspace for PhD scholars and academic researchers: literature grounding, data-source discovery, journal matching, compliance auditing, manuscript co-drafting, and submission tracking, backed by a multi-provider AI gateway and a citation/academic-compliance engine.

New to this repo? Read `START_HERE.md` first, then `.claude/HANDOVER.md` for the current, verified state of the codebase.

## What's actually running

The live application is a React 19 SPA (`src/App.tsx`) talking to an Express backend (`server.ts` + `server/`):

- **Frontend**: hash-routed single-page app with a lettered phase workflow (`A`–`I`, with `G1`/`G2` sub-phases — grounding, source discovery, journal matching, compliance setup, manuscript co-drafting, quality control, submission tracking). Defined in `src/types.ts`, driven from `src/components/`.
- **Backend**: Express (`server.ts`, plus `server/routes/ai.ts`, `auth.ts`, `parser.ts`) — AI generation proxying, DOCX/PDF/XLSX parsing, authentication/signup/approval, DOI lookup.
- **Auth**: `src/auth/` (React Context + localStorage session), PBKDF2-SHA256 password hashing and AES-GCM client-side encryption (`src/utils/crypto.ts`), AES-256-CBC server-side API key storage (`server/utils/apiKeyCrypto.ts`).
- **Data**: PostgreSQL (`server/data/db.ts`, schema in `database_schema.sql`) for admin approvals and model preferences, with a legacy JSON fallback (`server/data/legacyUsersJson.ts`).
- **AI**: `src/services/aiGateway.ts` / `aiService.ts` route requests to Gemini (`@google/genai`), with adapters for Anthropic, OpenAI-compatible, Ollama, and LM Studio in `src/ai/providers/`.
- **Citations**: `src/citation_compliance/` — APA 7th, IEEE, MLA 9th, Chicago, Harvard, and Vancouver formatters and importers (BibTeX/RIS).

## A second, larger layer that exists but isn't wired in yet

Alongside the running app, the repo contains a substantial "Operating System" kernel architecture — `src/ai` (AIKernel), `src/knowledge` (KnowledgeKernel), `src/writing` (WritingKernel), `src/publication` (PublicationKernel), `src/workspace` (WorkspaceKernel), `src/collaboration` (CollaborationKernel) — plus `src/orchestrator` (a multi-agent workflow engine) and `src/agents` (eight scholarly agents: research planner, literature review, methodology advisor, manuscript writer, etc.), and `src/document_intelligence` (a PDF/DOCX/TXT/Markdown parsing pipeline). All of it is implemented and covered by tests. **Only `src/ai` is currently consumed outside its own module** (by `src/research/`) — nothing in `server.ts` or `src/components/` imports the other kernels, the orchestrator, or the agents. There's also a `src/lifecycle/ResearchLifecycleEngine.ts` implementing a *different*, ten-phase research workflow (Research Intake → Literature Review → ... → Publication Submission) that is likewise unused by the running app.

This is real, tested code, not dead weight — it represents the intended long-term architecture (see `docs/architecture/` and `docs/adr/`), but it is not yet load-bearing for anything a user can click on. Treat "wire the kernels/orchestrator/agents into the app" as unstarted product work.

## Getting Started

**Prerequisites**: Node.js v18+

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

As of this writing: 0 TypeScript errors, 18 test files / 330 tests passing, production build succeeds.

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
