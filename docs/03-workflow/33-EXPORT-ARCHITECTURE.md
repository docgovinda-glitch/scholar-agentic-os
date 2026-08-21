# Export Architecture

> **Doc ID:** 33 · **Status:** Design · **Depends on:** `30`, `31`, `32`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

Producing the file the user submits. DOCX and ODT are first-class; everything
else is derived.

---

## 1. Principles

| # | Principle |
|---|---|
| E1 | **Editable formats are primary.** Academic work is reviewed, annotated, and revised by supervisors and editors. DOCX and ODT are the targets; PDF is a derivation |
| E2 | **Render from the CDM.** One canonical model, many writers. No format is the source of truth |
| E3 | **Formatting comes from the Rubric.** Export applies compiled rules, not app defaults |
| E4 | **Pre-flight before production.** Never emit a file that fails a blocking check |
| E5 | **Verify the output.** Structural validation before delivery; a file that fails is not delivered |
| E6 | **Export is server-side.** Rendering, layout measurement, and validation run in the service tier |
| E7 | **Export is never tier-gated.** The user's own content, on every plan including free |

---

## 2. Pipeline

```
   Technical Document Ready (G5 reviewed / Document saved)
        │
        ▼
┌───────────────────┐
│ 1. PRE-FLIGHT     │  Technical validity: document non-empty, title present
│                   │  (Academic Rubric recommendations surfaced as advisory)
└─────────┬─────────┘
          │ fail technical validity → report error
          ▼
┌───────────────────┐
│ 2. RESOLUTION     │  citations → formatted · cross-refs → numbers ·
│                   │  bibliography · TOC · figure/table numbering
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 3. LAYOUT         │  apply template formatting; measure where physical
│                   │  limits apply (page counts, poster dimensions)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 4. RENDER         │  format-specific writer (DOCX, ODT, PDF)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 5. VERIFY         │  structural container validation (magic bytes, headers)
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 6. DELIVER        │  deliver file attachment stream to user
└─────────┬─────────┘
```

---

## 3. Pre-flight

| Check | Severity | Behaviour |
|---|---|---|
| Document Existence & Title | Mandatory Technical Block | Export refused if document body or title is missing |
| Supported Export Format | Mandatory Technical Block | Export refused if format is unsupported |
| Structural Render & Verification | Mandatory Technical Block | Export refused if binary output fails container integrity |
| Rubric Compliance Findings | Advisory Assistance | Listed with locations; user may review, but export is permitted |
| Bibliography entries never cited | Advisory Assistance | Listed; the user decides |
| Unsupported claims | Advisory Assistance | Handled at `G5`/review; counts surfaced without blocking |
| Fonts unavailable | Advisory Assistance | Fallback font applied automatically |

The pre-flight report presents clear visibility: what is technically required, what is advisory guidance, and what recommendations exist. If technical pre-flight passes, format selection and file export remain immediately available.

---

## 4. Resolution

Turning the abstract document into a concrete one.

| Element | Resolution |
|---|---|
| In-text citations | Rendered by `domain/reference` in the project's style |
| Bibliography | Assembled from cited corpus entries; sorted per style |
| Footnotes / endnotes | Placed per style (Chicago notes-bibliography needs the notes variant) |
| Cross-references | Section, figure, table, and equation numbers assigned and substituted |
| Numbering | Figures, tables, equations numbered per the Rubric's scheme (continuous or per-chapter) |
| Table of contents | Generated from the heading tree to the configured depth |
| Lists of figures/tables | Generated |
| Front matter | Assembled per output type and Rubric |
| Index | Generated for OT-09 from marked terms |

### 4.1 Citation styles

Six styles at minimum (`REQ-CMP-3`), plus the Chicago notes variant:

| Style | In-text | Bibliography | Notes |
|---|---|---|---|
| APA 7 | Author–date | Alphabetical | — |
| MLA 9 | Author–page | Works Cited, alphabetical | — |
| Chicago (author–date) | Author–date | References | — |
| Chicago (notes–bibliography) | Superscript note | Bibliography | Footnotes or endnotes |
| Harvard | Author–date | Alphabetical | Institution variants exist |
| IEEE | Bracketed number | Numbered by first appearance | — |
| Vancouver | Superscript or bracketed number | Numbered by first appearance | — |

Style correctness is a golden-set obligation (`52` §4.3). A subtly wrong
bibliography is worse than an obviously wrong one, because nobody catches it.

---

## 5. Layout and measurement

Most rules are counts. Some are physical, and those require actual layout.

| Rule | Requires |
|---|---|
| Word limit | Counting per the Rubric's inclusion rules |
| **Page limit** | Rendering to the target template and measuring pages |
| **Poster dimensions** | Rendering at physical size |
| **Minimum font at viewing distance** | Physical measurement |
| Figure print resolution | DPI against physical placement size |

Page limits (OT-11, OT-16) cannot be estimated from word count — a conference
paper that is 8.2 pages when the limit is 8 is rejected, and no word-count
heuristic reliably predicts that. The layout engine renders to the template and
measures, and the finding says "8.2 pages against a limit of 8; the Discussion
runs onto page 9."

---

## 6. Format writers

### 6.1 DOCX — primary

| Aspect | Approach |
|---|---|
| Structure | Native Word styles mapped from CDM block types |
| Template | The user's institutional template is the base document; content flows into its styles |
| Tracked changes | Ledger spans map to `w:ins` / `w:del` revision marks with authorship |
| Comments | Comment threads map to Word comments |
| Citations | Rendered as text, with optional field codes for Zotero/Mendeley interop |
| Front matter | Section breaks, distinct headers/footers, roman then arabic numbering |
| TOC | Native Word TOC field, updatable in Word |
| Figures | Embedded with captions and cross-referenceable bookmarks |
| Equations | OMML |

**Must open without repair prompts in Word 2016+, LibreOffice 7+, and Google
Docs** (`REQ-EXP-6`). This is tested against real files in CI (`52` §4.4).

**Template fidelity is the hard part.** A department template has specific style
names, and content must land in *those* styles, not in ones we invent. Where a
required style is missing, export reports it rather than silently substituting.

### 6.2 ODT — primary

Full parity with DOCX. OpenDocument's tracked changes and comments map cleanly.
Verified against LibreOffice.

ODT is first-class rather than an afterthought because it is the default in much
of European and public-sector academia, and because a format the user can open
with free software is consistent with `P9`.

### 6.3 PDF — derived

Rendered from the laid-out document. Used for: final submission where required,
posters (where it is primary), and preview.

| Property | Requirement |
|---|---|
| Text | Selectable and searchable; never rasterised |
| Fonts | Embedded |
| Metadata | Title, author, keywords, language |
| Tagging | PDF/UA structure tags for accessibility |
| Links | Internal cross-references and DOIs as live links |
| Print | Exact dimensions for posters; correct bleed where specified |

### 6.4 Markdown — derived

Structure and citations preserved; formatting is not. Useful for version control,
static sites, and handing content to other tools. Citations render as
Pandoc-style keys with a companion `.bib`.

### 6.5 LaTeX — derived

Generates `.tex` plus `.bib`. Class and package selection follows the venue
template where known. Equations pass through natively.

**Scope is limited and stated:** LaTeX export is for users who will continue in
LaTeX, not a claim of round-trip fidelity. Full LaTeX authoring is out of scope
(`10` §7, `OQ-04`).

### 6.6 HTML — derived

Semantic HTML with embedded or linked assets. WCAG 2.2 AA compliant output.
Useful for supervisor review by link and for web publication.

### 6.7 EPUB — derived

For OT-09 book-length work. Reflowable, with a navigation document, embedded
fonts, and accessibility metadata.

---

## 7. Submission packages

For venues requiring multiple files (`REQ-EXP-7`):

| Component | Included when |
|---|---|
| Manuscript | Always |
| Title page (separate) | Anonymous review requires it |
| Anonymised manuscript | Double-blind venues |
| Cover letter | Journal submissions |
| Figures as separate files | Publisher requires (with per-figure format and DPI rules) |
| Tables as separate files | Publisher requires |
| Supplementary material | Present |
| Data availability / DMP | Rubric requires |
| Compliance report | User chooses |
| Authorship report | User chooses |
| Response to reviewers | Resubmissions |

Packaged as a ZIP with the venue's naming convention applied, plus a manifest
listing every file and its purpose.

### 7.1 Anonymisation

For double-blind venues, an automated pass removes or replaces: author names and
affiliations, acknowledgements, funding statements naming the team,
self-citations phrased as "our previous work", and document metadata.

**Every change is shown for review before the anonymised file is produced.**
Automated anonymisation that silently misses something is worse than none,
because the author stops checking.

---

## 8. Failure handling

| Failure | Response |
|---|---|
| Required template style missing | Report the style name; offer export without the template |
| Font unavailable | Substitute per a documented fallback chain; warn |
| Figure resolution too low for print | Blocking for posters, advisory elsewhere; state the actual and required DPI |
| Output fails structural validation | Do not deliver; retain diagnostics; report |
| Disk full | Fail before writing a partial file |
| Document exceeds writer limits | Report the specific limit; suggest splitting |
| Template corrupt | Report; offer export without it |

**Never deliver a broken file.** A corrupt DOCX discovered at 2am before a
deadline is the worst possible failure, and it is entirely preventable by
verifying before delivery.

---

## 9. Export record

Every export is recorded in the Ledger:

```yaml
export_id: exp_4471
at: 2026-03-28T16:04:11Z
format: docx
template: "university-thesis-template-2025.dotx"
rubric_version: 7
preflight: passed
integrity_override: null
authorship_at_export: 0.71
word_count: 19840
content_hash: sha256:…
```

This makes "which version did I submit?" answerable months later — a question
that arises constantly during revision cycles and viva preparation.

---

## 10. Performance

| Document | Target |
|---|---|
| 3,000 words, DOCX | < 2 s |
| 20,000 words with TOC and front matter, DOCX | < 8 s |
| 100,000 words, DOCX | < 30 s |
| 20,000 words, PDF with layout | < 15 s |
| Poster, print-ready PDF | < 10 s |

Export runs off the UI thread with progress and cancellation.

---

## 11. Current state

`src/services/documentExportService.ts` produces DOCX via the `docx` library and
PDF via `pdfmake`, and `src/components/DocumentExportPipeline.tsx` and
`SubmissionPackagingSuite.tsx` exist.

| Current | Target |
|---|---|
| DOCX and PDF | DOCX and ODT primary; five more derived |
| Rendered from component state | Rendered from CDM |
| App-default formatting | Rubric-driven formatting |
| No template ingestion | Institutional template as the base document |
| No pre-flight | Blocking pre-flight with the integrity gate |
| No output verification | Structural validation before delivery |
| No layout measurement | Physical measurement for page and dimension limits |
| No tracked-change export | Ledger spans → Word revision marks |
| No anonymisation | Reviewable anonymisation pass |

The `docx` library work is a reasonable base for the DOCX writer. ODT, layout
measurement, and template fidelity are new construction.
