# 17 — Compliance Engine

Covers revision requirement #6. Determines the rules that govern an output
**before drafting begins**, and validates against them continuously.

`[RECOMMENDATION]` **Design intent: the user should not need to already know
their requirements.** This is the requirement most often skipped by comparable
tools, and the reason a first-year undergraduate and a PhD candidate can use
the same system.

---

## 1. Venue rule packs

A **venue** is anything that imposes rules: a journal, publisher, university,
department, conference, or funder. All are the same object.

```
VenueRulePack
  venueId, name, kind, publisher?
  effectiveFrom, version, sourceUrl, reviewedAt

  disclosure   { required, placement, title, template, exemptions[] }
  citation     { styleId, referenceListHeading, inTextVariant }
  structure    { sections[], ordering, required[] }
  limits       { wordCountMin?, wordCountMax?, perSection{}, abstractMax? }
  formatting   { font, size, spacing, margins, numbering, anonymised }
  files        { acceptedFormats[], templateRef? }
  ethics       { requiredStatements[] }
  submission   { accompanyingItems[] }
```

`[OBSERVED]` This generalises what `documentExportService.ts` currently
hardcodes for one publisher — disclosure placed immediately before references,
per Elsevier's convention.

### Versioning is load-bearing

`[RECOMMENDATION]` `effectiveFrom` is mandatory. `[INFERRED]` A manuscript
submitted in March must be checkable against the rules in force in March, not
today's. Publisher policies changed materially during 2025–26 and continue to
diverge; without versioning, historical compliance claims become unverifiable.

`[RECOMMENDATION]` `sourceUrl` and `reviewedAt` are also mandatory, and
staleness is **surfaced to the user**, not hidden: *"These rules were last
verified 2026-03-14. Check the publisher's current guidance."*

`[INFERRED]` This addresses R-13, the second-highest risk in
[08](./08-risk-register.md). A stale rule pack produces *confidently wrong*
compliance output, which is worse than no guidance because the user will not
check it.

---

## 2. Determining requirements

```
1  Output type + degree level      → catalogue default ([14](./14-output-catalog.md))
2  Named venue                     → rule pack overrides
3  Uploaded template / exemplar    → detected values override, where confident
4  User override                   → always wins, always recorded
```

### Uploaded templates and exemplars

`[RECOMMENDATION]` Requirement #6 permits both. They are treated differently:

- **Template** — a document defining structure and formatting. Extractable with
  reasonable confidence: styles, margins, heading hierarchy, section order.
- **Exemplar** — a real prior submission. Weaker evidence: it shows one
  author's choices, which may not be requirements. `[INFERRED]` Values derived
  from an exemplar must be labelled as *observed in an example*, not *required*
  — presenting them as rules would manufacture constraints that do not exist.

`[OBSERVED]` Parsing infrastructure exists (`document_intelligence`, heading
detection). The extraction of *rules* from a parsed template is new.

`[RECOMMENDATION]` Extraction confidence is always shown, and low-confidence
values are proposed rather than applied.

### Every requirement shows its source

`[RECOMMENDATION]` Non-negotiable in the UI:

> Word limit **8,000** — *University of X handbook v3, effective 2026-01*
> Citation style **APA 7** — *catalogue default for Psychology; not confirmed against your department*
> Abstract max **250** — *you set this*

`[INFERRED]` Without provenance per requirement, a user cannot tell a verified
rule from a guess — and will trust both equally. This is the same failure mode
as R-13 applied at requirement granularity.

---

## 3. Gates

```
Gate
  id, appliesTo, severity: blocking | advisory
  evaluate(state) → pass | fail(reason, remediation)
  phase: intake | drafting | finalisation | export
```

`[RECOMMENDATION]` **`remediation` is mandatory** — the single action that
clears the gate. `[OBSERVED]` Existing gates block correctly but explain
inconsistently. A gate that blocks without explaining is a bug.

### Standard gates

| Gate | Severity | Phase |
|---|---|---|
| Every cited source approved | Blocking | Drafting → Export |
| No unsupported claims | Blocking at export | Continuous |
| Disclosure derivable and confirmed | Blocking | Export |
| Word count within limits (countable, per `excludes[]`) | Blocking if venue-set | Continuous |
| Per-section limits | Blocking if venue-set | Continuous |
| Required sections present | Blocking | Export |
| Citation style consistent | Blocking | Export |
| Required ethics statements present | Blocking | Export |
| Accompanying items prepared | Advisory | Export |
| Structural balance vs. output type | Advisory | Drafting |
| Anonymisation where required | Blocking | Export |

`[RECOMMENDATION]` Gates run **continuously**, not only at export. `[INFERRED]`
A word-limit failure discovered at export costs a rewrite; discovered at 60% it
costs an adjustment.

---

## 4. Readiness

`[RECOMMENDATION]` The workspace's primary signal ([13](./13-user-journey.md)):

```
Readiness for <venue> — <output type>

BLOCKING (3)
  ✗ 3 claims have no approved source        → Review claims
  ✗ Abstract is 340 words; limit is 250     → Shorten abstract
  ✗ Ethics statement required, not present  → Add statement

ADVISORY (1)
  ⚠ Introduction is 22% of budget; typical is 15%

READY (5)
  ✓ Disclosure derivable — 47 ledger entries
  ✓ All 34 cited sources approved
  ✓ Citation style consistent (APA 7)
  ✓ Required sections present
  ✓ Word count 7,840 / 8,000 countable
```

`[RECOMMENDATION]` Blocking failures prevent export. Advisory failures never
do. `[INFERRED]` Conflating them trains users to override, which destroys the
value of blocking.

---

## 5. Overrides

`[RECOMMENDATION]` Any *requirement* may be overridden. Overrides are recorded
with a timestamp and optional reason, and shown in the readiness view as
user-set.

`[RECOMMENDATION]` **Gate outcomes may not be overridden — only their inputs.**
`[INFERRED]` A user may raise a word limit they believe is wrong; they may not
declare a manuscript to have zero unsupported claims when it has three. The
first corrects the system's knowledge; the second falsifies its output.

`[RECOMMENDATION]` One deliberate exception: a user may **decline disclosure**
(requirement #8 makes it user-controlled). Declining is recorded, and export
proceeds without the statement. `[INFERRED]` The system's role is to make
accurate disclosure easy and correct, not to compel it — compulsion would be
both unenforceable and outside its authority.

---

## 6. What the system does not claim

`[RECOMMENDATION]` Gates report **what was checked**, never that a manuscript
*is compliant*.

`[INFERRED]` Real venue requirements exceed anything checkable here —
originality, contribution, methodological soundness, and the tacit expectations
of a specific editor. A product implying "this is compliant" would assume
liability it cannot discharge, and R-14 identifies this as a high-impact risk.

`[RECOMMENDATION]` UI language: *"12 of 12 checks passed"* — never *"Your
manuscript is compliant."* `[INFERRED]` The honest framing is also the
compliant one: COPE and ICMJE both require responsibility to remain with the
author.

---

## 7. Maintaining the rule set

`[INFERRED]` This is the moat ([04](./04-market-position.md)) and the largest
ongoing non-engineering cost. Treated as a product function, not a backlog
item:

- Rule packs are **data**, contributable without application changes.
- Each carries `sourceUrl` and `reviewedAt`; staleness is visible.
- `[RECOMMENDATION]` A review cadence per pack, with high-traffic venues
  reviewed most often.
- `[RECOMMENDATION]` Institutions and departments can contribute and maintain
  their own — `[INFERRED]` a university has both the authoritative knowledge
  and the strongest incentive for its own rules to be right.

`[RECOMMENDATION]` Administrator tooling for pack lifecycle — authoring,
review, staleness reporting, publication — is specified in
[20](./20-admin-platform.md).
