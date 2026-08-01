# 00 — Executive Summary

Reconstructed from the codebase at `main` (`4e46f2f`), 2026-08-01. No prior
documentation was used as evidence.

---

## What was found

`[INFERRED]` **A real, working system with an unusually valuable and largely
accidental differentiator, wrapped in an architecture that permitted three
competing implementations of its own core abstraction.**

The system is not a prototype: export produces genuine OOXML and
selectable-text PDF, six citation styles are separately implemented behind a
registry, 39 AI backends are driven from one catalog consumed by both browser
and server, and 1,104 tests pass against a clean type-check and build.

`[INFERRED]` It is also not ready for 100,000 users — for architectural
reasons, not cosmetic ones.

---

## The central finding

`[INFERRED]` **The most valuable code in this repository is the least
fashionable, and the most duplicated code is the most fashionable.**

Three compliance gates — approved-sources-only, AI-use disclosure, phase
ordering — total a few hundred lines. They are wired, tested, unbypassable, and
implement a requirement every major academic publisher now mandates. They are
the product.

The AI provider abstraction is roughly 7,000 lines, implemented three times,
and is table stakes that every competitor also has.

`[OBSERVED]` `documentExportService.ts` refuses to emit AI-disclosure text
unless the user has explicitly confirmed it, and places that text immediately
before the references section — matching Elsevier's published requirement
exactly. `[OBSERVED — external]` That requirement is now mandatory across
Elsevier, Springer Nature, Wiley, Taylor & Francis, and SAGE, while only 31% of
postgraduates report receiving clear institutional guidance on AI use, against
74% who use AI in thesis writing.

`[INFERRED]` The system already solves a mandatory, under-served, poorly
understood problem — and its own documentation described it as an AI writing
assistant.

---

## What the product actually is

`[INFERRED]` A **zero-backend-cost, offline-capable manuscript production line
that turns a finished thesis into a submittable journal package, and enforces
the evidence-approval and AI-disclosure rules publishers now require.**

Not an AI research assistant. `[OBSERVED]` The distinctive machinery is
refusal, not generation: unapproved sources cannot enter AI context or a
bibliography (four independent call sites), export is gated on confirmed
disclosure, and phases cannot be entered out of order. A tool built primarily
to write would implement none of these.

Full reasoning in [03](./03-product-definition.md).

---

## Strategic recommendation

`[RECOMMENDATION]` **Compete on submission integrity. Do not compete on
research assistance.**

`[OBSERVED — external]` Elicit and Consensus own evidence synthesis; SciSpace
owns corpus (270M+ papers) and comprehension; Paperpal owns language editing.
All are better funded and further ahead. Every one of them competes on
**inputs**.

`[INFERRED]` None competes on **outputs** — whether the finished manuscript is
defensible. That gap is where this system already sits, and the moat is not the
feature but the maintained per-publisher rule set, which is editorial labour
that compounds.

`[RECOMMENDATION]` Complement the incumbents: import their output through the
approval gate rather than rebuilding discovery against a 270M-paper corpus.

Full analysis in [04](./04-market-position.md).

---

## The blocking constraint

`[OBSERVED]` The manuscript is `sections: Record<string, string>`.

`[INFERRED]` This single decision caps the product. Per-claim citation
integrity, paragraph-level AI provenance, tracked changes, and block-level
merge for multi-device sync are all inexpressible against a flat string map.
Disclosure can only be asserted at document level — while publisher regimes
move toward *which parts* were AI-assisted.

`[RECOMMENDATION]` Replacing this with a block/claim model plus an append-only
provenance ledger is the highest-leverage change available, and everything
defensible depends on it. It is deliberately sequenced *after* market
validation, because it is expensive and rests on an unvalidated assumption.

---

## Condition of the system

| | Finding |
|---|---|
| **Works well** | Export fidelity, compliance gates, provider handling, hybrid storage, document parsing |
| **Works, under-tested** | Citation formatting — 6 formatters, 17 files, **1 test file** |
| **Duplicated** | Submission UI — two implementations, **both mounted and visible to users** |
| **Ambiguous** | `src/ai/` — 6,086 lines, 2 test files, no live import edge |
| **Dead** | `server/routes/auth.ts` + `parser.ts` — 1,347 lines, zero importers |
| **Deleted** | 46 files / 8,303 lines in Phase 0, including a full workflow orchestrator built and never wired |
| **Absent** | Cross-device sync, collaboration, per-claim provenance |

`[OBSERVED]` Test coverage is inverted against risk: `hooks` 4/4 and `services`
29/28, against `citation_compliance` 1/17, `src/ai` 2/37, `src/core` 0/9.

`[INFERRED]` One cause explains most structural debt: **nothing prevented a
second implementation of an existing concept.** Three provider abstractions,
two submission suites, two agent registries, two Knowledge Vault surfaces, two
hosting configurations. A CI-enforced layer and registry rule addresses the
cause; fixing the instances one by one does not.

---

## Sequence

Detail in [07](./07-roadmap.md). Principle: **fix what is broken, prove the
wedge, then rebuild the core.**

| Stage | Purpose | Exit criterion |
|---|---|---|
| **0** Stop the bleeding | Duplicated UI, dead code, citation tests, CI enforcement | No user-visible defects; one provider abstraction |
| **1** Prove the wedge | Venue rules as data; instrument gates; **user research** | Evidence that disclosure compliance is valued |
| **2** Provenance core | Block/claim model, ledger, evidence graph | Disclosure derived, not asserted |
| **3** Multi-device | Encrypted sync, block-level merge | Two devices, no server-side plaintext |
| **4** Scale readiness | Distributed limits, quota, static/API split | Load evidence at target scale |
| **5** Ecosystem | Venue rule packs, import adapters, plugins | Third-party rule pack without app changes |

`[RECOMMENDATION]` Stage 1 gates Stage 2 deliberately. If research contradicts
the wedge, stop and revisit the product definition rather than pushing through
— Stage 2 is expensive and entirely predicated on it.

---

## Principal risks

| Risk | Score | Note |
|---|---|---|
| Disclosure wedge not valued | H×H | Strategy rests on it; **unvalidated** |
| Venue rules drift stale | H×H | Confidently wrong output destroys trust |
| Provenance corrupted in migration | M×H | Mark legacy text `unknown`, never `human` |
| Data loss from cleared storage | M×H | No server copy exists today |
| Managed AI cost runaway | H×M | Quota code exists but is unreachable |

Full register, each with an early-warning signal, in [08](./08-risk-register.md).

---

## Honest position

`[INFERRED]` This project has been building the right thing while describing
itself as something else. The compliance layer is genuinely differentiated,
already works, and addresses a requirement that is mandatory and growing. The
research-assistant ambition — visible in `src/ai`, `src/research`, and the
agent layer — is where the effort accumulated and where the market is lost.

`[RECOMMENDATION]` The redesign is less about building new capability than
about **promoting what already works to the centre**, deleting the competing
implementations around it, and giving the manuscript a data model good enough
to carry the idea further.

`[ASSUMPTION]` The strategic claim rests on assumptions stated explicitly in
[04](./04-market-position.md). They are testable, cheap to test, and expensive
to be wrong about. Test them before Stage 2.
