# Submission Compliance Architecture — The Rubric

> **Doc ID:** 31 · **Status:** Design · **Depends on:** `14`, `30`, `42`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

How institutional and publisher requirements become checks that run while the
user writes.

---

## 1. The problem

Academic requirements live in documents nobody enjoys reading: a 40-page author
guideline PDF, a departmental handbook last revised in 2011, a Word template with
the real rules encoded in its styles, an email from a supervisor.

They are then checked once, at the end, by a human under deadline pressure — which
is why desk rejection on formatting is common and why students discover at
submission that their front matter is wrong.

**The Rubric's job:** turn those sources into typed, machine-evaluable rules, and
run them continuously.

### 1.1 The honest limits

Stated up front because a compliance engine that overclaims is dangerous.

| Limit | Consequence |
|---|---|
| Not every rule is automatable | "Write clearly" compiles to a checklist item, not a check |
| Extraction is imperfect | Every rule is a *proposal* requiring human confirmation (`REQ-CMP-8`) |
| Sources change | Snapshots are dated; sources older than 90 days are flagged |
| The user knows their institution better than we do | Every rule is editable and waivable (`REQ-CMP-4`) |

A compliance pass is evidence, not a guarantee. The UI says so at `G6`.

---

## 2. Architecture

```
REQUIREMENT SOURCES
 ├── Journal author guidelines (PDF, URL)
 ├── University regulations (PDF)
 ├── Department template (DOCX/ODT — rules live in the styles)
 ├── Conference template (LaTeX/DOCX)
 ├── Funder call document (PDF)
 ├── Assignment brief (PDF/DOCX)
 ├── Sample submission (a document known to have been accepted)
 ├── Venue profile (curated, shipped)
 └── Manual entry
            │
            ▼
   ┌─────────────────────┐
   │ EXTRACTION          │  AG-05 Requirement Analyzer
   │ parse → identify →  │  + deterministic template analysis
   │ classify → propose  │
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ HUMAN REVIEW        │  ← mandatory. Nothing binds without it
   │ confirm/edit/reject │
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ COMPILATION         │  typed rules with scope, severity, evaluator
   │ → THE RUBRIC        │
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐      ┌──────────────────┐
   │ CONTINUOUS          │◀────▶│ DRAFT (CDM)      │
   │ EVALUATION          │      └──────────────────┘
   └──────────┬──────────┘
              ▼
        FINDINGS → inline in the editor + Compliance panel
```

---

## 3. Rule model

```yaml
id: rule_a1f3
source:
  document: "journal-x-author-guidelines.pdf"
  locator: "p.4 §2.3"
  quote: "Manuscripts must not exceed 6,000 words excluding references."
  extracted_at: 2026-03-12
  confidence: 0.94
type: quantitative
scope: document                # document | section | element | metadata
severity: blocking             # blocking | required | advisory
evaluator:
  kind: word_count
  params:
    max: 6000
    exclude: [references, abstract]
message: "Manuscript exceeds the 6,000-word limit (currently {actual})."
remedy: "Reduce by {overage} words. The Discussion is 800 words over its budget."
auto_fixable: false
user_modified: false
waived: null
```

### 3.1 Rule types

| Type | Checks | Evaluation | Example |
|---|---|---|---|
| `structural` | Presence, order, nesting of sections | Deterministic | "Must contain a Methods section" |
| `quantitative` | Counts and limits | Deterministic | Word, page, figure, table, reference counts |
| `bibliographic` | Citation and reference correctness | Deterministic | "Vancouver style, numbered by first appearance" |
| `formatting` | Typography, spacing, margins, numbering | Deterministic | "Double-spaced, 12pt, 2.5cm margins" |
| `metadata` | Required declarations and fields | Deterministic | "Must include a data availability statement" |
| `stylistic` | Register, tense, person, terminology | Model-assisted | "Methods in past passive" |
| `ethical` | Required ethical disclosures | Deterministic presence + model-assisted adequacy | "Ethics approval reference required" |
| `content` | Substantive requirements | Model-assisted | "Impact section must address the funder's priorities" |

**Roughly 80% of rules are deterministic**, which is what makes continuous
evaluation feasible offline and within `NFR-PERF-4`'s 300 ms budget.

### 3.2 Severity

| Severity | At `G6` | Waivable | Use for |
|---|---|---|---|
| `blocking` | Prevents sign-off | No | Rules whose violation means rejection or ineligibility |
| `required` | Must be resolved or waived | Yes, with a reason | Real rules the user may have context on |
| `advisory` | Surfaced only | n/a | Best practice, and low-confidence extractions |

**Severity assignment rule:** an extracted rule inherits `blocking` only where the
source language is mandatory ("must", "will not be considered") *and* extraction
confidence is above 0.9. Everything else starts at `required`. Over-blocking
trains users to override, which destroys the mechanism.

### 3.3 Scope

| Scope | Evaluated against |
|---|---|
| `document` | The whole draft |
| `section` | Each matching section |
| `element` | Each figure, table, citation, heading |
| `metadata` | Project metadata, not prose |

---

## 4. Extraction

### 4.1 Per source type

| Source | Method |
|---|---|
| **Guidelines PDF/URL** | Parse to CDM → segment into requirement statements → classify → extract parameters → propose. Model-assisted throughout |
| **DOCX/ODT template** | **Deterministic.** Read styles, margins, spacing, numbering, section placeholders, front matter directly from the file. The highest-precision source available |
| **LaTeX template** | Parse class options, `\documentclass`, geometry, and bibliography style |
| **Sample submission** | Measure the observed document: structure, style, counts. Propose rules describing it, marked as *inferred from an example*, never as stated policy |
| **Venue profile** | Curated rule set, shipped and versioned. Still confirmed by the user |
| **Manual** | Guided form: type, scope, parameters, severity |

**The template path deserves emphasis.** A department's Word template contains
its formatting rules in machine-readable form. Extracting them requires no model
and produces no ambiguity. Where a template exists, it is the authoritative
source and its rules supersede prose extraction.

### 4.2 The extraction pipeline

```
Parse → Segment → Classify → Extract params → Score confidence → Deduplicate
      → Detect conflicts → Propose
```

**Confidence scoring** combines: language modality ("must" > "should" >
"may"), parameter explicitness (a number beats a description), source authority
(template > guidelines > sample), and cross-source agreement.

**Conflict detection** matters more than it appears. When the university handbook
says 12pt and the department template says 11pt, the system must surface the
conflict rather than picking one. The user resolves it, and the resolution is
recorded.

### 4.3 Review presentation

```
┌─────────────────────────────────────────────────────────┐
│  24 requirements found in journal-x-guidelines.pdf       │
│  Review each before it applies.        [Accept all ✓]   │
├─────────────────────────────────────────────────────────┤
│  ⚠ Low confidence — check these first (3)               │
│                                                          │
│  □ Figures should be "of sufficient quality"            │
│    Source: p.7 §4.1                                      │
│    We can't check this automatically. Keep it as a       │
│    checklist item?                                       │
│    [Keep as checklist] [Discard] [Make a rule myself]   │
├─────────────────────────────────────────────────────────┤
│  ✓ Word limit: 6,000 excluding references               │
│    Source: p.4 §2.3 · "Manuscripts must not exceed…"    │
│    Blocking · Quantitative              [Edit] [Remove]  │
└─────────────────────────────────────────────────────────┘
```

Low-confidence proposals sort first — the user's attention goes where it is worth
most. "Accept all" exists for the expert path (`11` §4.2) and still records a
single sign-off covering the set.

---

## 5. Continuous evaluation

### 5.1 Tiers

| Tier | Rules | Trigger | Budget |
|---|---|---|---|
| **Immediate** | Cheap deterministic (counts, presence) | Every edit, debounced 300 ms | < 50 ms |
| **Fast** | Deterministic requiring a document walk | 2 s after typing stops | < 300 ms |
| **Deferred** | Expensive deterministic (layout measurement, bibliography) | Section complete, gate transition | < 3 s |
| **Model-assisted** | Stylistic, content, ethical adequacy | Gate transition, explicit request | Budgeted |

Only the model-assisted tier costs money, and it does not run on every keystroke.
This is what makes `REQ-CMP-6` affordable.

### 5.2 Incremental evaluation

Re-evaluating every rule on every edit does not scale to a 100k-word document.
The engine maintains a dependency map from document regions to rules and
re-evaluates only affected rules:

- Editing a paragraph re-runs: that section's rules, and document-scope
  quantitative rules.
- Adding a citation re-runs: bibliographic rules and reference-count rules.
- Changing a heading re-runs: structural rules.

### 5.3 Offline

Every deterministic rule evaluates offline. Model-assisted rules are marked
`pending` with an explanation, and `G6` states clearly which checks have not run.
The system never implies a clean pass when checks were skipped.

---

## 6. Findings

```yaml
rule: rule_a1f3
status: fail                # pass | warn | fail | not_applicable | pending
location:
  section: discussion
  span: [1240, 1389]
actual: 6842
expected: "≤ 6000"
message: "Manuscript exceeds the 6,000-word limit (currently 6,842)."
remedy:
  text: "Reduce by 842 words."
  detail: "Discussion is 800 words over its budget; Introduction is 200 over."
  action: navigate_to_section
evaluated_at: timestamp
```

### 6.1 Presentation rules

- Grouped by severity, then location.
- Every finding navigates to its location **and** to its source clause
  (`REQ-CMP-7`).
- The remedy is specific. "Reduce by 842 words, mostly from the Discussion" beats
  "too long".
- Auto-fixable findings offer a one-click fix that the user applies — never
  applied automatically (`UX1`).
- Resolved findings disappear immediately; no stale state.

---

## 7. User control

| Capability | Behaviour |
|---|---|
| Edit a rule | Change parameters, severity, or message. Marked `user_modified`; re-extraction never overwrites it |
| Add a rule | Guided form. Full parity with extracted rules |
| Remove a rule | Removed from the Rubric; the source clause remains visible as unused |
| Waive a finding | `required` and `advisory` only. Reason required. Appears in the compliance report |
| Override severity | Downgrade permitted with a reason; upgrade freely |
| Re-extract | Re-runs extraction; preserves `user_modified` rules; shows a diff |

**Waivers are recorded and reported.** A waived rule is not a hidden rule — it
appears in the compliance report with its reason, so the user's supervisor or
editor can see what was consciously set aside.

---

## 8. Venue profiles

Curated, shipped rule sets for common venues.

```yaml
profile: elsevier-water-research
version: 3
updated: 2026-01-15
source_url: https://…
source_snapshot: blob_sha256
rules: [...]
confidence: curated
```

| Property | Rule |
|---|---|
| Versioned | Projects pin a version; updates are offered with a diff |
| Dated | Profiles older than 180 days are flagged as possibly stale |
| Confirmed | Still requires user sign-off at `G1` |
| Community-contributable | Via plugin, subject to review (`47` §7) |
| Never authoritative over a template | An uploaded template beats a profile |

Profiles ship for: the ten largest publishers' house styles, the six citation
styles' formal specifications, common conference templates (IEEE, ACM, LNCS), and
major funder schemes.

---

## 9. Grant proposals — the strict path

For `funder` compliance profiles (`14` §8), the cost of a false pass is
catastrophic: a non-compliant proposal is not assessed at all
(`26` Journey 6).

Additional rules:

| Rule | Rationale |
|---|---|
| Every extracted rule requires individual review — no "accept all" | The blast radius justifies the friction |
| Default severity is `blocking` | Funder rules are eligibility criteria, not preferences |
| Per-section limits are measured against rendered layout, not estimated | Page limits are physical |
| A "completeness against the call" check runs at `G6` | Missing sections are the most common disqualification |
| The compliance report is exportable for co-investigator review | Multiple people carry the risk |

---

## 10. Compliance report

Generated at `G6`, attachable to a submission (`REQ-CMP-10`).

| Section | Contents |
|---|---|
| Summary | Rule counts by status; overall readiness |
| Requirement sources | What was used, with dates and snapshot hashes |
| Passed | Every rule that passed, grouped by type |
| Waived | Every waiver with its reason |
| Not automated | Checklist items the system could not verify |
| Not evaluated | Model-assisted rules that did not run, with the reason |
| Attestation | What this report does and does not certify |

The final section is not boilerplate. It reads:

> This report records automated checks against requirements extracted from the
> sources listed above and confirmed by the author. It does not certify
> compliance: requirement sources may have changed, extraction may be incomplete,
> and some requirements cannot be checked automatically. The author remains
> responsible for meeting the venue's requirements.

---

## 11. Failure modes

| Failure | Response |
|---|---|
| Extraction finds nothing useful | State it plainly; offer manual entry and catalog defaults. Never fabricate rules |
| Extraction produces a wrong rule | User edits or removes it; the cost is one correction |
| Two sources conflict | Surface the conflict; user resolves; resolution recorded |
| A rule cannot be evaluated | Marked `pending` with the reason; visible at `G6` |
| Rule evaluation throws | That rule is marked errored; the run continues; logged |
| Source URL changed since extraction | Flagged by age; re-extraction offered with a diff |
| User waives everything | Permitted. The report shows it. Their submission, their responsibility |

---

## 12. Current state

**The deterministic core is implemented**: the rule/finding model, three rule
evaluators covering the tier that matters most for continuous evaluation
(§5.1's "roughly 80% of rules are deterministic"), and compilation of rules
directly from an Atlas output type — the machine-readable-template path
described in §4.1, applied to the one high-precision source that already
exists in this codebase (Atlas), rather than to DOCX style extraction, which
is not yet built.

| Module | Path | Covers |
|---|---|---|
| Rule/Finding model | `src/domain/compliance/types.ts` | §3 in full: source traceability (`document`, `locator`, `quote`, `confidence`), type, scope, severity, waiver |
| Evaluators | `src/domain/compliance/evaluators.ts` | `word_count`, `structural_presence`, `metadata_presence` (checks `CanonicalDocument.metadata`, for the `metadata` rule type's own example, "must include a data availability statement"), `claim_support` (checks a `domain/claim` `ClaimEvidenceGraph` for unsupported claims — `evaluateRule`/`evaluateRules` take it as an optional third argument, extending `RuleScope` with a `claims` value; every pre-existing evaluator kind ignores it, so this was backward-compatible), `readability` (checks Flesch-Kincaid grade level and/or jargon density via `domain/language/readability.ts` — the same pure logic `app/mesh`'s AG-18 Readability Analyst wraps, called directly here rather than through the agent runtime, since evaluating a document the Rubric already has in hand isn't an untrusted-caller situation), and `position_in_text` (checks whether one of a set of keywords appears within the first N words — a heuristic proxy, not real understanding of the sentence's meaning). A rule type with no evaluator returns `not_applicable`, never a false pass (§10, AG-22's QA rule) |
| Compilation from Atlas | `src/app/rubric/fromAtlas.ts` | The word-limit rule from `budget.totalWords` (excluding sections marked `countsTowardWordcount: false`), one blocking structural rule per required section, one `metadata_presence` rule per quality gate that sets `metadataKey` (OT-06's `ethics_approval_recorded` gate — orthogonal metadata, not document content), one `claim_support` rule per quality gate that sets `usesClaimGraph` — OT-04, OT-08, OT-20, and OT-22 all compile one, checking the project's Claim–Evidence Graph for unsupported claims — one `readability` rule per quality gate that sets `readabilityGate` — OT-17's participant-information-sheet gate compiles one scoped to its `appendices` section, OT-20 compiles two unscoped (audience-appropriate grade level, jargon density) — and one `position_in_text` rule per quality gate that sets `positionInTextGate` — OT-20's recommendation-in-first-200-words gate compiles one |
| Report / waivers | `src/app/rubric/rubric.ts` | `evaluateAgainstOutputType()`, `readyForG6`, `waiveRule()`, and `applyWaivers()` (reapplies previously-recorded waivers onto a freshly compiled rule set — `fromAtlas.ts` always compiles unwaived rules, so this is what lets a waiver survive a document resubmission rather than silently resetting). Reachable over HTTP via `PUT /api/projects/:id/document` (evaluates and recomputes G6), `GET /api/projects/:id/rubric` (re-fetches the last report), and `POST /api/projects/:id/rubric/waive` (records a waiver by rule id and reason, 400s on a blocking rule) — see `30` §10 |

86 tests, including the re-targeting case from `26` Journey 3 in miniature:
the same document evaluated against two different output types produces
different findings without the document itself changing.

### 12.1 A severity bug caught by testing, not by review

The first implementation let `waiveRule()` downgrade a rule of *any*
severity, including `blocking`, from `fail` to `warn`. §3's own severity
table says blocking rules are "Waivable: No" — writing the test for that
exact sentence caught the contradiction before it shipped. `waiveRule()` now
throws `RuleNotWaivableError` for a blocking rule, and the evaluator's
waiver downgrade (`isEffectivelyWaived()`) is unreachable for blocking
severity regardless of what a caller sets on the rule object, so the
guarantee holds even if something upstream constructs a rule with `waived`
already set.

### 12.2 What remains

| Gap | Status |
|---|---|
| Requirement-source PDF/URL extraction (§4) | Not built — needs a model call through `app/mesh`'s Requirement Analyzer, which doesn't exist yet |
| DOCX/ODT template style extraction (§4.1) | Not built — needs `app/ingestion`, which doesn't exist yet |
| Remaining rule types (`bibliographic`, `formatting`, `ethical`) | Evaluator not implemented; correctly reported as `not_applicable` rather than skipped silently. `content` and `stylistic` are now partially covered — `claim_support` and `readability` rules use them respectively — but a rule of either type with a different `evaluator.kind` still has no evaluator |
| Continuous re-evaluation on edit, tiering, and the 300ms budget (§5) | Not wired to anything — there is no live editor yet to trigger it |
| Venue profiles (§8) | Not built |
| Conflict detection across sources | Not applicable yet — only one source (Atlas) is implemented |
| Compliance report generation (§10) | The `RubricReport` structure exists; the human-readable attestation document is not yet assembled |

The former `src/services/journalGuidelinesService.ts`,
`src/components/ComplianceChecklistPanel.tsx`,
`src/components/SubmissionChecklistBuilder.tsx`, and
`src/services/sampleDocLearningService.ts` are unchanged and not yet
retired or integrated — they remain the reference point for the
requirement-source extraction path once `app/mesh` exists.
