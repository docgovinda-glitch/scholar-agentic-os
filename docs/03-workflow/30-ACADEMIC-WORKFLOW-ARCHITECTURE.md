# Academic Workflow Architecture — The Conductor

> **Doc ID:** 30 · **Status:** Design · **Depends on:** `11`, `14`, `42`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

The eight-gate model, the state machine that enforces it, and the drafting
pipeline. The Conductor is the subsystem that owns all of it.

---

## 1. Why gates

Academic work fails in predictable ways, and almost all of those failures are
*ordering* failures — something was decided too late.

| Failure | Root cause | Gate that prevents it |
|---|---|---|
| Wrong document produced entirely | Never decided what was being made | `G0` |
| Format wrong at submission | Requirements read at the end | `G1` |
| Fabricated or unverifiable citations | Sources never checked | `G2` |
| Incoherent structure discovered after drafting | Structure emerged from writing | `G3` |
| Text nobody read | Generation without review | `G4` |
| First draft submitted | No review stage | `G5` |
| Desk rejection on formatting | Compliance checked once, at the end | `G6` |
| A broken or non-compliant file submitted | No pre-flight before export | `G7` |

A gate is a **decision the human must make before the cost of not having made it
compounds**. That framing determines everything about the design: gates exist
where reversal is expensive, and nowhere else.

### 1.1 What gates are not

- Not approval workflows. There is one actor: the user.
- Not project management. No dates, no assignments, no burndown.
- Not quality assurance. Quality is continuous; gates are ordering.
- Not skippable-by-configuration. An expert passes them fast (`11` §4.2), not
  around them.

---

## 2. The state machine

```
        ┌──────────────────────────────────────────────────┐
        │                                                  │
        ▼                                                  │
   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐  │
   │ G0      │──▶│ G1      │──▶│ G2      │──▶│ G3      │  │
   │ Intake  │   │ Require │   │ Sources │   │ Structur│  │
   └─────────┘   └─────────┘   └────┬────┘   └─────────┘  │
                                    │  ▲          │        │
                          (continuous)  └─────────┤        │
                                    │             ▼        │
                               ┌────┴────┐   ┌─────────┐  │
                               │         │   │ G4      │  │
                               │         │◀──│ Draft   │  │
                               └─────────┘   └─────────┘  │
                                                  │        │
                                                  ▼        │
                                             ┌─────────┐   │
                                             │ G5      │───┘
                                             │ Review  │  (revision loop)
                                             └─────────┘
                                                  │
                                                  ▼
                                             ┌─────────┐   ┌─────────┐
                                             │ G6      │──▶│ G7      │
                                             │ Complian│   │ Export  │
                                             └─────────┘   └─────────┘
```

### 2.1 Traversal rules

| Rule | Statement |
|---|---|
| **Forward requires sign-off** | No gate advances without a recorded human decision (`P5`) |
| **Backward is always free** | Returning to an earlier gate needs no permission and destroys nothing |
| **`G2` is continuous** | Sources may be added at any point up to `G6`; each still passes approval |
| **`G4`↔`G5` loops** | Draft and review iterate per section until the user is satisfied |
| **`G6` is re-entrant** | Any change after `G6` invalidates it and requires re-evaluation |
| **Chaptered projects gate per chapter** | `G3`–`G5` have independent state per chapter; `G6`/`G7` are whole-document |
| **Returning invalidates downstream** | Changing requirements at `G1` marks `G6` stale, with the impact shown before the change is made |

### 2.2 Gate state

```yaml
gate: G3
status: not_started | in_progress | ready | signed_off | invalidated
entry_satisfied: bool
exit_criteria:
  - id: outline_complete
    satisfied: true
  - id: budgets_assigned
    satisfied: false
    blocking: true
signoff:
  actor: user_id
  at: timestamp
  state_hash: sha256      # what exactly was approved
invalidated_by: [event_id]   # if a later change undermined it
```

**The `state_hash` is load-bearing.** It records exactly what the human approved,
so the system can detect when the approved thing has changed underneath the
sign-off and mark the gate invalidated rather than silently carrying a stale
approval forward.

---

## 3. The gates

### G0 — Intake

**Question:** What am I producing, for whom, by when?

| | |
|---|---|
| **Entry** | Project created |
| **Activities** | Select output type; complete intake; upload brief, template, or guidelines |
| **Exit** | Output type selected · all Required intake fields answered or explicitly deferred · language and level set |
| **Sign-off** | "This is what I'm producing" |
| **Agents** | Requirement Analyzer (extract from brief), Metadata Agent |
| **Typical** | 3–10 min |

**Deferral is permitted.** A user may mark a Required field "not sure yet"
(`REQ-OUT-7`); it becomes a blocking item at `G3` instead. This keeps `G0` from
being a wall for the users least equipped to climb it.

### G1 — Requirements

**Question:** What rules govern this document?

| | |
|---|---|
| **Entry** | `G0` signed off |
| **Activities** | Identify requirement sources; extract rules; review each proposal; edit, add, waive; select citation style |
| **Exit** | Every extracted rule reviewed · citation style set · word limit set or explicitly unbounded · no unreviewed proposals |
| **Sign-off** | "These are the rules I'm working to" |
| **Agents** | Requirement Analyzer, Submission Compliance Agent |
| **Typical** | 5–20 min |

**No requirement source is acceptable** — a user with no brief and no guidelines
gets the output type's catalog defaults and signs off on those. The gate is
satisfied by a *decision*, not by the existence of a document.

### G2 — Sources

**Question:** What evidence am I allowed to use?

| | |
|---|---|
| **Entry** | `G0` signed off (`G1` not required — sourcing can proceed in parallel) |
| **Activities** | Upload materials; import from Vault; run discovery; review candidates; approve or reject |
| **Exit** | Corpus meets the type's minimum source count, **or** the user explicitly accepts a smaller corpus with a recorded reason · zero unreviewed candidates blocking |
| **Sign-off** | "This is the evidence I'm building on" — provisional, since `G2` continues |
| **Agents** | Discovery, Metadata, Reference Validator, Privacy Guard |
| **Typical** | Continuous |

**`G2` is the only continuous gate.** It signs off to unblock `G3`, but reopens
whenever sources are added. Every addition passes approval regardless of gate
state — there is no window in which sources enter unapproved.

### G3 — Structure

**Question:** What shape does this document take?

| | |
|---|---|
| **Entry** | `G0` signed off · `G2` initially signed off · deferred `G0` fields resolved |
| **Activities** | Review the proposed outline; add, remove, reorder sections; assign word budgets; map sources to sections |
| **Exit** | Every required section present · budgets assigned and summing within tolerance of the total · every deferred `G0` field resolved |
| **Sign-off** | "This is the shape of the document" |
| **Agents** | Outline Planner, Methodology Assistant, Structure Reviewer |
| **Typical** | 5–15 min |

For `long_form_chaptered`, `G3` runs per chapter after a whole-document skeleton
is agreed.

### G4 — Draft

**Question:** Does the text exist, and has a human read it?

| | |
|---|---|
| **Entry** | `G1`, `G2`, `G3` all signed off (`REQ-DRF-1`) |
| **Activities** | Draft sections (agent-assisted or by hand); review generated spans; bind claims to evidence; iterate |
| **Exit** | Every required section non-empty · no `ai_generated_unreviewed` spans in sections marked complete · every claim bound or explicitly marked unsupported |
| **Sign-off** | Per section: "this section is drafted" |
| **Agents** | The drafting pipeline (§6) |
| **Typical** | Hours to weeks |

**The four-gate prerequisite is the strictest rule in the workflow.** Drafting
without approved requirements, sources, and structure is the failure mode the
entire architecture exists to prevent (`REQ-DRF-1`).

### G5 — Review

**Question:** Is it good?

| | |
|---|---|
| **Entry** | `G4` signed off for the section or document |
| **Activities** | Structural review; style; language refinement; fact verification; attribution check; address findings |
| **Exit** | Every blocking quality-gate finding resolved or waived · every unsupported claim resolved, sourced, or explicitly softened · refinement complete |
| **Sign-off** | "I'm satisfied with this" |
| **Agents** | Structure Reviewer, Style Coach, Language Editor, Fact Verification, Risk Detection, Accessibility Reviewer |
| **Typical** | Hours to days |

### G6 — Compliance

**Question:** Does it satisfy the rules?

| | |
|---|---|
| **Entry** | `G5` signed off for the whole document |
| **Activities** | Full Rubric evaluation; resolve findings; waive with reasons; apply formatting |
| **Exit** | Zero `blocking` findings · every `required` finding resolved or waived with a recorded reason · citation style consistent · bibliography complete and matching in-text citations |
| **Sign-off** | "This meets the requirements" |
| **Agents** | Submission Compliance, Formatting, Reference Validator, Accessibility Reviewer |
| **Typical** | 15–60 min |

**`G6` is invalidated by any subsequent content change.** Re-entry is cheap
because evaluation is continuous — the user is never re-running compliance from
cold.

### G7 — Export

**Question:** Is this ready to leave?

| | |
|---|---|
| **Entry** | `G6` signed off |
| **Activities** | Pre-flight; integrity check; format selection; render; verify; deliver |
| **Exit** | Pre-flight passes · every blocking compliance finding resolved · required assets present · output validates structurally |
| **Sign-off** | "Export this" |
| **Agents** | Export, Privacy Guard |
| **Typical** | 2–5 min |

**Revision 2:** the authorship integrity check is withdrawn (`32` §8.2).
`G7` blocks only on correctness — unresolved blocking compliance findings,
missing figures, unresolvable cross-references, and output that fails structural
validation (`33` §3).

---

## 4. Gate presentation

The Workflow Monitor (`22` §3.4) shows the pipeline. Each gate displays:

```
┌────────────────────────────────────────────────────┐
│ ● G0 Intake          signed off · 12 Mar           │
│ ● G1 Requirements    signed off · 12 Mar           │
│ ◐ G2 Sources         continuous · 34 approved · 8 waiting │
│ ● G3 Structure       signed off · 14 Mar           │
│ ◐ G4 Draft           4 of 7 sections               │
│ ○ G5 Review          not started                   │
│ ○ G6 Compliance      not started · 12 findings pending │
│ ○ G7 Export          blocked by G6                 │
└────────────────────────────────────────────────────┘
```

The user always sees: where they are, what is outstanding, and what the next
action is. A gate that cannot state its outstanding items is a specification
defect.

---

## 5. Workflow variants

The six variants from `14` §7 specialise the traversal.

### 5.1 `long_form_chaptered`

```
Whole document:   G0 → G1 → G2(continuous) → G3-skeleton → … → G6 → G7
                                                  │
Per chapter:                             G3 → G4 → G5 ──┘
```

Chapter state is independent. A user may have Chapter 2 at `G5` while Chapter 4
is at `G3`. `G6` requires every chapter at `G5`.

**Cross-chapter consistency** is checked at `G6`, not per chapter: terminology
consistency, non-duplicated content, cross-references resolving, and a
bibliography unified across chapters.

### 5.2 `venue_targeted`

Adds a **re-target** operation available at any gate:

```
Change target venue
   → recompile Rubric from the new venue's requirement sources
   → re-evaluate all rules against existing content
   → mark G1 re-signoff required, G6 invalidated
   → content, structure, and Ledger untouched
```

This is Journey 3 (`26`) and the clearest payoff of separating content from
presentation.

Adds the post-`G7` reviewer-response loop (`14` §10).

### 5.3 `proposal`

`G1` is strict: funder rules are blocking by default. Adds a budget-narrative
sub-workflow at `G4` and a feasibility assessment at `G5` that cross-checks the
timeline against the stated work plan.

### 5.4 `visual`

`G3` produces a slide or region plan rather than prose sections. `G4` generates
per region with density limits. `G6` checks legibility, contrast, and physical
dimensions rather than word counts.

---

## 6. The drafting pipeline

What happens when a user drafts a section. Seven stages, each an agent with a
defined contract (`42`).

```
  ┌──────────────────────────────────────────────────────────┐
  │ 0. PRECONDITION CHECK                                     │
  │    G1,G2,G3 signed off? evidence sufficient? budget ok?    │
  └───────────────────────────┬──────────────────────────────┘
                              │ fail → refuse with the specific reason
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 1. EVIDENCE RETRIEVAL          AG-04 Research             │
  │    Retrieve relevant spans from Approved Corpus + Vault    │
  │    Output: ranked Evidence Spans with locations            │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 2. SECTION PLANNING            AG-07 Outline Planner      │
  │    Paragraph-level plan; which evidence supports what      │
  │    Output: plan with evidence assignments                  │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
              ┌───────────────┴───────────────┐
              │  USER CHECKPOINT (optional)    │  ← default on for first section
              │  Review the plan before prose  │
              └───────────────┬───────────────┘
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 3. DRAFTING                    AG-09 Section Drafter      │
  │    Generate prose per plan, citing only approved sources   │
  │    Output: spans + citations + claim candidates            │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 4. CLAIM BINDING               AG-13 Fact Verification    │
  │    Every claim → Evidence Span, or marked unsupported      │
  │    Output: bindings + unsupported list                     │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 5. CITATION VALIDATION         AG-14 Reference Validator  │
  │    Every citation resolves to a corpus entry               │
  │    Any that does not is REMOVED, not repaired              │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 6. STYLE PASS                  AG-16 Style Coach          │
  │    Register, tense, voice per discipline and type          │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 7. LEDGER COMMIT               app/ledger                 │
  │    Every span recorded: ai_generated_unreviewed            │
  │    + agent, model, run, timestamp, evidence bindings       │
  └───────────────────────────┬──────────────────────────────┘
                              ▼
                     Presented for human review
```

### 6.1 Pipeline invariants

| # | Invariant |
|---|---|
| 1 | Stage 0 refuses rather than degrades. Insufficient evidence is a refusal with a stated remedy, not a lower-quality draft |
| 2 | Every citation traces to an Approved Corpus entry. Stage 5 **removes** unresolvable citations rather than attempting repair — repair invites fabrication |
| 3 | Every span reaches the document as `ai_generated_unreviewed`. No exception, no configuration |
| 4 | The pipeline is interruptible at every stage; partial output is retained and marked partial |
| 5 | Every stage is individually observable in the Agent Monitor |
| 6 | The pipeline writes to a review surface, never directly to the accepted draft |
| 7 | Stage failure degrades the run, never the document |

### 6.2 Refusal conditions

The pipeline refuses to draft when:

| Condition | Message shape |
|---|---|
| Gates unsatisfied | "Structure isn't approved yet. Approve it at G3 and I can draft this section." |
| No relevant evidence | "I found nothing in your approved sources about [topic]. Add sources, or write this section yourself and I'll help with language." |
| Evidence contradicts the plan | "Your sources disagree with what this section claims. Here's the conflict." |
| Section already has substantial human content | "This section already has 400 words of your writing. Do you want me to draft alongside it, or help refine what's there?" |
| Budget exhausted | "This would exceed your token budget for this project." |

**A refusal always offers an alternative.** A refusal that leaves the user stuck
is a defect (`AI-8`, `UX5`).

---

## 7. Agent scheduling

The Conductor decides when agents run.

| Trigger | Example | Consent |
|---|---|---|
| **User-invoked** | "Draft this section" | Implicit in the action |
| **Gate-triggered** | Compliance evaluation on entering `G6` | Implicit in the sign-off |
| **Continuous** | Deterministic compliance rules on edit | Configured once |
| **Proposed** | "Chapter 2 is drafted — shall I run a structure review?" | Explicit per proposal |
| **Scheduled** | Overnight batch drafting | Explicit, with budget and scope set in advance |

**Rules**

- No agent that costs money runs without consent — implicit through an action, or
  explicit through a proposal.
- Continuous agents are free (deterministic) or explicitly budgeted.
- Background work respects the Resource Monitor's limits.
- Every scheduled run is visible before it starts and cancellable.

### 7.1 Overnight batch

A legitimate and valuable pattern for long-form work: the user queues drafting
for four sections before bed. Requirements:

- Scope, budget ceiling, and model binding fixed in advance and displayed.
- Runs stop at the budget ceiling, not past it.
- Every produced span is `ai_generated_unreviewed` — waking up to a drafted
  chapter is waking up to a chapter that needs reading.
- A morning summary states what ran, what it cost, and what needs review.

---

## 8. Interruption and recovery

| Event | Behaviour |
|---|---|
| User cancels a run | Stop at the next stage boundary; retain partial output marked partial; Ledger records the cancellation |
| Provider fails mid-run | Failover; if impossible, pause the run and preserve state for resumption |
| App crashes mid-run | Run state recovered from the event log; user is asked whether to resume or discard |
| Machine sleeps | Runs pause; resume on wake |
| Budget exhausted mid-run | Pause; ask; resume or abandon |

**No interruption ever leaves the document in an inconsistent state.** Partial
output is either committed as partial-and-marked or discarded entirely; there is
no third case.

---

## 9. Gate metrics

| Metric | Purpose |
|---|---|
| Time in gate | Identify where users stall |
| Abandonment per gate | `G2` abandonment usually means discovery quality is poor |
| Backward transitions | High `G6`→`G1` means rule extraction is missing things |
| Sign-off latency | Long latency at `G3` means the structure proposal is not trusted |
| Refusal rate | High refusal at stage 0 means gate prerequisites are not being communicated |
| Override rate at `G7` | Above 8% triggers a product review (`10` §8.2) |

Aggregate only. No content, no per-user paths.

---

## 10. Current state

**Built.** The gate state machine (§2-3, G0-G7) is implemented as
`domain/project/gates.ts` (pure — types, entry-prerequisite checks,
`updateExitCriteria`, `signOffGate`, `invalidateGate` with forward-only
cascade, `isProjectComplete`, `nextOutstandingGate`) with `app/conductor/`
as its public entry point. The Conductor binds the gate machine to the two
modules that can compute real exit criteria today:

| Gate | Bound to | How |
|---|---|---|
| G0 (Intake) | Atlas (`app/atlas`) | `computeG0ExitCriteria` — one blocking criterion per required intake field; a provisional answer satisfies it only if the field's `allowsProvisional` is true (§14 §9's per-field contract, not a blanket rule) |
| G6 (Compliance) | Rubric (`app/rubric`, `domain/compliance`) | `computeG6ExitCriteria` — every non-advisory finding becomes a blocking criterion; `not_applicable` findings (an evaluator that doesn't exist yet) are surfaced as non-blocking but never as a silent pass |
| G1-G5, G7 | Nothing yet | No requirement-extraction, sourcing, structure-proposal, drafting, review, or export pipeline exists (`13` §8.3). `updateExitCriteria` accepts any `ExitCriterion[]` from any source, so wiring a real gate in later is additive, not a redesign. |

Sign-off is `state_hash`-bound as designed: `app/conductor/hash.ts` hashes a
caller-supplied "what was approved" snapshot via Web Crypto SHA-256 over a
key-order-independent JSON serialization (chosen over Node's `crypto`
module to stay isomorphic per `13` §2). `isSignoffStale` compares a new
snapshot's hash against the recorded one. `updateExitCriteria` refuses to
recompute criteria on an already-signed-off gate — the caller must
`invalidateGate` first, so the "this used to be approved" transition is
always recorded with a reason, never silently overwritten.

Tests: `domain/project/__tests__/gates.test.ts` and
`app/conductor/__tests__/conductor.test.ts`, 29 tests — initial state,
entry-prerequisite combinations (including G4's three-way AND and G3's
G0+G2 without G1), sign-off readiness and its blocking/advisory distinction,
invalidation cascade (forward-only, leaf gates don't affect ancestors), the
Atlas and Rubric bindings, hash staleness, and a re-target scenario
(`26` Journey 3, in miniature) exercising a full sign-off → invalidate →
recompute cycle.

**Also exposed over HTTP** (`server/routes/project.ts`, 16 supertest
integration tests): `GET /api/atlas/output-types[/:id]` for choosing and
rendering an output type, `POST /api/projects` to bind a project to one,
`PATCH /api/projects/:id/intake` to submit answers and recompute G0,
`POST /api/projects/:id/gates/:gate/signoff` and `.../invalidate` for the
gate-agnostic sign-off/invalidate actions. A project's exit criteria for G0
are computed immediately at creation (not left at
`domain/project/gates.ts`'s default empty list, which is vacuously "ready"
with zero blocking criteria) so a caller can't sign off before intake was
ever evaluated. Persistence is the same explicitly-interim in-memory
pattern as the Studio's session-policy store — see
`src/app/conductor/projectStore.ts` and `13` §8.3.

**Tracked gap.** Per-chapter independent gating for `long_form_chaptered`
(§3's "G3 runs per chapter") is not implemented — the module tracks one
gate state per project, not per chapter. Extending to per-chapter state is
additive (a `Record<chapterId, ProjectGateState>` for G3-G5, with G6/G7
remaining project-level), not a redesign of what exists.

| Remaining | Target |
|---|---|
| No requirement-extraction pipeline | G1 exit criteria computed from extracted requirements |
| No sourcing pipeline | G2 exit criteria computed from discovered/vetted sources |
| No structure-proposal pipeline | G3 exit criteria computed from an agreed outline |
| No drafting pipeline | Seven-stage drafting pipeline with refusal conditions (§6) driving G4 |
| No review pipeline | G5 exit criteria from review completion |
| No export pipeline | G7 exit criteria from export readiness |
| No per-chapter state | Independent chapter gating for `long_form_chaptered` |
| No workflow-variant branching | Six variants (§5) selecting which gates apply and how |
| No persistence | `ProjectGateState` is an in-memory value type; no store yet (`13` §8.3's "largest near-term gap") |

The existing `executor.ts` and `registry.ts` (legacy pipeline, pre-dating
this session's work) are a reasonable base for the eventual G4 drafting
pipeline; they are not yet wired to the gate model.
