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

---

## 3. Current Project Status

### Operating Systems
- ✅ Phase 1-5: Implemented and functional
- ✅ Phase 6: Document Intelligence in progress
- ⏳ Phase 7-10: Planned

### Architecture Status
- ✅ Multi-provider AI integration (Gemini, Ollama, OpenAI-compatible endpoints)
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
- ✅ Branch: `blackboxai/phase-6b-doc-intelligence-cycle1`
- ✅ Architecture documentation in `docs/architecture/`
- ✅ ADRs documented in `docs/adr/`

### Build Status
- ✅ Vite-based build system configured
- ✅ TypeScript strict mode enabled
- ✅ Tailwind CSS v4 integration

### Test Status
- ✅ Test runner: **Vitest** (`npm test` / `npm run test:coverage`), not Jest — 309 `*.test.ts` files on disk; run `npm test` to confirm current pass count

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
- `.claude/PROJECT_MEMORY.md` — Long-term project context
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