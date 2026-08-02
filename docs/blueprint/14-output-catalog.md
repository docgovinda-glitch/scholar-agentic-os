# 14 — Academic Output Catalogue

Covers revision requirement #3. Defines what the system can help a user
produce, and what it knows about each before the user does.

`[RECOMMENDATION]` **Design intent: the system determines requirements so the
user does not have to already know them.** A first-year undergraduate does not
know their department's word count or citation style. The catalogue supplies a
defensible default; the venue rule pack ([17](./17-compliance-engine.md))
overrides it; the user overrides both.

---

## 1. Definition schema

Every output type is a data record, not code. Twelve attributes, per
requirement #3:

```
OutputType
  id, label, degreeLevels[], typicalDiscipline[]

  requiredInputs[]        what the user must supply
  optionalInputs[]        what improves the result
  expectedOutputs[]       artifacts produced at completion

  structure[]             ordered sections
    ├ heading             canonical name
    ├ subHeadings[]       conventional subdivisions
    ├ wordShare           % of total budget
    └ required            boolean

  tableOfContents         none | optional | required
  wordCount               { min, max, typical, excludes[] }
  referenceStyles[]       permitted, first = default
  formatting              { font, size, spacing, margins, numbering }
  fileFormats[]           accepted submission formats
  submissionRequirements[] what must accompany the document
```

`[RECOMMENDATION]` Three precedence rules, in order: **venue rule pack >
catalogue default > user override is always permitted and always recorded.**
An override is a fact about this project, never a change to the catalogue.

---

## 2. Word-count guidance

`[OBSERVED — external]` Ranges below are documented conventions, not universal
rules. Sources at the end.

| Level | Output | Typical range |
|---|---|---|
| Undergraduate | Dissertation | 8,000 – 15,000 |
| Master's | Dissertation / thesis | 15,000 – 25,000 |
| PhD (UK) | Thesis | 70,000 – 100,000 |
| PhD (US/India) | Dissertation | 80,000 – 120,000 |
| Any | Journal article | 3,000 – 8,000 |
| Any | Conference paper | 4,000 – 8,000 |
| Any | Abstract | 250 – 300 |

`[OBSERVED — external]` Most universities **exclude** bibliography, footnotes,
appendices, abstract, and acknowledgements from the official count. Exceeding
the limit by more than ~10% can trigger resubmission.

`[RECOMMENDATION]` The `excludes[]` field is therefore load-bearing, and the
word counter must report *both* raw and countable totals. `[INFERRED]` A tool
reporting only raw count will tell users they are over when they are not — a
false failure is worse than no check.

---

## 3. Structural conventions

`[OBSERVED — external]` **IMRaD** — Introduction, Methods, Results, Discussion
— is the dominant structure for original research across the sciences and much
of the social sciences. Typical shares for a 3,000–5,000 word article:
Introduction 15–20%, Methods 20–30%, Results 20–30%, Discussion 25–35%.

`[OBSERVED — external]` For an 80,000-word PhD thesis a documented distribution
is: Introduction 10%, Literature Review 20%, Methodology 15%, Results 25%,
Discussion 20%, Conclusion 10% — with the literature review typically the
longest single chapter.

`[RECOMMENDATION]` These become `wordShare` defaults, presented as budgets
rather than rules. Their value is telling a user that a 4,000-word introduction
in an 8,000-word article is disproportionate — a structural error, which
`[OBSERVED — external]` is the category behind the 40%+ of first submissions
requiring major revision.

---

## 4. Detailed definitions

Four worked examples spanning the audience. The remainder are summarised in §5
on the same schema.

### 4.1 Journal article

**Levels:** Master's, PhD, postdoctoral · **Structure:** IMRaD

| Attribute | Value |
|---|---|
| **Required inputs** | Research question; methodology; results or findings; target journal |
| **Optional inputs** | Prior thesis chapters; datasets; figures; co-author details; cover letter notes |
| **Expected outputs** | Manuscript; reference list; cover letter; disclosure statement; submission checklist |
| **Structure** | Title (—) · Abstract (5%) · Keywords (—) · Introduction (15%) · Literature Review (15%) · Methods (25%) · Results (25%) · Discussion (25%) · Conclusion (10%) · References (—) · Declarations (—) |
| **Table of contents** | None |
| **Word count** | 3,000–8,000; abstract 250–300. Excludes references, figure captions |
| **Reference styles** | Venue-dictated. `[OBSERVED]` Six implemented: APA 7, IEEE, MLA 9, Chicago, Harvard, Vancouver |
| **Formatting** | Venue rule pack; commonly double-spaced, 12pt serif, 1" margins, continuous line numbers |
| **File formats** | `.docx` primary; `.pdf` for review; LaTeX where the venue requires |
| **Submission requirements** | Cover letter · **AI-use disclosure** · conflict of interest · funding statement · data availability · ethics approval where applicable · ORCID · suggested reviewers |

`[OBSERVED]` The disclosure requirement is implemented — placed immediately
before references, gated on explicit confirmation.

### 4.2 PhD thesis / dissertation

**Levels:** PhD

| Attribute | Value |
|---|---|
| **Required inputs** | Research questions; methodology; results across studies; institutional handbook |
| **Optional inputs** | Published papers for integration; supervisor feedback; ethics documentation |
| **Expected outputs** | Full thesis; front matter; ToC; lists of figures/tables; appendices; declaration |
| **Structure** | Front matter · Introduction (10%) · Literature Review (20%) · Methodology (15%) · Results (25%) · Discussion (20%) · Conclusion (10%) · References · Appendices |
| **Table of contents** | **Required**, auto-generated, with lists of figures, tables, abbreviations |
| **Word count** | 70,000–100,000 (UK) / 80,000–120,000 (US, India). Excludes bibliography, footnotes, appendices |
| **Reference styles** | Institution-dictated; consistency across the whole document is itself a requirement |
| **Formatting** | University handbook: binding margin, page numbering by section, chapter-start rules |
| **File formats** | `.docx`, `.pdf`; `.odt` where the institution accepts it |
| **Submission requirements** | Declaration of originality · supervisor sign-off · ethics approval · embargo request where applicable · repository deposit |

`[INFERRED]` The distinguishing problem is *scale*: cross-chapter consistency,
a citation set in the hundreds, and a document too large to review in one pass.
Consistency checking matters more here than anywhere else in the catalogue.

### 4.3 Undergraduate coursework / assignment

**Levels:** Undergraduate

| Attribute | Value |
|---|---|
| **Required inputs** | Assignment brief; module code; deadline |
| **Optional inputs** | Lecture notes; reading list; marking rubric; prior feedback |
| **Expected outputs** | Essay or report; reference list; word-count declaration |
| **Structure** | Essay: Introduction (10%) · Body (75%, argument sections) · Conclusion (15%). Report: IMRaD or department template |
| **Table of contents** | Optional; typically required above ~3,000 words |
| **Word count** | 1,500–5,000. **±10% tolerance is the common convention** |
| **Reference styles** | Department-dictated; commonly Harvard or APA |
| **Formatting** | Module handbook; often anonymous marking — no name in the document |
| **File formats** | `.docx` or `.pdf`; submission portal usually dictates |
| **Submission requirements** | Plagiarism declaration · **AI-use declaration where the institution requires** · anonymised filename |

`[RECOMMENDATION]` The rubric is the highest-value optional input. If supplied,
gates check against the actual marking criteria rather than generic structure —
`[INFERRED]` this is the strongest reason an undergraduate would adopt the
system at all, and it is a different value proposition from the PhD case.

### 4.4 Research proposal / grant proposal

**Levels:** all · **Note:** the two share a schema, differ in emphasis

| Attribute | Value |
|---|---|
| **Required inputs** | Research question; significance; proposed method; timeline. Grants add: budget, team |
| **Optional inputs** | Preliminary data; prior publications; letters of support |
| **Expected outputs** | Proposal; timeline (Gantt); budget where applicable; lay summary |
| **Structure** | Title · Abstract/Lay summary (5%) · Background & Significance (20%) · Aims & Objectives (10%) · Methodology (30%) · Timeline (5%) · Expected Outcomes (10%) · Budget & Justification (10%) · References |
| **Table of contents** | Optional; funder-dependent |
| **Word count** | Research proposal 2,000–5,000; grant proposals **strictly funder-capped**, often per section |
| **Reference styles** | Funder or institution |
| **File formats** | `.docx`, `.pdf`; funder portals frequently mandate a template |
| **Submission requirements** | Funder-specific forms · ethics pre-approval · institutional sign-off · **per-section limits enforced independently** |

`[INFERRED]` Per-section word limits are the distinguishing constraint. A
whole-document counter is insufficient — the gate engine must evaluate limits
per section, which is why `wordShare` is structural and not advisory.

---

## 5. Remaining types

Same schema; abbreviated.

| Output | Levels | Words | Structure | Distinguishing requirement |
|---|---|---|---|---|
| **Master's dissertation** | Master's | 15,000–25,000 | Thesis structure, fewer chapters | Institutional handbook; ToC required |
| **UG dissertation** | Undergraduate | 8,000–15,000 | Thesis-lite | Supervisor sign-off; often anonymous |
| **Conference paper** | Master's, PhD | 4,000–8,000 | IMRaD, compressed | **Conference template mandatory**; often LaTeX; hard page limit |
| **Literature review** | all | 3,000–15,000 | Thematic or chronological | Search strategy must be documented; PRISMA if systematic |
| **Systematic review** | Master's, PhD | 6,000–12,000 | PRISMA | Protocol registration; PRISMA flow diagram; inclusion/exclusion criteria |
| **Book chapter** | PhD+ | 6,000–12,000 | Editor-specified | Editor's style sheet overrides publisher default |
| **Technical report** | all | 3,000–20,000 | Exec summary + body + appendices | Executive summary mandatory; often non-academic audience |
| **Policy paper / brief** | Master's, PhD | 1,500–5,000 | Problem · Evidence · Options · Recommendation | **Non-academic register**; recommendations must be actionable |
| **Presentation** | all | — (slides) | Narrative arc | Time limit, not word limit; speaker notes; accessible contrast |
| **Poster** | all | 500–1,000 | Visual-first | **Fixed physical dimensions**; legibility at distance; QR to full paper |
| **Textbook chapter** | PhD+ | 8,000–20,000 | Pedagogical | Learning objectives; exercises; glossary; instructor materials |
| **Abstract (standalone)** | all | 250–300 | Structured or unstructured | Venue dictates which; keyword limits |
| **Thesis-by-publication** | PhD | varies | Papers + linking narrative | **Co-author contribution statements**; permission to reuse published work |

`[RECOMMENDATION]` Two rows carry requirements the current system cannot
express and which should be scoped explicitly rather than discovered late:
posters need a **fixed-canvas visual layout**, and presentations need
**slide-based output**. `[INFERRED]` Both fall outside a
document-and-word-count model. Either commit to them as first-class output
classes or state that they are out of scope — offering them as text documents
would be a poor experience masquerading as coverage.

---

## 6. Requirement determination

`[RECOMMENDATION]` When a user selects an output type, the system resolves
requirements in this order and shows its work:

```
1  Catalogue default for (output type, degree level)
2  Venue rule pack, if a venue is named          → overrides 1
3  Uploaded template or exemplar, if provided    → overrides 2 where detectable
4  User override                                 → always wins, always recorded
```

`[RECOMMENDATION]` Every resolved requirement displays its **source and
confidence**: *"Word limit 8,000 — from University of X handbook, 2026-01"* or
*"Citation style APA 7 — catalogue default for your discipline; not confirmed
against your department."*

`[INFERRED]` This is what separates helping from guessing. A confidently wrong
requirement is worse than an acknowledged default, because the user will not
check it — the same failure mode as R-13 (stale rule packs), and it applies
equally to catalogue defaults.

---

## 7. Extensibility

`[RECOMMENDATION]` Output types are data, contributed the same way venue rule
packs are ([17](./17-compliance-engine.md)). A department can define its own
output type — a specific lab report format, a professional-doctorate portfolio
— without application changes.

`[OBSERVED]` Precedent exists: `src/types/documentTypes.ts` already defines ten
document types with metadata, section sets, word targets, and quality gates.
`[RECOMMENDATION]` It is the right shape and the wrong location — it should
move from source constant to versioned data, alongside the rule packs.

---

## Sources

- [Thesis Word Count Guide: Master's, PhD, and Bachelor's (2026)](https://howmanywords.app/blog/thesis-word-count-guide)
- [How Many Words in a Dissertation? (PhD & Masters Guide 2026)](https://www.wordcountertool.net/blog/how-many-words-in-a-dissertation)
- [Dissertation Length According to UK Standard — Key To Study](https://www.keytostudy.com/dissertation-length-according-to-uk-standard/)
- [How Long Should a Master's Thesis Be? (2026)](https://tesify.app/how-long-should-a-masters-thesis-be/)
- [Dissertation content and format — University of Bristol](https://www.bristol.ac.uk/academic-quality/pg/code-of-practice/assessment/content-format/)
- [What is IMRaD Format in Research? — Researcher.Life](https://researcher.life/blog/article/what-is-imrad-format-in-research/)
- [IMRaD structure — Aarhus University Studypedia](https://studypedia.au.dk/en/formal-requirements/imrad-structure)
- [Scientific Reports Formatting (2026)](https://manusights.com/blog/scientific-reports-formatting-requirements)
