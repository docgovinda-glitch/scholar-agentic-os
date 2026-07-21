# HANDOVER.md — Scholar Agentic Operating System Developer Handover

## Next Session — READ THIS FIRST

**Phase 1 of `docs/planning/hosting-and-topology.md` (static hosting + Supabase migration) is built and unit-tested, but NOT live-verified and NOT cut over — read this before touching auth, hosting, or AI-gateway work.** As of 2026-07-21:

**What's done and verified** (`npx tsc --noEmit` clean, `npx vitest run` — 21 files / 347 tests passing):
- `supabase/schema.sql` — `profiles`, `api_credentials`, `pending_password_resets` tables, RLS policies, an auto-profile-creation trigger, and two security-definer RPCs (`email_for_username`, `is_username_approved`) needed because the app logs in by username but Supabase Auth is email-based.
- `src/services/supabaseClient.ts` + `src/services/supabaseAuthService.ts` — full client-side replacement for `server.ts`'s auth/user/admin routes (signUp, signIn, checkApproval, saveModelPreferences, saveApiKeys, requestPasswordReset, requestProfileUpdate), unit-tested against a mocked Supabase client.
- `supabase/functions/` — 5 Edge Functions (Deno) covering the admin-approval-by-email workflows that need the service_role key: `send-approval-email`, `approve-registration`, `request-password-reset`, `approve-password-reset`, `request-profile-update`. **Not type-checked or tested by this project's `tsc`/`vitest`** — that's a structural limitation (different runtime), not skipped effort; `tsconfig.json` now explicitly excludes `supabase/functions`.
- `scripts/migrate-users-to-supabase.ts` — one-off `users.json` → Supabase migration script (`npm run migrate:users-to-supabase`).
- `DEPLOYMENT_README.md` and `render.yaml` rewritten for the new split: Supabase (auth/user data) + static hosting (frontend) + a slimmed-down interim `server.ts` (still needed — see below).

**Update: the live Supabase project is now provisioned and fully verified** (see the closed-out walkthrough below) — item 1 below is historical, kept for context on what this phase originally shipped without live verification.

**What's explicitly NOT done, and why:**
1. ~~No live Supabase project exists.~~ **Superseded** — live project `scholarAgent` (`gfjhsijrwodjvkisouzw`, `ap-south-1`) now exists, schema is applied, all 5 Edge Functions are deployed and verified working end-to-end (see below). What's still true from this point: the frontend isn't yet pointed at any of it (item 2 below).
2. **The actual UI is NOT cut over.** `UserProfileGate.tsx` (1,782 lines), `ProfileSettings.tsx`, and `AIControlCenter.tsx` still call the old `/api/*` Express routes — `src/auth/authContext.tsx` itself doesn't call the backend directly, the three components above do. This was a deliberate stop: `UserProfileGate.tsx` has substantial bespoke logic (OTP sandbox-bypass codes, `formsubmit.co` client-side email fallback, mailto fallbacks, activation-key hash comparisons) with **zero existing test coverage**, and no live backend or E2E harness to verify a rewrite against. Rewiring it now would be guessing past a real risk, not completing the phase. Recommend either (a) adding characterization tests for its current behavior before touching it, or (b) doing the cutover deliberately slowly with manual click-through testing once live credentials exist — not a "do it autonomously" task.
3. **`server.ts`'s old ~1,050 auth/user/admin lines are untouched, deliberately** — per the "don't delete until the replacement is verified working" instruction. They're still what actually runs today; nothing currently points at the new Supabase code.
4. **Two design questions from the previous pass are now CONFIRMED, not open — do not re-litigate, implement per this when the relevant code is touched:**
   - **Password reset**: switch to Supabase Auth's built-in `resetPasswordForEmail` self-service flow, dropping the custom admin-approval gate currently built (`pending_password_resets` table in `supabase/schema.sql`, and the `request-password-reset`/`approve-password-reset` Edge Functions). Reasoning: the old flow's admin-approval step wasn't adding security on top of an already-verified mechanism — `server.ts`'s `/api/request-password-reset` never checked that the submitted email matched the account on file, so anyone who knew a username could stage a reset with an arbitrary email; the admin clicking approve was the *only* thing preventing takeover. Supabase's built-in reset closes that gap directly (the link only ever goes to the real email on `auth.users`), at the cost of losing the admin's visibility into every reset event — an accepted tradeoff. **Not implemented yet.** This happens as part of the Step 2 UI cutover (`UserProfileGate.tsx`'s `handleForgotPasswordSubmit`), not in isolation — when that happens, `supabase/functions/request-password-reset`, `approve-password-reset`, and the `pending_password_resets` table become dead code to remove.
   - **BYOK key encryption**: confirmed direction is a client-side, app-level encryption layer using the already-built `src/utils/crypto.ts` (`encryptDataAsync`/`decryptDataAsync` — AES-GCM + PBKDF2, already throws on an empty secret, no hardcoded fallback to reintroduce). The secret is a **separate vault passphrase**, distinct from the account's login password, entered once per session and held only in memory — never persisted to localStorage/disk. If it's missing (e.g., a page refresh cleared in-memory state), the UI must explicitly prompt to re-enter it before decrypting/re-encrypting anything — never silently fall back to an empty or default secret. **Not implemented yet** — `supabaseAuthService.ts`'s `saveApiKeys` deliberately still stores keys unencrypted; this is deferred until Supabase is live and the encryption round-trip can be tested for real, not built blind.

**Supabase go-live walkthrough — CLOSED OUT, fully verified.** Live project: `scholarAgent`, ref `gfjhsijrwodjvkisouzw`, region `ap-south-1`.
- **Step 1**: Project URL + anon (Publishable) key located and distinguished from the Secret (service_role) key; `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set in the local, gitignored `.env`. Secret key was shown in chat once but never written to any file.
- **Step 2**: `supabase/schema.sql` run against the live project via the SQL Editor. Verified: `profiles`, `api_credentials`, `pending_password_resets` tables exist; RLS enabled on all three; exactly the three expected policies present.
- **Step 3**: the hardcoded admin notification email (`"doc.govinda@gmail.com"`, previously duplicated across `server.ts`, the unwired `server/routes/auth.ts` duplicate, and 3 of the 5 Edge Functions) is now a configurable `ADMIN_EMAIL` (committed — see git log). Supabase CLI installed via `npx supabase@2.109.1` (Homebrew's own `curl` couldn't verify GitHub's release-asset CDN cert on this machine — an unresolved local Homebrew/curl issue, unrelated to Supabase; `npx` sidesteps it using Node's own CA store). Project linked (`supabase/.temp/linked-project.json` confirms `gfjhsijrwodjvkisouzw` — note this CLI version doesn't use `supabase/config.toml`, it's `.temp/`-based, now gitignored). All 5 Edge Functions deployed with `--use-api` (no Docker on this machine) and `--no-verify-jwt` on `approve-registration`/`approve-password-reset` (verified: both return `400`, not `401`). `RESEND_API_KEY` and `ADMIN_EMAIL` secrets set (`supabase secrets list` confirms both registered, distinct from the auto-injected `SUPABASE_*` platform secrets). **Full end-to-end send path verified**: 3 test emails confirmed landed in the `ADMIN_EMAIL` inbox.
- **Two secret-handling mishaps during this walkthrough, both resolved, worth knowing about if repeating similar steps**: (a) the Resend key was twice set to instructional placeholder text instead of a real value (`re_your_actual_key_here` literally, then a Render API key — prefix `rnd_` — pasted by mistake instead of a Resend key, prefix `re_`) — resolved by testing the key directly against `https://api.resend.com/emails` first to isolate "is the key itself valid" from "did it get set correctly," before touching Supabase secrets. (b) The Render `rnd_` key was briefly shown in full in a screenshot in chat — flagged to the user as exposed, same handling as the Supabase Secret Key earlier; revoking it is the user's call, not blocking.

**What's still NOT done** (unchanged from before this walkthrough):
1. **The actual UI is NOT cut over.** `UserProfileGate.tsx` (1,782 lines), `ProfileSettings.tsx`, and `AIControlCenter.tsx` still call the old `/api/*` Express routes. This was a deliberate stop: `UserProfileGate.tsx` has substantial bespoke logic (OTP sandbox-bypass codes, `formsubmit.co` client-side email fallback, mailto fallbacks, activation-key hash comparisons) with **zero existing test coverage**, and now that Supabase is live, this is exactly the point where (a) characterization tests or (b) a slow, manual click-through cutover become possible for real — this is next session's actual first task.
2. **`server.ts`'s old ~1,050 auth/user/admin lines are untouched, deliberately** — don't delete until the replacement above is verified working through the real UI, not just via `curl`.
3. **The two CONFIRMED-but-not-implemented design decisions from the previous pass are now unblocked and ready to implement**: password reset → switch to Supabase's built-in `resetPasswordForEmail` (removing the custom admin-approval gate, `pending_password_resets` table, and `request-password-reset`/`approve-password-reset` Edge Functions as dead code); BYOK key encryption → add the vault-passphrase app-level encryption layer to `saveApiKeys` using `src/utils/crypto.ts`. Both were explicitly deferred until Supabase was live and testable for real — that condition is now met. Implement both **as part of** the UI cutover in item 1, not in isolation.

**Next session's actual first task**: begin the `UserProfileGate.tsx` UI cutover (item 1) — recommend starting with characterization tests for its current behavior before touching it, given zero existing coverage. Do the password-reset and BYOK-encryption changes (item 3) as part of this same effort, not as separate follow-ups.

**Still paused, unchanged, not part of any of the above**: the native-skills agent-wiring rollout (`ResearchPlannerAgent` wired to `src/skills/`, 1 of 8 agents, still uncommitted — deliberately kept separate from every commit made during this Supabase work). Remains blocked until the hosting picture (including the UI cutover above) is fully settled.

**Next proposed step after live provisioning is done (not started): Phase 2 — AI Gateway Tiers 2 and 3** (free-tier BYOK, heavy BYOK), per `docs/planning/hosting-and-topology.md` §7's proposed sequencing — lowest technical risk of the remaining AI Gateway work, reusing `src/services/aiGateway.ts`'s existing provider adapters. Do not start until Phase 1's live verification and the UI-cutover risk (item 2 above) are resolved.

**Also still paused, unchanged**: the in-progress native-skills agent-wiring rollout (`ResearchPlannerAgent` wired to `src/skills/`, 1 of 8 agents, uncommitted) — `createAgentContext()` lives in `server.ts`, which this hosting migration will eventually eliminate; don't wire the remaining 7 agents until the hosting picture is fully settled. See `docs/planning/2026-07-20-session-notes.md` for that work and the still-open UI redesign / agent-roster (blocked on ARCH-3) proposals.

---

## 0. Repository Migration Note (2026-07-20) — READ FIRST

This is a **fresh repository**, copied from an older working directory
(`/Users/pobpkf/Documents/Doctoral-Research-and-Journal-Publication-Assistant 4.43.36 PM`)
because that location's Claude Code session had a persistent bug where the
`Write` tool could not create new files (reported success but the file never
actually existed on disk, confirmed via both `Bash` and `Read`). That bug
does **not** reproduce in this new location — new-file creation was
verified working here before this note was written.

**Do not repeat completed work.** The old repository had already been through
multiple audit/stabilization/convergence sessions before this migration. This
copy excluded that session's audit-report clutter (`ARCHITECTURE_SYNCHRONIZATION_REPORT.md`,
`ENGINEERING_*_REPORT.md`, etc.) and a few non-code items (`.env`, `users.json`,
a local AI model binary, stray duplicate scaffold folders) — none of that
represents unfinished engineering work, just prior audit trail. If you need
that history, it still exists at the old path above.

**Verified state as of this commit**: 0 TypeScript errors, 18 test files /
330 tests passing (`npx vitest run`), production build succeeds
(`npm run build`), server boots and serves real requests (health check).
Note: `/api/agents` does not exist — `server/routes/` only registers `ai.ts`,
`auth.ts`, and `parser.ts`. The `src/agents/` scholarly agents and
`src/orchestrator/` workflow engine are implemented but are not imported by
`server.ts` or any route, so they are not reachable from the running app yet
(see the kernel-wiring note below).

**Fixed during migration** (both bugs are resolved, not open items):
- `src/ai/` (the AI Kernel) was accidentally omitted by an overly-broad
  copy-exclude pattern — restored and verified.
- `uuid` (used by `src/orchestrator/*`) was an undeclared/phantom dependency
  that only worked in the old repo by accident (already sitting in its
  `node_modules`) — now a proper `package.json` dependency.
- BibTeX/RIS citation import logic, previously stuck inline in `server.ts`
  as a workaround while file-creation was blocked, has been moved to its
  proper home: `src/citation_compliance/importers/` (with tests).

**Suggested next steps** (not started yet, from the prior session's audit):
Knowledge Graph (`src/knowledge/graph/KnowledgeGraph.ts`) is fully
implemented but has no adapter connecting it to any live UI or service —
genuinely disconnected, not a quick fix; would need a product decision on
what it should actually show before wiring it up. The same is true, more
broadly, of most of the "Operating System" kernel layer: grepping the
codebase for each kernel class shows `KnowledgeKernel`, `WritingKernel`,
`PublicationKernel`, `WorkspaceKernel`, and `CollaborationKernel` are only
referenced inside their own module (definition + barrel `index.ts`) — no
import from `server.ts`, `server/routes/`, `src/App.tsx`, or
`src/components/`. `AIKernel` is the exception: `src/research/` consumes it.
`src/orchestrator/` (MultiAgentOrchestrator, WorkflowEngine) and
`src/agents/` (the eight scholarly agents) are likewise fully implemented
and tested but never imported by the running server or UI. None of this is
broken — it's substantial, working library code — but earlier drafts of
this document described it as production-integrated, which overstates its
current reach. Treat "wire an OS kernel / agent / orchestrator into the
live app" as real, unstarted product work, not a loose end to tidy up.
Beyond that, continue the established pattern from this project's
engineering history: prefer deterministic Scholar Core OS processing over
AI where structured data already exists, and validate every change with
`npx tsc --noEmit`, `npx vitest run`, and `npm run build`.

---

## 1. Executive Summary

- **Project Name**: Scholar Agentic Operating System
- **Current Maturity**: v1.0.0 LTS Release
- **Primary Purpose**: AI-native operating system for academic research and journal publication
- **Development Stage**: Phase 6 (Document Intelligence) in progress; Phases 7-10 planned
- **Production Readiness**: Build system stable, 330 tests passing, PWA implemented, authentication ready

---

## 2. Repository Overview

### Major Directories

```
src/
├── ai/                    # AI Operating System (providers, router, cache, telemetry) — kernel: AIKernel
├── research/              # Research Operating System (discovery, analyzers, evidence) — ResearchIntelligenceEngine, no Kernel class
├── knowledge/             # Knowledge Operating System (graph, semantic memory, KQL) — kernel: KnowledgeKernel
├── knowledge_vault/       # Document repository/indexing service (distinct from knowledge/)
├── writing/               # Writing Operating System (drafting, citations) — kernel: WritingKernel
├── publication/           # Publication Operating System (journals, workflow) — kernel: PublicationKernel
├── workspace/             # Workspace Operating System (projects, lifecycle) — kernel: WorkspaceKernel
├── collaboration/         # Collaboration Operating System (teams, roles) — kernel: CollaborationKernel
├── orchestrator/          # Multi-agent workflow engine (MultiAgentOrchestrator, WorkflowEngine, execution/approval/retry)
├── agents/                # Scholarly agents (research planner, literature review, methodology advisor, manuscript writer, ...)
├── document_intelligence/ # Document parsing pipeline (PDF/DOCX/TXT/Markdown → Canonical Document Model)
├── citation_compliance/   # Citation & academic compliance engine (APA7/IEEE/MLA9/Chicago/Harvard/Vancouver)
├── auth/                  # Authentication UI (LoginScreen, authContext, useAuth)
├── lifecycle/             # ResearchLifecycleEngine (10-phase workflow state machine)
├── core/                  # Shared foundation, incl. core/manuscript and core/project
├── components/            # React UI components
├── hooks/                 # Custom React hooks
└── services/              # Service layer integrations

server/                    # Express backend — routes/ (ai, auth, parser), services/, middleware/, data/ (storage layer)

docs/
├── architecture/ # core architecture documents
├── adr/        # architecture decision records
└── development/  # Developer handbook, sprint guides

.claude/        # AI handover documentation (this folder)
```

### Documentation Structure

- `README.md` — Project overview and quick start
- `CHANGELOG.md` — Release history and changes
- `docs/architecture/` — System design documentation
- `docs/adr/` — Architectural decisions
- `.claude/` — AI development handover documents

### Source Layout

Each operating system follows consistent patterns with `core/`, `types/`, and `index.ts` barrel files. Components are in `src/components/`, hooks in `src/hooks/`.

### Test Organization

Tests located in `__tests__/` directories adjacent to source code. Integration tests for cross-module workflows.

### Configuration Files

- `package.json` — Dependencies and scripts
- `tsconfig.json` — TypeScript configuration
- `vite.config.ts` — Vite build configuration
- `.env.example` — Environment variable template

---

## 3. Current Implementation Status

### Operating Systems

| OS | Status | Wired into running app? | Notes |
|----|--------|--------------------------|-------|
| AI OS | ✅ Implemented | Yes — consumed by `src/research/` | Provider abstraction, fallback chains, caching |
| Knowledge OS | ✅ Implemented | No | KnowledgeKernel, KnowledgeGraph, SemanticMemory — only referenced within `src/knowledge/` |
| Research OS | ✅ Implemented | Partially — depends on AIKernel, but not called by `server.ts`/UI | ResearchIntelligenceEngine, evidence workspace |
| Writing OS | ✅ Implemented | No | Manuscript drafting, citation generation — only referenced within `src/writing/` |
| Publication OS | ✅ Implemented | No | Journal management, recommendations — only referenced within `src/publication/` |
| Workspace OS | ✅ Implemented | No | Multi-project support, lifecycle — only referenced within `src/workspace/` |
| Collaboration OS | ✅ Implemented | No | Teams, roles, permissions — only referenced within `src/collaboration/` |

The live product (`server.ts` + `src/App.tsx`/`src/components/`) actually runs on `src/services/aiGateway.ts` + `src/services/aiService.ts`, `src/auth/` (localStorage-backed), and `src/core/project` (`ProjectBuilder`) — a simpler, more conventional stack than the kernel model above describes. See the kernel-wiring note in section 0.

### Architecture

- ✅ Clean Architecture compliant
- ✅ Kernel-based design implemented
- ✅ Dependency Injection in place
- ✅ Event-driven ready
- ✅ No circular dependencies
- ✅ Architecture audit complete

### Documentation

- ✅ 5 Architecture Documents
- ✅ 10 ADRs
- ✅ Developer Handbook
- ✅ AI handover documents (`.claude/`)

### PWA

- ✅ Service worker (`sw.js`)
- ✅ Web manifest (`manifest.json`)
- ✅ Offline-first architecture

### Research Lifecycle

- ✅ 10-phase workflow defined in `src/lifecycle/ResearchLifecycleEngine.ts` — **but nothing imports this file outside itself**; it is not the workflow the running app actually uses.
- ⚠️ The live UI runs a *different*, lettered phase model: `src/types.ts` defines `currentPhase: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "G1" | "G2" | "H" | "I"`, and `src/components/*` + `src/services/aiService.ts` hardcode phase labels against those letters (B = Dissertation Grounding, C = Data/Source Discovery, D = Journal Discovery, E = Compliance Setup, F = Manuscript Co-Drafting, G = Quality Control, H/I = Submission Packaging & Tracking). When a doc or a user says "Phase 6" or "Phase F", confirm which of the two models they mean before acting — they are not the same numbering.
- ✅ State persistence implemented (client-side, via `authContext.tsx` + localStorage, and server-side via `server/data/`)
- ✅ Evidence-controlled reasoning (in the disconnected `src/knowledge/reasoning` module)

### Testing

- ✅ 330 automated tests passing (18 test files)
- ✅ Unit tests for all kernels
- ✅ Integration tests for OS modules

### Build

- ✅ Vite build system operational
- ✅ TypeScript strict mode
- ✅ Tailwind CSS v4 integrated

### Current Repository Maturity

Stable foundation with active Document Intelligence development. Ready for new feature development within established patterns.

---

## 4. Major Features

### AI Operating System
- Multi-provider AI (OpenAI, Anthropic, Gemini, Ollama, LM Studio)
- AIRouter with fallback, caching, telemetry
- ModelRegistry, TaskRouter, PolicyEngine
- Cost tracking and rate limiting

### Knowledge Operating System
- KnowledgeRegistry for object management
- KnowledgeGraph for relationships
- SemanticMemory for vector search
- KQL (Knowledge Query Language) for querying
- ReasoningEngine with deductive/inductive/abductive reasoning

### Research Operating System
- ResearchIntelligenceEngine for analysis
- Literature discovery providers
- Evidence review workspace
- Framework generation
- Methodology recommendation
- Novelty analysis

### Writing Operating System
- Manuscript drafting
- Outline generation with templates
- Citation compliance (APA 7th, IEEE, MLA 9th, Chicago, Harvard, Vancouver)

### Publication Operating System
- Journal database with metadata
- Journal recommendations
- Impact factor-based ranking
- Publication workflow

### Workspace Operating System
- Multi-project management
- Project lifecycle (draft → active → completed → archived)
- State persistence

### Collaboration Operating System
- Team management
- User roles
- Shared workspace features

---

## 5. Architecture Summary

### Operating System Model

Scholar follows an operating system model where each domain (AI, Research, Knowledge, Writing, Publication, Workspace, Collaboration) operates as an independent layer. Layers communicate through well-defined interfaces.

### Kernel Abstractions

Each OS layer implements the `Kernel` interface:
```typescript
interface Kernel {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<HealthStatus>;
  configuration(): KernelConfig;
  capabilities(): KernelCapabilities;
  execute<T>(input: T): Promise<T>;
  events(): EventBus;
  metrics(): Metrics;
}
```

### Research Lifecycle

Ten-phase structured workflow:
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

### AI Abstraction

Multi-provider architecture with:
- `AIProvider` interface for all providers
- `AIRouter` for fallback chains
- Caching and telemetry built-in

### Knowledge Graph

Knowledge objects with:
- UUID identity
- Metadata and relationships
- Lifecycle management
- Confidence scoring

### Workspace Organization

Projects contain:
- Research questions
- Evidence
- Knowledge objects
- Manuscripts
- Publications

---

## 6. Development Environment

### Primary Language
- **TypeScript** (strict mode enabled)

### Frameworks
- React 19 with hooks
- Vite for build
- Express.js for backend API

### Package Manager
- npm (with `package-lock.json` committed)

### Build System
- Vite development server
- TypeScript compiler
- Tailwind CSS v4

### Testing Framework
- **Vitest** (`npm test` runs `vitest run`; `test:coverage` runs `vitest run --coverage`)
- Jest appears in `devDependencies` but is not the active runner — treat as legacy/unused unless confirmed otherwise
- Unit and integration tests, 18 `*.test.ts` files on disk, 330 tests passing

### Development Tools
- ESLint (recommended for consistency)
- VS Code with TypeScript extension

### IDE Recommendations
- VS Code with ESLint and TypeScript plugins
- Prettier for formatting

### Current Git Strategy
- Local repository active
- Branch: `main`

---

## 7. Build & Verification

### Build Command
```bash
npm run build
```

### Development Command
```bash
npm run dev
```

### Test Command
```bash
npm test
```

### Expected Results
- Build completes without errors
- All tests passing (330 tests)
- No TypeScript errors in strict mode

### Current Verification Status
- Build system operational
- Tests passing
- PWA verified
- ESLint configuration pending

---

## 8. Repository Health

### Architecture Maturity
- Foundation stable and audited
- Kernel patterns consistent
- Dependency rules enforced

### Documentation Coverage
- Architecture: Complete (5 documents)
- ADRs: Complete (10 records)
- AI handover: Complete (`.claude/` folder)

### Testing Maturity
- 330 tests passing
- Unit test coverage for kernels
- Integration test coverage

### Build Reliability
- Build succeeds consistently
- TypeScript strict mode enforced
- Tailwind CSS v4 integrated

### Technical Debt
- Minor: Inline style migration, test coverage gaps
- Medium: Git cleanup pending
- Major: Document Intelligence mid-implementation

### Maintainability
- Clean architecture patterns
- Consistent naming conventions
- Modular design enables independent changes

### Scalability
- Provider abstraction supports scaling
- Kernel model enables horizontal growth
- Event system enables parallel development

### Overall Readiness
Production-ready foundation with active feature development.

---

## 9. Known Limitations

### Authentication & Security
- Authentication UI and backend routes exist (`src/auth/`, `server/routes/auth.ts`, `server/middleware/authRateLimiter.ts`, `server/utils/apiKeyCrypto.ts`) — maturity/completeness not verified at source level in this pass
- API keys stored encrypted (WebCrypto API)
- Rate limiting on backend endpoints

### Cloud Features
- Cloud synchronization not yet implemented
- Offline-first with local storage only

### Enterprise Capabilities
- Multi-tenancy not implemented
- Audit logging not yet implemented
- RBAC designed but not enforced

### Mobile Support
- Native mobile apps not yet implemented
- Responsive web UI only

### Plugin Ecosystem
- Plugin architecture ready but no marketplace

### See Also
- `KNOWN_LIMITATIONS.md` for detailed limitations
- `FUTURE_ENHANCEMENTS.md` for future capabilities

---

## 10. Immediate Development Priorities

### Priority 1: Document Intelligence Cycle 1 (In Progress)
**Why**: Enables evidence extraction from user-uploaded documents, essential for completing the evidence pipeline.
**Status**: Active development (Document Intelligence, `src/document_intelligence/`)

### Priority 2: Architecture Stabilization (E01)
**Why**: Unblocks security foundation and refactoring tasks.
**Components**: T001 (CDM Resolution), T002 (Event Dispatcher), T003 (Secure Encryption)

### Priority 3: Security Foundation (E02)
**Why**: Essential for production deployment and user trust.
**Components**: T004 (API Keys), T005 (CSRF), T006 (Rate Limiting)

### Priority 4: Codebase Refactoring (E03)
**Why**: Improves maintainability and follows established patterns.
**Components**: T007, T008

---

## 11. Risks

### Architectural Drift
**Risk**: Future changes may violate established module boundaries.
**Mitigation**: Review against `ARCHITECTURE_RULES.md` before merging.

### Documentation Gaps
**Risk**: Implementation may outpace documentation.
**Mitigation**: Update docs as part of every significant change.

### Large Reviews
**Risk**: Monolithic changes difficult to review and debug.
**Mitigation**: Make small, incremental changes with clear commits.

### Dependency Upgrades
**Risk**: Newer versions may break established patterns.
**Mitigation**: Test thoroughly before upgrading; pin versions.

### Scalability Concerns
**Risk**: Performance may degrade with large datasets.
**Mitigation**: Profile before optimizing; design for horizontal scaling.

---

## 12. Handover Notes

### Essential Reading
1. Review `docs/architecture/01-Scholar-Platform-Constitution.md` for vision and principles
2. Review `docs/architecture/02-Scholar-System-Architecture.md` for system design
3. Review `docs/adr/ADR-0001-ScholarKernel.md` through `ADR-0010-MultiProviderAI.md` for decisions
4. Read `.claude/CLAUDE.md` for AI operating procedures
5. Read `.claude/ARCHITECTURE_RULES.md` for architectural constraints

### Do's
- ✅ Extend existing modules before creating new ones
- ✅ Follow established patterns and conventions
- ✅ Update documentation alongside code
- ✅ Make small, incremental changes
- ✅ Test thoroughly before considering work complete

### Don'ts
- ❌ Redesign completed architecture without approval
- ❌ Remove existing functionality
- ❌ Introduce breaking API changes
- ❌ Duplicate existing modules
- ❌ Bypass established abstractions

---

## 13. Related Documentation Reading Order

### For Understanding
1. `README.md` — Quick overview
2. `.claude/PROJECT_MEMORY.md` — Historical context
3. `docs/architecture/01-Scholar-Platform-Constitution.md` — Vision and principles
4. `docs/architecture/02-Scholar-System-Architecture.md` — Technical architecture
5. `.claude/ARCHITECTURE_RULES.md` — Non-negotiable rules

### For Development
6. `.claude/DEVELOPMENT_GUIDELINES.md` — Coding standards
7. `CHANGELOG.md` — Recent changes
8. `docs/adr/` — Architectural decisions
9. `.claude/HANDOVER.md` — This document

---

## 14. Definition of Successful Handover

A successful handover means:

- ✅ Repository builds successfully (`npm run build`)
- ✅ Architecture is understood and respected
- ✅ Documentation is complete and current
- ✅ Future contributors can work productively
- ✅ Development standards are established and followed
- ✅ Knowledge transfer is preserved in `.claude/` documents
- ✅ No regressions introduced in handover process