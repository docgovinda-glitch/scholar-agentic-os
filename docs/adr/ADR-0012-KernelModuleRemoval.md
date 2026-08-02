# ADR-0012: Removal of the Unwired Kernel and Orchestrator Modules

## Status

Accepted (2026-08-01) — **documented retroactively**. The deletion shipped in
Phase 0 (commit `4afb6c8`) without an ADR, which `CLAUDE.md` §5 forbids
("Make undocumented architectural changes"). This record exists to close that
gap and to make the decision reviewable and reversible, not to imply it was
approved in advance.

## Context

The repository carried a second, parallel architecture alongside the running
product: a set of "kernel" modules plus a full workflow-orchestration package.
They were written as the substrate for the long-term "AI-native operating
system for research" vision described in `CLAUDE.md` §2.

Their defining property was that **nothing imported them**. A grep across
`src/` and `server.ts` at the parent commit (`4afb6c8~1`), excluding the
modules' own directories, found zero importers. They were not wired into
`server.ts`, `src/App.tsx`, or any component. `CLAUDE.md` §3 already recorded
this explicitly, instructing readers to "treat them as standalone library
code, not as active parts of the running product, until something wires them
in."

They nonetheless carried ongoing cost. Phase 0's mandate was to make
`tsc --noEmit` clean under stricter settings and stand up CI; every one of
these files had to be type-corrected and kept compiling despite executing in
no code path. `src/orchestrator/types.ts` alone was 891 lines of type
definitions for an execution engine nothing invoked.

## Decision

Delete the unwired modules rather than carry them through the strict-TypeScript
migration. Removed in `4afb6c8` — **46 files, 8,303 lines**:

| Module | Files | Lines | What it was |
|---|---:|---:|---|
| `src/orchestrator/` | 30 | ~5,500 | Workflow engine, executor, registry, scheduler, queue, dependency resolver, retry/failure recovery, approval gates, metrics, health monitoring, audit — plus a 1,443-line test suite |
| `src/knowledge/` | 11 | ~660 | KnowledgeKernel, knowledge graph, semantic memory, KQL query layer, reasoning and relationship engines |
| `src/lifecycle/` | 1 | 112 | `ResearchLifecycleEngine` — the 10-phase research model |
| `src/publication/` | 3 | 138 | PublicationKernel, Journal types |
| `src/writing/` | 2 | 103 | WritingKernel |
| `src/collaboration/` | 2 | 91 | CollaborationKernel |
| `src/workspace/` | 2 | 88 | WorkspaceKernel |

The test count moved 1207 → 1104. The entire 103-test delta is the deleted
orchestrator suite; no test covering live code was lost.

`src/ai`, `src/research`, and `src/agents` were **kept**. `src/ai` is consumed
by `src/research`; `src/agents` is genuinely live, reached from the UI through
`src/services/agentService.ts`.

## Consequences

**Positive**

- The strict-TypeScript migration and CI apply only to code that runs.
- No reader can mistake an unreachable API for a working one — a real risk when
  `src/orchestrator` exposed a plausible-looking `WorkflowEngine` that nothing
  could invoke.
- ~8,300 fewer lines to keep compiling, review, and navigate.

**Negative — the real cost**

- **The stated long-term vision lost its scaffolding.** `CLAUDE.md` §2 frames
  Scholar as an "AI-native operating system"; these kernels were that OS's
  intended substrate. Rebuilding is now a design exercise, not a wiring
  exercise.
- **The 10-phase research model no longer exists in code**, only in prose.
  `CLAUDE.md` §2 has been corrected to say so.
- Recovery costs a git archaeology step, and any recovered code still needs the
  strict-TypeScript work that was avoided.

## Reversibility

Nothing is lost — the code is intact in git history. To restore a module:

```bash
# inspect first
git show 4afb6c8~1:src/orchestrator/WorkflowEngine.ts

# restore one module (repeat per path)
git checkout 4afb6c8~1 -- src/orchestrator

# restore everything removed by this decision
git checkout 4afb6c8~1 -- \
  src/orchestrator src/knowledge src/lifecycle \
  src/publication src/writing src/collaboration src/workspace
```

Restored files will **not** pass `npm run lint` as-is — they predate the strict
settings Phase 0 introduced, which is precisely the work their deletion
avoided. Budget for that before restoring.

## When to revisit

Reinstate — selectively, wiring each piece into a real code path as it lands —
if any of these become true:

- Multi-agent workflows need durable scheduling, retry, or approval gates
  beyond what `src/agents` + `agentService.ts` provide today.
- The knowledge graph / semantic memory layer gains a live consumer.
- The 10-phase lifecycle model is chosen to replace the lettered `A`–`I` model
  the UI actually runs.

Prefer restoring one module at a time against a concrete consumer. Restoring
the whole set speculatively would recreate exactly the unwired-code situation
this ADR removed.
