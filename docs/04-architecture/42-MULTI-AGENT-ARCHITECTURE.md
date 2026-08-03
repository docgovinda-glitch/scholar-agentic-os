# Multi-Agent Architecture — The Mesh

> **Doc ID:** 42 · **Status:** Design · **Depends on:** `30`, `41`, `46`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

Twenty-four agents, their contracts, their permissions, how they communicate,
and how they improve.

---

## 1. What an agent is here

**An agent is a bounded worker with a declared responsibility, typed contracts, a
permission set, and an evaluation suite.**

It is deliberately not "an autonomous entity that decides what to do." Autonomy is
the Conductor's, and the Conductor's autonomy is bounded by gates that require
human sign-off. Agents are competent specialists that do one thing on request.

| An agent is | An agent is not |
|---|---|
| Narrowly scoped | A general assistant |
| Typed in and out | Free-form |
| Capability-limited | Ambiently authorised |
| Individually evaluable | Judged only by end-to-end output |
| Versioned and releasable | A code path |
| Observable | A black box |

### 1.1 Deterministic where possible

Many agents run without a model at all. Reference validation, citation
formatting, structural checks, and counting are algorithms. Deterministic mode is
preferred wherever it suffices: it is free, offline, instant, and reproducible
(`REQ-AI-3` and the offline guarantee in `22` §8 both depend on it).

Roughly a third of the agent population is deterministic-only, and several
others are hybrid.

---

## 2. Agent manifest

```yaml
id: AG-13
name: Fact Verification Agent
version: 2.4.0
channel: stable
responsibility: >
  Verify that each claim in a draft span is supported by an approved
  Evidence Span, and classify the strength of that support.

modes: [hybrid]                 # ai | deterministic | hybrid
default_mode: hybrid

inputs:
  - draft_spans: Span[]
  - approved_corpus: CorpusRef
  - claim_candidates: Claim[]
outputs:
  - bindings: ClaimEvidenceBinding[]
  - unsupported: Claim[]
  - conflicts: EvidenceConflict[]

permissions:
  - read:draft
  - read:corpus
  - read:evidence
  - write:claim_graph
  # explicitly absent: write:draft, net:outbound, read:vault

memory: project
task_class: verification
egress_class: user_content

qa_checkpoints:
  - every binding resolves to a real corpus entry
  - no binding invents a page or locator
  - unsupported claims are reported, never silently dropped
  - conflicts surfaced, not resolved unilaterally

golden_set: fact-verification-v3
eval_thresholds:
  binding_precision: 0.95
  unsupported_recall: 0.90
```

**Permissions are the important field.** AG-13 verifies claims and cannot write
to the draft. It cannot reach the network. It cannot read the Vault. If a model
returns something that would require those, the service tier refuses
(`REQ-AI-5`).

---

## 3. The agent population

Twenty-four agents in seven groups.

### Group A — Intake and requirements

#### AG-01 · Metadata Agent
Extracts and normalises bibliographic metadata from documents and identifiers.
**Mode:** deterministic (parsing) + AI (ambiguous cases). **Permissions:**
`read:source`, `write:metadata`, `net:outbound` (identifier resolution).
**Memory:** ephemeral. **QA:** identifiers resolve or are marked unresolved;
never fabricates a DOI.

#### AG-02 · Requirement Analyzer
Reads requirement sources and proposes compiled rules (`31` §4).
**Mode:** hybrid — deterministic for templates, AI for prose.
**Permissions:** `read:requirement_source`, `write:rule_proposals`.
**Memory:** project. **QA:** every proposal cites its source clause; confidence
scored; conflicts detected, never silently resolved.

#### AG-03 · Intake Assistant
Generates the intake form's proposals: structure, budgets, style, source targets.
Explains each. **Mode:** hybrid. **Permissions:** `read:project`,
`read:output_type`, `write:intake_proposals`. **Memory:** ephemeral.
**QA:** every proposal carries a rationale; no empty required field.

### Group B — Sources

#### AG-04 · Research Agent
Retrieves relevant Evidence Spans from the approved corpus and Vault for a given
section or question. The retrieval engine behind drafting.
**Mode:** hybrid (vector + keyword + reranking). **Permissions:** `read:corpus`,
`read:vault`, `read:index`. **Memory:** project.
**QA:** every returned span has a real locator; relevance scored; never returns
spans from unapproved sources.

#### AG-05 · Discovery Agent
Constructs queries, searches academic sources, deduplicates, and ranks candidates.
**Mode:** hybrid. **Permissions:** `read:project`, `net:outbound`,
`write:candidate_queue`. **Memory:** project.
**QA:** **cannot write to the corpus** — the queue is its only output
(`REQ-SRC-4`); every result attributed to its service.

#### AG-06 · Reference Validator
Verifies identifiers resolve, publishers are real, retraction status, and
predatory-venue signals. Validates citation–bibliography consistency.
**Mode:** deterministic + network lookup. **Permissions:** `read:corpus`,
`net:outbound`, `write:verification_status`. **Memory:** project.
**QA:** unresolvable identifiers are marked unverified, never assumed valid;
"retraction database unreachable" is never reported as "not retracted".

#### AG-07 · Knowledge Vault Curator
Maintains Vault health: deduplication, tagging suggestions, relationship
detection, gap identification, stale-content flagging.
**Mode:** hybrid. **Permissions:** `read:vault`, `write:vault_metadata`.
**Memory:** workspace. **QA:** never deletes; only proposes.

### Group C — Structure and planning

#### AG-08 · Outline Planner
Proposes document structure from output type, requirements, and available
evidence. Assigns word budgets. Plans sections at paragraph level during
drafting. **Mode:** AI. **Permissions:** `read:project`, `read:corpus`,
`write:structure_proposal`. **Memory:** project.
**QA:** every required section present; budgets sum within tolerance; each
planned paragraph names its supporting evidence.

#### AG-09 · Methodology Assistant
Advises on research design, sampling, analysis approach, and methodological
disclosure. Checks that methods match research questions.
**Mode:** AI. **Permissions:** `read:project`, `read:corpus`,
`write:advisory`. **Memory:** project.
**QA:** advisory only — never asserts a method was used; flags mismatches rather
than rewriting.

#### AG-10 · Literature Review Agent
Organises the corpus thematically, identifies clusters and disagreements, and
proposes synthesis structure. **Mode:** hybrid. **Permissions:** `read:corpus`,
`read:evidence`, `write:synthesis_proposal`. **Memory:** project.
**QA:** every theme traces to specific sources; disagreements surfaced, not
smoothed.

#### AG-11 · Knowledge Gap Agent
Identifies where the corpus is thin relative to the planned structure, and where
claims lack supporting evidence. **Mode:** hybrid. **Permissions:**
`read:corpus`, `read:structure`, `read:claim_graph`, `write:findings`.
**Memory:** project. **QA:** gaps are specific and actionable.

### Group D — Drafting

#### AG-12 · Section Drafter
Generates prose for one section from a plan and retrieved evidence.
**Mode:** AI. **Permissions:** `read:corpus`, `read:evidence`, `read:structure`,
`write:draft_proposal`. **Memory:** project.
**QA:** cites only approved sources; every span carries evidence bindings;
**writes to a review surface, never to the accepted draft**; never exceeds the
section budget by more than 20%.

#### AG-13 · Fact Verification Agent
Per §2. Binds claims to evidence; reports unsupported claims and conflicts.

#### AG-14 · Citation Manager
Formats citations and bibliographies; maintains style consistency; detects
missing and orphaned entries. **Mode:** deterministic.
**Permissions:** `read:corpus`, `read:draft`, `write:citations`.
**Memory:** project. **QA:** style-conformance golden sets per style; **removes**
citations that do not resolve rather than repairing them (`30` §6.1).

### Group E — Review and quality

#### AG-15 · Structure Reviewer
Checks logical flow, section balance, argument coherence, and that the conclusion
follows from the content. **Mode:** AI. **Permissions:** `read:draft`,
`read:structure`, `write:findings`. **Memory:** project.
**QA:** findings are located and specific.

#### AG-16 · Academic Style Coach
Register, tense, voice, hedging, discipline conventions, terminology consistency.
Runs in a different mode for applied output types where academic hedging is a
defect (`14` OT-20). **Mode:** hybrid. **Permissions:** `read:draft`,
`write:suggestions`. **Memory:** project.
**QA:** suggestions preserve meaning; meaning-altering changes flagged separately.

#### AG-17 · Language Editor
The Language & Voice Studio's engine: five intervention levels, voice matching,
L1-aware second-language support, discipline register (`32`).
**Mode:** hybrid — levels 1–2 largely deterministic, 3–5 model-driven.
**Permissions:** `read:draft`, `read:voice_profile`, `write:suggestions`.
**Memory:** project.
**QA:** level 1 changes only errors; every change carries a reason; quotations
protected; meaning changes handed to AG-20 and surfaced separately; voice
matching never reintroduces an error.

**Revision 2:** the constraint forbidding operation on unreviewed AI text is
removed along with the mandatory provenance tracking it depended on. AG-17 is
now the most heavily specified agent in the Mesh.

#### AG-18 · Readability Analyst
Reading level, sentence-length distribution, jargon density, passive-voice ratio
— assessed against the output type's audience. **Mode:** deterministic.
**Permissions:** `read:draft`, `write:findings`. **Memory:** ephemeral.

#### AG-19 · Attribution Agent
Plagiarism awareness (`32` §10): unattributed overlap with the corpus or the
user's Vault, quotation integrity, close paraphrase presented as original.
**Mode:** deterministic + AI. **Permissions:** `read:draft`, `read:corpus`,
`read:vault`, `write:findings`. **Memory:** project.
**QA:** every finding names the overlapping source and offers the attribution fix;
**produces no similarity score**.

#### AG-20 · Risk Detection Agent
Flags risks a user may not see: overclaimed findings, causal language on
correlational evidence, missing limitations, unsupported generalisation, ethical
disclosure gaps, statistical misstatement. **Mode:** AI.
**Permissions:** `read:draft`, `read:evidence`, `write:findings`.
**Memory:** project. **QA:** flags, never edits; each flag explains the risk in
plain terms.

#### AG-21 · Accessibility Reviewer
Alt text for figures, table header structure, heading hierarchy, colour-only
information, link text, and — for visual output types — contrast and font size.
**Mode:** deterministic + AI (alt text). **Permissions:** `read:draft`,
`write:findings`, `write:suggestions`. **Memory:** ephemeral.

### Group F — Compliance and output

#### AG-22 · Submission Compliance Agent
Orchestrates Rubric evaluation, aggregates findings, produces the compliance
report. **Mode:** deterministic + AI for model-assisted rules.
**Permissions:** `read:draft`, `read:rubric`, `write:findings`.
**Memory:** project. **QA:** never reports a pass for a rule that did not run.

#### AG-23 · Formatting Agent
Applies Rubric formatting, numbering, cross-references, TOC, and front matter.
Measures layout where physical limits apply. **Mode:** deterministic.
**Permissions:** `read:draft`, `read:rubric`, `write:formatting`.
**Memory:** ephemeral.

#### AG-24 · Export Agent
Runs pre-flight, renders to the target format, verifies output, packages
submissions, and performs anonymisation. **Mode:** deterministic.
**Permissions:** `read:draft`, `read:rubric`, `read:ledger`, `write:artifact`.
**Memory:** ephemeral. **QA:** never delivers a file failing structural
validation; every pre-flight block reported before rendering.

### Group G — System

#### AG-25 · Privacy Guard
The Warden's agent face: classifies content, evaluates policy, produces egress
previews, maintains the egress audit. **Mode:** deterministic.
**Permissions:** `read:egress_request`, `write:egress_decision`.
**Memory:** none — stateless by design.
**QA:** never permits an unclassified payload; fails closed.

#### AG-26 · Workflow Coordinator
The Conductor's agent face: evaluates gate criteria, proposes next actions,
schedules runs, detects stalls. **Mode:** deterministic + AI (proposals).
**Permissions:** `read:project`, `read:gates`, `write:schedule`.
**Memory:** project. **QA:** **never advances a gate** — only reports readiness
(`P5`).

> The population is 26 agents against the brief's 22 examples; AG-03, AG-11,
> AG-18, and AG-19 were added where a responsibility had no clear owner, and
> "Research" and "Discovery" were separated because retrieval-from-approved and
> search-the-world have materially different permissions.

---

## 4. Permissions

### 4.1 The capability set

| Capability | Grants |
|---|---|
| `read:project` | Project metadata, intake, structure |
| `read:draft` | Draft content |
| `read:corpus` | Approved sources and their content |
| `read:vault` | Vault content |
| `read:evidence` | The claim–evidence graph |
| `read:rubric` | Compiled rules |
| `read:voice_profile` | The user's Voice Profile statistics |
| `read:index` | Search |
| `write:draft_proposal` | Propose text into a review surface |
| `write:draft` | **Modify the accepted draft directly** |
| `write:findings` | Create findings |
| `write:suggestions` | Propose edits |
| `write:metadata` | Modify source metadata |
| `write:claim_graph` | Create bindings |
| `write:candidate_queue` | Add candidates |
| `write:vault_metadata` | Tags and relationships |
| `write:artifact` | Produce export files |
| `net:outbound` | Network, still subject to the Warden |

### 4.2 Rules

| Rule | Statement |
|---|---|
| **No agent holds `write:draft`** | Only the user writes the accepted draft. Agents propose |
| **`net:outbound` never bypasses the Warden** | It grants the *ability* to request egress, not permission to egress |
| **`read:vault` is granted narrowly** | Four agents hold it: AG-04, AG-07, AG-19, AG-17 |
| **`read:voice_profile` is AG-17 only** | The profile models how one person writes |
| **Permissions are declared, not requested at runtime** | The manifest is the whole grant |
| **service tier-enforced** | Not honour-system; `services/capabilities` is the enforcement point |
| **Escalation is impossible** | An agent cannot obtain a capability it did not declare |

The first rule is the one that matters. It is the mechanism by which
`REQ-DRF-3` and the Ledger's guarantees hold: no agent can put text into the
user's document without passing through a review surface where provenance is
recorded.

---

## 5. Communication

Agents do not call each other. The Conductor composes them.

```
Conductor ──▶ AG-04  ──┐
                       ├──▶ typed artifacts in the kernel store
Conductor ──▶ AG-08  ──┘
                  (Conductor reads outputs, passes to the next)
Conductor ──▶ AG-12
```

| Property | Rationale |
|---|---|
| No direct agent-to-agent calls | Prevents emergent, unobservable behaviour |
| Communication is typed artifacts | Every intermediate is inspectable |
| The Conductor is the only orchestrator | One place where sequencing is understood |
| Every hop is logged | Full trace in the Agent Monitor |

This costs some flexibility and buys legibility (`P6`). An agent graph with
free inter-agent calls is not debuggable by a two-person team, and is not
explicable to a user asking why a sentence appeared.

---

## 6. Memory

| Tier | Scope | Contents | Persistence |
|---|---|---|---|
| `ephemeral` | One run | Working state | Discarded |
| `project` | One project | Learned project context — terminology, style, structure decisions | Project lifetime |
| `workspace` | One workspace, opt-in | Cross-project preferences — citation habits, discipline conventions | Until cleared |

**No agent has cross-user memory.** There is no shared learning across users
(`41` §11).

Workspace memory is opt-in and inspectable: the user can see what an agent has
learned about them and clear it. An agent that has learned a user prefers British
spelling and passive-voice methods sections should be able to say so.

---

## 7. Lifecycle

```
AUTHORED       Foundry: config, prompts, tool grants, golden set
    ▼
EVALUATED      Golden set + regression across affected suites
    ▼
dev            Operator testing only
    ▼
beta           Opted-in users; monitored 48h minimum
    ▼
stable         Default channel
    ▼
DEPRECATED     Superseded; still available to pinned users
    ▼
RETIRED        Removed; pinned users migrated with notice
```

### 7.1 Promotion rules

| Rule | Statement |
|---|---|
| No promotion to `stable` without a passing golden-set evaluation (`REQ-ADM-5`) |
| Regression across *all* affected golden sets, not just the target one |
| Minimum 48 hours in `beta` with monitoring |
| Rollback available within minutes |
| Users may pin a version and may track a channel |
| Permission changes require an explicit re-consent from the user |

The last rule closes an obvious hole: an agent update that silently added
`read:vault` would be a privilege escalation shipped as an improvement.

### 7.2 Version binding

A project records which agent versions produced its content, in the Ledger. This
makes "why does Chapter 2 read differently from Chapter 5" answerable, and lets a
user pin versions for consistency across a long project.

---

## 8. Quality assurance

### 8.1 Per-agent QA checkpoints

Every agent declares checkpoints (§2) verified at runtime. A failed checkpoint
fails the run rather than emitting bad output.

Examples:

| Agent | Checkpoint |
|---|---|
| AG-12 | Every citation resolves to an approved corpus entry |
| AG-13 | No binding invents a locator |
| AG-06 | Unreachable retraction database is never reported as "not retracted" |
| AG-17 | Refuses `ai_generated_unreviewed` input |
| AG-24 | Never delivers a structurally invalid file |
| AG-26 | Never advances a gate |

### 8.2 Golden sets

Every agent has a versioned evaluation set with expected outputs
(`52` §4.5). Held in the Foundry, never containing user content — constructed
from public documents, synthetic cases, and operator-authored examples.

### 8.3 Runtime guards

| Guard | Behaviour |
|---|---|
| Output schema validation | Non-conforming output rejected before it reaches the document |
| Citation resolution | Enforced structurally |
| Budget | Run stops at its ceiling |
| Timeout | Run cancelled and reported |
| Loop detection | Repeated identical calls abort the run |
| Capability check | Every guarded operation verified against the token |

---

## 9. Why agents are configuration, not code

A two-to-four-person team cannot ship a desktop release to fix a prompt
(`26` Journey 9). Agent behaviour therefore lives in versioned configuration
delivered through the signed registry:

| In configuration | In code |
|---|---|
| Prompts and their variants per model family | Execution engine |
| Model preferences and task class | Capability enforcement |
| Output schemas | Schema validation |
| QA checkpoint definitions | Checkpoint evaluation |
| Thresholds and parameters | service tier integration |
| Tool grants (within what the code permits) | The capability system itself |

**The boundary:** configuration can never grant a capability the code does not
already implement and gate. Config changes behaviour within a fixed security
envelope.

---

## 10. Observability

The Agent Monitor (`22` §3.4) shows, per run: agent, version, channel, status,
progress, model, provider, elapsed, tokens, cost, and a stop control. Expanding
shows inputs, outputs, capability grants, QA checkpoint results, and the
reasoning trace where the agent produces one.

**Every run is inspectable.** This is `P6` made concrete, and it is what lets a
user answer "why did it say that?" without asking us.

---

## 11. Current state

`src/agents/` has 9 agents with a registry, executor, and pipeline;
`src/skills/` has 10 skills with an executor and registry. The `ExecutionMode`
type already distinguishes `ai | deterministic | web | hybrid`, which is the
right instinct.

| Current | Target |
|---|---|
| 9 agents | 26 agents in 7 groups |
| No permission system | Declared, service tier-enforced capability grants |
| No versioning or channels | Full lifecycle with evaluation-gated promotion |
| No memory tiers | Three tiers with opt-in workspace memory |
| Agents in code | Behaviour in signed, versioned configuration |
| No golden sets | Per-agent evaluation suites |
| No QA checkpoints | Declared checkpoints enforced at runtime |
| Pipeline exists | Conductor-composed with typed artifacts and no agent-to-agent calls |
| `humanizeSkill` | **Retired** (`32` §12) |

The registry/executor/mode design carries forward. Permissions, versioning, and
the Foundry are new construction.
