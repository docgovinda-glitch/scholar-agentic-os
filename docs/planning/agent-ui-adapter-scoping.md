# Agent-UI Adapter — Scoping Note (2026-07-24)

**Status: SCOPING ONLY — no code written for this.** Task explicitly bounded to
scoping; full wire-up is a separate, larger piece of work.

## Why this is scoped, not built

The 8 native skills are already wired to real panels via `context.runSkill()`
(this is the live, working path — includes all the fabrication-audit
retrieval fixes: `literatureRetrievalService.ts`, `journalRetrievalService.ts`,
`arxivProxyService.ts`, `searchProxyService.ts`, `who-proxy`, `imf-proxy`,
etc.). `src/agents/` is a separate, unused sequential pipeline — not imported
by `server.ts` or the React app (per CLAUDE.md §3). Naively wiring agents into
the UI risks silently regressing those real retrieval paths, because at least
one agent still fabricates/stubs the exact data those services already fetch
for real.

## Confirmed current state

- **`LiteratureReviewAgent.fetchWebStudies()` — still a stub**, `src/agents/literatureReview.ts:185-191`:
  ```ts
  private async fetchWebStudies(input, context): Promise<unknown[]> {
    // Would call web search providers through abstraction
    return [];
  }
  ```
  Called at line 147 whenever `executionMode !== "deterministic"`. It never
  touches any of the real retrieval services built during the fabrication
  audit. Wiring this agent into a panel today would show empty/degraded
  results where the equivalent live panel currently shows real data.

- **Every other agent** (`researchPlanner.ts`, `knowledgeGap.ts`,
  `researchQuestion.ts`, `methodologyAdvisor.ts`, `statisticalAnalysis.ts`,
  `integrityReviewer.ts`) is a thin passthrough to `context.runSkill(...)` —
  no agent-local fabricated fetch logic besides `literatureReview.ts`'s stub.

- **Sequential dependency chain** (via optional input fields on each
  agent's `*Input` type, not an actual runtime orchestrator):
  `knowledgeGap → researchQuestion → methodologyAdvisor → statisticalAnalysis → integrityReviewer`,
  with `literatureReview` and `researchPlanner` feeding in separately.
  **No orchestrator exists today** that threads one agent's `AgentResult.data`
  into the next stage — `src/agents/executor.ts`'s `AgentExecutor` only runs
  a single agent with timeout/retry; nothing chains agents together yet.

## What a real adapter needs to do (not done here)

1. **Fix the stub before wiring, not after.** Replace
   `LiteratureReviewAgent.fetchWebStudies()`'s body with calls into the real
   services (`literatureRetrievalService.discoverLiterature`,
   `arxivProxyService`, `searchProxyService`, `whoProxyService`,
   `imfProxyService`) instead of inventing agent-local fetch logic. Otherwise
   any adapter that exposes this agent to the UI ships a regression on day one.
2. **Build the missing orchestration layer.** Nothing today runs agents in
   the dependency order above and threads `AgentResult.data` into the next
   stage's `*Report` input fields. This has to be built new — it doesn't
   exist to be "reused."
3. **Converge on one skill-execution path.** The adapter must call agents via
   the same `context.runSkill()` mechanism already wired to the 8 native
   skills — not stand up a second, parallel skill-execution path that could
   drift from the one panels currently use.
4. **Add regression coverage before flipping any UI panel over.** A
   contract/snapshot test asserting agent-driven literature results
   match-or-exceed what `literatureRetrievalService.ts` returns directly,
   so a future stub regression is caught in CI, not live.

## Recommended sequencing for the actual build (future session)

1. Fix `LiteratureReviewAgent.fetchWebStudies()` stub (small, isolated,
   testable on its own — do this first, independent of adapter work).
2. Build the orchestrator that chains `knowledgeGap → researchQuestion →
   methodologyAdvisor → statisticalAnalysis → integrityReviewer` using real
   `AgentResult.data`, with its own test coverage.
3. Only then build the panel-facing adapter that lets `aiService.ts` callers
   opt into the agent pipeline for a given panel, one panel at a time, each
   with a regression test against the existing direct-service behavior it
   would replace or supplement.

Each of the three steps above is itself a full task, not a subtask of one
session — flagged as "substantial" in the original task list for that reason.
