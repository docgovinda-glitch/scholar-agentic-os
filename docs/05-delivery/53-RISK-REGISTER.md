# Risk Register

> **Doc ID:** 53 · **Status:** Design · **Depends on:** all

Scored risks with triggers, mitigations, and owners. Reviewed at every phase
review.

---

## 1. Scoring

**Likelihood** — L1 rare · L2 unlikely · L3 possible · L4 likely · L5 near-certain
**Impact** — I1 minor · I2 moderate · I3 serious · I4 severe · I5 existential
**Score** = L × I. Above 12 requires an active mitigation with an owner.

---

## 2. The register

### RISK-01 — Span-level provenance proves infeasible at scale

**L4 × I5 = 20 · Critical · Owner: platform lead**

Provenance that survives arbitrary editing across a 150k-word document is the
product's foundation (`32` §4). If anchoring degrades — attribution drift,
performance collapse, or divergence between text and Ledger — the central
differentiator fails and there is no fallback that preserves the vision.

| | |
|---|---|
| **Trigger** | Attribution loss in the Phase 1 editing test; latency above 50 ms; text–Ledger divergence |
| **Mitigation** | Built first (`50` §1); dedicated Phase 1 exit gate; 100% coverage on `domain/provenance`; the 10,000-operation stress test; divergence detection with read-only lock |
| **Contingency** | Stop and re-architect the editor. Do not proceed to Phase 2 (`50` §8) |
| **Residual** | Moderate — this is a genuinely hard engineering problem with no proven off-the-shelf solution |

### RISK-02 — Requirement extraction quality is too poor to trust

**L4 × I4 = 16 · Critical · Owner: product engineering**

The Rubric's value depends on turning a 40-page PDF into correct rules
(`31` §4). Poor extraction produces wrong rules, which is worse than none —
users who correct three wrong rules stop trusting the fourth.

| | |
|---|---|
| **Trigger** | Extraction precision below 0.90 on the golden set (`52` §4.6) |
| **Mitigation** | Precision weighted above recall; every rule is a proposal requiring confirmation; low-confidence sorted first; deterministic template extraction as the high-precision path; curated venue profiles; manual entry always available |
| **Contingency** | Ship with venue profiles and manual entry as the primary paths; extraction becomes an advisory assist |
| **Residual** | Moderate |

### RISK-03 — Users route around the gates

**L4 × I4 = 16 · Critical · Owner: product**

If gates feel like bureaucracy, users draft elsewhere and paste in — which
produces `imported` spans, a meaningless authorship report, and no evidence
binding. The product's guarantees evaporate without anything visibly breaking.

| | |
|---|---|
| **Trigger** | Imported-content proportion above 25% of exported documents; high `G0`–`G3` abandonment; large-paste events frequent |
| **Mitigation** | Expert path completes `G0`–`G3` in under five minutes (`11` §4.2); good defaults everywhere; each gate justified in the UI by the failure it prevents; import fidelity good enough that importing beats pasting |
| **Contingency** | Reduce gate friction, never gate count. Investigate which gate is failing rather than removing gates |
| **Residual** | Moderate — this is a product-design risk, not a technical one, and it is the most likely way the product fails while appearing to work |

### RISK-04 — Users lose work with no backup

**L4 × I4 = 16 · Critical · Owner: product**

Local-first means we cannot recover a dead laptop (`44` §7). A student losing
a thesis is a catastrophe for them and an existential reputational event for us,
regardless of how clearly we warned.

| | |
|---|---|
| **Trigger** | Backup configuration rate below 50%; any reported loss |
| **Mitigation** | Backup conversation at workspace creation; escalating prompts — the only escalating prompt in the product (`25` §10.2); one-action setup; verified restore, not just configured backup; warnings about cloud-sync folders and network mounts (`44` §8.1) |
| **Contingency** | Make backup configuration a blocking step at `G4` for long-form output types |
| **Residual** | Moderate — we can make it easy and loud; we cannot make it mandatory without breaking the local-only promise |

### RISK-05 — Local models are too weak on baseline hardware

**L3 × I4 = 12 · High · Owner: AI lead**

The free tier's usefulness and the privacy story both depend on local models
being adequate on 8 GB machines (`NFR-HW-1`). If a 7B model cannot produce a
usable draft section, "Maximum privacy" becomes a setting nobody can afford to
use.

| | |
|---|---|
| **Trigger** | Beta users on baseline hardware abandoning local models for cloud |
| **Mitigation** | Honest quality guidance per task (`41` §10.2); deterministic agents wherever possible, reducing model dependence; task-class binding so weak models handle only suitable tasks; hardware-aware recommendations |
| **Contingency** | Shift default presets toward cloud while keeping local as the genuine privacy option, and say so plainly rather than overselling local capability |
| **Residual** | Low-moderate — local model quality is improving fast, which favours us over time |

### RISK-06 — Import and export fidelity is inadequate

**L3 × I4 = 12 · High · Owner: frontend lead**

Marcus decides in 40 minutes (`26` Journey 5). Diego's supervisor never
installs anything and reviews in Word (Journey 2). Both depend on lossless
round-trips.

| | |
|---|---|
| **Trigger** | Import structure loss; DOCX repair prompts; tracked changes lost |
| **Mitigation** | DOCX/ODT as first-class rendered from CDM; structural validation before delivery (`33` §8); round-trip tests in CI; diff-against-original offered after export |
| **Contingency** | Narrow the supported import surface and be explicit about what is preserved |
| **Residual** | Moderate — DOCX is a large and quirky format |

### RISK-07 — The Console becomes a second Workbench

**L3 × I3 = 9 · Medium · Owner: product**

Scope creep pressure on the web surface is constant and each individual request
is reasonable. The cumulative result is two products at parity, maintained by a
team of three.

| | |
|---|---|
| **Trigger** | Requests to add panels, drafting, or version restore to the Console |
| **Mitigation** | The normative capability matrix (`20` §6); the explicit never-list (`23` §10); changing either requires amending both documents with a rationale |
| **Contingency** | Hold the line; the matrix exists precisely to make the answer stable |
| **Residual** | Low, if the documents are respected |

### RISK-08 — Onboarding loses users at the AI Setup Wizard

**L3 × I3 = 9 · Medium · Owner: product**

The Wizard is the highest-leverage screen and also the most complex. Twelve
providers with nine information fields each can overwhelm Amara.

| | |
|---|---|
| **Trigger** | Wizard completion below 85% (`25` §12) |
| **Mitigation** | Presets before detail; local-first ordering with a clear recommended default; full cards behind expansion; completable with zero cloud providers |
| **Contingency** | Add a one-click "just set it up for me" path that configures Ollama and explains what it did |
| **Residual** | Low |

### RISK-09 — A two-person team cannot sustain the operational surface

**L3 × I4 = 12 · High · Owner: platform lead**

Twelve providers, an agent registry, a plugin registry, three desktop platforms,
a cloud plane, and institutional customers is a lot of surface
(`10` §6).

| | |
|---|---|
| **Trigger** | Admin actions requiring engineering above 5%; on-call load appearing |
| **Mitigation** | Agent behaviour as configuration (`42` §9); feature flags with kill switches; managed cloud services; registry-driven updates avoiding desktop releases; runbooks (`49` §11) |
| **Contingency** | Reduce provider count; delay institutional tier; extend phase durations rather than adding surface |
| **Residual** | Moderate |

### RISK-10 — Discovery quality makes the approval queue noise

**L3 × I3 = 9 · Medium · Owner: AI lead**

If discovery returns 40 irrelevant candidates (`26` Journey 1), users
either reject everything and stop using discovery, or start rubber-stamping —
the worse outcome.

| | |
|---|---|
| **Trigger** | Approval rate outside the 40–75% band (`10` §8.2) |
| **Mitigation** | Discovery ships in Phase 4, after approval is proven with uploaded sources; ranking by relevance and credibility; query refinement offered rather than more results; deduplication across services |
| **Contingency** | Reduce default result count; make discovery more explicitly query-driven and iterative |
| **Residual** | Moderate |

### RISK-11 — An institution demands surveillance features

**L2 × I4 = 8 · Medium · Owner: product / founders**

An institutional customer asks for automatic authorship reports on every student
submission, or silent key escrow. The revenue is real; the request breaks
`32` §11.

| | |
|---|---|
| **Trigger** | The request, in a sales conversation |
| **Mitigation** | The boundary is written into `32` §11 and `49` §9 before any sales conversation happens; escrow requires a user-visible indicator enforced client-side and cannot be added silently |
| **Contingency** | Decline the requirement; offer the voluntary-report path instead. Losing the deal is the correct outcome |
| **Residual** | Low — the mitigation is architectural, not just policy |

### RISK-12 — Users stop reading AI suggestions

**L4 × I3 = 12 · High · Owner: product**

Suggestion acceptance above 85% probably means the user has stopped evaluating.
The product then produces text the user has technically "reviewed" but not read —
exactly the failure the Ledger exists to prevent, occurring inside the mechanism.

| | |
|---|---|
| **Trigger** | Acceptance rate above 85%; review-mode dwell times collapsing |
| **Mitigation** | Tracked as a risk signal, not a success metric (`10` §8.2); Review Mode presents evidence alongside each span; dwell time recorded (not enforced) |
| **Contingency** | Investigate whether suggestions have become trivially safe; consider surfacing the pattern to the user as information about their own habits |
| **Residual** | Moderate — there is a limit to how much a tool can make someone think |

### RISK-13 — Prompt injection via source documents

**L3 × I3 = 9 · Medium · Owner: AI lead**

The system feeds untrusted PDFs and web pages to models. A crafted document could
attempt to redirect an agent.

| | |
|---|---|
| **Trigger** | Any observed injection |
| **Mitigation** | Layered, with structural defences doing most of the work (`41` §9.1): delimited untrusted content, narrow output schemas, citations that must resolve to approved sources, capability limits, Warden-controlled egress |
| **Contingency** | Tighten output schema validation; add injection detection to ingestion |
| **Residual** | Low — an injection cannot introduce a source, exceed capabilities, or exfiltrate |

### RISK-14 — Schema migration loses a long project

**L2 × I5 = 10 · High · Owner: platform lead**

A four-year doctoral project spans dozens of releases (`45` §8). A migration
bug that corrupts a dissertation is unrecoverable and unforgivable.

| | |
|---|---|
| **Trigger** | Any migration failure in testing or the field |
| **Mitigation** | Permanent snapshot before every migration; migration fixtures for every prior version in CI; forward-only with clean rollback; downgrade refused rather than attempted |
| **Contingency** | Halt the release; restore path verified before any fix ships |
| **Residual** | Low, with discipline |

### RISK-15 — Provider landscape shifts faster than we adapt

**L4 × I2 = 8 · Medium · Owner: AI lead**

Models, pricing, and APIs change monthly. Hardcoded assumptions age badly.

| | |
|---|---|
| **Trigger** | A provider deprecating a model we depend on |
| **Mitigation** | Signed cloud registry updatable without a client release (`40` §8.3); adapter pattern isolating provider differences; no agent depends on a specific model |
| **Contingency** | Registry update within hours |
| **Residual** | Low |

### RISK-16 — Free tier costs more than projected

**L2 × I3 = 6 · Low · Owner: platform lead**

`NFR-COST-1` targets under USD 0.05 per free user per month.

| | |
|---|---|
| **Trigger** | Cost per free user exceeding target |
| **Mitigation** | Local compute; ciphertext-only Relay; no managed credits on free; CDN-cached registry |
| **Contingency** | Cap free-tier sync storage; the architecture already avoids the expensive paths |
| **Residual** | Low — this is the risk the local-first architecture most directly retires |

### RISK-17 — Accessibility falls behind

**L3 × I3 = 9 · Medium · Owner: frontend lead**

A dense panel-based desktop app with a custom editor is hard to make accessible,
and provenance is a visual mechanism carrying integrity-critical information
(`21` §6.1).

| | |
|---|---|
| **Trigger** | Any WCAG 2.2 AA failure at a phase review |
| **Mitigation** | Automated axe on every build; keyboard traversal on every journey; screen reader testing every release; non-visual provenance equivalents specified |
| **Contingency** | Block the phase review until resolved |
| **Residual** | Moderate |

### RISK-18 — The catalog is wrong about academic conventions

**L3 × I3 = 9 · Medium · Owner: product**

Twenty-four output types with word budgets and structures, applied across
disciplines and countries. Some of it will be wrong, and confidently wrong
guidance to a student who does not know better is a real harm.

| | |
|---|---|
| **Trigger** | User reports of incorrect defaults |
| **Mitigation** | Every budget and count must cite its source (`14` §11.1); everything user-editable; institution and discipline overrides; uploaded templates and handbooks supersede catalog defaults |
| **Contingency** | Downgrade a contested default to a prompt rather than a proposal |
| **Residual** | Moderate — heterogeneity is inherent to the domain |

---

## 3. Risk summary

| Score | Risks |
|---|---|
| **20 — Critical** | RISK-01 |
| **16 — Critical** | RISK-02, RISK-03, RISK-04 |
| **12 — High** | RISK-05, RISK-06, RISK-09, RISK-12, RISK-14 (10) |
| **8–9 — Medium** | RISK-07, RISK-08, RISK-10, RISK-11, RISK-13, RISK-15, RISK-17, RISK-18 |
| **6 — Low** | RISK-16 |

### 3.1 The four that matter most

**RISK-01** is a technical bet that either works or the product does not exist.
It is tested first, deliberately.

**RISK-03** is the most likely way this product fails *while appearing to
succeed* — users completing projects with the gates satisfied and the content
pasted in from elsewhere. It is a design risk with no technical mitigation, only
a UX one.

**RISK-04** is the cost of the local-first architecture, paid by users, and the
one that would generate the worst possible story about us.

**RISK-02** determines whether compliance is the product's strongest feature or
an unreliable one.

---

## 4. Review

| Cadence | Activity |
|---|---|
| Phase review | Full register; rescore; close resolved; add new |
| Monthly | Critical and High only |
| On incident | Add or rescore the relevant risk; record what the incident revealed |

A risk closed without evidence is a risk hidden. Closure requires the trigger
metric having stayed clear for a full phase.
