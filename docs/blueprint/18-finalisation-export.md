# 18 — Finalisation and Export

Covers revision requirements #8 (finalisation) and #9 (export).

---

## 1. Finalisation stages

`[RECOMMENDATION]` Independently runnable, in any order, each producing
proposals the user accepts or rejects. None applies silently.

| Stage | Does | Never does |
|---|---|---|
| Language refinement | Grammar, punctuation, academic register, clarity | Change what a claim asserts |
| **Voice & refinement** | Flow, sentence variety, remove model tells, match the author's learned voice | **Target AI detectors** (§2) |
| Formatting | Apply venue rule pack: styles, margins, headings, numbering | Alter content |
| Consistency | Terminology, citation style, heading depth, tense, spelling variant | Resolve ambiguity unilaterally |
| Structure review | Sections and word budgets vs. output type | Reorganise without approval |
| Plagiarism awareness | Unattributed quotation, near-duplication of approved sources | Report a similarity score (§3) |
| Disclosure | Derive an accurate statement **if the user opts in** (§4) | Overstate or understate what the ledger records |

`[RECOMMENDATION]` Every stage writes a ledger entry, including voice
refinement. `[INFERRED]` The ledger is the user's own complete record; whether
any of it is *published* as a disclosure is a separate, user-controlled
decision (§4).

---

## 2. Output quality — humanized by default

Settled by owner decision; see
[C-06](./11-requirements-conflicts.md#c-06--output-quality-and-disclosure-control--resolved-by-owner-decision).

`[RECOMMENDATION]` **Natural, human-quality prose is the default state of all
output, not an optional pass.** There is no "raw model output" mode. Every
drafted section passes through voice refinement before the user sees it.

### Voice learning

`[RECOMMENDATION]` The system learns the author's academic voice from material
they supply — prior drafts, published work, submitted coursework, thesis
chapters — and writes in it.

`[OBSERVED]` `PaperProject.styleLearningEnabled` already exists. This decision
makes it central rather than an option.

Learned characteristics: sentence length distribution and rhythm · preferred
connectives and transitions · hedging strength (*"suggests"* vs *"demonstrates"*)
· terminology and preferred synonyms · paragraph length and argument shape ·
citation density and integration style (integral vs. parenthetical).

`[RECOMMENDATION]` The voice profile is **tier 1 data** — derived on the
device, stored locally, never transmitted
([21](./21-data-and-security.md)). `[INFERRED]` It is among the most personally
identifying artifacts the system holds; a writing fingerprint is not something
to sync casually.

`[RECOMMENDATION]` With no corpus supplied, the system falls back to
discipline-appropriate academic register and says so — *"Writing in general
academic style. Add samples of your writing to match your voice."*

### Refinement

Applied continuously, not as a final step: sentence variety, natural
transitions, removal of mechanical repetition and model tells, register
alignment to the venue, and consistency with the learned voice.

### Two constraints

`[RECOMMENDATION]`

1. **Meaning is never altered.** Refinement changes expression, never the
   claim. Comparison tooling exists to verify this, and a refinement that
   changes meaning is a defect.
2. **No detector targeting.** No evaluation against AI-detection tools, no
   prompts framed around evasion, no detector score surfaced or optimised
   against.

`[INFERRED]` The second constraint serves the quality commitment rather than
qualifying it. Detector behaviour changes without notice and is outside the
product's control; a system tuned to it degrades silently as classifiers
change. Voice learned from the author is a stable target that improves with
use. The stronger claim — *"this reads like you, because it learned how you
write"* — is also the more durable one.

---

## 3. Plagiarism awareness — and its limit

`[RECOMMENDATION]` The system checks what it can actually see:

- Text matching an approved source without quotation marks or attribution
- Near-duplication of an approved source's phrasing
- Quotations exceeding conventional length without block formatting
- Self-overlap with the user's own prior drafts in the vault

`[RECOMMENDATION]` It **does not** produce a similarity percentage.

`[INFERRED]` The system has no access to the corpora a real similarity service
checks against — published literature at scale, student submission databases,
the open web. A percentage would imply a comparison that never happened. A
false assurance here is worse than none, because the user would stop checking.

`[RECOMMENDATION]` The UI states this plainly: *"Checked against your approved
sources and prior drafts. This is not a substitute for your institution's
similarity check."*

---

## 4. Disclosure — user-controlled

Settled by owner decision; see
[C-06](./11-requirements-conflicts.md#c-06--output-quality-and-disclosure-control--resolved-by-owner-decision).

`[RECOMMENDATION]` **Declining is the default. Declaring is one action away.
Output quality is identical either way.**

`[INFERRED]` The last clause matters most. If declaring produced worse prose,
the choice would be coerced. Refinement and disclosure operate on different
things — expression and attribution — so they are independent by construction.

### If the user chooses to declare

`[RECOMMENDATION]` The statement is **derived from the ledger, never typed.**

```
1  Read ledger entries for this manuscript
2  Group by model, task, and section
3  Apply the venue's disclosure template and placement
4  Present for review — user may edit
5  Record the choice
```

Illustrative output:

> **Declaration of Generative AI and AI-assisted technologies in the writing
> process**
>
> During the preparation of this work the author used Claude (Opus 5) to draft
> initial text in the Introduction and Discussion sections, and Gemini 2.5 Pro
> to summarise 14 approved sources supporting the Literature Review. All
> AI-generated content was reviewed and edited by the author, who takes full
> responsibility for the content of the publication.

`[RECOMMENDATION]` Accuracy runs both ways. Overstating misrepresents
authorship as much as understating — a statement claiming AI drafted sections
the author wrote is equally wrong.

`[OBSERVED]` Placement comes from the venue rule pack. Elsevier requires the
declaration at the end of the manuscript, immediately above the references,
under a specific title; the current implementation already does this for one
publisher, and the rule pack generalises it.

### If the user declines

`[RECOMMENDATION]` Export proceeds with no disclosure section. The choice is
recorded locally. Prose is unchanged.

`[RECOMMENDATION]` Where the venue rule pack marks disclosure **mandatory**,
the readiness view states the obligation plainly and offers the derived
statement:

> *This venue requires an AI-use declaration. You have chosen not to include
> one. → Add declaration*

`[INFERRED]` Advisory, never blocking. The system cannot enforce a third
party's rule on its own user, and attempting to would be both unenforceable and
outside its authority. Informing the user is the honest limit of what it can
do — and it is what COPE and ICMJE mean by responsibility remaining with the
author.

### The ledger is unaffected

`[RECOMMENDATION]` Provenance is recorded regardless of disclosure choice.
`[INFERRED]` It is the *user's own* record: it drives revision history,
comparison, and the provenance report, and it means a user who later decides to
declare — or whose supervisor asks — can produce an accurate statement instead
of reconstructing one from memory. Tier 1, local, never transmitted.

---

## 5. Export formats

| Format | Priority | Rationale |
|---|---|---|
| **`.docx`** | Primary | `[OBSERVED]` implemented via `docx`. The dominant academic submission format |
| **`.odt`** | **Required, new** | Requirement #9. `[INFERRED]` Matters for institutions with open-source mandates and for LibreOffice users; the same document model can render it |
| **`.pdf`** | Primary | `[OBSERVED]` implemented via `pdfmake`, selectable text |
| **LaTeX / `.tex`** | Recommended | `[INFERRED]` Required by many conferences and STEM journals; a hard blocker for those venues ([14](./14-output-catalog.md) §5) |
| **`.md`** | Useful | Portability, version control, plain-text workflows |
| **BibTeX / RIS** | Recommended | `[OBSERVED]` importers exist; export closes the loop with reference managers |
| **Provenance report** | **Distinctive** | §6 |
| `.pptx` | Conditional | Only if presentations become a first-class output type |

`[RECOMMENDATION]` All formats render from the **single export model**.
`[OBSERVED]` `buildExportDocumentModel()` already establishes this pattern —
DOCX and PDF share one model, so the two renderers never diverge on which
fields come from where. `.odt` and LaTeX extend the same pattern.

`[RECOMMENDATION]` Editable formats (`.docx`, `.odt`, `.tex`, `.md`) must
preserve real structure — heading styles, not manual formatting — so downstream
tools and accessibility checkers work. `[INFERRED]` An export that *looks*
right but carries no style information fails the moment a supervisor opens the
navigation pane.

---

## 6. Provenance report

`[RECOMMENDATION]` A separate exportable artifact, produced from the ledger and
evidence graph:

- AI involvement per section, by model and task
- Every source: origin, retrieval date, approval date
- Claim-to-source support map
- Approval history, including revocations
- Requirement overrides and their stated reasons

`[INFERRED]` No competitor can produce this, because it requires owning both
the evidence graph and the manuscript. For a supervisor, examiner, or
institutional audit it answers the question the disclosure statement only
summarises. `[RECOMMENDATION]` It is the strongest candidate for the
institutional value proposition in [04](./04-market-position.md), and worth
treating as a headline capability rather than a byproduct.

---

## 7. Export gate

```
1  Resolve venue rule pack at effective date
2  Evaluate ALL blocking gates ([17](./17-compliance-engine.md))
3  Any blocking failure → refuse; list each with its remediation
4  Derive disclosure; present for review; user confirms, edits, or declines
5  Render per rule pack — placement, style, structure, formatting
6  Record the export in the ledger
```

`[OBSERVED]` Steps 2–5 exist today in reduced form: export refuses without
`confirmedAt`, and disclosure is placed before references per one publisher's
convention. The target generalises across venues and derives rather than
asserts.
