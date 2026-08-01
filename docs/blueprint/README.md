# Scholar — Engineering Blueprint (Reconstructed)

**Reconstructed 2026-08-01 from the codebase at `main` (`4e46f2f`).**
**Revised 2026-08-01 to incorporate the product revision requirements.**

This set was rebuilt from source. No prior README, roadmap, planning doc,
design doc, or architecture diagram was used as an input or as evidence. Where
an earlier document is referenced at all, it is as an *artifact under
examination*, never as a source of truth.

## Status

**Not approved.** Documents 00–10 were the original reconstruction; documents
11–21 add the revised product requirements and, where those requirements
conflict with the original, **[11](./11-requirements-conflicts.md) is
authoritative.**

Read [11](./11-requirements-conflicts.md) first. It records eight conflicts,
the alternatives considered, and the recommendation for each — including one
conflict *internal to the requirements themselves* (C-06) that is resolved on
its merits rather than by picking a side.

## Why this exists

The repository's prior documentation had drifted from the code badly enough to
be actively misleading. Two examples found during reconstruction:

- The operating manual described seven modules (`src/orchestrator`,
  `src/knowledge`, `src/lifecycle`, and four "kernels") as present-but-unwired.
  All seven had been deleted — 46 files, 8,303 lines.
- It cited `src/lifecycle/ResearchLifecycleEngine.ts` as the definition of the
  product's headline 10-phase model. That file does not exist.

That is the failure mode this set is written to avoid. Every structural claim
is traceable to a file, a symbol, or a re-runnable command.

## Reading order

**Start here**

| # | Document | Purpose |
|---|---|---|
| 11 | [Requirements Conflict Analysis](./11-requirements-conflicts.md) | **Read first.** Eight conflicts, alternatives, resolutions |
| 00 | [Executive Summary](./00-executive-summary.md) | The whole picture in one page |

**What exists today**

| # | Document | Purpose |
|---|---|---|
| 01 | [System Inventory](./01-system-inventory.md) | What is actually in the repo — pure observation |
| 02 | [Engineering Assessment](./02-engineering-assessment.md) | Unsparing evaluation of the current system |
| 09 | [Technical Debt Register](./09-technical-debt-register.md) | 20 items with evidence and repro commands |

**What it should become**

| # | Document | Purpose |
|---|---|---|
| 03 | [Product Definition](./03-product-definition.md) | What the software is, from behaviour alone |
| 04 | [Market Position](./04-market-position.md) | Competitive landscape and the defensible gap |
| 05 | [Target Blueprint](./05-target-blueprint.md) | Vision, philosophy, redesign decisions |
| 06 | [Architecture Specification](./06-architecture-spec.md) | Layers, contracts, data and control flow |

**Product and system design** *(revision requirements)*

| # | Document | Covers |
|---|---|---|
| 12 | [Client Strategy](./12-client-strategy.md) | Desktop and web as independent products (#1) |
| 13 | [User Journey](./13-user-journey.md) | Onboarding and output-first workspace (#2, #3) |
| 14 | [Output Catalogue](./14-output-catalog.md) | Every supported academic output and its rules (#3) |
| 15 | [Evidence Pipeline](./15-evidence-pipeline.md) | Intake, proposal, approval, provenance (#4) |
| 16 | [Authoring Lifecycle](./16-authoring-lifecycle.md) | Drafting and editing environment (#5, #7) |
| 17 | [Compliance Engine](./17-compliance-engine.md) | Requirement determination and gates (#6) |
| 18 | [Finalisation and Export](./18-finalisation-export.md) | Refinement, disclosure, export formats (#8, #9) |
| 19 | [Agent Architecture](./19-agent-architecture.md) | Multi-agent design and adaptive control (#10) |
| 20 | [Administrator Platform](./20-admin-platform.md) | Operations within the data boundary (#11) |
| 21 | [Data and Security](./21-data-and-security.md) | Local-first residency and security (#12, #13) |

**Execution**

| # | Document | Purpose |
|---|---|---|
| 07 | [Roadmap](./07-roadmap.md) | Sequenced path with exit criteria |
| 08 | [Risk Register](./08-risk-register.md) | Risks, each with an early-warning signal |
| 10 | [Contributor Guide](./10-contributor-guide.md) | Rules derived from observed failures |

## Evidence conventions

Every non-trivial claim carries one of four tags. They are load-bearing — the
difference between "the code does X" and "X was probably intended" is the
difference between a fact and a guess, and the prior documentation collapsed
that distinction repeatedly.

| Tag | Meaning | Standard of proof |
|---|---|---|
| **`[OBSERVED]`** | Read directly from source, config, or command output | Cite the file/symbol. Reproducible. |
| **`[INFERRED]`** | Deduced from observed evidence, with reasoning shown | Must state what it is inferred *from* |
| **`[ASSUMPTION]`** | Taken as given; not verifiable from the repo | Must be flagged as unverified |
| **`[RECOMMENDATION]`** | Proposed design | Must name the observation motivating it |

An `[INFERRED]` claim is never upgraded to `[OBSERVED]` for readability. Where
something could not be verified, it says so.

`[OBSERVED — external]` marks findings from published sources outside the
repository, cited inline.

## Scope boundary

Strategic and implementation-agnostic. **No source changes** — no refactors,
renames, moves, deletions, or implementation code. No database schemas, APIs,
UI code, or SQL. Where a change is proposed, it is proposed, never performed.

## Reproducing the analysis

```bash
# module presence
ls -d src/*/

# what Phase 0 deleted, and how much
git show --stat --diff-filter=D --format="" 4afb6c8

# whether the deleted modules had any external importer
git grep -l "orchestrator\|lifecycle" 4afb6c8~1 -- src server.ts

# which server route modules are actually wired
cat server/routes/index.ts && grep -n "^import" server.ts

# the gates that define the product
grep -rn 'status === "approved"' src/services/
grep -n "aiUseDisclosure" src/services/documentExportService.ts
```

If a claim here conflicts with the code, the code is right and this set is
stale — fix it, and record the correction.
