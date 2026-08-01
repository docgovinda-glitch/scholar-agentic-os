# 18 — Finalisation and Export

Covers revision requirements #8 (finalisation) and #9 (export).

---

## 1. Finalisation stages

`[RECOMMENDATION]` Independently runnable, in any order, each producing
proposals the user accepts or rejects. None applies silently.

| Stage | Does | Never does |
|---|---|---|
| Language refinement | Grammar, punctuation, academic register, clarity | Change what a claim asserts |
| **Readability & voice** | Flow, sentence variety, remove mechanical repetition, align register to venue | **Target AI detectors** (§2) |
| Formatting | Apply venue rule pack: styles, margins, headings, numbering | Alter content |
| Consistency | Terminology, citation style, heading depth, tense, spelling variant | Resolve ambiguity unilaterally |
| Structure review | Sections and word budgets vs. output type | Reorganise without approval |
| Plagiarism awareness | Unattributed quotation, near-duplication of approved sources | Report a similarity score (§3) |
| Disclosure | Derive the statement from the ledger | Understate or omit AI involvement |

`[RECOMMENDATION]` Every stage writes a ledger entry. `[INFERRED]` A
readability pass *is* AI assistance; omitting it from the record would make the
disclosure understate the AI's role — precisely the misrepresentation
requirement #8 prohibits.

---

## 2. Readability and voice — scope and boundary

Resolves [C-06](./11-requirements-conflicts.md#c-06--internal-conflict-in-the-requirements-completely-humanized-vs-no-detection-evasion).

**What it does.** Improves prose quality: varies sentence length and opening
structure, removes mechanical repetition and filler, aligns register to the
target venue, improves paragraph transitions.

**Four hard constraints:**

1. Every pass is recorded in the ledger as an AI edit.
2. Refined text remains covered by the disclosure statement. Refinement never
   removes an AI contribution from the record.
3. No detector targeting — no evaluation against AI-detection tools, no prompts
   framed around evasion, no "make this undetectable" affordance.
4. Substantive claims are never altered. A refinement that changes meaning is a
   bug, and comparison tooling exists to catch it.

`[RECOMMENDATION]` The phrase *"completely humanized"* is **not used** in
product or documentation. `[INFERRED]` It is false as stated — the output is
AI-assisted and declared as such. What improves is readability.

`[OBSERVED]` This is not hypothetical: the repository already contains
`humanizeSkill.ts`, and its own record documents detection-evasion prompt
language being found in `aiService.ts` and removed. The constraint exists
because the failure has occurred here before.

**On third-party "humanizer" packages** `[RECOMMENDATION]`: not specified as a
dependency. `[INFERRED]` The widely available packages in this category are
detection-evasion tools, which constraint 3 rules out; and an arbitrary
third-party repository in the path that touches every manuscript is a
supply-chain risk disproportionate to the benefit. The capability is a
prompt-and-rules skill inside the system, where its behaviour is auditable.

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

## 4. Disclosure

`[RECOMMENDATION]` **Derived from the ledger, never typed by the user.**

`[OBSERVED]` Today `aiUseDisclosure.disclosureText` is text the user confirms —
an assertion. Derivation converts it into an audit trail, which is the
institutional value identified in [04](./04-market-position.md).

### Derivation

```
1  Read ledger entries for this manuscript
2  Group by model, by task, by section
3  Apply the venue's disclosure template and placement
4  Present for review — user may edit or decline
5  Record the outcome
```

Illustrative output:

> **Declaration of Generative AI and AI-assisted technologies in the writing
> process**
>
> During the preparation of this work the author used Claude (Opus 5) to draft
> initial text in the Introduction and Discussion sections, and Gemini 2.5 Pro
> to summarise 14 approved sources supporting the Literature Review. A
> readability pass was applied to the Discussion. All AI-generated content was
> reviewed and edited by the author, who takes full responsibility for the
> content of the publication.

`[RECOMMENDATION]` Accuracy in both directions. Overstating is as wrong as
understating — a statement claiming AI drafted sections the user wrote
themselves misrepresents authorship just as much.

`[RECOMMENDATION]` **User-controlled**, per requirement #8: the user may edit
the derived text or decline disclosure entirely. Declining is recorded and
export proceeds without it. `[INFERRED]` The system's role is to make accurate
disclosure easy and correct, not to compel it.

`[OBSERVED]` Placement comes from the venue rule pack — Elsevier requires it at
the end of the manuscript, immediately above the references, under a specific
title. The current implementation already does this for one publisher; the rule
pack generalises it.

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
