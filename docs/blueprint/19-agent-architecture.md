# 19 — Agent Architecture

Covers revision requirement #10. Resolves
[C-04](./11-requirements-conflicts.md#c-04--orchestration-one-skill-registry-vs-comprehensive-multi-agent).

---

## 1. Three execution classes

`[RECOMMENDATION]` The most important distinction in this document, because it
determines what can be trusted, tested, and audited.

| Class | Definition | Properties | Examples |
|---|---|---|---|
| **Deterministic** | Same input → same output. No inference. | Testable, auditable, offline, free | Word counts, citation formatting, gate evaluation, structure checks, format conversion |
| **AI-assisted** | Inference produces a **proposal** | Non-deterministic; always reviewable; ledger-recorded | Drafting, critique, synthesis, source proposal, readability |
| **User-controlled** | Only a human may decide | Never automated | Source approval, claim acceptance, disclosure, conclusions, overrides |

`[RECOMMENDATION]` **Compliance gates are deterministic without exception.**
`[INFERRED]` A gate whose outcome depends on model sampling is not a gate. This
is what makes the compliance claim defensible and what separates this from a
tool that asks an LLM whether a manuscript looks compliant.

`[OBSERVED]` The existing citation formatters and `phaseGating.ts` are already
deterministic. That property must be preserved as the rule set grows.

---

## 2. Agents vs. skills

`[RECOMMENDATION]` Two layers, and the distinction must earn its keep:

- **Skill** — one capability, one contract, pure over domain objects. Returns a
  patch or a report. Never mutates.
- **Agent** — composes multiple skills toward a goal, handles their failures,
  applies quality checks, and decides what to surface.

`[RECOMMENDATION]` **An agent that wraps exactly one skill is not an agent.**
`[OBSERVED]` Today seven agents map near one-to-one onto nine skills, with
agents mostly delegating — indirection without composition. Under this design
such a pairing collapses to the skill.

`[OBSERVED]` **Every agent must have a named consumer before it is built.** A
full orchestration package — queue, scheduler, dependency resolver, retry
manager, failure recovery, ~5,500 lines — was written, never wired, and deleted
in `4afb6c8`. This is the specific mechanism preventing a repeat (R-06).

---

## 3. Agent contract

```
AgentSpec
  id, version, purpose
  executionClass: ai-assisted            // agents are never deterministic-only
  skills[]                               // must be > 1
  tools[]                                // inference, retrieval, parsing, formatting
  inputs   { required[], optional[] }
  outputs  { kind: proposal | report | patch, schema }
  interactions[]                         // named agents; no cycles
  failureModes[]  { condition, handling, userVisible }
  qualityChecks[]                        // pre-emission
  humanCheckpoints[]                     // where the user must decide
  consumer                               // MANDATORY — who calls this
```

`[RECOMMENDATION]` `humanCheckpoints` is mandatory and non-empty for any agent
that touches manuscript content. `[INFERRED]` An agent with no checkpoint is
authoring autonomously, which contradicts requirement #5.

---

## 4. Agent roster

`[OBSERVED]` Seven agents exist today: research planner, literature review,
knowledge gap, research question, methodology advisor, statistical analysis,
integrity reviewer.

`[RECOMMENDATION]` Revised roster, aligned to the lifecycle. Each composes
multiple skills; each has a named consumer.

### Intake & Evidence

**Source Proposer** — proposes authenticated secondary sources when material is
insufficient.
· *Skills:* gap detection, query formulation, multi-source retrieval, dedup, relevance ranking
· *Inputs:* output type, existing approved sources, section context · *Outputs:* ranked proposals, each `unapproved` with a stated reason
· *Failure:* no results → report honestly, never pad; adapter down → degrade to remaining adapters, name the gap
· *Quality:* every proposal has a resolvable identifier — **no identifier, not shown**
· *Checkpoint:* user approves each · *Consumer:* [15](./15-evidence-pipeline.md) intake

**Evidence Analyst** — reports coverage and balance across approved sources.
· *Skills:* thematic clustering, temporal/venue distribution, contradiction detection, coverage mapping
· *Outputs:* report only — never modifies · *Checkpoint:* advisory · *Consumer:* workspace readiness

### Planning

**Structure Planner** — proposes document structure from output type, venue, and evidence.
· *Skills:* structure resolution, word budgeting, evidence-to-section mapping
· *Failure:* conflicting venue and catalogue structure → surface both, ask
· *Checkpoint:* user approves the outline · *Consumer:* workspace creation

### Drafting

**Section Drafter** — drafts one section from approved sources and user intent.
· *Skills:* context assembly (approved only), drafting, claim extraction, support linking
· *Quality:* every generated claim carries source attribution or is flagged unsupported **before** it is shown
· *Failure:* insufficient approved evidence → refuse and surface the gap, rather than drafting unsupported prose
· *Checkpoint:* per-claim accept/reject · *Consumer:* [16](./16-authoring-lifecycle.md) drafting

**Critic** — identifies weaknesses without authoring.
· *Skills:* argument coherence, support adequacy, structural balance, consistency
· *Outputs:* report only · *Consumer:* editor review panel
· `[INFERRED]` Highest value-to-risk ratio in the roster — improves the work without authoring it, so the provenance question barely arises.

### Finalisation

**Compliance Auditor** — runs the full gate set and produces readiness.
· `[RECOMMENDATION]` **Deterministic. Not an agent in the AI sense** — listed here because it belongs to the lifecycle, and to make explicit that it must never become inference-driven.
· *Consumer:* [17](./17-compliance-engine.md) readiness view

**Language Editor** — refinement and readability, under §2 of [18](./18-finalisation-export.md).
· *Quality:* semantic-equivalence check — a change in meaning is a defect
· *Constraint:* no detector targeting · *Checkpoint:* diff review

**Integrity Reviewer** — `[OBSERVED]` exists today.
· *Skills:* citation-claim alignment, quotation attribution, self-overlap, disclosure completeness
· *Outputs:* report only · *Consumer:* finalisation

`[RECOMMENDATION]` Deliberately **not** included: an autonomous "write the whole
document" agent, and any agent that approves sources or accepts claims.
`[INFERRED]` Both would relocate authorship from the user to the system.

---

## 5. Interaction

`[RECOMMENDATION]` Agents interact through the **domain state**, not by calling
each other. Structure Planner writes a proposed structure; Section Drafter reads
it. No direct invocation, no cycles.

`[INFERRED]` Direct agent-to-agent calls produce chains where a failure three
levels deep surfaces as an unexplainable outcome — and make the provenance
record ambiguous about which agent was responsible for what.

`[RECOMMENDATION]` Pipelines compose agents explicitly, with a user checkpoint
between stages by default.

---

## 6. Failure handling

`[RECOMMENDATION]` Uniform, and biased toward honesty over completion:

| Failure | Handling |
|---|---|
| Provider unavailable | `[OBSERVED]` error-kind-classified failover already exists; on exhaustion, report which providers were tried |
| Insufficient approved evidence | **Refuse and explain.** Never draft unsupported content |
| Malformed model output | Retry with stricter instruction; on repeat, surface raw output rather than silently discarding |
| Quality check failed | Do not emit. Report what failed |
| Partial pipeline failure | Preserve completed steps; resume from the failure point |
| Timeout | Preserve partial results; mark incomplete |

`[RECOMMENDATION]` **No silent failures and no silent substitutions.**
`[INFERRED]` A system that quietly downgrades to a weaker model or a smaller
context, and reports success, makes its own provenance record wrong.

---

## 7. Adaptive behaviour under administrator control

Requirement #10 asks for adaptive or continually improving behaviour with
administrator control.

`[RECOMMENDATION]` **What may adapt:**

| Adaptable | Mechanism | Control |
|---|---|---|
| Model routing per task | Observed latency, cost, failure rate | Admin sets policy and caps |
| Prompt templates | Versioned; A/B evaluated offline | Admin approves promotion |
| Retrieval ranking | Relevance signals from approval rates | Admin can reset |
| Rule-pack suggestion | Which venue a user likely means | Admin curates |
| Default output structures | Aggregate acceptance of proposed outlines | Admin approves |

`[RECOMMENDATION]` **What may never adapt:**

- Gate logic and thresholds — `[INFERRED]` a gate that learns to pass more
  manuscripts is an integrity failure, and the failure would be invisible
- Citation formatting rules
- Disclosure derivation
- What counts as an approved source
- Anything altering the ledger's meaning

`[RECOMMENDATION]` All adaptation is **fleet-level and offline-evaluated**,
never per-user silent drift: candidate changes are evaluated in the admin
sandbox ([20](./20-admin-platform.md)), approved explicitly, versioned, and
reversible. `[INFERRED]` Per-user online learning would make two users' results
differ for reasons neither can see, which is unacceptable in a compliance
tool.

`[RECOMMENDATION]` Learning signals are **aggregate counters**, never
manuscript content — consistent with the tier-3 boundary in
[21](./21-data-and-security.md).

---

## 8. Observability

`[RECOMMENDATION]` Every agent run emits: agent id and version, skills invoked,
model and provider, token counts, duration, quality-check results, failure
mode, and the user's decision at each checkpoint.

`[OBSERVED]` No telemetry exists in the live path today
([09](./09-technical-debt-register.md) TD-19), so agent behaviour is currently
unmeasurable — including whether an agent is ever used.

`[RECOMMENDATION]` Run records are **local by default** ([21](./21-data-and-security.md));
only aggregate counters reach the administrator.
