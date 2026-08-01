# 11 — Requirements Conflict Analysis

**Status: decision record. Read before 00–10, all of which are revised to match
the resolutions here.**

The revision requirements dated 2026-08-01 conflict with the prior blueprint in
eight places. Per instruction, each conflict is stated, alternatives are given,
and a recommendation is justified *before* the documents were changed.

Seven conflicts are between the new requirements and the prior blueprint. **One
is internal to the new requirements themselves** (C-06) and cannot be resolved
by picking a side — it is addressed on its merits.

---

## C-01 · Audience: narrow segment vs. all degree levels

**Prior blueprint** `[INFERRED]` — [03](./03-product-definition.md) read the
product as serving *PhD candidates converting doctoral work into journal
articles*, from `dissertationMaterials`, `orcidId`, `targetJournal`, and six
journal citation styles. [04](./04-market-position.md) argued *for* that
narrowness.

**New requirement** — undergraduate, graduate, Master's, and PhD students,
across a dozen-plus output types.

**The conflict is real, not cosmetic.** The prior positioning derived its moat
from depth in one workflow. Breadth across four degree levels is a different
product with different economics: an undergraduate writing coursework has
almost no overlap with a PhD candidate preparing a journal submission — not in
requirements, review process, or willingness to pay.

### Alternatives

| | Approach | Assessment |
|---|---|---|
| **A** | Keep PhD-only; treat breadth as later expansion | Preserves the moat argument, ignores the instruction |
| **B** | Build for all four levels equally from the start | Honours the instruction; risks a shallow product serving nobody well |
| **C** | **One engine, level-specific rule packs and output types** | Breadth in *catalogue*, depth in *engine* |

### Recommendation — C

`[RECOMMENDATION]` The compliance engine does not care whether the governing
rules come from Elsevier or from a university's undergraduate handbook. Both
are *a venue with rules*. The engine generalises without dilution; only the
rule packs and output definitions multiply, and those are editorial work, not
engineering.

`[INFERRED]` This preserves the moat argument from
[04](./04-market-position.md) — a maintained rule set that compounds — while
serving the broader audience. What changes is that "venue" now means *journal,
university, department, conference, or funder*.

**Cost, stated honestly** `[INFERRED]`: the undergraduate segment has the
weakest willingness to pay and the highest support burden. Breadth is a
product decision, not a revenue one.

---

## C-02 · Positioning: submission integrity vs. full authoring assistant

**Prior blueprint** `[RECOMMENDATION]` — [04](./04-market-position.md) said
*compete on submission integrity, not research assistance*, because Elicit,
Consensus, and SciSpace own discovery with 270M-paper corpora and better
funding.

**New requirements** — intelligent data collection with secondary-source
proposal (#4), a drafting workflow (#5), an advanced editor with conversational
assistance and inline suggestions (#7). That is a full authoring environment.

**The conflict:** the prior blueprint explicitly recommended *not* building
several of these.

### Alternatives

| | Approach | Assessment |
|---|---|---|
| **A** | Hold the line; document data collection and drafting as thin | Contradicts the instruction |
| **B** | Build a full research assistant | Enters the fight [04](./04-market-position.md) argues is unwinnable |
| **C** | **Build the full authoring lifecycle; keep discovery import-first** | Owns the workflow without fighting on corpus |

### Recommendation — C

`[RECOMMENDATION]` The prior argument was narrower than it read. It said *do
not compete on corpus size* — not *do not help the user write*. Those are
separable:

- **Drafting and editing are workflow, not corpus.** Owning them is
  compatible with the integrity position and is what makes gates enforceable at
  the point of authorship rather than only at export.
- **Discovery stays import-first.** The system proposes sources from
  authenticated APIs and accepts imports from Elicit, Zotero, and similar. It
  does not build a competing index.

`[INFERRED]` This is strictly stronger than the prior position: gates that
operate *while writing* are more valuable than gates that only fire at export,
because they prevent rework instead of reporting it.

**What does not change:** every proposed source enters `unapproved`. The
approval gate is preserved and becomes more prominent, not less.

---

## C-03 · Client: single browser app vs. independent desktop and web

**Prior blueprint** `[RECOMMENDATION]` — [05](./05-target-blueprint.md) treated
the client as one browser application, with "client is the system of record" as
a principle.

**New requirement** — desktop and web designed *independently*, not as
responsive variants; desktop leverages local compute.

**The conflict:** the prior blueprint had no desktop story at all, and its
zero-per-user-cost argument assumed one client.

### Alternatives

| | Approach | Assessment |
|---|---|---|
| **A** | Responsive web only | Contradicts the instruction; forfeits local compute |
| **B** | Two independent codebases | Honours the instruction; duplicates the domain layer — the exact failure mode in [09](./09-technical-debt-register.md) |
| **C** | **Shared domain core; independent experience layers** | Independent UX, single source of truth for rules |

### Recommendation — C

`[RECOMMENDATION]` "Independent" must mean *independent product design* —
different users, workflows, navigation, and feature sets — not *independent
implementations of the compliance rules*.

`[INFERRED]` This is not a compromise but a requirement of correctness. If
desktop and web each implement gates separately, they will disagree, and a
manuscript that passes on one will fail on the other. Given
[09](./09-technical-debt-register.md) documents five existing cases of
duplicated concepts, duplicating the domain layer across two clients is the
single most predictable way to reproduce that failure at larger scale.

Detail in [12](./12-client-strategy.md).

---

## C-04 · Orchestration: one skill registry vs. comprehensive multi-agent

**Prior blueprint** `[RECOMMENDATION]` — [05](./05-target-blueprint.md) said
merge agents and skills into one registry, because
`[OBSERVED]` seven agents map near one-to-one onto nine skills and the agent
wrapper adds indirection without composition.

**New requirement** — a comprehensive multi-agent architecture with per-agent
responsibility, tools, inputs, outputs, inter-agent interaction, failure
handling, and quality checks.

### Alternatives

| | Approach | Assessment |
|---|---|---|
| **A** | Keep the merge recommendation | Contradicts the instruction |
| **B** | Full autonomous multi-agent system | Conflicts with the human-authorship requirement (#5) and repeats the deleted-orchestrator history |
| **C** | **Agents as composition over a skill layer, with declared contracts** | Both, without the redundancy |

### Recommendation — C

`[RECOMMENDATION]` The prior objection was to *one-to-one* agents, not to
agents. An agent that wraps exactly one skill is indirection; an agent that
composes several skills, handles their failures, and enforces quality checks is
a real unit.

`[OBSERVED]` The caution stands and is now written into
[19](./19-agent-architecture.md): a full orchestration package — queue,
scheduler, dependency resolver, retry manager, failure recovery, ~5,500 lines —
was built, never wired to a consumer, and deleted in `4afb6c8`. Every agent in
the revised architecture must have a named consumer before it is built.

**On "adaptive or continually improving behavior with administrator control":**
`[RECOMMENDATION]` adaptation is scoped to *retrieval and configuration* —
prompt templates, model routing, rule-pack selection — never to silent changes
in gate behaviour. A gate that quietly learns to pass more manuscripts is an
integrity failure. Detail in [19](./19-agent-architecture.md) §7.

---

## C-05 · Collaboration: deferred vs. required

**Prior blueprint** `[RECOMMENDATION]` — [05](./05-target-blueprint.md)
explicitly deferred real-time collaborative editing: inexpressible before the
block model, and a far larger commitment than sync.

**New requirement** — "collaborative editing where appropriate" (#7).

### Recommendation — staged, and the qualifier is load-bearing

`[RECOMMENDATION]` "Where appropriate" is doing real work. Three tiers,
ordered by cost:

1. **Asynchronous review** — a supervisor or co-author receives an export,
   comments, and returns it. No shared infrastructure. Covers the dominant
   real workflow: student ↔ supervisor.
2. **Shared project with turn-taking** — one editor at a time, explicit
   handoff. Requires sync, not concurrency.
3. **Real-time concurrent editing** — requires the block model, CRDT or OT, and
   presence infrastructure.

`[INFERRED]` Tier 1 covers most of the actual need — supervisor feedback
latency is the binding constraint identified in
[04](./04-market-position.md), and it is asynchronous by nature. Tier 3
remains deferred until the block model lands, because it is not expressible
before then.

---

## C-06 · **Internal conflict in the requirements: "completely humanized" vs. no detection evasion**

This is the one conflict that is not between old and new. The requirements
contain both:

> "Final Output completely humanized (add skill in the system from public
> github repo)"

> "Do not design features intended to evade AI detection or misrepresent
> authorship."

**These pull in opposite directions.** "Completely humanized" is the phrase
used by tools whose function is defeating AI detectors. Taken that way, it
directly violates the second instruction — and would also undermine the
product's core value, which is *accurate disclosure of AI assistance*.

`[OBSERVED]` This is not hypothetical here. The repository contains
`src/skills/humanizeSkill.ts`, and its own handover record documents that
**detection-evasion prompt language was previously found in `aiService.ts` and
removed.** This project has already had this problem once and corrected it.

### Alternatives

| | Interpretation | Assessment |
|---|---|---|
| **A** | Defeat AI detectors | Violates the stated constraint; undermines the disclosure product; not designed |
| **B** | **Style and readability refinement, disclosed** | Legitimate, valuable, consistent with both instructions |
| **C** | Omit entirely | Over-corrects; genuine readability need goes unserved |

### Recommendation — B, explicitly and only

`[RECOMMENDATION]` The blueprint specifies a **Readability & Voice** capability
that improves flow, varies sentence structure, removes mechanical repetition,
and aligns register to the target venue. It is designed under four constraints:

1. Every pass is recorded in the provenance ledger as an AI edit.
2. Output remains covered by the disclosure statement — refinement never
   removes an AI contribution from the record.
3. No detector-targeting: no evaluation against detection tools, no prompts
   framed around evasion, no "make this undetectable" affordance.
4. Substantive claims are never altered — style only. A refinement that changes
   meaning is a bug.

`[INFERRED]` Under this design the phrase "completely humanized" is *false as
stated* and the documentation does not use it. Output is AI-assisted and
declared as such; what improves is readability.

**On "add skill from public github repo":** `[RECOMMENDATION]` not specified as
a dependency. Two reasons: `[INFERRED]` an arbitrary third-party repository in
the path that touches every manuscript is a supply-chain risk disproportionate
to the benefit; and the widely available packages in this category are
detection-evasion tools, which alternative A rules out. The capability is
specified as a prompt-and-rules skill inside the system, where its behaviour is
auditable. If a specific repository is intended, name it and it can be assessed
on its licence, maintenance, and function.

---

## C-07 · Local-first vs. administrator visibility

**New requirements contain both** — prioritise local processing, administrator
retains "only the minimum information necessary" (#12); and an admin platform
with usage monitoring and audit logging (#11).

`[INFERRED]` Not contradictory, but the boundary must be explicit or it will be
crossed by default.

### Recommendation — a hard data classification

`[RECOMMENDATION]` Four tiers, enforced by design rather than policy:

| Tier | Contents | Location |
|---|---|---|
| **Never transmitted** | Manuscript text, uploaded sources, provenance ledger, API keys, local model I/O | Device only |
| **Transmitted, opaque** | Encrypted project blobs when sync is enabled | Server stores ciphertext; cannot read |
| **Transmitted, minimal** | Account identity, entitlement, aggregate counters | Server |
| **Server-side by nature** | Managed-mode inference; outbound proxy requests | Server, ephemeral |

`[RECOMMENDATION]` Admin monitoring operates on tier 3 only — counts, not
content. An administrator can see *that* a user ran 40 drafting operations;
never *what* was drafted.

Detail in [21](./21-data-and-security.md).

---

## C-08 · Roadmap: validate-then-build vs. a specified feature set

**Prior blueprint** `[RECOMMENDATION]` — [07](./07-roadmap.md) gated the
expensive provenance rebuild behind Stage 1 user research, because the strategy
rested on an unvalidated assumption.

**New requirements** specify a large feature set directly, which implies the
decision is made.

### Recommendation — keep the gate, narrow its question

`[RECOMMENDATION]` The requirements settle *scope*. They do not settle the open
empirical question, which was never "should we build this" but "do users value
correct disclosure enough to change behaviour."

`[INFERRED]` That question still gates the same expensive work — the provenance
ledger — and is now *more* important, because the audience broadened to
undergraduates, where the assumption is weakest. A PhD candidate submitting to
Elsevier has an obvious reason to care. A second-year undergraduate may not.

The revised roadmap keeps the validation gate and narrows it: **does
disclosure-and-provenance change behaviour at each degree level?** A negative
result at undergraduate level does not stop the product; it changes which
features lead there.

---

## Summary of resolutions

| # | Conflict | Resolution |
|---|---|---|
| C-01 | Narrow vs. all degree levels | One engine, level-specific rule packs and output types |
| C-02 | Integrity vs. full assistant | Own the authoring lifecycle; discovery stays import-first |
| C-03 | Single client vs. desktop + web | Independent experience layers, shared domain core |
| C-04 | One registry vs. multi-agent | Agents compose skills; every agent needs a named consumer |
| C-05 | Collaboration deferred vs. required | Async review now; concurrent editing after the block model |
| C-06 | "Humanized" vs. no evasion | Readability refinement only, ledger-recorded, disclosed |
| C-07 | Local-first vs. admin visibility | Four-tier data classification; monitoring on counts, not content |
| C-08 | Validate-first vs. specified scope | Gate retained; question narrowed to per-level behaviour change |

`[RECOMMENDATION]` C-06 is the one resolution that declines part of a stated
requirement. It does so on the authority of another stated requirement in the
same document, and because the declined reading would destroy the product's
central value proposition. If the intent was different from the reading here,
that should be corrected explicitly rather than left ambiguous — it is the kind
of thing that must not be resolved by inference.
