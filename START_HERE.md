# Start Here — Scholar Agentic Operating System

Welcome to the Scholar Agentic Operating System. This guide helps you get productive quickly.

## Quick Start (5 Minutes)

1. **Prerequisites**: Node.js (v18+) installed
2. **Install**: `npm install`
3. **Configure**: Copy `.env.example` to `.env` and add your `GEMINI_API_KEY`
4. **Run**: `npm run dev`

## For Human Developers

### Understand the Architecture
- Read `docs/architecture/01-Scholar-Platform-Constitution.md`
- Review `docs/architecture/02-Scholar-System-Architecture.md`
- Check `docs/architecture/04-Scholar-Engineering-Standards.md`

### Key Directories
```
src/ai/                  - AI Operating System (kernel: AIKernel)
src/research/            - Research Operating System (ResearchIntelligenceEngine — no Kernel class, unlike other OS layers)
src/knowledge/           - Knowledge Operating System (kernel: KnowledgeKernel; graph, semantic memory, KQL, reasoning)
src/knowledge_vault/     - Document repository/vault service (distinct from src/knowledge/ — raw literature storage & indexing)
src/writing/             - Writing Operating System (kernel: WritingKernel)
src/publication/         - Publication Operating System (kernel: PublicationKernel)
src/workspace/           - Workspace Operating System (kernel: WorkspaceKernel)
src/collaboration/       - Collaboration Operating System (kernel: CollaborationKernel)
src/orchestrator/        - Multi-agent workflow engine (MultiAgentOrchestrator, WorkflowEngine, execution/approval/retry management)
src/agents/              - Scholarly agents (research planner, literature review, methodology advisor, manuscript writer, etc.)
src/document_intelligence/ - Document parsing/ingestion pipeline (PDF/DOCX/TXT/Markdown parsers, Canonical Document Model)
src/citation_compliance/ - Citation & academic compliance engine (APA7, IEEE, MLA9, Chicago, Harvard, Vancouver formatters)
src/auth/                - Authentication UI (LoginScreen, authContext, useAuth)
src/lifecycle/           - ResearchLifecycleEngine (10-phase workflow state machine)
src/core/                - Shared foundation, incl. core/manuscript and core/project subsystems
server/                  - Express backend: routes/ (ai, auth, parser), services/, middleware/, data/ (storage layer)
docs/adr/                - Architecture Decisions (read before changing architecture)
.claude/                 - AI handover documentation
```

**Important caveat**: only `src/ai` is consumed outside its own module (by `src/research`). `src/knowledge`, `src/writing`, `src/publication`, `src/workspace`, `src/collaboration`, `src/orchestrator`, and `src/agents` are fully implemented and tested but are not imported by `server.ts` or the React app — see `.claude/HANDOVER.md` §0 for details before assuming any of these are reachable from the running product.

## For AI Assistants (Claude Code)

### Required Reading Order
1. `.claude/CLAUDE.md` — Operating procedures
2. `.claude/ARCHITECTURE_RULES.md` — Non-negotiable rules
3. `.claude/DEVELOPMENT_GUIDELINES.md` — Coding standards
4. `.claude/HANDOVER.md` — Current state snapshot
5. `.claude/ROADMAP.md` — Future priorities

### Before Making Changes
- Understand existing patterns before introducing new ones
- Review ADRs for architectural decisions
- Follow the extension principles (extend before create)
- Update documentation for significant changes

## Current Status

- **Branch**: `main`
- **Phase**: 6 (Document Intelligence) in progress
- **Build**: ✅ Passing (`npx tsc --noEmit`, `npm run build`)
- **Tests**: run via **Vitest** (`npm test`) — 18 `*.test.ts` files, 330 tests, all passing as of this writing

## Next Priorities

1. Complete Architecture Stabilization (E01)
2. Implement Document Intelligence (T006-cycle1)
3. Add Security Foundation (E02)

See `.claude/ROADMAP.md` for details.