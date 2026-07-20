# Scholar Agentic Operating System

An AI-native operating system for academic research and journal publication. Scholar guides PhD scholars and researchers through a structured ten-phase research workflow — literature review, planning, methodology, data analysis, drafting, refinement, compliance checking, and publication — orchestrated by a kernel-based set of Operating Systems (AI, Research, Knowledge, Writing, Publication, Workspace, Collaboration) plus a multi-agent orchestration layer, document intelligence pipeline, and citation/academic-compliance engine.

See `START_HERE.md` for onboarding and `.claude/HANDOVER.md` for current repository status.

## Run Locally

**Prerequisites:** Node.js (v18+)

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` (and any other provider keys you use).
3. Run the app (starts the Express/Vite dev server via `tsx server.ts`):
   `npm run dev`

## Scripts

- `npm run dev` — development server (`tsx server.ts`)
- `npm run build` — Vite client build + esbuild server bundle to `dist/`
- `npm start` — run the built server (`dist/server.cjs`)
- `npm run lint` — TypeScript check (`tsc --noEmit`)
- `npm test` — run the test suite (**Vitest**)
- `npm run test:coverage` — Vitest with coverage
