# CLAUDE.md — Claude Code Operating Manual

## 1. Project Identity

- **Project Name**: Scholar Agentic Operating System (Scholar)
- **Purpose**: An AI-powered assistant designed to support PhD scholars and academic researchers through a comprehensive ten-phase research workflow — writing, citing, checking compliance, and managing literature for journal publication.
- **Long-term Vision**: To become an AI-native operating system for research and scholarly work, providing intelligent orchestration across all phases of academic research and publication.
- **Primary Users**: PhD scholars, academic researchers, and journal publication professionals.
- **Core Philosophy**: Facilitate high-level academic production by managing a structured research workflow while maintaining academic integrity and technical resilience.

---

## 2. Mission

Scholar is intended to become an AI-native operating system for research and scholarly work rather than a traditional research application. It provides a ten-phase research workflow that guides users from initial research intake through publication:

1. Research Intake
2. Literature Review
3. Research Planning
4. Methodology Design
5. Data Analysis
6. Draft Writing
7. Manuscript Refinement
8. Compliance Checking
9. Publication Preparation
10. Publication Submission

The system acts as a scholarly research collaborator, proposing structural improvements while maintaining strict adherence to academic standards and Vedic Samhitas alignment where applicable.

**Note**: this 10-phase model is aspirational — it describes the product vision, not a module in the codebase. It was previously defined in `src/lifecycle/ResearchLifecycleEngine.ts`, which was **deleted in Phase 0** (commit `4afb6c8`) as unwired dead code; see `docs/adr/ADR-0012-KernelModuleRemoval.md`. The only phase model that actually executes is the lettered one (`"A" | "B" | ... | "I"`, with `G1`/`G2` sub-phases) defined in `src/types.ts` and referenced throughout `src/components/` and `src/services/aiService.ts`. Assume a "phase" reference means the lettered model unless stated otherwise; see `.claude/HANDOVER.md` §3 ("Research Lifecycle") for the mapping.

---

## 3. Current Project Status

### Operating Systems
- ✅ Phase 1-5: Implemented
- ✅ Phase 6: Document Intelligence in progress
- ⏳ Phase 7-10: Planned
- ⚠️ **The unwired kernel modules no longer exist.** `KnowledgeKernel`, `WritingKernel`, `PublicationKernel`, `WorkspaceKernel`, `CollaborationKernel`, `src/orchestrator` (the full workflow-orchestration package), and `src/lifecycle` were **deleted in Phase 0** (commit `4afb6c8`): 46 files, 8,303 lines, with zero importers outside their own directories. Rationale, restore instructions, and the case for reinstating them are in `docs/adr/ADR-0012-KernelModuleRemoval.md`. Do not write code against these APIs — recover them from git history first if they're wanted back.
- The surviving library modules are `src/ai` (AIKernel — consumed by `src/research`), `src/research`, and `src/agents`. `src/agents` is real and live: it's reached from the UI via `src/services/agentService.ts` and `AgentOrchestrationDashboard.tsx`.

### Architecture Status
- ✅ Multi-provider AI integration — 26 cloud providers and 9 local runners, defined once in `src/config/providerCatalog.ts` and `src/config/localRunnerCatalog.ts` and consumed by both the browser bundle and `server.ts`. Adding a provider is one catalog entry; do NOT add a new adapter or a new `if (aiProvider === ...)` branch (see `docs/adr/ADR-0011-AIProviderCatalogAndVault.md`)
- ✅ Encrypted API key vault (`src/services/apiVault.ts`) with device-bound or passphrase unlock, plus backup/restore
- ✅ Error-kind-driven provider failover (`src/services/aiErrors.ts`, `src/services/providerFailover.ts`)
- ✅ Event-driven architecture with plugin system
- ✅ Knowledge Vault for literature management
- ✅ Citation compliance formatters (APA 7th, IEEE, MLA 9th, Chicago, Harvard, Vancouver)
- ✅ PWA capabilities with offline support

### PWA Status
- ✅ Service worker implemented (`sw.js`)
- ✅ Web manifest configured (`manifest.json`)
- ✅ Offline-first architecture

### Research Lifecycle
- ✅ 10-phase workflow defined
- ✅ State persistence implemented
- ✅ Semantic memory patterns established

### Repository
- ✅ Local Git repository active
- ✅ Architecture documentation in `docs/architecture/`
- ✅ ADRs documented in `docs/adr/`

### Build Status
- ✅ Vite-based build system configured (`npx tsc --noEmit` and `npm run build` both pass)
- ⚠️ TypeScript: `tsconfig.json` sets no `strict` flag, so `strictNullChecks` is OFF. Consequence worth knowing before writing code: TypeScript will NOT narrow a discriminated union through `if (!result.ok)`. Use an explicit type predicate instead — see `isFailoverSuccess`/`isFailoverFailure` in `src/services/providerFailover.ts`
- ✅ Tailwind CSS v4 integration

### Test Status
- ✅ Test runner: **Vitest** (`npm test` / `npm run test:coverage`), not Jest — 106 test files, 1104 tests, all passing as of 2026-08-01 (run `npm test` to reconfirm). The drop from 1207 is the orchestrator suite deleted in Phase 0, not lost coverage of live code. jsdom suites must wire localStorage themselves via the `Object.defineProperty(globalThis, "localStorage", ...)` preamble used across the existing suites; `fake-indexeddb/auto` is available for IndexedDB-backed code
- ⚠️ **CI gates on `npm run lint` (`tsc --noEmit`), which is stricter than `npm run build`.** Vite transpiles without full type-checking, so a green build does **not** mean a green CI. Always run `npm run lint` before pushing — several commits were merged red because only `build` and `test` were checked locally.

---

## 4. Claude's Responsibilities

As a development partner for Scholar, Claude is responsible for:

- **Extend existing systems** — Build upon established architecture rather than replacing it.
- **Improve quality** — Enhance code quality, performance, and user experience.
- **Preserve architecture** — Maintain the existing architectural patterns and conventions.
- **Write production-ready code** — Follow coding standards and best practices.
- **Maintain documentation** — Keep all relevant documentation current and accurate.
- **Keep implementations modular** — Follow separation of concerns and maintain low coupling.

---

## 5. Things Claude Must Never Do

Claude must **never**:

- ❌ Redesign completed architecture without explicit approval
- ❌ Remove existing functionality that users depend on
- ❌ Introduce breaking API changes
- ❌ Duplicate existing modules or functionality
- ❌ Replace abstractions unnecessarily
- ❌ Make undocumented architectural changes
- ❌ Modify application source code unless explicitly requested
- ❌ Modify configuration files unless explicitly requested
- ❌ Sacrifice code quality for speed

---

## 6. Preferred Development Workflow

For every task, follow this workflow:

1. **Understand the request** — Clarify ambiguous requirements before proceeding.
2. **Review existing implementation** — Examine current code patterns and architecture.
3. **Identify affected components** — Map out which systems will be touched.
4. **Produce a short implementation plan** — Present approach for approval on major changes.
5. **Wait for approval** — When major architectural changes are required, seek confirmation.
6. **Implement incrementally** — Make small, testable changes.
7. **Test thoroughly** — Ensure builds succeed and tests pass.
8. **Update documentation** — Keep all relevant docs current.
9. **Summarize completed work** — Provide clear summary of changes made.

---

## 7. Code Quality Expectations

All code must adhere to these standards:

- **SOLID Principles** — Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion
- **DRY** — Don't repeat yourself; extract common logic into reusable modules
- **Separation of Concerns** — Each module should have one clear purpose
- **High Cohesion** — Related functionality should be grouped together
- **Low Coupling** — Minimize dependencies between modules
- **Readability** — Code should be self-documenting with clear naming
- **Maintainability** — Easy to modify and extend
- **Scalability** — Design for future growth

Additional requirements:
- Use Tailwind CSS classes for styling (no inline styles)
- Strict TypeScript type-checking
- Use retry/backoff middleware for LLM interactions
- Parse LLM responses using brace-extracting helper logic

---

## 8. Documentation Policy

Any significant implementation change should update:

- Architecture documentation in `docs/architecture/`
- Relevant ADRs in `docs/adr/`
- Project `README.md`
- `CHANGELOG.md`
- `.claude/` handover documents when appropriate

Documentation is a required deliverable, not optional.

---

## 9. Testing Policy

- ✅ Build must succeed (`npm run build`)
- ✅ Existing tests must pass (`npm test`)
- ✅ New functionality should include tests where appropriate
- ✅ Avoid introducing regressions

---

## 10. Communication Style

Claude should:

- **Explain reasoning** — Provide clear rationale for implementation decisions
- **State assumptions** — Make implicit assumptions explicit
- **Highlight risks** — Identify potential issues early
- **Ask for clarification** — When requirements are ambiguous, seek guidance
- **Avoid large undocumented changes** — Keep modifications transparent and reviewed

---

## 11. Repository Awareness

Before undertaking significant work, Claude should familiarize itself with:

- `README.md` — Project overview and getting started guide
- `docs/architecture/` — Architecture documentation
- `docs/adr/` — Architecture decision records
- `.claude/HANDOVER.md` — Current state and priorities
- `.claude/ARCHITECTURE_RULES.md` — Structural guidelines
- `.claude/DEVELOPMENT_GUIDELINES.md` — Coding standards and workflows

---

## 12. Definition of Done

A task is complete only when:

1. Implementation is finished and functional
2. Code quality standards are met (SOLID, DRY, TypeScript strict)
3. Build succeeds without errors
4. All relevant tests pass
5. Documentation is updated
6. No known regressions remain