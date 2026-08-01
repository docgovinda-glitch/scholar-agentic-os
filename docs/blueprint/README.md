# Scholar — Engineering Blueprint (Reconstructed)

**Reconstructed 2026-08-01 from the codebase at `main` (`4e46f2f`).**

This set was rebuilt from source. No prior README, roadmap, planning doc, design
doc, or architecture diagram was used as an input or as evidence. Where an
earlier document is referenced at all, it is as an *artifact under examination*,
never as a source of truth.

## Why this exists

The repository's prior documentation had drifted from the code badly enough to
be actively misleading. Two concrete examples found during reconstruction:

- The project's own operating manual described seven modules
  (`src/orchestrator`, `src/knowledge`, `src/lifecycle`, and four "kernels") as
  present-but-unwired. All seven had been deleted — 46 files, 8,303 lines.
- The same manual cited `src/lifecycle/ResearchLifecycleEngine.ts` as the
  definition of the product's headline 10-phase research model. That file does
  not exist. The model that actually executes is a different, lettered one.

That is the failure mode this set is written to avoid. Every structural claim
below is traceable to a file, a symbol, or a command whose output can be
re-run.

## Reading order

| # | Document | Purpose |
|---|---|---|
| 00 | [Executive Summary](./00-executive-summary.md) | The whole picture in one page |
| 01 | [System Inventory](./01-system-inventory.md) | What is actually in the repo — pure observation |
| 02 | [Engineering Assessment](./02-engineering-assessment.md) | Unsparing evaluation of the current system |
| 03 | [Product Definition](./03-product-definition.md) | What this software actually is, from behaviour alone |
| 04 | [Market Position](./04-market-position.md) | Competitive landscape and the defensible gap |
| 05 | [Target Blueprint](./05-target-blueprint.md) | The redesign — vision, philosophy, decisions |
| 06 | [Architecture Specification](./06-architecture-spec.md) | Target modules, contracts, data and control flow |
| 07 | [Roadmap](./07-roadmap.md) | Sequenced path from today's system to the target |
| 08 | [Risk Register](./08-risk-register.md) | What can kill this, and the early-warning signal for each |
| 09 | [Technical Debt Register](./09-technical-debt-register.md) | Every known defect and compromise, with evidence |

Read 01 before 02. Read 03 before 05. Everything else stands alone.

## Evidence conventions

Every non-trivial claim carries one of four tags. They are load-bearing — the
difference between "the code does X" and "X was probably intended" is the
difference between a fact and a guess, and the prior documentation collapsed
that distinction repeatedly.

| Tag | Meaning | Standard of proof |
|---|---|---|
| **`[OBSERVED]`** | Read directly from source, config, or a command's output | Cite the file/symbol. Reproducible. |
| **`[INFERRED]`** | Deduced from observed evidence, with the reasoning shown | Must state what it is inferred *from* |
| **`[ASSUMPTION]`** | Taken as given; not verifiable from the repo | Must be flagged as unverified |
| **`[RECOMMENDATION]`** | Proposed change | Must name the observation motivating it |

An `[INFERRED]` claim is never upgraded to `[OBSERVED]` for readability. If
something could not be verified — for example, whether the configured Render
service is currently serving traffic — it says so.

## Scope boundary

These documents are strategic and implementation-agnostic. They contain **no
source changes**: no refactors, renames, moves, deletions, or new
implementation code. Where a change is proposed, it is proposed — never
performed.

## Reproducing the analysis

The structural findings come from commands like these, all runnable at the
documented commit:

```bash
# module presence
ls -d src/*/

# what Phase 0 deleted, and how much
git show --stat --diff-filter=D --format="" 4afb6c8

# whether the deleted modules had any external importer
git grep -l "orchestrator\|lifecycle" 4afb6c8~1 -- src server.ts

# which server route modules are actually wired
cat server/routes/index.ts && grep -n "^import" server.ts

# the gates that define the product (see 03)
grep -rn 'status === "approved"' src/services/
grep -n "aiUseDisclosure" src/services/documentExportService.ts
```

If a claim here conflicts with the code, the code is right and this set is
stale — fix it, and record the correction.
