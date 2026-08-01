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

- **`LiteratureReviewAgent.fetchWebStudies()` — fixed**, `src/agents/literatureReview.ts` (see its own header comment,
  "Agent-UI adapter, Step 2a"). It now calls the same real, fabrication-audit-verified
  `literatureRetrievalService.discoverLiterature()` path the live panels already use
  (Crossref/OpenAlex/PubMed/Semantic Scholar), mapping results into the same shape
  `literatureReviewSkill.ts`'s dedup/classify logic expects from local studies — honest
  empty array on failure or no results, never fabricated. **Recommendation 1 below (fix
  the stub) is done; recommendations 2-4 (orchestrator, converged skill path, regression
  coverage) remain unstarted — this note's "no code written" status still applies to the
  adapter itself, only the one prerequisite bug is closed.**

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

1. ~~Fix `LiteratureReviewAgent.fetchWebStudies()` stub~~ **Done** — see
   "Confirmed current state" above.
2. Build the orchestrator that chains `knowledgeGap → researchQuestion →
   methodologyAdvisor → statisticalAnalysis → integrityReviewer` using real
   `AgentResult.data`, with its own test coverage.
3. Only then build the panel-facing adapter that lets `aiService.ts` callers
   opt into the agent pipeline for a given panel, one panel at a time, each
   with a regression test against the existing direct-service behavior it
   would replace or supplement.

Steps 2-3 are each still a full task, not a subtask of one session — flagged
as "substantial" in the original task list for that reason.
