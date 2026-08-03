# Output Type Catalog — Atlas

> **Doc ID:** 14 · **Status:** Design · **Depends on:** `02`, `10`, `30`, `31`
> **Revision:** 2 — website-only. Surface and architecture passages updated; see `README.md` rev key.

Atlas is the subsystem that knows what academic artefacts are. This document is
its content specification: 24 output types, each with the structure, intake
schema, quality gates, and workflow variant that make "What do you want to
produce?" a useful first question.

---

## 1. Why the catalog exists

A blank editor is a design failure for academic writing. The document a student
must produce is already heavily constrained — by discipline convention, by
institutional regulation, by publisher requirement — and those constraints are
knowable *before the first word*. The catalog encodes them.

The catalog is also the mechanism by which the system teaches. Amara (`10` §2, P1)
does not know what a literature review's structure should be. The catalog does,
and it explains itself as it proposes.

**Design constraint:** the catalog is *data*, not code. Adding an output type,
correcting a word budget, or adding a discipline variant is a catalog edit or a
plugin, never a change to the Conductor or the editor (`REQ-OUT-8`).

---

## 2. The output type schema

Every catalog entry conforms to this shape. Field semantics are normative.

```yaml
id: OT-07                              # stable identifier
label: "Master's Thesis"
aliases: ["masters dissertation", "MSc thesis"]
family: long_form                      # see §3
academic_levels: [masters]
typical_disciplines: [all]

structure:
  variant: chapter_based               # see §4
  sections:                            # ordered; nesting permitted
    - key: title_page
      required: true
      counts_toward_wordcount: false
      guidance: "..."
    - key: abstract
      required: true
      word_budget: {min: 200, max: 350}
      guidance: "..."
  front_matter: [...]
  back_matter: [...]

budget:
  total_words: {min: 15000, max: 25000, typical: 20000}
  distribution: {intro: 0.10, litreview: 0.25, ...}

sources:
  target_count: {min: 50, typical: 80}
  recency_expectation: "majority within 10 years"
  type_mix: {peer_reviewed: 0.7, ...}

citation:
  default_style: institution_dependent
  common_styles: [apa7, harvard, chicago]

intake_schema:                         # see §5
  required: [...]
  recommended: [...]
  optional: [...]

quality_gates: [...]                   # see §6
workflow_variant: long_form_chaptered  # see §7
compliance_profile: institutional      # see §8
export_defaults: {format: docx, ...}
```

### 2.1 Field notes

- **`counts_toward_wordcount`** matters more than it appears. Institutions
  disagree about whether the abstract, references, and appendices count. The
  Rubric can override per project; the catalog supplies the common default.
- **`distribution`** is advisory. It drives the initial budget proposal at `G3`
  and the "this section is running long" advisory during `G4`.
- **`recency_expectation`** is a rule generator, not a hard filter. A history
  thesis citing 1890 sources is correct; a clinical review citing only 1990s
  trials is not.

---

## 3. Output families

Twenty-four types group into six families. The family determines the workflow
skeleton; the type determines the detail.

| Family | Types | Defining characteristic | Workflow variant |
|---|---|---|---|
| **Short-form academic** | OT-01…OT-05 | Single-pass, one sitting to one week, one structure | `short_form` |
| **Long-form academic** | OT-06…OT-09 | Chapter-based, months, independently-gated sections | `long_form_chaptered` |
| **Publication** | OT-10…OT-14 | Venue-constrained, external review, resubmission cycles | `venue_targeted` |
| **Proposal & funding** | OT-15…OT-17 | Persuasive, budget-bearing, hard deadlines, funder rules | `proposal` |
| **Applied & professional** | OT-18…OT-21 | Practitioner audience, non-standard structure | `applied` |
| **Presentation** | OT-22…OT-24 | Visual-first, word-sparse, layout-constrained | `visual` |

---

## 4. Structure variants

| Variant | Shape | Used by |
|---|---|---|
| `linear` | Ordered sections, no nesting beyond H2 | Essay, abstract, policy brief |
| `imrad` | Introduction, Methods, Results, and Discussion | Journal article, lab report, conference paper |
| `chapter_based` | Chapters containing sections; independent gating | Thesis, dissertation, book, monograph |
| `thematic` | Sections organised by theme rather than sequence | Literature review, review article |
| `argumentative` | Claim → evidence → counter → resolution | Essay, position paper, policy brief |
| `slide_deck` | Slides with speaker notes | Presentation |
| `poster_grid` | Fixed-region spatial layout | Poster |
| `funder_prescribed` | Structure dictated verbatim by the funder | Grant proposal |

---

## 5. Intake schema semantics

Every output type defines its intake fields in three tiers. This is what makes
the form *specific* rather than generic (`REQ-OUT-4`).

| Tier | Meaning | UI treatment | Can proceed without? |
|---|---|---|---|
| **Required** | Cannot produce a sensible document without it | Prominent, validated | No |
| **Recommended** | Materially improves output; system will infer if absent | Shown with inferred default | Yes, with the inference visible |
| **Optional** | Refinement | Collapsed under "More detail" | Yes |

### 5.1 Universal intake fields

Present on every output type:

| Field | Tier | Notes |
|---|---|---|
| Working title | Required | May be provisional; the system will suggest refinements later |
| Topic / research area | Required | Free text; drives discovery |
| Academic level | Required | Sets register, depth, and source expectations |
| Discipline | Required | Selects conventions and default style |
| Deadline | Recommended | Drives pacing and milestone prompts |
| Institution | Recommended | Triggers institution-specific rule lookup |
| Language and variant | Recommended | Defaults to UI language; en-GB vs en-US matters for spelling rules |
| Word limit | Recommended | Defaults from catalog; overridden by Rubric if a rule exists |
| Citation style | Recommended | Defaults from catalog + institution |
| Prior work to build on | Optional | Links Vault material |

### 5.2 Per-field guidance contract

Every field MUST supply four things (`REQ-OUT-5`):

1. **What it is** — one sentence, no jargon.
2. **Why it matters** — the consequence of getting it wrong.
3. **An example** — concrete, from the user's discipline where possible.
4. **A default with rationale** — never an empty required field
   (`REQ-OUT-7`).

Worked example, for `research_question` on OT-07:

> **Research question** — *Required*
> **What it is:** The single question your thesis answers.
> **Why it matters:** Every chapter must serve it. A vague question produces a
> thesis that cannot be examined.
> **Example:** "How did municipal water policy in Lagos change between 2010 and
> 2020, and what drove those changes?"
> **If you're not sure:** Start with your topic and the word "how" or "why". We
> will help you sharpen it at the structure stage — a provisional question is
> normal and expected at this point.

That last line exists specifically for Amara. It converts a blocking unknown into
a permitted provisional answer.

---

## 6. Quality gates

Per-type checks evaluated during `G4` and enforced at `G6`. Distinct from Rubric
rules: quality gates are intrinsic to the *type*; Rubric rules come from the
*venue*.

| Gate class | Example | Severity default |
|---|---|---|
| Structural completeness | Required section present and non-empty | blocking |
| Budget adherence | Section within ±20% of budget | advisory |
| Source sufficiency | Meets `target_count.min` | required |
| Claim support | Unsupported claim rate under threshold | required |
| Style consistency | One citation style throughout | blocking |
| Abstract constraints | Within word limit; no citations if venue forbids | required |
| Methodological disclosure | Methods section names design, sample, analysis | required (empirical types) |
| Ethical statement | Present where human/animal subjects declared | blocking (empirical types) |
| Terminology consistency | Key terms used consistently | advisory |

---

## 7. Workflow variants

How the eight gates (`30` §3) specialise per family.

| Variant | Gate specialisation |
|---|---|
| `short_form` | Gates run once, linearly. `G3` produces a flat outline. `G4` drafts section by section in one pass |
| `long_form_chaptered` | `G3`–`G5` run **per chapter** with independent state. `G2` is continuous across the project's life. `G6`/`G7` run once at the end |
| `venue_targeted` | `G1` is venue-driven and re-runnable; changing venue re-compiles the Rubric without touching content (`REQ-CMP-9`). Adds post-`G7` reviewer-response loop |
| `proposal` | `G1` is funder-prescribed and strict. Adds a budget-narrative sub-workflow and a feasibility check at `G5` |
| `applied` | `G0` captures audience and decision context explicitly. `G5` weights clarity over academic register |
| `visual` | `G3` produces a slide/region plan, not prose sections. `G4` generates content per region with strict density limits. `G6` checks legibility and contrast, not just format |

---

## 8. Compliance profiles

| Profile | Requirement sources | Strictness |
|---|---|---|
| `coursework` | Module handbook, assignment brief | Advisory-heavy |
| `institutional` | University regulations, department template | Blocking on structure and format |
| `venue` | Journal/conference author guidelines | Blocking on everything the venue states |
| `funder` | Funder call documents | Blocking; non-compliance means ineligibility |
| `professional` | Organisational template or none | Light |

---

## 9. The catalog

### Family: Short-form academic

---

#### OT-01 — Assignment

| | |
|---|---|
| **Levels** | Undergraduate, master's |
| **Structure** | `linear` |
| **Budget** | 800–3,000 words (typical 1,500) |
| **Sources** | 5–15, majority peer-reviewed |
| **Default style** | Institution-dependent; Harvard/APA common |
| **Compliance** | `coursework` |
| **Workflow** | `short_form` |

**Sections:** Title/cover · Introduction · Body (task-dependent) · Conclusion ·
References · Appendices (optional)

**Type-specific intake:** Assignment brief upload (Required — this is the single
highest-value input and drives Rubric compilation) · Module code · Marking rubric
upload (Recommended) · Question or task statement (Required) · Word limit and
whether references count (Required).

**Notes.** The most common first project. The assignment brief upload is what
turns this from a generic essay tool into something useful: the brief usually
contains the word limit, the question, the weighting, and the deadline. Atlas
extracts all four and pre-fills the form.

---

#### OT-02 — Essay

| | |
|---|---|
| **Levels** | Undergraduate, master's |
| **Structure** | `argumentative` |
| **Budget** | 1,000–5,000 words (typical 2,500) |
| **Sources** | 8–25 |
| **Default style** | Discipline-dependent (MLA humanities, APA social science) |
| **Compliance** | `coursework` |
| **Workflow** | `short_form` |

**Sections:** Introduction with thesis statement · Argument sections (one per
claim) · Counter-argument · Conclusion · References

**Type-specific intake:** Essay question (Required) · Position or thesis
statement (Required, with heavy guidance — this is where most undergraduates
struggle) · Argument type: analytical / persuasive / comparative / evaluative
(Required) · Required texts (Recommended).

**Quality gates:** Thesis statement present in the introduction (blocking) ·
Each body section advances the thesis (advisory) · Counter-argument addressed
(required for persuasive/evaluative).

**Notes.** The `argumentative` structure variant here is doing real work: the
outline at `G3` is a claim tree, not a section list, and `G5` checks that each
claim has support and that the conclusion follows from the claims.

---

#### OT-03 — Report

| | |
|---|---|
| **Levels** | Undergraduate, master's, professional |
| **Structure** | `linear` with numbered sections |
| **Budget** | 1,500–8,000 words (typical 3,500) |
| **Sources** | 10–30 |
| **Compliance** | `coursework` or `professional` |
| **Workflow** | `short_form` |

**Sections:** Title page · Executive summary · Contents · Introduction ·
Methodology (if applicable) · Findings · Discussion · Conclusions ·
Recommendations · References · Appendices

**Type-specific intake:** Report purpose (Required) · Audience (Required —
changes register substantially) · Whether recommendations are expected
(Required) · Data sources (Recommended) · Numbered-heading convention
(Recommended).

**Notes.** Distinguished from the essay by the recommendations section and the
executive summary. The executive summary is generated *last* and is the one place
the system will draft a summary of the user's own text rather than from sources.

---

#### OT-04 — Abstract (standalone)

| | |
|---|---|
| **Levels** | All |
| **Structure** | `linear`, single block or structured |
| **Budget** | 150–500 words |
| **Sources** | Usually 0 |
| **Compliance** | `venue` |
| **Workflow** | `short_form` |

**Sections:** Background · Objective · Methods · Results · Conclusion (structured
variant) or a single paragraph (unstructured variant).

**Type-specific intake:** Abstract type: structured / unstructured (Required) ·
Word limit (Required — venues are absolute about this) · Source document
(Recommended — if the full work exists, the abstract derives from it) · Keywords
required (Recommended) · Whether citations are permitted (Required; most venues
forbid).

**Notes.** Frequently the entry point for conference submission. When a source
document is supplied, this becomes a *derivation* workflow: every claim in the
abstract must bind to a span in the user's own document, which is a strong
guarantee against overstatement.

---

#### OT-05 — Seminar Paper

| | |
|---|---|
| **Levels** | Master's, doctoral |
| **Structure** | `linear` or `thematic` |
| **Budget** | 3,000–8,000 words |
| **Sources** | 20–40 |
| **Compliance** | `institutional` |
| **Workflow** | `short_form` |

**Sections:** Introduction · Theoretical framework · Analysis · Discussion ·
Conclusion · References

**Type-specific intake:** Seminar topic and convenor's framing (Required) ·
Whether presentation accompanies (Recommended — triggers a linked OT-22) ·
Theoretical tradition (Recommended).

**Notes.** Common in European graduate programmes. Often paired with a
presentation; the system offers to create a linked OT-22 project sharing the
same corpus.

---

### Family: Long-form academic

---

#### OT-06 — Undergraduate Dissertation / Capstone

| | |
|---|---|
| **Levels** | Undergraduate (final year) |
| **Structure** | `chapter_based` |
| **Budget** | 6,000–12,000 words (typical 8,000) |
| **Sources** | 30–60 |
| **Compliance** | `institutional` |
| **Workflow** | `long_form_chaptered` |

**Chapters:** Introduction · Literature Review · Methodology · Results/Findings ·
Discussion · Conclusion. Front matter: title page, declaration, acknowledgements,
abstract, contents, lists of tables and figures.

**Type-specific intake:** Research question (Required, heavy guidance) ·
Empirical or theoretical (Required — changes whether Methodology and Results
appear) · Ethics approval status (Required if empirical, blocking) · Supervisor
name (Recommended) · Department handbook upload (Recommended, high value).

**Notes.** For most users this is their first long-form project and the first
time chapter-level gating matters. Milestone prompts and backup prompts are
tuned aggressively here (`RISK-04`).

---

#### OT-07 — Master's Thesis

| | |
|---|---|
| **Levels** | Master's |
| **Structure** | `chapter_based` |
| **Budget** | 15,000–25,000 words (typical 20,000) |
| **Sources** | 50–100 |
| **Compliance** | `institutional` |
| **Workflow** | `long_form_chaptered` |

**Chapters:** Introduction · Literature Review · Theoretical Framework
(discipline-dependent) · Methodology · Results · Discussion · Conclusion.
Front matter: title page, declaration of originality, abstract, acknowledgements,
contents, lists of tables/figures/abbreviations. Back matter: references,
appendices.

**Budget distribution:** intro 10% · literature 25% · framework 10% · methodology
15% · results 20% · discussion 15% · conclusion 5%.

**Type-specific intake:** Research question and sub-questions (Required) ·
Methodology type: qualitative / quantitative / mixed / theoretical (Required) ·
Data collection method (Required if empirical) · Ethics approval reference
(Required if human subjects; blocking) · Institutional template upload
(Recommended, very high value) · Submission format: single volume / by
publication (Recommended).

**Quality gates:** Declaration of originality present (blocking) · Each chapter
within budget ±20% (advisory) · Methodology names design, sampling, and analysis
(required) · Research question answered explicitly in the conclusion (required) ·
Every chapter referenced in the introduction's roadmap (advisory).

**Notes.** The reference implementation of `long_form_chaptered`. Diego's persona
drives this entry. Chapters gate independently so a supervisor can review Chapter
2 while Chapter 3 is drafted. Project state must survive five months and multiple
app versions (`REQ-LOC`, `45` §8).

---

#### OT-08 — Doctoral Dissertation

| | |
|---|---|
| **Levels** | Doctoral |
| **Structure** | `chapter_based` |
| **Budget** | 40,000–100,000 words (discipline-dependent; typical 70,000) |
| **Sources** | 150–400 |
| **Compliance** | `institutional` |
| **Workflow** | `long_form_chaptered` |

**Chapters:** As OT-07, plus: multiple substantive/empirical chapters,
contribution-to-knowledge statement, limitations, future work. Supports the
"thesis by publication" variant where chapters are published papers with a
connecting narrative.

**Type-specific intake:** All of OT-07, plus: Thesis format: monograph / by
publication / hybrid (Required — restructures everything) · Contribution claim
(Required) · Viva/defence jurisdiction (Recommended — affects declaration and
formatting) · Publication status of chapters (Required if by publication) ·
Embargo requirements (Optional).

**Quality gates:** Contribution to knowledge stated explicitly (blocking) ·
Limitations section present (required) · Each empirical chapter self-contained if
by-publication (required) · Consistent terminology across chapters (advisory,
computed across the whole document) · No unsupported claims in the contribution
statement (blocking).

**Notes.** The most demanding entry. Priya's persona. Four-year project lifespan
makes `45` §8 (schema migration) and `43` (Vault durability) load-bearing. The
by-publication variant is materially different and its own structure template.

---

#### OT-09 — Book / Monograph

| | |
|---|---|
| **Levels** | Doctoral, faculty |
| **Structure** | `chapter_based` |
| **Budget** | 60,000–150,000 words |
| **Sources** | 100–500 |
| **Compliance** | `venue` (publisher) |
| **Workflow** | `long_form_chaptered` |

**Sections:** Front matter (half title, title, copyright, dedication, contents,
preface, acknowledgements) · Introduction · Parts and chapters · Conclusion ·
Notes · Bibliography · Index.

**Type-specific intake:** Publisher and series (Recommended) · Publisher style
guide upload (Recommended, high value) · Notes style: footnotes / endnotes
(Required — Chicago-dominant field) · Index required (Recommended) ·
Part-level grouping (Optional) · Manuscript delivery format (Required).

**Notes.** Distinguished from the dissertation by audience and by the publisher's
style guide replacing institutional regulations. Index generation is an
export-stage concern (`33` §6). Chicago notes-bibliography is the common style
and the citation layer must support the notes variant, not only author-date.

---

### Family: Publication

---

#### OT-10 — Journal Article

| | |
|---|---|
| **Levels** | Master's through faculty |
| **Structure** | `imrad` (or discipline variant) |
| **Budget** | 3,000–10,000 words (venue-dictated) |
| **Sources** | 30–80 |
| **Compliance** | `venue` |
| **Workflow** | `venue_targeted` |

**Sections:** Title · Authors and affiliations · Abstract · Keywords ·
Introduction · Methods · Results · Discussion · Conclusion · Declarations
(funding, conflicts, ethics, data availability, author contributions) ·
References · Supplementary.

**Type-specific intake:** Target journal (Required — drives the entire Rubric) ·
Article type: original research / review / short communication / case report
(Required) · Author guidelines upload or URL (Recommended, very high value) ·
Author list and contribution roles (Recommended, CRediT taxonomy) · Funding
statement (Required) · Conflicts of interest (Required) · Data availability
(Required) · Ethics approval (Required if applicable, blocking) · Preprint
intention (Optional).

**Quality gates:** Abstract within venue limit (blocking) · Structured abstract
if venue requires (blocking) · All declarations present (blocking) · Reference
style matches venue exactly (blocking) · Figure and table count within limits
(required) · Word count within limit, counted per venue's own rules (blocking).

**Notes.** The `venue_targeted` reference implementation. Marcus's persona.
Changing target journal re-compiles the Rubric and re-runs compliance without
touching content — this is the single most-requested capability from active
researchers, and `REQ-CMP-9` exists for it. Adds the post-submission
reviewer-response loop (§10).

---

#### OT-11 — Conference Paper

| | |
|---|---|
| **Levels** | Master's through faculty |
| **Structure** | `imrad` |
| **Budget** | 2,000–8,000 words, or a hard page limit |
| **Sources** | 15–40 |
| **Compliance** | `venue` |
| **Workflow** | `venue_targeted` |

**Sections:** As OT-10, usually more compressed. Often a strict page limit in a
supplied template.

**Type-specific intake:** Conference and track (Required) · Page limit and
whether references count (Required) · Template: ACM / IEEE / Springer LNCS /
custom (Required) · Anonymous submission required (Required — blocking implication
for author fields and self-citation) · Deadline (Required, hard).

**Quality gates:** Page limit satisfied in rendered output, not word count
(blocking — this requires actual layout) · Anonymisation complete if
double-blind (blocking) · Template applied (blocking).

**Notes.** The page-limit gate is genuinely different from a word count: it
requires rendering to the template and measuring. This is why `33` §5 specifies a
layout-measurement pass rather than an estimate. Anonymisation checking scans for
author names, institution names, self-citations phrased as "our previous work",
and acknowledgements.

---

#### OT-12 — Review Article

| | |
|---|---|
| **Levels** | Doctoral, faculty |
| **Structure** | `thematic` |
| **Budget** | 5,000–15,000 words |
| **Sources** | 80–300 |
| **Compliance** | `venue` |
| **Workflow** | `venue_targeted` |

**Sections:** Abstract · Introduction · Scope and search strategy · Thematic
sections · Synthesis · Gaps and future directions · Conclusion · References.

**Type-specific intake:** Review type: narrative / systematic / scoping /
umbrella (Required — systematic triggers PRISMA obligations) · Search strategy
(Required if systematic; blocking) · Databases searched (Required if systematic)
· Inclusion/exclusion criteria (Required if systematic) · Date range (Required) ·
PRISMA compliance (Required if systematic).

**Quality gates:** Search strategy reproducible (blocking if systematic) · PRISMA
flow diagram present (blocking if systematic) · Every included study in the
corpus (blocking) · Thematic coverage balanced (advisory).

**Notes.** The systematic variant is the most evidentially demanding type in the
catalog and the best showcase for the claim–evidence graph. The corpus *is* the
dataset; source approval is the screening process. Atlas maps the Source Approval
Queue directly onto PRISMA screening stages, and the excluded set with reasons
generates the flow diagram.

---

#### OT-13 — Literature Review (standalone)

| | |
|---|---|
| **Levels** | All |
| **Structure** | `thematic` |
| **Budget** | 2,000–10,000 words |
| **Sources** | 25–100 |
| **Compliance** | `coursework` or `institutional` |
| **Workflow** | `short_form` |

**Sections:** Introduction and scope · Thematic or chronological sections ·
Synthesis and critique · Gaps · Conclusion · References.

**Type-specific intake:** Organising principle: thematic / chronological /
methodological / theoretical (Required) · Scope boundaries (Required) ·
Whether critique is expected or summary suffices (Required — the single most
common misunderstanding at undergraduate level).

**Notes.** Distinct from OT-12 by being a component or coursework piece rather
than a publication. The critique-vs-summary question is deliberately explicit:
students routinely submit summaries when critique was required, and the intake
form is the right place to catch it.

---

#### OT-14 — Book Chapter

| | |
|---|---|
| **Levels** | Doctoral, faculty |
| **Structure** | `linear` or `thematic` |
| **Budget** | 5,000–12,000 words |
| **Sources** | 30–80 |
| **Compliance** | `venue` (editor/publisher) |
| **Workflow** | `venue_targeted` |

**Type-specific intake:** Volume title and editors (Recommended) · Editor's brief
upload (Recommended, high value) · Position in volume (Optional — affects how much
context to assume) · House style (Required) · Whether an abstract is required
(Recommended).

**Notes.** The editor's brief is the requirement source. Chapters must fit a
volume's argument, so `G3` includes a "relationship to volume" prompt absent from
other types.

---

### Family: Proposal & funding

---

#### OT-15 — Research Proposal

| | |
|---|---|
| **Levels** | Master's through faculty |
| **Structure** | `linear` |
| **Budget** | 1,500–10,000 words |
| **Sources** | 20–60 |
| **Compliance** | `institutional` or `funder` |
| **Workflow** | `proposal` |

**Sections:** Title · Abstract · Background and rationale · Research questions ·
Literature review · Methodology · Timeline · Ethical considerations · Expected
outcomes · Resources · References.

**Type-specific intake:** Proposal purpose: degree admission / upgrade / funding /
ethics (Required — materially different documents) · Duration (Required) ·
Supervisor or PI (Recommended) · Resource requirements (Recommended) · Ethics
review body (Recommended).

**Quality gates:** Feasibility within stated timeline (advisory, agent-assessed) ·
Methodology matches research questions (required) · Ethical considerations present
(blocking where human subjects indicated).

---

#### OT-16 — Grant Proposal

| | |
|---|---|
| **Levels** | Doctoral, faculty |
| **Structure** | `funder_prescribed` |
| **Budget** | Funder-dictated; often per-section limits |
| **Sources** | 30–100 |
| **Compliance** | `funder` |
| **Workflow** | `proposal` |

**Sections:** Entirely funder-dictated. Common: summary · case for support ·
objectives · methodology · impact and pathways · work plan · team · budget
justification · data management plan · ethics · references.

**Type-specific intake:** Funder and scheme (Required) · Call document upload
(Required — this *is* the Rubric) · Budget total and duration (Required) ·
Co-investigators (Recommended) · Track record requirements (Recommended) ·
Per-section limits (extracted from the call, confirmed by user).

**Quality gates:** Every funder-required section present (blocking) · Per-section
limits respected (blocking) · Budget justification aligns with work plan
(required, cross-checked) · Impact section addresses the funder's stated
priorities (required) · Data management plan present where required (blocking).

**Notes.** The strictest compliance profile. Non-compliance means ineligibility,
not a lower score, so severities skew blocking. The call document is a
high-density requirement source and Rubric compilation quality here is the
feature. Budget narrative is a sub-workflow with its own consistency checks
against the work plan.

---

#### OT-17 — Ethics Application

| | |
|---|---|
| **Levels** | All conducting empirical work |
| **Structure** | `funder_prescribed` (institution's form) |
| **Budget** | Form-dictated |
| **Sources** | 5–20 |
| **Compliance** | `institutional` |
| **Workflow** | `proposal` |

**Sections:** Study summary · Participants and recruitment · Procedures ·
Risks and mitigation · Consent process · Data protection · Withdrawal ·
Dissemination · Appendices (information sheet, consent form).

**Type-specific intake:** Review body (Required) · Application form upload
(Required) · Participant type, including vulnerable groups (Required) · Data
types collected, including special-category data (Required) · Retention period
(Required).

**Quality gates:** Consent process described (blocking) · Data protection
addressed (blocking) · Withdrawal procedure stated (blocking) · Vulnerable
participant safeguards present where indicated (blocking) · Information sheet
readability at or below the target reading level (required).

**Notes.** Included because it blocks OT-06 through OT-08 in practice, and
because its appendices — participant information sheets — have a readability
obligation the system can genuinely check.

---

### Family: Applied & professional

---

#### OT-18 — Lab Report

| | |
|---|---|
| **Levels** | Undergraduate, master's |
| **Structure** | `imrad` |
| **Budget** | 1,000–4,000 words |
| **Sources** | 3–15 |
| **Compliance** | `coursework` |
| **Workflow** | `applied` |

**Sections:** Title · Abstract · Introduction · Materials and Methods · Results ·
Discussion · Conclusion · References · Appendices (raw data, calculations).

**Type-specific intake:** Experiment title and date (Required) · Hypothesis
(Required) · Apparatus and materials (Required) · Variables: independent,
dependent, controlled (Required) · Data files upload (Recommended) ·
Uncertainty treatment expected (Recommended) · Lab manual upload (Recommended).

**Quality gates:** Methods written in past passive or per the module's convention
(advisory) · Methods reproducible from the description (required, agent-assessed)
· Results contain no interpretation (required — the most common student error) ·
Discussion addresses the hypothesis explicitly (blocking) · Units and significant
figures consistent (required) · Every figure and table referenced in text
(blocking).

**Notes.** The results/discussion separation check is genuinely useful teaching:
students consistently interpret in Results. The units-and-sig-figs check is
deterministic and needs no model.

---

#### OT-19 — Case Study

| | |
|---|---|
| **Levels** | All |
| **Structure** | `linear` |
| **Budget** | 1,500–8,000 words |
| **Sources** | 10–40 |
| **Compliance** | `coursework` or `professional` |
| **Workflow** | `applied` |

**Sections:** Executive summary · Background and context · Problem statement ·
Analysis · Alternatives considered · Recommendation · Implementation ·
Limitations · References.

**Type-specific intake:** Case subject (Required) · Case type: exploratory /
explanatory / descriptive / clinical / business (Required) · Anonymisation
required (Required — blocking for clinical) · Framework applied (Recommended) ·
Consent for case details (Required for clinical; blocking).

**Quality gates:** Anonymisation complete where required (blocking; scans for
names, dates, locations, identifiers) · Recommendation follows from analysis
(required) · Alternatives genuinely considered (advisory).

**Notes.** Clinical case reports carry consent and anonymisation obligations that
are blocking rather than advisory. The anonymisation scan is the same machinery as
OT-11's double-blind check, differently configured.

---

#### OT-20 — Policy Brief

| | |
|---|---|
| **Levels** | Master's through faculty |
| **Structure** | `argumentative` |
| **Budget** | 1,000–3,000 words |
| **Sources** | 10–30 |
| **Compliance** | `professional` |
| **Workflow** | `applied` |

**Sections:** Title · Executive summary · The problem · Evidence · Policy options
· Recommendation · Implementation · References.

**Type-specific intake:** Target audience: legislator / civil servant / NGO /
public (Required) · Decision being influenced (Required) · Political constraints
(Optional) · Length limit, often two pages (Required) · Visual requirements
(Recommended).

**Quality gates:** Reading level appropriate to audience (required — briefs
routinely fail here) · Recommendation stated in the first 200 words (blocking) ·
Every claim sourced (blocking) · Jargon density below threshold (required).

**Notes.** The register inversion is the interesting part: academic hedging is a
*defect* here. The Academic Style Coach agent runs in a different mode for this
type, and the intake makes that explicit so the user is not surprised.

---

#### OT-21 — White Paper / Technical Documentation

| | |
|---|---|
| **Levels** | Master's through faculty, professional |
| **Structure** | `linear` |
| **Budget** | 2,000–12,000 words |
| **Sources** | 10–40 |
| **Compliance** | `professional` |
| **Workflow** | `applied` |

**Sections:** Executive summary · Introduction · Problem · Approach or
architecture · Evaluation · Deployment considerations · Conclusion · References ·
Appendices.

**Type-specific intake:** Document purpose: technical / marketing-technical /
standards (Required) · Audience technical level (Required) · Whether code or
specification blocks appear (Recommended) · Organisational template
(Recommended) · Versioning scheme (Optional).

**Notes.** The least academic entry, included because researchers write these for
industry collaborations and standards bodies. Code-block handling and
version-controlled documents distinguish it.

---

### Family: Presentation

---

#### OT-22 — Presentation

| | |
|---|---|
| **Levels** | All |
| **Structure** | `slide_deck` |
| **Budget** | 10–40 slides; 20–40 words per slide |
| **Sources** | 5–30 |
| **Compliance** | `venue` or `coursework` |
| **Workflow** | `visual` |

**Structure:** Title · Agenda · Context · Method · Findings · Implications ·
Conclusion · References · Backup slides.

**Type-specific intake:** Duration (Required — drives slide count directly) ·
Audience expertise (Required) · Presentation context: viva / conference /
seminar / defence (Required) · Source document (Recommended — derives the deck) ·
Q&A expected (Recommended — generates backup slides) · Template (Optional).

**Quality gates:** Slide count matches duration at the configured pace (required)
· Word density per slide below threshold (blocking — the most common failure) ·
Every claim traceable to the source document or corpus (required) · Font size
minimum met (blocking) · Contrast ratio meets WCAG AA (blocking).

**Notes.** When derived from an existing document, this is a *reduction*
workflow: every slide binds to a span in the source. That binding is what
prevents the deck from claiming things the paper does not. Speaker notes carry
their own provenance separately from slide text.

---

#### OT-23 — Poster

| | |
|---|---|
| **Levels** | All |
| **Structure** | `poster_grid` |
| **Budget** | 300–800 words total |
| **Sources** | 5–20 |
| **Compliance** | `venue` |
| **Workflow** | `visual` |

**Regions:** Title and authors · Introduction · Methods · Results (figure-dominant)
· Conclusions · References · Acknowledgements · QR/contact.

**Type-specific intake:** Physical dimensions and orientation (Required) ·
Conference template (Recommended) · Print resolution (Required) · Figure files
(Recommended) · Viewing distance (Recommended — drives minimum font size).

**Quality gates:** Total word count below threshold (blocking) · Minimum font
size for the stated viewing distance (blocking) · Figure resolution adequate for
print size (blocking) · Region balance (advisory) · Contrast AA (blocking).

**Notes.** The most layout-constrained type. Compliance here is physical:
millimetres and DPI, not word counts. Export produces a print-ready PDF at exact
dimensions, which makes this the one type where PDF is the primary format rather
than a derivation.

---

#### OT-24 — Generic Document *(escape hatch)*

| | |
|---|---|
| **Levels** | All |
| **Structure** | `linear` |
| **Budget** | User-defined |
| **Sources** | User-defined |
| **Compliance** | Minimal |
| **Workflow** | `short_form` |

**Type-specific intake:** Title (Required) · Purpose (Required) · Approximate
length (Recommended) · Citation style if any (Optional).

**Notes.** Exists so that "my document is not in your list" is never a dead end.
Deliberately not offered first (`REQ-OUT-1`), presented at the bottom of type
selection as "Something else". Gates still apply — `G2` source approval and `G7`
export checks are not optional here either. When a user selects it, the system
logs the free-text purpose; recurring patterns are a catalog roadmap input.

---

## 10. The reviewer-response sub-workflow

Attached to `venue_targeted` types (OT-10, OT-11, OT-12, OT-14) after `G7`.

| Stage | Action |
|---|---|
| Import | Upload the decision letter and reviewer comments |
| Decompose | Each reviewer point becomes a tracked item with a status |
| Triage | User marks each: accept / partially accept / rebut / defer |
| Address | Each accepted point links to the manuscript change that addresses it |
| Verify | Every point has a response and, where accepted, a linked change |
| Compose | Generate the response letter from the tracked items |
| Resubmit | Re-run `G6` against the (possibly updated) Rubric |

The response letter is generated from the item table, which means it cannot claim
a change that does not exist in the manuscript — the same evidence-binding
discipline applied to a different artefact.

---

## 11. Extending the catalog

| Mechanism | Who | Scope |
|---|---|---|
| Catalog entry | Core team | New types shipped with the product |
| Discipline variant | Core team or plugin | Overrides sections, budgets, or gates for one discipline |
| Institution profile | Institution admin | Overrides defaults for one institution's users |
| Plugin type | Third party | Wholly new types, reviewed before distribution (`47` §7) |
| User template | End user | Saves a customised type for reuse; not shared |

Precedence, highest first: user template → institution profile → discipline
variant → catalog default.

### 11.1 Catalog governance

- A new type requires: a real submission example, a documented structure source
  (handbook, guideline, style manual), and a golden-set test.
- Word budgets and source counts MUST cite where the number came from. Invented
  numbers presented as authoritative are worse than no number.
- Types are versioned. An in-flight project keeps the version it started with;
  upgrading is a user action with a visible diff (`45` §8).

---

## 12. Current state

**The Atlas engine is implemented, with 6 of 24 output types populated.**

| Module | Path | Covers |
|---|---|---|
| Schema | `src/app/atlas/types.ts` | §2's OutputTypeSpec shape, in full — structure, budget, sources, citation, three-tier intake schema, quality gates, workflow variant, compliance profile, export defaults |
| Catalog registry | `src/app/atlas/catalog.ts` | Get-by-id, list, filter by family, search by label/alias — validates every entry at construction, so a malformed spec fails at startup rather than reaching a user |
| Validation | `src/app/atlas/validate.ts` | The four-part guidance contract (§5.2) enforced per field; structural completeness; budget-distribution sanity |
| Proposal engine | `src/app/atlas/proposals.ts` | §2.1's budget-from-distribution calculation, intake value defaults, citation style resolution, and the `G0`→`G1` provisional-answer gating from `30` §3 |
| Data | `src/app/atlas/catalogData.ts` | **6 entries** — OT-01, OT-07, OT-10, OT-16, OT-18, OT-22 — one per family, proving all 6 workflow variants and both funder/venue/institutional/coursework compliance profiles |

36 tests: catalog data validity, the query API, validation rules (including
what "never an empty required field" actually means — see §12.1), and the
proposal engine's arithmetic.

### 12.1 A correction made during implementation

Building the validator against real data caught a genuine ambiguity in §5.2's
wording. "Never an empty required field" was initially implemented as "every
required field must have either a `defaultValue` or `allowsProvisional`" —
but OT-16's `funder_and_scheme` and `call_document` fields are correctly
specified in §9 as required with neither, because a grant proposal
genuinely has no safe default for its funder and blocking until it's
answered is the right behaviour, not a data-entry gap. The rule is
implemented as written here: every field's `defaultWithRationale` guidance
must be non-empty — including, and especially, when the rationale is "there
is no safe default." That is what makes the field non-empty in the sense
the spec actually cares about (unguided), not whether it has a pre-fillable
value.

### 12.2 What remains

| Gap | Status |
|---|---|
| 18 of 24 output types | Not yet entered. The engine is proven against all 6 families; remaining types are data entry, each needing a real submission example and structure source per §11.1 |
| Override precedence (`user template → institution profile → discipline variant → catalog default`) | Not implemented — only the catalog-default layer exists. `atlas.ts`'s module comment notes where the other three layers plug in |
| Type versioning / migration on catalog update | The `version` field exists on every spec but nothing yet reads it to diff or migrate an in-flight project |
| Any client UI (intake form rendering) | Not built — no editor exists yet (`13` §8.1) |

The former `src/types/documentTypes.ts` (10 document types, a TypeScript
const with a `QualityGate.check: (content: string) => boolean` signature) is
unchanged and not yet retired; its section definitions were a reasonable
starting reference for OT-07/08/10/18 above, but the new schema does not
reuse its code, only ideas from its structure.
