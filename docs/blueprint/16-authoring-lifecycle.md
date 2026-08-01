# 16 — Authoring Lifecycle

Covers revision requirements #5 (drafting), #7 (editing environment),
#8 (finalisation) and #9 (export).

`[RECOMMENDATION]` **Governing principle: the user makes every substantive
decision.** AI proposes; the user disposes; the ledger records which. This is
not a safety disclaimer — it is what makes the disclosure statement in
[18](./18-finalisation-export.md) truthful, and therefore what makes the
product's central claim defensible.

---

## 1. Drafting

### The unit of work is a claim, not a document

`[RECOMMENDATION]` AI operates on a **section or block**, never "write my
thesis." `[INFERRED]` Two reasons: a whole-document generation cannot be
meaningfully reviewed, so acceptance becomes rubber-stamping and the provenance
record becomes a fiction; and it removes the author from the decisions that
constitute authorship.

### The cycle

```
1  User selects a section and states intent
2  System assembles context — APPROVED sources only
3  Gate check: enough approved evidence for this section?
      └─ no → surface the gap; offer intake ([15](./15-evidence-pipeline.md))
4  Inference produces a PROPOSAL — never written directly into the manuscript
5  Proposal is shown with: which sources informed it, which claims it asserts,
   which are unsupported
6  User accepts / edits / rejects — per claim, not wholesale
7  Ledger records the outcome per claim
8  Accepted claims link to their supporting sources
```

`[RECOMMENDATION]` Steps 4–6 are the heart of it. `[OBSERVED]` Today a skill
returns text and a component writes it into `sections[name]`; provenance
survives only as an aggregate usage log. Under the target model a skill returns
a **patch** the user reviews before anything enters the manuscript.

### Modes

`[RECOMMENDATION]` Named honestly, because the label sets the expectation:

| Mode | AI does | User does |
|---|---|---|
| **Outline** | Proposes structure from output type + evidence | Approves, reorders, rewrites |
| **Expand** | Drafts a section from user notes + approved sources | Reviews per claim |
| **Rephrase** | Restates user text; meaning preserved | Compares and accepts |
| **Critique** | Identifies gaps, weak support, inconsistency | Decides what to act on |
| **Synthesise** | Cross-source themes; each attributed | Judges the reading |

`[RECOMMENDATION]` **Critique carries the highest value-to-risk ratio** — it
improves the work without authoring it, so the provenance question barely
arises. `[INFERRED]` It also targets the documented failure mode: 40%+ of first
submissions require major revision for structural reasons.

### What is not offered

`[RECOMMENDATION]` No autonomous multi-section generation; no "complete this
document"; no silent AI edits. `[INFERRED]` Each would make the disclosure
statement misleading, which is a product failure before it is an ethical one.

---

## 2. Editing environment

Requirement #7 features, with the human-review constraint kept explicit.

| Feature | Design |
|---|---|
| **AI-assisted editing** | Suggestions surface as proposals with a visible diff. Never applied silently. |
| **Conversational assistance** | Chat scoped to the current document and approved sources. May quote and cite; may not introduce unapproved sources. |
| **Inline suggestions** | Margin markers, not autocomplete. `[INFERRED]` Inline completion produces text the user did not decide to write and cannot later attribute. |
| **Document review** | Whole-document pass: structure vs. output type, word budgets, unsupported claims, citation and terminology consistency. |
| **Revision history** | Every accepted change is a ledger entry. `[OBSERVED]` `versions` and `ProjectVersion` already exist; this extends them to claim granularity. |
| **Comparison** | Any two revisions, with provenance shown per change — human edit vs. accepted AI proposal. |
| **Citation management** | Insert from approved sources only; live formatting in the target style; unresolved citations block export. |
| **Collaboration** | Async review first. See §3. |

### Provenance is visible while writing

`[RECOMMENDATION]` The editor shows, inline and continuously: which claims are
AI-authored, which are unsupported, and which cite a source whose approval was
revoked.

`[INFERRED]` This is the difference between a compliance tool and a compliance
*gate*. If provenance is only visible at export, the user discovers problems
after the work is done. Visible while writing, the disclosure statement at the
end is a summary of something they already understood — not a surprise.

---

## 3. Collaboration

Per [C-05](./11-requirements-conflicts.md#c-05--collaboration-deferred-vs-required),
staged. "Where appropriate" is doing real work.

**Tier 1 — asynchronous review (build first).** Share a read-only snapshot with
a supervisor or co-author. They comment; comments return as resolvable items.
No shared infrastructure; works with sync off. `[INFERRED]` This covers the
dominant real workflow — student ↔ supervisor — and supervisor feedback latency
is the binding constraint identified in [04](./04-market-position.md).

**Tier 2 — shared project, turn-taking.** One editor at a time with explicit
handoff. Requires sync; not concurrency.

**Tier 3 — real-time concurrent editing.** Requires the block model, CRDT/OT,
and presence. Deferred until the block model lands, because it is not
expressible before then.

`[RECOMMENDATION]` Co-author contributions are ledger entries like any other.
`[INFERRED]` For thesis-by-publication, contribution statements are a formal
submission requirement ([14](./14-output-catalog.md) §5) — the ledger can
produce them as a derived artifact rather than asking the user to reconstruct
them from memory.

---

## 4. Finalisation

Requirement #8. Full treatment in [18](./18-finalisation-export.md); the
drafting-side constraints are here.

| Stage | Scope | Boundary |
|---|---|---|
| **Language refinement** | Grammar, register, clarity | Never alters a claim's meaning |
| **Readability & voice** | Flow, sentence variety, repetition | **Style only. Not detection evasion** — see [C-06](./11-requirements-conflicts.md#c-06--internal-conflict-in-the-requirements-completely-humanized-vs-no-detection-evasion) |
| **Formatting** | Against the venue rule pack | Mechanical |
| **Consistency** | Terminology, citation style, heading depth, tense | Flags; user decides |
| **Structure** | Sections and word budgets vs. output type | Advisory except where the venue makes it blocking |
| **Plagiarism awareness** | Quoted text without attribution; near-duplication of approved sources | **Awareness, not a similarity score.** `[INFERRED]` The system cannot access the corpora a real service checks against; implying otherwise would be a false assurance |
| **Disclosure** | Derived from the ledger | User-controlled; accurate by construction |

`[RECOMMENDATION]` Every finalisation pass is a ledger entry. `[INFERRED]` A
readability pass *is* AI assistance; omitting it from the record would make the
disclosure understate the AI's role — the exact misrepresentation requirement
#8 prohibits.

---

## 5. Where responsibility sits

`[RECOMMENDATION]` Explicit, because requirement #5 turns on it:

| Decision | Owner |
|---|---|
| Research question, argument, conclusions | **User only** |
| Which sources are credible and relevant | **User only** (approval gate) |
| Whether a claim is adequately supported | **User**, system flags |
| Whether to accept any AI proposal | **User only** |
| Whether to disclose, and in what form | **User**, system derives the content |
| Structure proposal, gap identification | System proposes |
| Formatting, citation rendering, consistency checks | System, deterministic |
| Gate evaluation | System, deterministic |

`[INFERRED]` The line: **the system may determine what is *true about the
document* — word counts, missing citations, structural deviation. It may not
determine what is *true about the world*.** That is the author's job, and it is
what COPE and ICMJE mean by responsibility remaining with the author.
