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

See `REPOSITORY_TRUTH_REPORT.md` and `ARCHITECTURE_SYNCHRONIZATION_REPORT.md` at the repo root for the verified structural audit this listing is based on.

## For AI Assistants (Claude Code)

### Required Reading Order
1. `.claude/CLAUDE.md` — Operating procedures
2. `.claude/PROJECT_MEMORY.md` — Historical context
3. `.claude/ARCHITECTURE_RULES.md` — Non-negotiable rules
4. `.claude/DEVELOPMENT_GUIDELINES.md` — Coding standards
5. `.claude/HANDOVER.md` — Current state snapshot
6. `.claude/ROADMAP.md` — Future priorities

### Before Making Changes
- Understand existing patterns before introducing new ones
- Review ADRs for architectural decisions
- Follow the extension principles (extend before create)
- Update documentation for significant changes

## Current Status

- **Branch**: `blackboxai/phase-6b-doc-intelligence-cycle1`
- **Phase**: 6 (Document Intelligence) in progress
- **Build**: ✅ Passing
- **Tests**: run via **Vitest** (`npm test`), not Jest — 309 `*.test.ts` files present on disk; exact pass count unverified in this pass, run `npm test` to confirm

## Next Priorities

1. Complete Architecture Stabilization (E01)
2. Implement Document Intelligence (T006-cycle1)
3. Add Security Foundation (E02)

See `.claude/ROADMAP.md` for details.