# Scholar Core (`scholar-agentic-os`)

Scholar Core is a full-stack academic research and writing platform. It provides purpose-built workspaces for coursework, journal manuscripts, theses, research proposals and presentations, backed by AI agents, a citation engine and a cross-project source library (the "Universal Vault"). One Node process serves both the API and the React single-page app.

- Production: https://scholar.gkshah.com.np (Render, Docker, free plan)
- Stack: React 19 + Vite 6 + Tailwind CSS v4 (client), Express 4 + TypeScript (server), Supabase (Auth, Postgres, Storage, Edge Functions)
- Every statement in this documentation is meant to match the code on `main`. If you find a mismatch, the code wins; please fix the doc.

## Workspaces

A project's `outputTypeId` decides which workspace opens (`src/desk/DeskApp.tsx`). The catalog (`src/app/atlas/catalogData.ts`) defines 24 output types (`OT-01` to `OT-24`); five dedicated workspaces exist today.

| Output type | Workspace | Entry component |
| :--- | :--- | :--- |
| `OT-01` Assignment, `OT-02` Essay | Coursework (5 stages) | `src/desk/assignment/AssignmentWorkspace.tsx` |
| `OT-07` Master's Thesis, `OT-09` Book / Monograph | Thesis | `src/desk/thesis/ThesisWorkspace.tsx` |
| `OT-10` Journal Article | Journal research studio (25 stages in 5 phases) | `src/desk/workspace/ResearchWorkspace.tsx` |
| `OT-19` | Research proposal | `src/desk/proposal/ProposalWorkspace.tsx` |
| `OT-22` | Presentation Studio | `src/desk/presentation/PresentationWorkspace.tsx` |
| any other type | Generic project shell | `src/desk/DeskShell.tsx` |

Highlights per workspace (details in [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md)):

- **Coursework**: Extract, Understand, Sources, Drafting, Submission, all derived from the student's own brief. Marks-weighted word budgets, a 10-point rubric audit, citation reconciliation and `.docx` / PDF export.
- **Journal**: 25 stages grouped as Foundation, Evidence, Drafting, Review and Publication, with claim-evidence tracking, a peer-review simulation, rebuttal matrix, cover letter, anonymization and export.
- **Thesis**: chapter editor, research questions, literature matrix, references and a Viva Voce simulator.
- **Proposal**: narrative section editor, budget editor and a study-section scorer.
- **Presentation Studio**: four steps (Understand, Design, Edit Slides, Present), Gamma-style card engine, native `.pptx` export. See [`docs/presentation-studio.md`](docs/presentation-studio.md).

Other surfaces: Ask Scholar chat on `/projects`, Knowledge Vault (`/vault`), AI Access (`/ai-access`), account settings (`/settings`) and the lazy-loaded admin panel (`/admin/*`).

## Single-brain architecture

`server/src/services/scholarBrain.ts` is the only AI brain for every workspace. It is the only module allowed to import `server/utils/llm.ts`; routes and services call its logged wrappers (`callOpenRouterJSON`, `callOpenRouterText`, `streamOpenRouterJSON`). No workspace may add its own prompt engine, regex outline generator or subject-to-theory table, and the Quantum literature catalog, the Zappos/Schein canned outline and keyword-to-framework tables are permanently banned. `src/__tests__/singleBrainGuardian.test.ts` enforces this in `npm test`. See [`CLAUDE.md`](CLAUDE.md) and `.claude/agents/single-brain-guardian.md`.

## AI access

Users choose where AI runs in `/ai-access` (sections: Overview, Providers, Subscription, Preferences). A request is served from four tiers: the user's local runner, free-tier keys, bring-your-own keys, or platform-managed Premium resources.

- 37 cloud providers are catalogued in `src/config/providerCatalog.ts`; 9 local runners (Ollama, LM Studio, Jan, LocalAI, llama.cpp, KoboldCpp, vLLM, text-generation-webui, OmniRoute) in `src/config/localRunnerCatalog.ts`.
- A user's key travels with a request only as transient `x-ai-*` headers (or the `x-ai-keyring` header for `/api/ai/run`); request handlers hold it in memory and never log or store it, and request bodies may not carry credentials. Users can optionally save keys to their account to sync devices (`public.user_provider_keys`, envelope-encrypted under `MASTER_KEY`). Premium (platform) credentials live in a separate server-side vault and never leave the server.
- A local model on the user's machine can only be reached from the browser; a deployed server cannot reach it.
- See [`docs/AI-SYSTEM.md`](docs/AI-SYSTEM.md).

## Source library and storage policy

The Knowledge Vault stores structured bibliographic metadata, DOIs, URLs and citation data per user (`public.user_vault_items`, with cloud-drive pointers for Google Drive and OneDrive). Uploaded files are parsed in memory (hard ceiling 10 MB, `MAX_UPLOAD_MB`) and the parsed text is stored only where a feature needs it (for example vault item `content_text`, or project files in the private `project-files` bucket). Reference import supports DOI lookup, BibTeX and RIS.

## Style engine

`ml-style-engine/` holds an offline-trained archetype classifier (Python scripts, 110 open-access papers, 10 per archetype across 11 archetypes, 752,811 words). Its exported weights (`src/features/coursework/data/archetype_model_weights.json`) are scored in TypeScript by `src/features/coursework/services/styleEngineService.ts` (TF-IDF dot products plus style metrics). Reported calibrated LinearSVC cross-validation accuracy: 93.97% (`ml-style-engine/models/archetype_classifier_meta.json`).

## Quick start

Requirements: Node 22 (Dockerfile and CI use 22), npm 10+.

```bash
git clone https://github.com/docgovinda-glitch/scholar-agentic-os.git
cd scholar-agentic-os
npm ci
cp .env.example .env      # fill in Supabase keys; see SETUP.md
npm run dev               # Express + Vite middleware on http://localhost:3000
```

| Command | What it does |
| :--- | :--- |
| `npm run dev` | `tsx server.ts`: API plus Vite HMR on port 3000 |
| `npm run lint` | `tsc --noEmit` + contrast, CSP-hash, no-pure-black and no-raw-hex-class checks (pre-commit hook and CI gate) |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm test` | `vitest run` (whole suite) |
| `npm run build` | `vite build`, chunk-budget check (< 500 kB per chunk), then esbuild bundles `server.ts` to `dist/server.cjs` |
| `npm start` | `node dist/server.cjs` |
| `npm run test:e2e` | Playwright end-to-end suite (see [`e2e/README.md`](e2e/README.md)) |

## Documentation map

| Document | Contents |
| :--- | :--- |
| [`docs/README.md`](docs/README.md) | Index and conventions |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Capabilities, roles, output types |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Topology, layers, security model |
| [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) | Step-by-step workflows per workspace |
| [`docs/AI-SYSTEM.md`](docs/AI-SYSTEM.md) | AI routing, providers, credentials, scholarBrain |
| [`docs/AI-CALL-MAP.md`](docs/AI-CALL-MAP.md) | Every AI entry layer and its credential source |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Tables, storage, domain state |
| [`docs/API.md`](docs/API.md) | HTTP endpoints |
| [`docs/UI-UX.md`](docs/UI-UX.md) | Design tokens, themes, layout, accessibility |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Local development and testing |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Docker, Render, CI/CD, Supabase |
| [`docs/presentation-studio.md`](docs/presentation-studio.md) | Slides engine |
| [`SETUP.md`](SETUP.md), [`RUNBOOK.md`](RUNBOOK.md), [`SYSTEM_MAP.md`](SYSTEM_MAP.md) | Setup, operations, file map |

Incident, audit and hotfix records (`AUDIT.md`, `HOTFIX*_DEPLOY.md`, `COMPROMISE_CHECKS.md`, `MERGE_PLAN.md`, `POST_DEPLOY_80.md`, `PROD_CHECKS.md`, `PRODUCT_AUDIT.md`, `ROTATION_RUNBOOK.md`, `USER_NOTICE.md`, `STATUS.md`, `docs/COMPLETION_ROADMAP.md`) are dated records and are not kept in sync with the code. `CHANGELOG.md` lists user-visible changes.
