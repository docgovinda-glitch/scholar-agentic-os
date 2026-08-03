# Risk Register

> **Doc ID:** 53 · **Status:** Design · **Revision:** 2 (website-only)

Scored risks with triggers, mitigations, and owners. Reviewed at every phase
review.

---

## 1. Scoring

**Likelihood** — L1 rare · L2 unlikely · L3 possible · L4 likely · L5 near-certain
**Impact** — I1 minor · I2 moderate · I3 serious · I4 severe · I5 existential
**Score** = L × I. Above 12 requires an active mitigation with an owner.

---

## 2. The register

### RISK-01 — The Studio does not visibly outperform free alternatives

**L3 × I5 = 15 · Critical · Owner: product**

The Language & Voice Studio is the differentiator. If a user compares it against
a free grammar tool or a general AI assistant and cannot tell the difference,
the product has no reason to exist that a cheaper substitute does not also
satisfy.

| | |
|---|---|
| **Trigger** | Studio satisfaction below 4.5/5 among second-language beta users; voice-match acceptance below 75% |
| **Mitigation** | Five differentiated levels rather than one operation; voice matching; L1-aware patterns; per-change reasons; meaning verification. Beta cohort is deliberately at least a third second-language writers (`50` §4, M2) |
| **Contingency** | Hold 1.0 rather than ship it weak (`50` §9). Ship levels without voice matching if that specific mechanism fails to land |
| **Residual** | Moderate |

### RISK-02 — Users expect detection evasion and we do not provide it

**L5 × I3 = 15 · Critical · Owner: product / founders**

Users will arrive expecting "undetectable" output, because competitors advertise
it. `01` §7 declines to provide it. Some will leave.

| | |
|---|---|
| **Trigger** | Support requests; churn citing detection; competitor comparison in reviews |
| **Mitigation** | Position on quality and voice, not evasion. Never imply a detection outcome (`02` §9.1). Route the underlying worry — usually fear of false accusation — to the Writing History, which is the genuinely useful answer |
| **Contingency** | None available. This is a settled position, not a parameter (`54` closed questions) |
| **Residual** | High, and accepted. The alternative — promising an outcome we cannot hold, losing the institutional market, and misleading users into a worse position — is worse on every axis |

### RISK-03 — Requirement extraction quality is too poor to trust

**L4 × I4 = 16 · Critical · Owner: product engineering**

The Rubric's value depends on turning a 40-page PDF into correct rules. A wrong
rule is worse than no rule: users who correct three stop trusting the fourth.

| | |
|---|---|
| **Trigger** | Extraction precision below 0.90 on the golden set |
| **Mitigation** | Precision weighted above recall; every rule a proposal requiring confirmation; low-confidence sorted first; deterministic template extraction as the high-precision path; curated venue profiles; manual entry always available |
| **Contingency** | Ship with venue profiles and manual entry as the primary paths |
| **Residual** | Moderate |

### RISK-04 — Users route around the workflow

**L4 × I3 = 12 · High · Owner: product**

If the gates feel like bureaucracy, users draft in a chatbot and paste in. The
evidence binding and compliance value evaporate without anything visibly
breaking.

| | |
|---|---|
| **Trigger** | High `G0`–`G3` abandonment; large-paste events frequent; short time-to-export |
| **Mitigation** | Expert path completes `G0`–`G3` in under five minutes; good defaults everywhere; each gate justified in the UI by the failure it prevents; import fidelity good enough that importing beats pasting |
| **Contingency** | Reduce friction, never gate count. Investigate which gate is failing |
| **Residual** | Moderate. Revision 2 lowers the impact — without a mandatory authorship ledger there is less incentive to work outside the tool |

### RISK-05 — Server costs exceed projection

**L3 × I4 = 12 · High · Owner: platform**

Revision 2 moves all compute server-side. Parsing, OCR, embedding, agent runs,
and Studio refinement are now our bill, at a per-user cost revision 1 avoided
entirely.

| | |
|---|---|
| **Trigger** | Cost per active free user above target; Studio cost per session above projection |
| **Mitigation** | Deterministic-first — ~80% of compliance rules and Studio levels 1–2 need no model; aggressive caching; per-user and per-tier budgets; bring-your-own-key costs us nothing |
| **Contingency** | Tighten free-tier caps on model-backed operations before reducing capability. Cheaper model bindings for levels 1–3 |
| **Residual** | Moderate. This is the principal cost risk revision 2 introduced |

### RISK-06 — Editor performance inadequate in a browser at length

**L3 × I4 = 12 · High · Owner: frontend**

A 100k-word thesis in a browser tab, with tracked changes, comments, and live
compliance, is demanding. Revision 1 had a native process; revision 2 does not.

| | |
|---|---|
| **Trigger** | Input latency above 50 ms; memory growth over a long session |
| **Mitigation** | Section-scoped loading; virtualised rendering; server-side compliance evaluation; measured on the target baseline, not developer machines |
| **Contingency** | Harder section scoping — a chapter is the maximum editable unit |
| **Residual** | Moderate |

### RISK-07 — Data loss or exposure incident

**L2 × I5 = 10 · High · Owner: platform**

Revision 2 holds user content and the keys to it. A breach exposes dissertations
and unpublished research — the outcome revision 1's architecture made
structurally impossible.

| | |
|---|---|
| **Trigger** | Any unauthorised access |
| **Mitigation** | Encryption at rest with KMS-managed keys; break-glass access with two-person approval, audit, and user notification (`44` §4); no routine staff access path; short retention; the `restricted` path for the most sensitive work |
| **Contingency** | Documented incident response; notification within 72 hours; independent review |
| **Residual** | Moderate, and materially higher than revision 1. This is the cost of website-only, recorded plainly (`44` §11) |

### RISK-08 — Meaning changes slip through refinement

**L3 × I4 = 12 · High · Owner: AI lead**

If the Studio changes "suggest" to "demonstrate" and the user accepts it among
twelve comma fixes, the product has caused an overclaim in academic work.

| | |
|---|---|
| **Trigger** | Any golden-set case where a meaning change is not separated |
| **Mitigation** | Stage 4 meaning verification as a distinct pipeline step; content edits always surfaced first and separately; 100% golden-set separation is a Phase 3 exit criterion |
| **Contingency** | Restrict level 5 until separation is reliable |
| **Residual** | Low with the mitigation, and this is the Studio's most consequential failure mode |

### RISK-09 — Pocket becomes a second Desk, or an afterthought

**L3 × I3 = 9 · Medium · Owner: product**

Two failure directions. Scope creep makes Pocket a cramped Desk; neglect makes it
a token responsive layout nobody uses.

| | |
|---|---|
| **Trigger** | Requests to add Desk regions to Pocket; or Pocket usage below 15% of sessions |
| **Mitigation** | The normative capability matrix (`20` §6); the explicit absent-list (`23` §8); the approval queue designed mobile-first rather than adapted |
| **Contingency** | Hold the matrix. If usage is low, investigate whether the four jobs are the right four |
| **Residual** | Low |

### RISK-10 — Voice matching is imperceptible or wrong

**L3 × I3 = 9 · Medium · Owner: AI lead**

Voice matching is the Studio's most distinctive claim and the hardest to verify.
If users cannot tell it is working, it is expensive decoration.

| | |
|---|---|
| **Trigger** | Voice-match acceptance below 75%; users disabling it |
| **Mitigation** | Minimum sample threshold before it activates (`32` §12); drift reporting makes the effect visible; correctness always wins over voice |
| **Contingency** | Ship the five levels without voice matching; revisit in Phase 4 |
| **Residual** | Moderate |

### RISK-11 — A student is accused of misconduct after using the product

**L4 × I3 = 12 · High · Owner: product / founders**

It will happen, regardless of what we build, because detectors flag
second-language writing. How we respond determines whether we are seen as part
of the problem.

| | |
|---|---|
| **Trigger** | The first report |
| **Mitigation** | Never imply detection outcomes, so no user is misled into complacency (`01` §7); Writing History as genuine evidence of process; documentation the student can show |
| **Contingency** | Support process that helps the student present their process. **Never a claim that our output should not have been flagged** |
| **Residual** | Moderate, and partly outside our control |

### RISK-12 — Users stop reading suggestions

**L4 × I3 = 12 · High · Owner: product**

Acceptance above 85% usually means evaluation has stopped. The Studio's per-change
reasons only work if someone reads them.

| | |
|---|---|
| **Trigger** | Acceptance above 85%; review dwell times collapsing |
| **Mitigation** | Tracked as a risk signal, not a success metric; meaning changes always separated and first; "accept all" available only for the language category, never for content edits |
| **Contingency** | Consider surfacing the pattern to the user as information about their own habits |
| **Residual** | Moderate |

### RISK-13 — A small team cannot sustain the operational surface

**L3 × I3 = 9 · Medium · Owner: platform**

Nine providers, an agent registry, a plugin registry, a service tier, and
institutional customers is a lot for two to four people — though materially less
than revision 1's three surfaces and cross-platform installers.

| | |
|---|---|
| **Trigger** | Admin actions requiring engineering above 5% |
| **Mitigation** | Agent behaviour as configuration; feature flags with kill switches; managed services throughout; continuous deployment; runbooks |
| **Contingency** | Reduce provider count; delay institutional tier |
| **Residual** | Low-moderate. Website-only reduced this substantially |

### RISK-14 — Prompt injection via source documents

**L3 × I3 = 9 · Medium · Owner: AI lead**

The system feeds untrusted PDFs and web pages to models.

| | |
|---|---|
| **Trigger** | Any observed injection |
| **Mitigation** | Structural defences do most of the work: delimited untrusted content, narrow output schemas, citations that must resolve to approved sources, capability limits, Warden-controlled egress |
| **Contingency** | Tighten output schema validation; injection detection at ingestion |
| **Residual** | Low |

### RISK-15 — Schema migration loses a long project

**L2 × I5 = 10 · High · Owner: platform**

A four-year doctoral project spans many releases. A migration bug that corrupts a
dissertation is unforgivable.

| | |
|---|---|
| **Trigger** | Any migration failure |
| **Mitigation** | Snapshot before every migration; fixtures for every prior version in CI; forward-only with clean rollback. Continuous deployment means smaller, more frequent migrations — lower risk per change |
| **Contingency** | Halt the deploy; verify the restore path before any fix ships |
| **Residual** | Low |

### RISK-16 — Provider landscape shifts faster than we adapt

**L4 × I2 = 8 · Medium · Owner: AI lead**

| | |
|---|---|
| **Mitigation** | Adapter pattern; registry-driven model list; no agent depends on a specific model. Continuous deployment makes this a same-day fix |
| **Residual** | Low |

### RISK-17 — Accessibility falls behind

**L3 × I3 = 9 · Medium · Owner: frontend**

A dense multi-region layout and a custom editor are hard to make accessible.

| | |
|---|---|
| **Trigger** | Any WCAG 2.2 AA failure at a phase review |
| **Mitigation** | Automated axe on every build; keyboard traversal on every journey; screen-reader testing every release; the approval card reading order specified explicitly |
| **Contingency** | Block the phase review |
| **Residual** | Moderate |

### RISK-18 — The catalog is wrong about academic conventions

**L3 × I3 = 9 · Medium · Owner: product**

Twenty-four output types across disciplines and countries. Some of it will be
wrong, and confidently wrong guidance to a student who does not know better is a
real harm.

| | |
|---|---|
| **Mitigation** | Every budget and count cites its source; everything user-editable; uploaded templates supersede catalog defaults |
| **Residual** | Moderate |

---

## 3. Summary

| Score | Risks |
|---|---|
| **16 — Critical** | RISK-03 |
| **15 — Critical** | RISK-01, RISK-02 |
| **12 — High** | RISK-04, RISK-05, RISK-06, RISK-08, RISK-11, RISK-12 |
| **10 — High** | RISK-07, RISK-15 |
| **8–9 — Medium** | RISK-09, RISK-10, RISK-13, RISK-14, RISK-16, RISK-17, RISK-18 |

### 3.1 How revision 2 changed the risk profile

| Risk | Change |
|---|---|
| Provenance infeasibility (was the top risk) | **Retired.** No mandatory provenance system |
| Users losing work with no backup (was critical) | **Retired.** Server-side storage with managed backups |
| Local model weakness | **Retired.** No local models |
| Data breach exposing content | **New, and material.** RISK-07 |
| Server cost | **New.** RISK-05 |
| Browser editor performance | **New.** RISK-06 |
| Studio not differentiating | **New, and now the top product risk.** RISK-01 |
| Detection-evasion expectation gap | **New.** RISK-02 |

The net is a lower-variance profile: revision 1's top risk was a technical bet
that could have ended the product, and revision 2's top risks are execution
quality and operating cost, both of which are manageable incrementally.

---

## 4. Review

| Cadence | Activity |
|---|---|
| Phase review | Full register; rescore; close resolved; add new |
| Monthly | Critical and High only |
| On incident | Add or rescore; record what the incident revealed |

Closure requires the trigger metric having stayed clear for a full phase. A risk
closed without evidence is a risk hidden.
