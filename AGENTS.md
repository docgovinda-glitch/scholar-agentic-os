# AGENTS.md — Scholar Agentic Operating System

This project is an AI-powered assistant that supports PhD scholars and academic researchers in writing, citing, checking compliance, and managing literature for journal publication. See `README.md` for the project overview and `.claude/HANDOVER.md` for current repository state.

---

## Tech Stack

- **Frontend**: React 19 (TypeScript), Vite, Tailwind CSS v4, Framer Motion (`motion`), Lucide React (icons)
- **Backend**: Node.js & Express (`server.ts` + `server/`) — runs Vite dev middleware in development, serves static assets in production
- **Database**: PostgreSQL (`server/data/db.ts`, `pg`), with a JSON-file fallback/legacy path (`server/data/legacyUsersJson.ts`)
- **AI Integration**: `@google/genai` (Gemini SDK) via a client/server proxy. Additional provider adapters exist in `src/ai/providers/` (Anthropic, OpenAI, Ollama, LM Studio)
- **Document Parsers**: `mammoth` (DOCX), `pdf-parse` (PDF), `xlsx` (Excel)
- **Testing**: Vitest (`npm test`) — not Jest, though `jest`/`ts-jest` remain in `devDependencies` unused

---

## Repository Structure

The **running application** (what actually serves requests) is:

- `server.ts` + `server/` — Express server: `routes/` (`ai.ts`, `auth.ts`, `parser.ts`), `services/`, `middleware/`, `data/` (Postgres + storage layer)
- `src/App.tsx` — root React component managing routing/tabs, layout, and state, synced to `window.location.hash`
- `src/types.ts` — data models for projects, citation items, workflow phases, cost metrics, user profiles
- `src/auth/` — `authContext.tsx`, `LoginScreen.tsx`, `useAuth.ts` (localStorage-backed client session state, backed by `server/routes/auth.ts` for signup/activation/approval)
- `src/services/` — `aiGateway.ts` / `aiService.ts` (talk to the Express AI proxy), `citationService.ts` (APA 7th, IEEE, MLA 9th, Chicago, Harvard, Vancouver formatting), `knowledgeVaultService.ts` (literature storage)
- `src/components/` — UI: `ThesisReader.tsx` / `KnowledgeVaultManager.tsx` (document reading/search), `ResearchIntakeWizard.tsx`, `ManuscriptDraftingWorkspace.tsx` / `ManuscriptEditorWorkspace.tsx`, `AIControlCenter.tsx` / `AISetupWizard.tsx`, `VedicDatabase.tsx` (searching and incorporating Vedic-text references, used across several research/manuscript components)
- `src/core/` — shared foundation, including `core/project` (`ProjectBuilder`) and `core/manuscript`

A separate, larger set of modules is implemented and tested but **not yet wired into the running app** (not imported by `server.ts`, any route, or a component): `src/knowledge/` (KnowledgeKernel), `src/writing/` (WritingKernel), `src/publication/` (PublicationKernel), `src/workspace/` (WorkspaceKernel), `src/collaboration/` (CollaborationKernel), `src/orchestrator/` (MultiAgentOrchestrator, WorkflowEngine), and `src/agents/` (eight scholarly agents). `src/ai/` (AIKernel) is the one exception — it's consumed by `src/research/`. `src/document_intelligence/` and `src/citation_compliance/` are also independent modules with their own tests. Don't assume any of this is reachable from the live product without checking imports first — see `.claude/HANDOVER.md` §0 for the full picture.

---

## Getting Started

### Prerequisites
Node.js (v18+) and npm.

### Installation
```bash
npm install
```

### Run Locally (Development)
Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (and `DATABASE_URL` if you need Postgres-backed features), then:
```bash
npm run dev
```
This starts the tsx-run Express server (`server.ts`), which wraps Vite's dev server and handles API requests.

### Production Build
```bash
npm run build
npm start
```

### Tests & Type Check
```bash
npm test          # vitest run
npx tsc --noEmit  # strict type check (npm run lint runs the same command)
```

---

## Coding Guidelines & Preferences

1. **Tailwind CSS (v4)**: style with Tailwind classes; avoid inline styles or custom stylesheets unless unavoidable.
2. **TypeScript Safety**: strictly type all variables, arguments, and props. Keep models in `src/types.ts` authoritative for the UI layer.
3. **LLM Failure Resiliency**: when touching server-side LLM calls, use the retry/backoff middleware (`generateContentWithRetry` in `server.ts`) so `429`/`503` responses don't break requests.
4. **SPA Routing & History Compatibility**: when adding or updating top-level views/tabs, keep `onboardingStep`, `viewMode`, and `activeTab` synchronized with `window.location.hash`, and listen for `hashchange` so Back/Forward navigation keeps working.
5. **Robust JSON Parsing**: parse LLM text responses with brace-extracting helper logic (search for the first `{` and matching `}`) so conversational preambles don't crash the parser.
6. **Academic Reference Formatting Compliance**: citation rendering must normalize input casing and format author lists, journals, volumes, issues, and page ranges per APA 7th, IEEE, MLA 9th, Chicago, Harvard, and Vancouver rules.
7. **Extend, don't duplicate**: before adding a module, check whether an existing OS layer (`src/ai`, `src/knowledge`, `src/writing`, `src/publication`, `src/workspace`, `src/collaboration`) already covers it — see `.claude/ARCHITECTURE_RULES.md`.

---

## Persona & Product Directives

- **Role**: Senior Research Architect for the Scholar Agentic Operating System — facilitate high-level academic production across the ten-phase research workflow (see `README.md`), acting as a scholarly research collaborator that proposes structural improvements while maintaining a scholarly tone.
- **Academic Integrity**: prioritize originality in all generated output; query the Knowledge Vault (`src/knowledge_vault/`, `KnowledgeVaultManager.tsx`) before drafting so content stays grounded in the user's own literature, and check theoretical alignment with Vedic Samhitas via `VedicDatabase.tsx` and relevant IR (information retrieval) frameworks where applicable.
- **Technical Resilience**: keep the AI Gateway's exponential-backoff retry behavior intact; don't trade code quality for speed.
- **Constraint Adherence**: follow user-specified formatting requirements exactly (e.g., omitting a "Limitations" or "Final Statement" section when asked).
- **Workflow Management**: track the active phase of the ten-phase lifecycle for the user's current task and flag dependencies between phases.
