/**
 * The catalog data — real output type entries.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md §9. That document
 * specifies 24 output types across 6 families. All 24 are implemented
 * here now. Built in phases: the original one representative entry per
 * family, proving the engine against every shape the catalog needs to
 * support; then successive rounds deepening each family and exercising
 * every structure variant, ending with OT-23 Poster, the only entry using
 * `poster_grid` — the eighth and last structure variant proven. Along the
 * way, OT-06 gave `QualityGateSpec.metadataKey` its first real,
 * non-synthetic use, and OT-09 became the first entry defaulting to
 * `chicago-notes-bibliography`, exercising this session's
 * ChicagoNotesFormatter for real.
 *
 * Four "no unsupported claims" gates — OT-04's claims_traceable_to_source,
 * OT-08's contribution_claims_supported, OT-20's every_claim_sourced, and
 * OT-22's claims_traceable — all set `usesClaimGraph` and compile into
 * real `claim_support` rules checking the project's Claim-Evidence Graph
 * (see app/rubric/fromAtlas.ts). Unscoped: an empty graph passes
 * vacuously, so this never penalises a project that hasn't started using
 * claims — it only fires once a claim with no evidence binding exists.
 *
 * A handful of other quality gates across these entries are still recorded
 * but not compiled, honestly, because what they need doesn't exist yet:
 * OT-11/OT-23's layout-measurement gates (page limits, print font sizes,
 * WCAG contrast), OT-12's PRISMA screening-workflow gates, OT-17's
 * agent-assessed readability gate, and OT-20's remaining
 * recommendation-position-in-text gate, which needs a rule type
 * domain/compliance doesn't implement. See
 * docs/01-product/13-MODULE-SPECIFICATIONS.md §8.3 for the tracked gaps.
 *
 * Word budgets, source counts, and structure are drawn directly from the
 * spec document's per-type tables, not invented here. Two exceptions,
 * both stated in their own entry's comment: OT-14's section list (the
 * source doc doesn't itemize one) and OT-24's word range (the type is
 * explicitly user-defined, so the range here is a generic fallback, not
 * a real target).
 */

import type { OutputTypeSpec } from "./types";

const OUTPUT_TYPES: OutputTypeSpec[] = [
  // ── OT-01 Assignment — short_form / linear / coursework ─────────────────
  {
    id: "OT-01",
    version: 1,
    label: "Assignment",
    aliases: ["coursework essay", "problem set writeup", "homework"],
    family: "short_form",
    academicLevels: ["undergraduate", "masters"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "title_page", title: "Title / Cover", required: true, countsTowardWordcount: false, guidance: "Your name, module code, and the assignment title, per your institution's cover-page convention." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, wordBudget: { min: 100, max: 300, typical: 200 }, guidance: "State what the assignment asks and how you will answer it." },
        { key: "body", title: "Body", required: true, countsTowardWordcount: true, wordBudget: { min: 800, max: 2200, typical: 1000 }, guidance: "Answer the task. Structure depends on what is asked — argue, analyse, compare, or report as instructed." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, wordBudget: { min: 100, max: 250, typical: 150 }, guidance: "Summarise your answer. Do not introduce new evidence here." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited in the body, in your required style." },
      ],
      frontMatter: ["title_page"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 800, max: 3000, typical: 1500 },
      distribution: { introduction: 0.13, body: 0.67, conclusion: 0.1 },
    },
    sources: { targetCount: { min: 5, typical: 10 }, recencyExpectation: "majority within 10 years unless historical", typeMix: { peer_reviewed: 0.6, other: 0.4 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "assignment_brief",
          label: "Assignment brief",
          tier: "required",
          guidance: {
            whatItIs: "The task sheet or question your tutor set.",
            whyItMatters: "It usually contains the word limit, the actual question, and the deadline — we read it so you don't have to re-type any of that.",
            example: "A PDF or pasted text of the assignment instructions from your course page.",
            defaultWithRationale: "If you don't have a file, you can type the question directly instead — that satisfies this field too.",
          },
          allowsProvisional: true,
        },
        {
          key: "word_limit",
          label: "Word limit",
          tier: "required",
          guidance: {
            whatItIs: "The maximum (and sometimes minimum) word count your department allows.",
            whyItMatters: "Going over is often penalised automatically, regardless of quality.",
            example: "1,500 words ± 10%.",
            defaultWithRationale: "We default to 1,500 words, the median for undergraduate assignments, until your brief tells us otherwise.",
          },
          defaultValue: "1500",
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "marking_rubric",
          label: "Marking rubric",
          tier: "recommended",
          guidance: {
            whatItIs: "The criteria your tutor grades against, if published.",
            whyItMatters: "Lets us check your draft against what's actually rewarded, not just general good writing.",
            example: "A rubric table with categories like 'critical analysis', 'structure', 'referencing'.",
            defaultWithRationale: "If unavailable, we assess against general academic writing standards for your level instead.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "required_texts",
          label: "Required or suggested reading",
          tier: "optional",
          guidance: {
            whatItIs: "Texts your module explicitly wants you to engage with.",
            whyItMatters: "Markers often look for engagement with set readings specifically.",
            example: "A reading list from your module handbook.",
            defaultWithRationale: "If none is given, we treat this as unconstrained and search broadly instead.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "structural_completeness", description: "Every required section present and non-empty", severity: "blocking" },
      { id: "budget_adherence", description: "Within ±20% of the word limit", severity: "required" },
      { id: "style_consistency", description: "One citation style used throughout", severity: "blocking" },
    ],
    workflowVariant: "short_form",
    complianceProfile: "coursework",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-02 Essay — short_form / argumentative / coursework ───────────────
  {
    id: "OT-02",
    version: 1,
    label: "Essay",
    aliases: ["argumentative essay", "position paper", "critical essay"],
    family: "short_form",
    academicLevels: ["undergraduate", "masters"],
    typicalDisciplines: ["humanities", "social science", "all"],
    structure: {
      variant: "argumentative",
      sections: [
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, wordBudget: { min: 100, max: 350, typical: 250 }, guidance: "States the essay question and the thesis — the single position the essay will argue for." },
        { key: "argument", title: "Argument", required: true, countsTowardWordcount: true, wordBudget: { min: 600, max: 3500, typical: 1500 }, guidance: "One claim at a time, each with its own evidence. At G3 this becomes a claim tree rather than a flat section list — the sections here represent that body in aggregate." },
        { key: "counter_argument", title: "Counter-argument", required: true, countsTowardWordcount: true, wordBudget: { min: 150, max: 600, typical: 300 }, guidance: "The strongest opposing position, addressed directly rather than dismissed." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, wordBudget: { min: 100, max: 300, typical: 200 }, guidance: "Restates the thesis in light of the argument and counter-argument. No new evidence." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited in the argument and counter-argument, in the required style." },
      ],
      frontMatter: [],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 1000, max: 5000, typical: 2500 },
      distribution: { introduction: 0.1, argument: 0.6, counter_argument: 0.15, conclusion: 0.08 },
    },
    sources: { targetCount: { min: 8, typical: 15 }, recencyExpectation: "majority within 10 years unless historical", typeMix: { peer_reviewed: 0.6, other: 0.4 } },
    citation: { defaultStyle: "mla9", commonStyles: ["mla9", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "essay_question",
          label: "Essay question",
          tier: "required",
          guidance: {
            whatItIs: "The exact question or prompt set for the essay.",
            whyItMatters: "The thesis has to answer this precisely — essays that drift from the set question lose marks regardless of writing quality.",
            example: "\"To what extent was the Treaty of Versailles responsible for the outbreak of the Second World War?\"",
            defaultWithRationale: "If you don't have the exact wording, paraphrase it as closely as you can — we'll flag if the thesis seems to be answering something else.",
          },
          allowsProvisional: true,
        },
        {
          key: "thesis_statement",
          label: "Position or thesis statement",
          tier: "required",
          guidance: {
            whatItIs: "The single claim your essay will argue for, in one or two sentences.",
            whyItMatters: "This is where most undergraduates struggle: a thesis that is too broad, too obvious, or actually a topic rather than a claim produces an essay with nothing to prove. Getting this right first saves a rewrite later.",
            example: "\"The Treaty of Versailles was a necessary but not sufficient cause of the Second World War, secondary to the failure of collective security in the 1930s.\"",
            defaultWithRationale: "If you're not sure yet, mark this provisional and describe your topic instead — we'll propose candidate thesis statements from your reading for you to choose from.",
          },
          allowsProvisional: true,
        },
        {
          key: "argument_type",
          label: "Argument type",
          tier: "required",
          guidance: {
            whatItIs: "Whether the essay is analytical, persuasive, comparative, or evaluative.",
            whyItMatters: "Changes what 'good' looks like at G5 — a persuasive essay needs a strong counter-argument response; a comparative one needs balanced treatment of both sides being compared.",
            example: "Evaluative — weighing the relative importance of several causes.",
            defaultWithRationale: "Defaults to analytical, the most common type when unspecified.",
          },
          defaultValue: "analytical",
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "required_texts",
          label: "Required or suggested reading",
          tier: "recommended",
          guidance: {
            whatItIs: "Texts your module explicitly wants you to engage with.",
            whyItMatters: "Markers often look for engagement with set readings specifically.",
            example: "A reading list from your module handbook.",
            defaultWithRationale: "If none is given, we treat this as unconstrained and search broadly instead.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "thesis_statement_present", description: "A single, specific thesis statement appears in the introduction", severity: "blocking" },
      { id: "claims_advance_thesis", description: "Each argument section advances the thesis rather than merely being related to the topic", severity: "advisory" },
      { id: "counter_argument_addressed", description: "The strongest opposing position is stated and directly answered, not ignored", severity: "required", appliesWhen: "persuasive or evaluative argument type" },
    ],
    workflowVariant: "short_form",
    complianceProfile: "coursework",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-03 Report — short_form / linear / coursework ─────────────────────
  {
    id: "OT-03",
    version: 1,
    label: "Report",
    aliases: ["business report", "technical report", "coursework report"],
    family: "short_form",
    academicLevels: ["undergraduate", "masters", "professional"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "title_page", title: "Title Page", required: true, countsTowardWordcount: false, guidance: "Report title, author, audience, and date." },
        { key: "executive_summary", title: "Executive Summary", required: true, countsTowardWordcount: false, wordBudget: { min: 150, max: 400, typical: 250 }, guidance: "Written last. A summary of your own findings and recommendations, not a restatement of sources — the one place the system drafts from your text rather than from cited material." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, wordBudget: { min: 150, max: 500, typical: 300 }, guidance: "States the report's purpose, scope, and intended audience." },
        { key: "methodology", title: "Methodology", required: false, countsTowardWordcount: true, guidance: "How data or evidence was gathered, if the report involves original data collection or a defined method." },
        { key: "findings", title: "Findings", required: true, countsTowardWordcount: true, wordBudget: { min: 400, max: 2500, typical: 1200 }, guidance: "What was found. Facts and data only, no interpretation — that belongs in Discussion." },
        { key: "discussion", title: "Discussion", required: true, countsTowardWordcount: true, wordBudget: { min: 200, max: 1500, typical: 700 }, guidance: "Interprets the findings and situates them against the report's purpose." },
        { key: "conclusions", title: "Conclusions", required: true, countsTowardWordcount: true, wordBudget: { min: 100, max: 400, typical: 250 }, guidance: "What the findings and discussion establish, stated plainly." },
        { key: "recommendations", title: "Recommendations", required: false, countsTowardWordcount: true, guidance: "Specific, actionable recommendations, present only when the report's purpose calls for them." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the required style." },
        { key: "appendices", title: "Appendices", required: false, countsTowardWordcount: false, guidance: "Supporting material too detailed for the main body — raw data, full survey instruments, extended calculations." },
      ],
      frontMatter: ["title_page", "executive_summary"],
      backMatter: ["references", "appendices"],
    },
    budget: {
      totalWords: { min: 1500, max: 8000, typical: 3500 },
      distribution: { introduction: 0.1, methodology: 0.15, findings: 0.3, discussion: 0.2, conclusions: 0.1, recommendations: 0.1 },
    },
    sources: { targetCount: { min: 10, typical: 20 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.5, other: 0.5 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "report_purpose",
          label: "Report purpose",
          tier: "required",
          guidance: {
            whatItIs: "What the report is for — inform, evaluate, recommend, or record.",
            whyItMatters: "Determines whether Recommendations and Methodology are needed at all, and shapes the Executive Summary.",
            example: "Evaluate three vendor proposals and recommend one.",
            defaultWithRationale: "There is no safe default for this — the report's structure genuinely depends on it, so it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "audience",
          label: "Audience",
          tier: "required",
          guidance: {
            whatItIs: "Who the report is written for.",
            whyItMatters: "Changes register substantially — a report for a board reads very differently from one for a technical peer, even with identical findings.",
            example: "Senior management with no technical background in the subject.",
            defaultWithRationale: "Defaults to 'an informed but non-specialist reader' when unspecified.",
          },
          defaultValue: "an informed but non-specialist reader",
          allowsProvisional: true,
        },
        {
          key: "recommendations_expected",
          label: "Are recommendations expected?",
          tier: "required",
          guidance: {
            whatItIs: "Whether the brief calls for actionable recommendations or a findings-only record.",
            whyItMatters: "Determines whether the Recommendations section is compiled at all — including one when it isn't wanted reads as padding.",
            example: "Yes — the brief asks for a recommended course of action.",
            defaultWithRationale: "Defaults to yes, since most report briefs expect a recommendation even when not stated explicitly.",
          },
          defaultValue: "yes",
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "data_sources",
          label: "Data sources",
          tier: "recommended",
          guidance: {
            whatItIs: "Any datasets, interviews, or records the report draws on beyond published literature.",
            whyItMatters: "Reports frequently rely on primary or organisational data that a literature search alone would never find.",
            example: "Q3 sales figures spreadsheet; three stakeholder interview transcripts.",
            defaultWithRationale: "If none is supplied, the report is written from published sources only.",
          },
          allowsProvisional: true,
        },
        {
          key: "numbered_heading_convention",
          label: "Numbered-heading convention",
          tier: "recommended",
          guidance: {
            whatItIs: "Whether sections should be numbered (1, 1.1, 1.2...) per your institution's or organisation's house style.",
            whyItMatters: "Numbered headings are a common, easy-to-miss formatting requirement in professional and some academic reports.",
            example: "Yes, decimal numbering to two levels.",
            defaultWithRationale: "Defaults to unnumbered headings unless a house style is specified.",
          },
          defaultValue: "no",
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "structural_completeness", description: "Every required section present and non-empty", severity: "blocking" },
      { id: "budget_adherence", description: "Within ±20% of the word limit", severity: "required" },
      { id: "recommendations_alignment", description: "Recommendations follow from the findings and discussion rather than introducing new claims", severity: "required", appliesWhen: "recommendations_expected" },
    ],
    workflowVariant: "short_form",
    complianceProfile: "coursework",
    exportDefaults: { format: "docx", includeToc: true },
  },

  // ── OT-13 Literature Review (standalone) — short_form / thematic ────────
  {
    id: "OT-13",
    version: 1,
    label: "Literature Review",
    aliases: ["lit review", "review of the literature", "standalone literature review"],
    family: "short_form",
    academicLevels: ["undergraduate", "masters", "doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "thematic",
      sections: [
        { key: "introduction", title: "Introduction and Scope", required: true, countsTowardWordcount: true, wordBudget: { min: 150, max: 500, typical: 300 }, guidance: "States the review's scope boundaries and organising principle." },
        { key: "body", title: "Body", required: true, countsTowardWordcount: true, wordBudget: { min: 1000, max: 7000, typical: 3000 }, guidance: "Organised by theme, chronology, methodology, or theory per the chosen organising principle — not source-by-source summary." },
        { key: "synthesis_critique", title: "Synthesis and Critique", required: true, countsTowardWordcount: true, wordBudget: { min: 300, max: 1500, typical: 700 }, guidance: "Connects the themes and evaluates the literature's strengths, weaknesses, and disagreements — present only when critique, not summary, was required." },
        { key: "gaps", title: "Gaps", required: true, countsTowardWordcount: true, wordBudget: { min: 100, max: 500, typical: 250 }, guidance: "What the literature has not yet addressed." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, wordBudget: { min: 100, max: 350, typical: 200 }, guidance: "Summarises the state of the field per the review's scope." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the required style." },
      ],
      frontMatter: [],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 2000, max: 10000, typical: 5000 },
      distribution: { introduction: 0.08, body: 0.55, synthesis_critique: 0.2, gaps: 0.07, conclusion: 0.05 },
    },
    sources: { targetCount: { min: 25, typical: 50 }, recencyExpectation: "majority within 10 years, with broader historical context where the field warrants it", typeMix: { peer_reviewed: 0.8, other: 0.2 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "organising_principle",
          label: "Organising principle",
          tier: "required",
          guidance: {
            whatItIs: "Whether the body is organised thematically, chronologically, methodologically, or theoretically.",
            whyItMatters: "Drives the entire structure of the body section — a chronological review and a thematic one covering the same literature read completely differently.",
            example: "Thematic, organised around three competing theoretical frameworks.",
            defaultWithRationale: "Defaults to thematic, the most common organising principle when unspecified.",
          },
          defaultValue: "thematic",
          allowsProvisional: false,
        },
        {
          key: "scope_boundaries",
          label: "Scope boundaries",
          tier: "required",
          guidance: {
            whatItIs: "What is in scope and out of scope — discipline, date range, geography, methodology, or population.",
            whyItMatters: "Without explicit boundaries, source discovery either misses relevant work or returns an unmanageable volume.",
            example: "Peer-reviewed empirical studies on remote work productivity, English-language, published 2015 onward.",
            defaultWithRationale: "There is no safe default for this — an unscoped review cannot be meaningfully searched, so it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "critique_or_summary",
          label: "Is critique expected, or does summary suffice?",
          tier: "required",
          guidance: {
            whatItIs: "Whether the review must evaluate and critique the literature, or whether accurately summarising it is sufficient.",
            whyItMatters: "The single most common misunderstanding at undergraduate level: students routinely submit a summary when critique was required. Asked explicitly here so it's never assumed.",
            example: "Critique required — the brief asks for an evaluation of methodological strengths and weaknesses, not just a description.",
            defaultWithRationale: "Defaults to critique expected, since most academic literature review briefs require it even when not stated in those exact words.",
          },
          defaultValue: "critique",
          allowsProvisional: false,
        },
      ],
      recommended: [],
      optional: [],
    },
    qualityGates: [
      { id: "critique_present", description: "The review evaluates the literature rather than only summarising it", severity: "blocking", appliesWhen: "critique_or_summary = critique" },
      { id: "thematic_coherence", description: "Sources within each theme are meaningfully connected rather than merely listed", severity: "advisory" },
      { id: "gap_identification", description: "At least one genuine gap in the literature is identified", severity: "required" },
    ],
    workflowVariant: "short_form",
    complianceProfile: "coursework",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-04 Abstract (standalone) — short_form / linear / venue ───────────
  // Modeled as the structured variant (Background/Objective/Methods/
  // Results/Conclusion) — docs 14 §9 also describes an unstructured
  // single-paragraph variant for venues that don't require headed
  // sub-sections; not modeled separately here since it's a strict subset
  // (one block instead of five) of what the structured variant already
  // supports, not a different shape the engine needs to prove.
  {
    id: "OT-04",
    version: 1,
    label: "Abstract",
    aliases: ["conference abstract", "standalone abstract", "extended abstract"],
    family: "short_form",
    academicLevels: ["undergraduate", "masters", "doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "background", title: "Background", required: true, countsTowardWordcount: true, wordBudget: { min: 20, max: 80, typical: 50 }, guidance: "The gap or problem motivating the work, in one or two sentences." },
        { key: "objective", title: "Objective", required: true, countsTowardWordcount: true, wordBudget: { min: 15, max: 60, typical: 30 }, guidance: "What the work set out to do." },
        { key: "methods", title: "Methods", required: true, countsTowardWordcount: true, wordBudget: { min: 20, max: 80, typical: 50 }, guidance: "How it was done — enough to judge rigor, not enough to replicate." },
        { key: "results", title: "Results", required: true, countsTowardWordcount: true, wordBudget: { min: 30, max: 120, typical: 70 }, guidance: "The key finding, stated as a result, not a promise ('we found X', not 'we will discuss X')." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, wordBudget: { min: 15, max: 60, typical: 30 }, guidance: "What the result means, in one sentence." },
      ],
      frontMatter: [],
      backMatter: [],
    },
    budget: {
      totalWords: { min: 150, max: 500, typical: 250 },
      distribution: { background: 0.2, objective: 0.12, methods: 0.2, results: 0.28, conclusion: 0.12 },
    },
    sources: { targetCount: { min: 0, typical: 0 }, recencyExpectation: "not applicable — abstracts of this length rarely cite directly", typeMix: { peer_reviewed: 0, other: 0 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7", "vancouver"] },
    intakeSchema: {
      required: [
        {
          key: "abstract_type",
          label: "Abstract type",
          tier: "required",
          guidance: {
            whatItIs: "Whether the venue wants a structured abstract (headed sub-sections) or a single unstructured paragraph.",
            whyItMatters: "Determines whether the five sections below render as headed sub-sections or are merged into one flowing paragraph on export.",
            example: "Structured, per the conference's submission template.",
            defaultWithRationale: "Defaults to structured, since it's strictly more informative and easy to flatten to unstructured on export if the venue turns out to want that.",
          },
          defaultValue: "structured",
          allowsProvisional: true,
        },
        {
          key: "word_limit",
          label: "Word limit",
          tier: "required",
          guidance: {
            whatItIs: "The venue's exact word (or character) limit for the abstract.",
            whyItMatters: "Venues are absolute about this — an over-limit abstract is often rejected by a submission system before a human ever reads it.",
            example: "250 words, per the conference submission portal.",
            defaultWithRationale: "There is no safe default for this — it is venue-specific and blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "citations_permitted",
          label: "Are citations permitted?",
          tier: "required",
          guidance: {
            whatItIs: "Whether the abstract may include citations at all.",
            whyItMatters: "Most venues forbid citations in an abstract; including one where forbidden is an easy, avoidable rejection reason.",
            example: "No — the submission system strips anything that looks like a citation.",
            defaultWithRationale: "Defaults to no citations permitted, the more common and safer restriction when unspecified.",
          },
          defaultValue: "no",
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "source_document",
          label: "Source document",
          tier: "recommended",
          guidance: {
            whatItIs: "The full paper, thesis, or report this abstract summarises, if it already exists.",
            whyItMatters: "When supplied, every claim in the abstract must bind to a span in your own document — a derivation workflow that is a strong guarantee against overstatement, rather than the abstract being drafted independently.",
            example: "The completed manuscript this abstract will accompany.",
            defaultWithRationale: "Without one, the abstract is drafted directly from your intake answers instead of derived from an existing text.",
          },
          allowsProvisional: true,
        },
        {
          key: "keywords_required",
          label: "Keywords required",
          tier: "recommended",
          guidance: {
            whatItIs: "Whether the venue requires a keyword list alongside the abstract.",
            whyItMatters: "A separate, easy-to-miss submission-form field distinct from the abstract text itself.",
            example: "Yes, 3-5 keywords.",
            defaultWithRationale: "Defaults to no keyword list unless the venue is known to require one.",
          },
          defaultValue: "no",
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "word_limit_satisfied", description: "Within the venue's exact word limit", severity: "blocking" },
      { id: "no_forbidden_citations", description: "Contains no citations where the venue forbids them", severity: "blocking", appliesWhen: "citations_permitted = no" },
      { id: "claims_traceable_to_source", description: "Every claim binds to a span in the source document", severity: "required", appliesWhen: "source_document provided", usesClaimGraph: true },
    ],
    workflowVariant: "short_form",
    complianceProfile: "venue",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-05 Seminar Paper — short_form / linear / institutional ───────────
  {
    id: "OT-05",
    version: 1,
    label: "Seminar Paper",
    aliases: ["Hausarbeit", "graduate seminar paper"],
    family: "short_form",
    academicLevels: ["masters", "doctoral"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, wordBudget: { min: 200, max: 600, typical: 350 }, guidance: "States the seminar topic and the paper's specific angle on it." },
        { key: "theoretical_framework", title: "Theoretical Framework", required: true, countsTowardWordcount: true, guidance: "The theoretical tradition or lens the analysis applies." },
        { key: "analysis", title: "Analysis", required: true, countsTowardWordcount: true, wordBudget: { min: 1500, max: 4500, typical: 3000 }, guidance: "The core analytical work, applying the framework to the topic." },
        { key: "discussion", title: "Discussion", required: true, countsTowardWordcount: true, guidance: "Interprets the analysis and situates it against the seminar's broader themes." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, wordBudget: { min: 150, max: 500, typical: 300 }, guidance: "Summarises the argument. No new evidence." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the required style." },
      ],
      frontMatter: [],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 3000, max: 8000, typical: 5000 },
      distribution: { introduction: 0.08, theoretical_framework: 0.17, analysis: 0.45, discussion: 0.2, conclusion: 0.06 },
    },
    sources: { targetCount: { min: 20, typical: 30 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.75, other: 0.25 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7", "chicago-author-date"] },
    intakeSchema: {
      required: [
        {
          key: "seminar_topic_and_framing",
          label: "Seminar topic and convenor's framing",
          tier: "required",
          guidance: {
            whatItIs: "The seminar's overall topic and how the convenor has framed the assignment.",
            whyItMatters: "Seminar papers are graded against how well they engage the convenor's specific framing, not the topic in the abstract.",
            example: "Seminar: 'Contested Sovereignty.' Convenor's framing: apply one contested-sovereignty case to a theoretical debate covered in class.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "presentation_accompanies",
          label: "Does a presentation accompany this paper?",
          tier: "recommended",
          guidance: {
            whatItIs: "Whether you will also present this work in the seminar.",
            whyItMatters: "Common in European graduate programmes — when yes, the system offers to create a linked Presentation project sharing the same corpus rather than starting from scratch.",
            example: "Yes, a 20-minute seminar presentation the week before submission.",
            defaultWithRationale: "Defaults to no linked presentation unless requested.",
          },
          defaultValue: "no",
          allowsProvisional: true,
        },
        {
          key: "theoretical_tradition",
          label: "Theoretical tradition",
          tier: "recommended",
          guidance: {
            whatItIs: "The specific theoretical tradition or school the framework draws on.",
            whyItMatters: "Shapes vocabulary and citation expectations from the start rather than discovering a mismatch during literature search.",
            example: "Constructivist international relations theory.",
            defaultWithRationale: "If unspecified, the framework is drawn from whatever the literature search surfaces as most relevant.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "structural_completeness", description: "Every required section present and non-empty", severity: "blocking" },
      { id: "budget_adherence", description: "Within ±20% of the word limit", severity: "required" },
      { id: "framework_applied_consistently", description: "The stated theoretical framework is actually used in the analysis, not just named in the introduction", severity: "advisory" },
    ],
    workflowVariant: "short_form",
    complianceProfile: "institutional",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-06 Undergraduate Dissertation / Capstone — long_form / chapter_based / institutional ──
  // The one entry in this catalog where "ethics approval status" is
  // genuinely orthogonal metadata, not document content: unlike OT-07's
  // "declaration of originality" (a structural section — a page of prose
  // the author writes), an ethics approval status is a fact *about* the
  // project, not a chapter of it, and docs 14 §9 lists it as intake, never
  // as a chapter. That is exactly the "structured fact that isn't also
  // rendered as content" fromAtlas.ts's module comment described as the
  // genuine fit for QualityGateSpec.metadataKey — the first real one.
  {
    id: "OT-06",
    version: 1,
    label: "Undergraduate Dissertation / Capstone",
    aliases: ["capstone project", "final year project", "undergraduate thesis"],
    family: "long_form",
    academicLevels: ["undergraduate"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "chapter_based",
      sections: [
        { key: "title_page", title: "Title Page", required: true, countsTowardWordcount: false, guidance: "Title, your name, degree, institution, submission date, per your department's template." },
        { key: "declaration", title: "Declaration of Originality", required: true, countsTowardWordcount: false, guidance: "The standard statement that this is your own work, using your institution's exact wording." },
        { key: "acknowledgements", title: "Acknowledgements", required: false, countsTowardWordcount: false, guidance: "Optional thanks to supervisors, participants, or funders." },
        { key: "abstract", title: "Abstract", required: true, countsTowardWordcount: false, wordBudget: { min: 150, max: 300, typical: 200 }, guidance: "A single paragraph summarising the question, method, key findings, and contribution." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "Motivates the research question and previews the dissertation's structure." },
        { key: "literature_review", title: "Literature Review", required: true, countsTowardWordcount: true, guidance: "Situates the work against existing research; identifies the gap it addresses." },
        { key: "methodology", title: "Methodology", required: false, countsTowardWordcount: true, guidance: "Present only for empirical projects: research design, data collection, and analysis approach." },
        { key: "results", title: "Results / Findings", required: false, countsTowardWordcount: true, guidance: "Present only for empirical projects: findings reported without interpretation." },
        { key: "discussion", title: "Discussion", required: true, countsTowardWordcount: true, guidance: "Interprets the work — findings for an empirical project, the argument's implications for a theoretical one." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, guidance: "Restates the contribution, states limitations, and suggests future work." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Full bibliography in your required citation style." },
      ],
      frontMatter: ["title_page", "declaration", "acknowledgements", "abstract"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 6000, max: 12000, typical: 8000 },
      distribution: {
        introduction: 0.12,
        literature_review: 0.28,
        methodology: 0.13,
        results: 0.17,
        discussion: 0.2,
        conclusion: 0.08,
      },
    },
    sources: { targetCount: { min: 30, typical: 45 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.65, other: 0.35 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "research_question",
          label: "Research question",
          tier: "required",
          guidance: {
            whatItIs: "The single question your project answers.",
            whyItMatters: "For most users this is their first long-form project — a vague question here is the single biggest cause of a directionless first draft.",
            example: "What factors most influenced student engagement with online seminars during 2020-2022?",
            defaultWithRationale: "Not sure yet? That's normal — start with your topic and the word 'how' or 'why'; we'll help sharpen it at the structure stage.",
          },
          allowsProvisional: true,
        },
        {
          key: "empirical_or_theoretical",
          label: "Empirical or theoretical",
          tier: "required",
          guidance: {
            whatItIs: "Whether the project involves original data collection (empirical) or is argument/analysis only (theoretical).",
            whyItMatters: "Determines whether the Methodology and Results chapters appear at all, and whether ethics approval is required.",
            example: "Empirical: a survey of 120 students plus five follow-up interviews.",
            defaultWithRationale: "Defaults to theoretical, the option requiring no ethics approval or data collection apparatus.",
          },
          defaultValue: "theoretical",
          allowsProvisional: false,
        },
        {
          key: "ethics_approval_status",
          label: "Ethics approval status",
          tier: "required",
          guidance: {
            whatItIs: "Whether ethics approval has been sought and its outcome, for empirical projects involving human participants or sensitive data.",
            whyItMatters: "Blocking for empirical projects — writing up unapproved data collection is a research-conduct issue, not just a paperwork gap, and needs to be caught before drafting proceeds, not at submission.",
            example: "Approved, reference REC-2026-0142.",
            defaultWithRationale: "Not applicable, and left blank, for theoretical projects.",
          },
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "supervisor_name",
          label: "Supervisor",
          tier: "recommended",
          guidance: {
            whatItIs: "Your supervisor's name, for the title page and acknowledgements.",
            whyItMatters: "Many templates require it on the title page.",
            example: "Dr. Amara Chen",
            defaultWithRationale: "Left blank until supplied; the title page renders without a supervisor line.",
          },
          allowsProvisional: true,
        },
        {
          key: "department_handbook",
          label: "Department handbook",
          tier: "recommended",
          guidance: {
            whatItIs: "Your department's dissertation or capstone handbook, if one exists.",
            whyItMatters: "The single highest-value upload for this output type — it usually fixes chapter structure, word limits, and formatting exactly.",
            example: "A PDF handbook from your department's student portal.",
            defaultWithRationale: "Without one, we apply common conventions for your discipline, editable once you have the real handbook.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "declaration_present", description: "Declaration of originality present", severity: "blocking" },
      { id: "ethics_approval_recorded", description: "Ethics approval status is on file for an empirical project", severity: "blocking", appliesWhen: "empirical_or_theoretical = empirical", metadataKey: "ethics_approval_status" },
      { id: "research_question_answered", description: "Research question answered explicitly in the conclusion", severity: "required" },
      { id: "budget_adherence", description: "Each chapter within ±20% of its budget", severity: "advisory" },
    ],
    workflowVariant: "long_form_chaptered",
    complianceProfile: "institutional",
    exportDefaults: { format: "docx", includeToc: true },
  },

  // ── OT-07 Master's Thesis — long_form / chapter_based / institutional ───
  {
    id: "OT-07",
    version: 1,
    label: "Master's Thesis",
    aliases: ["masters dissertation", "msc thesis", "ma thesis"],
    family: "long_form",
    academicLevels: ["masters"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "chapter_based",
      sections: [
        { key: "title_page", title: "Title Page", required: true, countsTowardWordcount: false, guidance: "Title, your name, degree, institution, submission date, per your department's template." },
        { key: "declaration", title: "Declaration of Originality", required: true, countsTowardWordcount: false, guidance: "The standard statement that this is your own work, using your institution's exact wording." },
        { key: "abstract", title: "Abstract", required: true, countsTowardWordcount: false, wordBudget: { min: 200, max: 350, typical: 300 }, guidance: "A single paragraph summarising the question, method, key findings, and contribution." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "Motivates the research question and previews the thesis structure." },
        { key: "literature_review", title: "Literature Review", required: true, countsTowardWordcount: true, guidance: "Situates your work against existing research; identifies the gap you address." },
        { key: "methodology", title: "Methodology", required: true, countsTowardWordcount: true, guidance: "Names your research design, data collection method, and analysis approach precisely enough to be reproducible." },
        { key: "results", title: "Results", required: true, countsTowardWordcount: true, guidance: "Reports findings without interpreting them — interpretation belongs in Discussion." },
        { key: "discussion", title: "Discussion", required: true, countsTowardWordcount: true, guidance: "Interprets the results against the literature and answers the research question explicitly." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, guidance: "Restates the contribution, states limitations, and suggests future work." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Full bibliography in your required citation style." },
      ],
      frontMatter: ["title_page", "declaration", "abstract"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 15000, max: 25000, typical: 20000 },
      distribution: {
        introduction: 0.1,
        literature_review: 0.25,
        methodology: 0.15,
        results: 0.2,
        discussion: 0.15,
        conclusion: 0.05,
      },
    },
    sources: { targetCount: { min: 50, typical: 80 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.7, other: 0.3 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7", "chicago-author-date"] },
    intakeSchema: {
      required: [
        {
          key: "research_question",
          label: "Research question",
          tier: "required",
          guidance: {
            whatItIs: "The single question your thesis answers.",
            whyItMatters: "Every chapter must serve it. A vague question produces a thesis that cannot be examined.",
            example: "How did municipal water policy in Lagos change between 2010 and 2020, and what drove those changes?",
            defaultWithRationale: "Not sure yet? That's normal at this stage — start with your topic and the word 'how' or 'why'; we'll help you sharpen it at the structure stage.",
          },
          allowsProvisional: true,
        },
        {
          key: "methodology_type",
          label: "Methodology type",
          tier: "required",
          guidance: {
            whatItIs: "Whether your work is qualitative, quantitative, mixed-methods, or theoretical.",
            whyItMatters: "It determines whether Methodology and Results chapters even apply, and what they should contain.",
            example: "Mixed-methods: a survey (quantitative) followed by interviews (qualitative).",
            defaultWithRationale: "We default to 'theoretical' when unspecified, since it's the only option requiring no empirical apparatus.",
          },
          defaultValue: "theoretical",
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "institutional_template",
          label: "Institutional template",
          tier: "recommended",
          guidance: {
            whatItIs: "Your department's required thesis template or formatting handbook.",
            whyItMatters: "It usually fixes your front matter, margins, and heading styles exactly — the single highest-value upload for this output type.",
            example: "A .docx or .dotx template from your graduate school, or a PDF regulations handbook.",
            defaultWithRationale: "Without one, we apply common conventions for your discipline, editable once you have the real template.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "supervisor_name",
          label: "Supervisor",
          tier: "optional",
          guidance: {
            whatItIs: "Your supervisor's name, for the title page and acknowledgements.",
            whyItMatters: "Many templates require it on the title page.",
            example: "Dr. Amara Chen",
            defaultWithRationale: "Left blank until supplied; the title page renders without a supervisor line.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "declaration_present", description: "Declaration of originality present", severity: "blocking" },
      { id: "budget_adherence", description: "Each chapter within ±20% of its budget", severity: "advisory" },
      { id: "methodology_disclosure", description: "Methodology names design, sampling, and analysis", severity: "required", appliesWhen: "empirical" },
      { id: "question_answered", description: "Research question answered explicitly in the conclusion", severity: "required" },
    ],
    workflowVariant: "long_form_chaptered",
    complianceProfile: "institutional",
    exportDefaults: { format: "docx", includeToc: true },
  },

  // ── OT-08 Doctoral Dissertation — long_form / chapter_based / institutional ──
  // Modeled as the monograph format (the baseline every field defaults to
  // when thesis_format is unanswered). The by-publication variant — where
  // empirical chapters are published papers with a connecting narrative —
  // is a materially different structure template per docs 14 §9's own
  // note and is not modeled here; the by-publication-specific intake
  // fields and quality gate below are marked as applying only to that
  // variant, honestly, rather than pretending this one structure covers both.
  {
    id: "OT-08",
    version: 1,
    label: "Doctoral Dissertation",
    aliases: ["phd thesis", "doctoral thesis", "dissertation"],
    family: "long_form",
    academicLevels: ["doctoral"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "chapter_based",
      sections: [
        { key: "title_page", title: "Title Page", required: true, countsTowardWordcount: false, guidance: "Title, your name, degree, institution, submission date, per your department's template." },
        { key: "declaration", title: "Declaration of Originality", required: true, countsTowardWordcount: false, guidance: "The standard statement that this is your own work, using your institution's exact wording." },
        { key: "abstract", title: "Abstract", required: true, countsTowardWordcount: false, wordBudget: { min: 250, max: 400, typical: 300 }, guidance: "A single paragraph summarising the question, method, key findings, and contribution." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "Motivates the research question and previews the dissertation's structure." },
        { key: "literature_review", title: "Literature Review", required: true, countsTowardWordcount: true, guidance: "Situates the work against existing research; identifies the gap it addresses." },
        { key: "methodology", title: "Methodology", required: true, countsTowardWordcount: true, guidance: "Names the research design, data collection method, and analysis approach precisely enough to be reproducible." },
        { key: "empirical_chapters", title: "Empirical / Substantive Chapters", required: true, countsTowardWordcount: true, guidance: "The dissertation's core chapters reporting original work — typically several, one per study or major result. Modeled here as one aggregate section; the drafting pipeline splits it into per-chapter units at G3." },
        { key: "discussion", title: "Discussion", required: true, countsTowardWordcount: true, guidance: "Interprets the results across all empirical chapters against the literature." },
        { key: "contribution_statement", title: "Contribution to Knowledge", required: true, countsTowardWordcount: true, wordBudget: { min: 300, max: 1500, typical: 800 }, guidance: "States explicitly what the dissertation contributes that did not exist before it. Every claim here must be traceable to the empirical chapters — this is the one place examiners look first." },
        { key: "limitations", title: "Limitations", required: true, countsTowardWordcount: true, wordBudget: { min: 200, max: 1000, typical: 500 }, guidance: "States the boundaries of the work honestly — scope, method, and generalisability limits." },
        { key: "future_work", title: "Future Work", required: false, countsTowardWordcount: true, guidance: "Directions the contribution opens up, distinct from limitations." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, guidance: "Draws the dissertation together; does not introduce new evidence." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Full bibliography in the required citation style." },
      ],
      frontMatter: ["title_page", "declaration", "abstract"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 40000, max: 100000, typical: 70000 },
      distribution: {
        introduction: 0.06,
        literature_review: 0.18,
        methodology: 0.12,
        empirical_chapters: 0.35,
        discussion: 0.15,
        contribution_statement: 0.02,
        limitations: 0.01,
        conclusion: 0.03,
      },
    },
    sources: { targetCount: { min: 150, typical: 250 }, recencyExpectation: "majority within 10 years, with foundational older work expected", typeMix: { peer_reviewed: 0.75, other: 0.25 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7", "chicago-author-date"] },
    intakeSchema: {
      required: [
        {
          key: "thesis_format",
          label: "Thesis format",
          tier: "required",
          guidance: {
            whatItIs: "Whether the dissertation is a monograph, by publication (chapters are published or publication-ready papers), or hybrid.",
            whyItMatters: "Restructures everything — chapter boundaries, the connecting narrative, and which quality gates apply.",
            example: "By publication: three journal articles (two published, one under review) with a connecting introduction and discussion.",
            defaultWithRationale: "There is no safe default for this — it changes the entire structure, so it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "contribution_claim",
          label: "Contribution claim",
          tier: "required",
          guidance: {
            whatItIs: "In one or two sentences, what the dissertation contributes that is new.",
            whyItMatters: "Everything else in the dissertation exists to support this claim — it is the first thing examiners assess.",
            example: "The first empirical account of how municipal water policy diffusion follows political rather than hydrological boundaries.",
            defaultWithRationale: "If not yet crystallised, mark this provisional and describe your research question instead — we'll propose candidate contribution statements once the empirical chapters exist.",
          },
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "viva_jurisdiction",
          label: "Viva / defence jurisdiction",
          tier: "recommended",
          guidance: {
            whatItIs: "The country or institutional system your viva or defence follows (affects declaration wording and formatting conventions).",
            whyItMatters: "UK vivas, US defences, and European systems have different regulatory expectations.",
            example: "UK, under a Russell Group university's standard regulations.",
            defaultWithRationale: "Defaults to generic institutional conventions when unspecified.",
          },
          allowsProvisional: true,
        },
        {
          key: "publication_status_of_chapters",
          label: "Publication status of chapters",
          tier: "recommended",
          guidance: {
            whatItIs: "For each empirical chapter, whether it is published, under review, or unpublished — relevant only for the by-publication format.",
            whyItMatters: "Published chapters carry citation and copyright obligations that unpublished ones don't.",
            example: "Chapter 3 published in Water Research (2025); Chapter 4 under review.",
            defaultWithRationale: "Not applicable, and left blank, for the monograph format.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "embargo_requirements",
          label: "Embargo requirements",
          tier: "optional",
          guidance: {
            whatItIs: "Whether the dissertation (or parts of it) must be embargoed from public access after submission.",
            whyItMatters: "Common for industry-sponsored or pre-publication work; affects the export and repository deposit step.",
            example: "12-month embargo on Chapter 4 pending a pending patent application.",
            defaultWithRationale: "Defaults to no embargo unless stated.",
          },
          defaultValue: "no embargo",
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "contribution_stated", description: "Contribution to knowledge is stated explicitly", severity: "blocking" },
      { id: "limitations_present", description: "Limitations section present", severity: "required" },
      { id: "chapter_self_contained", description: "Each empirical chapter is self-contained", severity: "required", appliesWhen: "thesis_format = by_publication" },
      { id: "terminology_consistency", description: "Consistent terminology used across chapters", severity: "advisory" },
      { id: "contribution_claims_supported", description: "No unsupported claims in the contribution statement", severity: "blocking", usesClaimGraph: true },
    ],
    workflowVariant: "long_form_chaptered",
    complianceProfile: "institutional",
    exportDefaults: { format: "docx", includeToc: true },
  },

  // ── OT-09 Book / Monograph — long_form / chapter_based / venue (publisher) ──
  // The first entry whose default citation style is
  // chicago-notes-bibliography (this session's own ChicagoNotesFormatter,
  // src/citation_compliance/formatters/chicagoNotes.ts) rather than an
  // author-date style — docs 14 §9's own note: "Chicago notes-bibliography
  // is the common style and the citation layer must support the notes
  // variant, not only author-date," which is exactly the gap that
  // formatter closed. Index generation is an export-stage concern (docs
  // 33 §6) and is not modeled as a structural section here.
  {
    id: "OT-09",
    version: 1,
    label: "Book / Monograph",
    aliases: ["academic monograph", "scholarly book"],
    family: "long_form",
    academicLevels: ["doctoral", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "chapter_based",
      sections: [
        { key: "title_page", title: "Title Page", required: true, countsTowardWordcount: false, guidance: "Half title, full title, subtitle, author, and publisher imprint, per the publisher's design template." },
        { key: "preface", title: "Preface", required: false, countsTowardWordcount: true, guidance: "Why this book, why now, and the author's relationship to the subject — distinct from the Introduction's argument." },
        { key: "acknowledgements", title: "Acknowledgements", required: false, countsTowardWordcount: false, guidance: "Thanks to colleagues, institutions, and funders." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "States the book's central argument and previews how the chapters build it." },
        { key: "chapters", title: "Chapters", required: true, countsTowardWordcount: true, guidance: "The book's substantive chapters, optionally grouped into parts. Modeled here as one aggregate section; the drafting pipeline splits it into per-chapter units at G3." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, guidance: "Draws the argument together and states its wider implications." },
        { key: "notes", title: "Notes", required: true, countsTowardWordcount: false, guidance: "Compiled endnotes (or footnotes, per notes_style) in Chicago notes-bibliography form — full note on first citation, shortened note thereafter." },
        { key: "bibliography", title: "Bibliography", required: true, countsTowardWordcount: false, guidance: "Full bibliography, alphabetical by author, in the required citation style." },
      ],
      frontMatter: ["title_page", "preface", "acknowledgements"],
      backMatter: ["notes", "bibliography"],
    },
    budget: {
      totalWords: { min: 60000, max: 150000, typical: 90000 },
      distribution: {
        introduction: 0.06,
        chapters: 0.82,
        conclusion: 0.05,
      },
    },
    sources: { targetCount: { min: 100, typical: 200 }, recencyExpectation: "majority within 15 years, with foundational older work expected", typeMix: { peer_reviewed: 0.6, other: 0.4 } },
    citation: { defaultStyle: "chicago-notes-bibliography", commonStyles: ["chicago-notes-bibliography", "chicago-author-date", "harvard"] },
    intakeSchema: {
      required: [
        {
          key: "publisher_and_series",
          label: "Publisher and series",
          tier: "required",
          guidance: {
            whatItIs: "The press you're contracted with (or targeting), and the series if one applies.",
            whyItMatters: "Drives the entire compliance Rubric the same way a target journal does for OT-10 — word limit, notes style, and manuscript delivery format all come from the publisher's own guidelines.",
            example: "Cambridge University Press, Cambridge Studies in Comparative Politics.",
            defaultWithRationale: "Without one, we use generic scholarly monograph conventions and flag every publisher-specific check as not yet applicable.",
          },
          allowsProvisional: true,
        },
        {
          key: "notes_style",
          label: "Notes style",
          tier: "required",
          guidance: {
            whatItIs: "Footnotes (per page) or endnotes (compiled at the back), independent of the notes-bibliography citation format itself.",
            whyItMatters: "Chicago-dominant fields disagree on this by convention as much as by publisher rule — worth confirming rather than assuming.",
            example: "Endnotes, compiled by chapter.",
            defaultWithRationale: "Defaults to endnotes, the more common choice for a full-length monograph.",
          },
          defaultValue: "endnotes",
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "publisher_style_guide",
          label: "Publisher style guide",
          tier: "recommended",
          guidance: {
            whatItIs: "The press's own style guide or author instructions, if published.",
            whyItMatters: "The single highest-value input for compliance here — word limits, notes conventions, and manuscript delivery requirements usually live in this one document.",
            example: "A downloaded PDF of the press's 'Notes for Authors.'",
            defaultWithRationale: "If unavailable, we use Chicago Manual of Style's own conventions as the fallback.",
          },
          allowsProvisional: true,
        },
        {
          key: "index_required",
          label: "Index required",
          tier: "recommended",
          guidance: {
            whatItIs: "Whether the press requires an index, and if so, author-prepared or professionally indexed.",
            whyItMatters: "Index generation happens at export time, not during drafting, but affects manuscript delivery scheduling.",
            example: "Yes, author-prepared, per the contract.",
            defaultWithRationale: "Defaults to no index requirement unless the contract specifies one.",
          },
          defaultValue: "no",
          allowsProvisional: true,
        },
        {
          key: "part_level_grouping",
          label: "Part-level grouping",
          tier: "recommended",
          guidance: {
            whatItIs: "Whether chapters are grouped into named or numbered Parts.",
            whyItMatters: "Changes the table of contents structure and chapter numbering convention.",
            example: "Yes — Part I: Foundations (Ch. 1-3), Part II: Applications (Ch. 4-6).",
            defaultWithRationale: "Defaults to no part-level grouping — a flat chapter list — unless specified.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "manuscript_delivery_format",
          label: "Manuscript delivery format",
          tier: "optional",
          guidance: {
            whatItIs: "The file format and formatting conventions the press requires for final delivery.",
            whyItMatters: "Presses vary widely here — some want minimally formatted Word files, others a specific LaTeX class.",
            example: "Word .docx, double-spaced, Times New Roman 12pt, per the contract's manuscript specifications.",
            defaultWithRationale: "Defaults to a standard double-spaced Word manuscript pending the press's actual requirements.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "structural_completeness", description: "Every required section present and non-empty", severity: "blocking" },
      { id: "notes_style_consistent", description: "Notes are consistently footnotes or consistently endnotes, matching notes_style", severity: "required" },
      { id: "bibliography_matches_notes", description: "Every source cited in the notes appears in the bibliography", severity: "blocking" },
    ],
    workflowVariant: "long_form_chaptered",
    complianceProfile: "venue",
    exportDefaults: { format: "docx", includeToc: true },
  },

  // ── OT-10 Journal Article — publication / imrad / venue_targeted ───────
  {
    id: "OT-10",
    version: 1,
    label: "Journal Article",
    aliases: ["research paper", "manuscript", "journal submission"],
    family: "publication",
    academicLevels: ["masters", "doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "imrad",
      sections: [
        { key: "title", title: "Title", required: true, countsTowardWordcount: false, guidance: "Concise, specific, and searchable — avoid vague titles like 'A study of...'." },
        { key: "abstract", title: "Abstract", required: true, countsTowardWordcount: false, wordBudget: { min: 150, max: 300, typical: 250 }, guidance: "Structured or unstructured per the venue; states objective, method, key result, and conclusion." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "Establishes the gap in the literature this paper fills." },
        { key: "methods", title: "Methods", required: true, countsTowardWordcount: true, guidance: "Detailed enough for replication." },
        { key: "results", title: "Results", required: true, countsTowardWordcount: true, guidance: "Findings only, no interpretation." },
        { key: "discussion", title: "Discussion", required: true, countsTowardWordcount: true, guidance: "Interprets results, states limitations, situates against prior work." },
        { key: "declarations", title: "Declarations", required: true, countsTowardWordcount: false, guidance: "Funding, conflicts of interest, ethics approval, data availability, author contributions." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "In the target venue's exact citation style." },
      ],
      frontMatter: ["title", "abstract"],
      backMatter: ["declarations", "references"],
    },
    budget: {
      totalWords: { min: 3000, max: 10000, typical: 6000 },
      distribution: { introduction: 0.15, methods: 0.2, results: 0.25, discussion: 0.3 },
    },
    sources: { targetCount: { min: 30, typical: 50 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.85, other: 0.15 } },
    citation: { defaultStyle: "vancouver", commonStyles: ["vancouver", "apa7", "ieee"] },
    intakeSchema: {
      required: [
        {
          key: "target_journal",
          label: "Target journal",
          tier: "required",
          guidance: {
            whatItIs: "The journal you intend to submit to.",
            whyItMatters: "It drives the entire compliance Rubric — word limit, structure, citation style, and required declarations all come from it.",
            example: "Water Research (Elsevier)",
            defaultWithRationale: "Without one, we use generic IMRaD conventions and flag every venue-specific check as not yet applicable.",
          },
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "author_guidelines",
          label: "Author guidelines",
          tier: "recommended",
          guidance: {
            whatItIs: "The journal's 'Guide for Authors' page or PDF.",
            whyItMatters: "The single highest-value input for compliance — word limits, section requirements, and declarations all live here.",
            example: "A link to the journal's author-guidelines page, or a downloaded PDF.",
            defaultWithRationale: "If unavailable, we use the venue's curated profile where one exists, or generic conventions otherwise.",
          },
          allowsProvisional: true,
        },
        {
          key: "article_type",
          label: "Article type",
          tier: "recommended",
          guidance: {
            whatItIs: "Original research, review, short communication, or case report.",
            whyItMatters: "Word limits and structure differ substantially by type.",
            example: "Original research article",
            defaultWithRationale: "Defaults to 'original research', the most common type.",
          },
          defaultValue: "original_research",
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "preprint_intention",
          label: "Preprint intention",
          tier: "optional",
          guidance: {
            whatItIs: "Whether you plan to post a preprint before or during review.",
            whyItMatters: "Some venues restrict this; worth flagging early.",
            example: "Yes, to arXiv, before submission.",
            defaultWithRationale: "Defaults to no preprint unless stated.",
          },
          defaultValue: "no",
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "abstract_limit", description: "Abstract within the venue's word limit", severity: "blocking", sectionWordLimitGate: { sectionKey: "abstract" } },
      { id: "declarations_present", description: "All required declarations present", severity: "blocking", declarationsPresentGate: true },
      { id: "citation_style_exact", description: "Reference style matches the venue exactly", severity: "blocking", citationStyleExactGate: true },
    ],
    workflowVariant: "venue_targeted",
    complianceProfile: "venue",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-11 Conference Paper — publication / imrad / venue_targeted ──────
  // The page-limit gate below is descriptive only, per docs 14 §9's own
  // note: "genuinely different from a word count — requires rendering to
  // the template and measuring," which needs a layout-measurement pass
  // (docs 33 §5) that doesn't exist. budget.totalWords is a word-count
  // proxy for the stated word range, not the binding constraint for venues
  // that only publish a page limit — stated honestly rather than modeled
  // as equivalent.
  {
    id: "OT-11",
    version: 1,
    label: "Conference Paper",
    aliases: ["conference submission", "workshop paper", "proceedings paper"],
    family: "publication",
    academicLevels: ["masters", "doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "imrad",
      sections: [
        { key: "title", title: "Title", required: true, countsTowardWordcount: false, guidance: "Concise and specific, within the template's title-length convention if one exists." },
        { key: "abstract", title: "Abstract", required: true, countsTowardWordcount: false, wordBudget: { min: 100, max: 250, typical: 200 }, guidance: "States objective, method, key result, and conclusion within the venue's abstract limit." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "Establishes the gap this paper fills, compressed for a shorter venue than a journal article." },
        { key: "methods", title: "Methods", required: true, countsTowardWordcount: true, guidance: "Detailed enough for replication, within the page budget." },
        { key: "results", title: "Results", required: true, countsTowardWordcount: true, guidance: "Findings only, no interpretation." },
        { key: "discussion", title: "Discussion", required: true, countsTowardWordcount: true, guidance: "Interprets results and situates against prior work, compressed relative to a journal article." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "In the conference's exact required style and format." },
      ],
      frontMatter: ["title", "abstract"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 2000, max: 8000, typical: 4500 },
      distribution: { introduction: 0.15, methods: 0.25, results: 0.25, discussion: 0.25 },
    },
    sources: { targetCount: { min: 15, typical: 25 }, recencyExpectation: "majority within 5 years — conference venues favour recency", typeMix: { peer_reviewed: 0.8, other: 0.2 } },
    citation: { defaultStyle: "ieee", commonStyles: ["ieee", "vancouver", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "conference_and_track",
          label: "Conference and track",
          tier: "required",
          guidance: {
            whatItIs: "The specific conference and, if applicable, its track or workshop.",
            whyItMatters: "Drives the template, page limit, and citation style — all fixed by the venue, not negotiable.",
            example: "ACM CHI 2027, Papers track.",
            defaultWithRationale: "Without one, we use generic conference conventions and flag every venue-specific check as not yet applicable.",
          },
          allowsProvisional: true,
        },
        {
          key: "page_limit_and_references_count",
          label: "Page limit, and whether references count toward it",
          tier: "required",
          guidance: {
            whatItIs: "The venue's hard page limit, and whether the reference list counts against it.",
            whyItMatters: "Conference limits are strict and enforced at submission — going over by even a line can mean desk rejection.",
            example: "8 pages including references, ACM double-column format.",
            defaultWithRationale: "There is no safe default for this — it is venue-specific and blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "template",
          label: "Template",
          tier: "required",
          guidance: {
            whatItIs: "The required formatting template — ACM, IEEE, Springer LNCS, or a custom one supplied by the venue.",
            whyItMatters: "Page count is measured against this template, not a generic word count — the wrong template invalidates any budget estimate.",
            example: "ACM sigconf template, double column.",
            defaultWithRationale: "Defaults to a generic single-column template pending the real one.",
          },
          defaultValue: "generic",
          allowsProvisional: true,
        },
        {
          key: "anonymous_submission",
          label: "Anonymous submission required",
          tier: "required",
          guidance: {
            whatItIs: "Whether the venue requires double-blind anonymisation — no author names, institutions, or identifying self-citation.",
            whyItMatters: "Has a blocking implication for author fields and how prior work is cited; getting this wrong risks desk rejection independent of paper quality.",
            example: "Yes, double-blind — remove all author-identifying information including acknowledgements.",
            defaultWithRationale: "There is no safe default for this — assuming the wrong answer either leaks identity or wrongly blanks required author fields, so it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "deadline",
          label: "Submission deadline",
          tier: "recommended",
          guidance: {
            whatItIs: "The hard submission deadline, including timezone.",
            whyItMatters: "Conference deadlines are fixed and unextendable, unlike journal submission which has no clock.",
            example: "March 15, 2027, 23:59 AoE.",
            defaultWithRationale: "If not given, no deadline-based prioritisation is applied.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "page_limit_satisfied", description: "Page limit satisfied in rendered output, not estimated word count", severity: "blocking" },
      { id: "anonymisation_complete", description: "Submission is fully anonymised", severity: "blocking", appliesWhen: "anonymous_submission = yes" },
      { id: "template_applied", description: "The venue's required template is applied", severity: "blocking" },
    ],
    workflowVariant: "venue_targeted",
    complianceProfile: "venue",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-12 Review Article — publication / thematic / venue_targeted ─────
  // The systematic variant's PRISMA obligations (search strategy,
  // databases searched, inclusion/exclusion criteria, the flow diagram)
  // are real per docs 14 §9's notes — "the best showcase for the
  // claim-evidence graph" — but mapping the Source Approval Queue onto
  // PRISMA screening stages needs a queue and screening workflow that
  // doesn't exist yet (no client, docs 13 §8.1). The systematic-only
  // intake fields and quality gates are recorded here, honestly marked as
  // conditional, not compiled into anything PRISMA-specific yet.
  {
    id: "OT-12",
    version: 1,
    label: "Review Article",
    aliases: ["systematic review", "narrative review", "scoping review"],
    family: "publication",
    academicLevels: ["doctoral", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "thematic",
      sections: [
        { key: "abstract", title: "Abstract", required: true, countsTowardWordcount: false, wordBudget: { min: 200, max: 350, typical: 300 }, guidance: "States the review's scope, method, and key conclusions." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "Motivates why this review is needed now." },
        { key: "scope_search_strategy", title: "Scope and Search Strategy", required: true, countsTowardWordcount: true, guidance: "What is in and out of scope, and how the literature was found — for a systematic review, this must be reproducible." },
        { key: "thematic_sections", title: "Thematic Sections", required: true, countsTowardWordcount: true, wordBudget: { min: 2500, max: 8000, typical: 4500 }, guidance: "The review's substantive body, organised by theme. Modeled here as one aggregate section; the drafting pipeline splits it at G3." },
        { key: "synthesis", title: "Synthesis", required: true, countsTowardWordcount: true, guidance: "Connects the themes into an overall picture of the field." },
        { key: "gaps_future_directions", title: "Gaps and Future Directions", required: true, countsTowardWordcount: true, guidance: "What the literature has not yet addressed." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, guidance: "Summarises the state of the field." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the required style." },
      ],
      frontMatter: ["abstract"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 5000, max: 15000, typical: 9000 },
      distribution: { introduction: 0.08, scope_search_strategy: 0.07, thematic_sections: 0.5, synthesis: 0.2, gaps_future_directions: 0.08, conclusion: 0.04 },
    },
    sources: { targetCount: { min: 80, typical: 150 }, recencyExpectation: "majority within 10 years, with foundational older work included deliberately", typeMix: { peer_reviewed: 0.9, other: 0.1 } },
    citation: { defaultStyle: "vancouver", commonStyles: ["vancouver", "apa7", "ieee"] },
    intakeSchema: {
      required: [
        {
          key: "review_type",
          label: "Review type",
          tier: "required",
          guidance: {
            whatItIs: "Narrative, systematic, scoping, or umbrella review.",
            whyItMatters: "A systematic review triggers PRISMA obligations — a reproducible search strategy, a flow diagram, documented inclusion/exclusion criteria — that a narrative review does not carry.",
            example: "Systematic review, PRISMA 2020-compliant.",
            defaultWithRationale: "There is no safe default for this — it changes what compliance actually requires, so it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "date_range",
          label: "Date range",
          tier: "required",
          guidance: {
            whatItIs: "The publication date range the review covers.",
            whyItMatters: "Defines the search's temporal scope and is reported explicitly in a systematic review's methods.",
            example: "January 2010 to December 2025.",
            defaultWithRationale: "Defaults to the last 10 years pending a more specific range.",
          },
          defaultValue: "last 10 years",
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "search_strategy",
          label: "Search strategy",
          tier: "recommended",
          guidance: {
            whatItIs: "The exact search terms, Boolean logic, and databases used — mandatory and blocking for a systematic review, not required for a narrative one.",
            whyItMatters: "A systematic review's search must be reproducible by another researcher; without a documented strategy, the review can't claim to be systematic.",
            example: "(\"remote work\" OR \"telework\") AND (\"productivity\") searched across PubMed, Scopus, and Web of Science.",
            defaultWithRationale: "Not applicable, and left blank, for narrative, scoping, or umbrella reviews.",
          },
          allowsProvisional: true,
        },
        {
          key: "databases_searched",
          label: "Databases searched",
          tier: "recommended",
          guidance: {
            whatItIs: "The specific databases the search strategy was run against.",
            whyItMatters: "Part of the reproducibility requirement for a systematic review.",
            example: "PubMed, Scopus, Web of Science, PsycINFO.",
            defaultWithRationale: "Not applicable, and left blank, for non-systematic reviews.",
          },
          allowsProvisional: true,
        },
        {
          key: "inclusion_exclusion_criteria",
          label: "Inclusion/exclusion criteria",
          tier: "recommended",
          guidance: {
            whatItIs: "The explicit criteria used to include or exclude studies found by the search.",
            whyItMatters: "Required for a systematic review's PRISMA flow diagram — every excluded study needs a stated reason.",
            example: "Include: peer-reviewed, empirical, English-language. Exclude: conference abstracts, non-human studies.",
            defaultWithRationale: "Not applicable, and left blank, for non-systematic reviews.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "search_strategy_reproducible", description: "The search strategy is documented precisely enough for another researcher to reproduce it", severity: "blocking", appliesWhen: "review_type = systematic" },
      { id: "prisma_flow_diagram_present", description: "A PRISMA flow diagram accounts for every study found, screened, and excluded with reasons", severity: "blocking", appliesWhen: "review_type = systematic" },
      { id: "every_included_study_in_corpus", description: "Every study cited as included is present in the approved source corpus", severity: "blocking" },
      { id: "thematic_coverage_balanced", description: "Thematic sections are proportionate to the literature rather than skewed toward the author's own prior work", severity: "advisory" },
    ],
    workflowVariant: "venue_targeted",
    complianceProfile: "venue",
    exportDefaults: { format: "docx", includeToc: true },
  },

  // ── OT-14 Book Chapter — publication / linear / venue (editor/publisher) ─
  // docs 14 §9 doesn't itemize OT-14's sections the way it does for most
  // entries (only intake and notes) — the section list below is inferred
  // as the standard chapter shape (introduction / body / conclusion /
  // references) consistent with the `linear` structure the doc does
  // specify, not invented content beyond that.
  {
    id: "OT-14",
    version: 1,
    label: "Book Chapter",
    aliases: ["edited volume chapter", "contributed chapter"],
    family: "publication",
    academicLevels: ["doctoral", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "Introduces the chapter's argument and its place in the volume." },
        { key: "body", title: "Body", required: true, countsTowardWordcount: true, wordBudget: { min: 4000, max: 10000, typical: 6500 }, guidance: "The chapter's substantive content." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, guidance: "Draws the chapter's argument together and connects back to the volume's overall theme." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the volume's house style." },
      ],
      frontMatter: [],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 5000, max: 12000, typical: 8000 },
      distribution: { introduction: 0.1, body: 0.75, conclusion: 0.08 },
    },
    sources: { targetCount: { min: 30, typical: 50 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.7, other: 0.3 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "chicago-notes-bibliography", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "house_style",
          label: "House style",
          tier: "required",
          guidance: {
            whatItIs: "The volume's required citation and formatting style, as set by the editor or publisher.",
            whyItMatters: "Edited volumes enforce a single consistent style across every contributed chapter — using your own discipline's default instead of the volume's is a common, avoidable rejection reason.",
            example: "Chicago notes-bibliography, per the volume's style sheet.",
            defaultWithRationale: "There is no safe default for this — it is volume-specific and blocks progress until answered.",
          },
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "volume_title_and_editors",
          label: "Volume title and editors",
          tier: "recommended",
          guidance: {
            whatItIs: "The edited volume's title and its editors.",
            whyItMatters: "Establishes what the chapter needs to fit into, thematically and stylistically.",
            example: "\"Sovereignty Reconsidered\", eds. J. Okafor and M. Lindqvist.",
            defaultWithRationale: "Left blank until supplied.",
          },
          allowsProvisional: true,
        },
        {
          key: "editors_brief_upload",
          label: "Editor's brief",
          tier: "recommended",
          guidance: {
            whatItIs: "The brief the editors circulated to contributors — scope, length, deadlines, and how the chapter should relate to the volume's argument.",
            whyItMatters: "The single highest-value input for this output type — the editor's brief is effectively the requirement source, the same role a target journal's guidelines play for OT-10.",
            example: "A PDF or emailed brief from the volume editors.",
            defaultWithRationale: "Without one, generic contributed-chapter conventions are used, editable once the real brief is available.",
          },
          allowsProvisional: true,
        },
        {
          key: "abstract_required",
          label: "Is an abstract required?",
          tier: "recommended",
          guidance: {
            whatItIs: "Whether the volume requires a short abstract preceding each chapter.",
            whyItMatters: "Some edited volumes require one for indexing purposes; others don't use them at all.",
            example: "Yes, 150 words, per the editor's brief.",
            defaultWithRationale: "Defaults to no abstract required unless the brief specifies one.",
          },
          defaultValue: "no",
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "position_in_volume",
          label: "Position in volume",
          tier: "optional",
          guidance: {
            whatItIs: "Where the chapter falls in the volume's running order, if known.",
            whyItMatters: "Affects how much context the chapter needs to assume — an opening chapter sets up terms later chapters can take for granted.",
            example: "Chapter 4 of 9, in the volume's second part.",
            defaultWithRationale: "If unknown, the chapter is written to stand reasonably alone.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "structural_completeness", description: "Every required section present and non-empty", severity: "blocking" },
      { id: "budget_adherence", description: "Within ±20% of the word limit", severity: "required" },
      { id: "relationship_to_volume_stated", description: "The chapter states how it relates to the volume's overall argument", severity: "advisory" },
    ],
    workflowVariant: "venue_targeted",
    complianceProfile: "venue",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-15 Research Proposal — proposal_funding / linear / institutional ─
  // Distinct from OT-16 by not being funder-prescribed: a degree-admission
  // or upgrade proposal follows a fixed linear shape the institution sets,
  // not a call document. Ethical considerations is already a required
  // structural section here (compiled by compileStructuralRules), so it
  // needs no metadataKey — a real second example, after OT-06, of the
  // same judgment call: model a requirement where the catalog already
  // models it best, don't force a second mechanism onto it.
  {
    id: "OT-15",
    version: 1,
    label: "Research Proposal",
    aliases: ["PhD proposal", "upgrade proposal", "admission proposal"],
    family: "proposal_funding",
    academicLevels: ["masters", "doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "title", title: "Title", required: true, countsTowardWordcount: false, guidance: "Working title of the proposed research." },
        { key: "abstract", title: "Abstract", required: true, countsTowardWordcount: false, wordBudget: { min: 150, max: 300, typical: 200 }, guidance: "Summarises the question, approach, and expected contribution." },
        { key: "background_rationale", title: "Background and Rationale", required: true, countsTowardWordcount: true, guidance: "Why this research matters and what motivates it." },
        { key: "research_questions", title: "Research Questions", required: true, countsTowardWordcount: true, guidance: "The specific questions the research will answer, stated precisely." },
        { key: "literature_review", title: "Literature Review", required: true, countsTowardWordcount: true, guidance: "Situates the proposal against existing work; identifies the gap." },
        { key: "methodology", title: "Methodology", required: true, countsTowardWordcount: true, guidance: "The proposed research design, data collection, and analysis approach." },
        { key: "timeline", title: "Timeline", required: true, countsTowardWordcount: false, guidance: "A realistic schedule of milestones against the stated duration." },
        { key: "ethical_considerations", title: "Ethical Considerations", required: true, countsTowardWordcount: true, guidance: "Anticipated ethical issues and how they will be addressed, even if formal approval is a later step." },
        { key: "expected_outcomes", title: "Expected Outcomes", required: true, countsTowardWordcount: true, guidance: "What the research is expected to contribute or produce." },
        { key: "resources", title: "Resources", required: true, countsTowardWordcount: false, guidance: "Facilities, equipment, or access required beyond normal supervision." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the required style." },
      ],
      frontMatter: ["title", "abstract"],
      backMatter: ["resources", "references"],
    },
    budget: {
      totalWords: { min: 1500, max: 10000, typical: 5000 },
      distribution: {
        background_rationale: 0.15,
        research_questions: 0.08,
        literature_review: 0.3,
        methodology: 0.25,
        ethical_considerations: 0.07,
        expected_outcomes: 0.1,
      },
    },
    sources: { targetCount: { min: 20, typical: 35 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.7, other: 0.3 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "proposal_purpose",
          label: "Proposal purpose",
          tier: "required",
          guidance: {
            whatItIs: "Whether this proposal is for degree admission, a PhD upgrade/confirmation, a funding application, or an ethics submission.",
            whyItMatters: "These are materially different documents in expectation and length even when the underlying research is the same — an admission proposal sells feasibility, an upgrade proposal proves progress.",
            example: "PhD upgrade/confirmation, first-year to second-year transfer.",
            defaultWithRationale: "There is no safe default for this — the document's entire register depends on it, so it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "duration",
          label: "Duration",
          tier: "required",
          guidance: {
            whatItIs: "The proposed research's total duration.",
            whyItMatters: "The Timeline section and feasibility assessment are both computed against this.",
            example: "3 years, full-time, starting October 2026.",
            defaultWithRationale: "Defaults to 3 years full-time, the most common doctoral duration, until corrected.",
          },
          defaultValue: "3 years full-time",
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "supervisor_or_pi",
          label: "Supervisor or Principal Investigator",
          tier: "recommended",
          guidance: {
            whatItIs: "The named supervisor or PI for this proposal.",
            whyItMatters: "Required on most institutional proposal cover sheets.",
            example: "Prof. Amara Chen",
            defaultWithRationale: "Left blank until supplied.",
          },
          allowsProvisional: true,
        },
        {
          key: "resource_requirements",
          label: "Resource requirements",
          tier: "recommended",
          guidance: {
            whatItIs: "Any facilities, equipment, datasets, or specialist access the research needs beyond normal supervision.",
            whyItMatters: "Flags feasibility concerns early — a proposal requiring unavailable equipment needs to know that before submission, not after.",
            example: "Access to a mass spectrometer; a licensed clinical dataset.",
            defaultWithRationale: "Defaults to no resources beyond normal supervision.",
          },
          allowsProvisional: true,
        },
        {
          key: "ethics_review_body",
          label: "Ethics review body",
          tier: "recommended",
          guidance: {
            whatItIs: "The committee or body that will eventually review this research's ethics, if known.",
            whyItMatters: "Different bodies have different expectations for how much ethical detail a proposal (as opposed to a full application) needs to anticipate.",
            example: "University Research Ethics Committee, Panel B (Health Sciences).",
            defaultWithRationale: "Defaults to the institution's general research ethics committee when unspecified.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "feasibility_within_timeline", description: "The proposed work is feasible within the stated timeline", severity: "advisory" },
      { id: "methodology_matches_questions", description: "The proposed methodology can actually answer the stated research questions", severity: "required" },
      { id: "ethical_considerations_present", description: "Ethical considerations are addressed", severity: "blocking", appliesWhen: "human subjects indicated" },
    ],
    workflowVariant: "proposal",
    complianceProfile: "institutional",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-16 Grant Proposal — proposal_funding / funder_prescribed ────────
  {
    id: "OT-16",
    version: 1,
    label: "Grant Proposal",
    aliases: ["funding application", "research grant"],
    family: "proposal_funding",
    academicLevels: ["doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "funder_prescribed",
      sections: [
        { key: "summary", title: "Summary", required: true, countsTowardWordcount: true, wordBudget: { min: 200, max: 400, typical: 300 }, guidance: "A plain-language summary of the proposed work, often read by non-specialist panel members." },
        { key: "case_for_support", title: "Case for Support", required: true, countsTowardWordcount: true, guidance: "The full scientific case: background, objectives, methodology." },
        { key: "impact", title: "Impact and Pathways to Impact", required: true, countsTowardWordcount: true, guidance: "Who benefits from this work and how, beyond academic publication." },
        { key: "work_plan", title: "Work Plan", required: true, countsTowardWordcount: true, guidance: "A timeline of work packages and milestones across the funding period." },
        { key: "team", title: "Team", required: true, countsTowardWordcount: false, guidance: "Investigators and their roles, with relevant track record." },
        { key: "budget_justification", title: "Budget Justification", required: true, countsTowardWordcount: false, guidance: "Every budget line explained and tied to the work plan." },
        { key: "ethics", title: "Ethics", required: true, countsTowardWordcount: false, guidance: "Ethical considerations and approval pathway for any human, animal, or sensitive-data work." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "In the funder's required style, if specified." },
      ],
      frontMatter: ["summary"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 1500, max: 10000, typical: 4000 },
      distribution: { summary: 0.08, case_for_support: 0.45, impact: 0.15, work_plan: 0.2, team: 0.07 },
    },
    sources: { targetCount: { min: 30, typical: 60 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.8, other: 0.2 } },
    citation: { defaultStyle: "apa7", commonStyles: ["apa7", "vancouver"] },
    intakeSchema: {
      required: [
        {
          key: "funder_and_scheme",
          label: "Funder and scheme",
          tier: "required",
          guidance: {
            whatItIs: "The funding body and the specific call you're applying to.",
            whyItMatters: "Every structural and formatting rule in this document comes from the funder's call, not from academic convention.",
            example: "UKRI, Future Leaders Fellowship",
            defaultWithRationale: "There is no safe default here — a grant proposal without a named funder cannot be compliance-checked, so this field cannot be left provisional past G1.",
          },
          allowsProvisional: false,
        },
        {
          key: "call_document",
          label: "Call document",
          tier: "required",
          guidance: {
            whatItIs: "The funder's call text or guidance document for this scheme.",
            whyItMatters: "This effectively *is* the Rubric for a grant proposal — required sections, page limits, and eligibility criteria all come from it.",
            example: "A downloaded PDF of the funder's call for proposals.",
            defaultWithRationale: "Required because a false pass here means ineligibility, not just a lower score — we do not compile funder rules from memory or convention.",
          },
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "budget_total",
          label: "Budget total and duration",
          tier: "recommended",
          guidance: {
            whatItIs: "The total amount requested and the project duration.",
            whyItMatters: "Cross-checked against your work plan for consistency at G5.",
            example: "£450,000 over 3 years",
            defaultWithRationale: "Left blank until you have a costed budget; the work plan can be drafted without it.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "co_investigators",
          label: "Co-investigators",
          tier: "optional",
          guidance: {
            whatItIs: "Named co-investigators and their institutions.",
            whyItMatters: "Populates the Team section and author-contribution statements.",
            example: "Dr. Priya Nair (Co-I), University of Leeds",
            defaultWithRationale: "Left blank for a sole-investigator application.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "required_sections_present", description: "Every funder-required section present", severity: "blocking" },
      { id: "section_limits", description: "Per-section limits respected", severity: "blocking" },
      { id: "budget_consistency", description: "Budget justification aligns with the work plan", severity: "required" },
    ],
    workflowVariant: "proposal",
    complianceProfile: "funder",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-17 Ethics Application — proposal_funding / funder_prescribed / institutional ──
  // Included per docs 14 §9's own note because it blocks OT-06 through
  // OT-08 in practice. Its readability quality gate is agent-assessed
  // (needs a model call to judge whether an information sheet is written
  // at the target reading level) rather than deterministic, so — same
  // honest-gap discipline as OT-12's PRISMA gates and OT-11/OT-19's scan
  // gates — it's recorded but not compiled into a Rubric rule here.
  {
    id: "OT-17",
    version: 1,
    label: "Ethics Application",
    aliases: ["IRB application", "REC application", "ethics review submission"],
    family: "proposal_funding",
    academicLevels: ["undergraduate", "masters", "doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "funder_prescribed",
      sections: [
        { key: "study_summary", title: "Study Summary", required: true, countsTowardWordcount: true, wordBudget: { min: 150, max: 400, typical: 250 }, guidance: "A plain-language summary of the study for the review committee." },
        { key: "participants_recruitment", title: "Participants and Recruitment", required: true, countsTowardWordcount: true, guidance: "Who will participate, how many, and how they will be recruited." },
        { key: "procedures", title: "Procedures", required: true, countsTowardWordcount: true, guidance: "Exactly what participants will be asked to do." },
        { key: "risks_mitigation", title: "Risks and Mitigation", required: true, countsTowardWordcount: true, guidance: "Foreseeable risks to participants and how each will be mitigated." },
        { key: "consent_process", title: "Consent Process", required: true, countsTowardWordcount: true, guidance: "How informed consent will be obtained, recorded, and — where relevant — re-confirmed." },
        { key: "data_protection", title: "Data Protection", required: true, countsTowardWordcount: true, guidance: "How participant data will be stored, secured, and who will have access." },
        { key: "withdrawal", title: "Withdrawal", required: true, countsTowardWordcount: true, guidance: "How and until when a participant may withdraw, and what happens to their data if they do." },
        { key: "dissemination", title: "Dissemination", required: true, countsTowardWordcount: false, guidance: "How and where results will be shared." },
        { key: "appendices", title: "Appendices", required: true, countsTowardWordcount: false, guidance: "The participant information sheet and consent form, attached in full." },
      ],
      frontMatter: ["study_summary"],
      backMatter: ["appendices"],
    },
    budget: {
      totalWords: { min: 1500, max: 6000, typical: 3000 },
      distribution: {
        study_summary: 0.08,
        participants_recruitment: 0.15,
        procedures: 0.2,
        risks_mitigation: 0.17,
        consent_process: 0.15,
        data_protection: 0.13,
        withdrawal: 0.07,
      },
    },
    sources: { targetCount: { min: 5, typical: 12 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.6, other: 0.4 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "review_body",
          label: "Review body",
          tier: "required",
          guidance: {
            whatItIs: "The specific ethics committee or institutional review board this application goes to.",
            whyItMatters: "Different bodies use different forms and have different section requirements — the form itself is often what the Rubric compiles from.",
            example: "University Research Ethics Committee, Panel B (Health Sciences).",
            defaultWithRationale: "If not yet confirmed, mark this provisional and proceed with generic institutional conventions.",
          },
          allowsProvisional: true,
        },
        {
          key: "application_form_upload",
          label: "Application form",
          tier: "required",
          guidance: {
            whatItIs: "The review body's own application form or template, if one exists.",
            whyItMatters: "This is the actual requirement source — most committees have their own exact section headings and question wording.",
            example: "A PDF or Word template downloaded from the committee's website.",
            defaultWithRationale: "Without one, we use generic ethics-application conventions, editable once you have the real form.",
          },
          allowsProvisional: true,
        },
        {
          key: "participant_type",
          label: "Participant type",
          tier: "required",
          guidance: {
            whatItIs: "Who will participate, and whether any belong to a vulnerable group (children, people who lack capacity to consent, prisoners, or others requiring extra safeguards).",
            whyItMatters: "Determines which safeguards are mandatory — getting this wrong is a research-conduct issue, not a paperwork gap, so it is not guessed.",
            example: "Adults aged 18-65 with full capacity to consent — no vulnerable groups involved.",
            defaultWithRationale: "There is no safe default for this — assuming no vulnerable participants when there are some is exactly the failure this field exists to catch, so it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "data_types_collected",
          label: "Data types collected",
          tier: "required",
          guidance: {
            whatItIs: "What data will be collected, and whether any of it is special-category data (health, ethnicity, sexual orientation, criminal history, and similar).",
            whyItMatters: "Special-category data triggers stricter data-protection obligations — assuming 'no' when there is some is a compliance issue, not a style choice.",
            example: "Anonymised survey responses; no special-category data.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "retention_period",
          label: "Retention period",
          tier: "required",
          guidance: {
            whatItIs: "How long participant data will be retained before deletion.",
            whyItMatters: "Most institutions have a default retention policy, but the application must still state it explicitly.",
            example: "10 years, per the university's standard research data retention policy.",
            defaultWithRationale: "Defaults to the institution's standard retention period (typically 5-10 years) pending confirmation.",
          },
          defaultValue: "per institutional policy",
          allowsProvisional: true,
        },
      ],
      recommended: [],
      optional: [],
    },
    qualityGates: [
      { id: "consent_process_described", description: "The consent process is fully described", severity: "blocking" },
      { id: "data_protection_addressed", description: "Data protection is addressed", severity: "blocking" },
      { id: "withdrawal_procedure_stated", description: "The withdrawal procedure is stated", severity: "blocking" },
      { id: "vulnerable_participant_safeguards_present", description: "Safeguards for vulnerable participants are present", severity: "blocking", appliesWhen: "participant_type indicates a vulnerable group" },
      // maxGradeLevel: 8 is the commonly-cited plain-language benchmark for
      // participant-facing research materials (widely used in REC/IRB
      // guidance). sectionKey: "appendices" is a stated approximation — the
      // CDM's V1 flat block model (domain/document/model.ts) has no
      // sub-block nesting, so the "appendices" block bundles the
      // information sheet with the consent form; a true per-document split
      // needs a richer structure this model doesn't have yet.
      { id: "information_sheet_readability", description: "The participant information sheet is written at or below the target reading level", severity: "required", readabilityGate: { maxGradeLevel: 8, sectionKey: "appendices" } },
    ],
    workflowVariant: "proposal",
    complianceProfile: "institutional",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-18 Lab Report — applied_professional / imrad / applied ──────────
  {
    id: "OT-18",
    version: 1,
    label: "Lab Report",
    aliases: ["laboratory report", "practical report", "experiment writeup"],
    family: "applied_professional",
    academicLevels: ["undergraduate", "masters"],
    typicalDisciplines: ["natural-sciences", "engineering"],
    structure: {
      variant: "imrad",
      sections: [
        { key: "title", title: "Title", required: true, countsTowardWordcount: false, guidance: "Names the experiment and, where relevant, the key variable studied." },
        { key: "abstract", title: "Abstract", required: false, countsTowardWordcount: true, wordBudget: { min: 100, max: 200, typical: 150 }, guidance: "A short summary — check whether your module requires one." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "States the hypothesis and its theoretical basis." },
        { key: "methods", title: "Materials and Methods", required: true, countsTowardWordcount: true, guidance: "Apparatus, procedure, and variables (independent, dependent, controlled) in enough detail to reproduce." },
        { key: "results", title: "Results", required: true, countsTowardWordcount: true, guidance: "Data and figures only — no interpretation. This is the section students most often get wrong by interpreting here." },
        { key: "discussion", title: "Discussion", required: true, countsTowardWordcount: true, guidance: "Interprets the results against the hypothesis explicitly; discusses sources of error." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, guidance: "States whether the hypothesis was supported." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Any cited background sources." },
      ],
      frontMatter: ["title"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 1000, max: 4000, typical: 2000 },
      distribution: { introduction: 0.15, methods: 0.25, results: 0.25, discussion: 0.25, conclusion: 0.1 },
    },
    sources: { targetCount: { min: 3, typical: 8 }, recencyExpectation: "no strict recency expectation", typeMix: { peer_reviewed: 0.5, other: 0.5 } },
    citation: { defaultStyle: "apa7", commonStyles: ["apa7", "ieee"] },
    intakeSchema: {
      required: [
        {
          key: "hypothesis",
          label: "Hypothesis",
          tier: "required",
          guidance: {
            whatItIs: "What you predicted would happen, and why.",
            whyItMatters: "The Discussion section must address whether this was supported — everything else follows from it.",
            example: "Increasing substrate concentration will increase reaction rate up to a saturation point.",
            defaultWithRationale: "Not sure yet? State what you expect based on the theory covered in the lab manual — we'll help refine it at the structure stage.",
          },
          allowsProvisional: true,
        },
        {
          key: "variables",
          label: "Variables",
          tier: "required",
          guidance: {
            whatItIs: "Your independent, dependent, and controlled variables.",
            whyItMatters: "Required for a reproducible Methods section and for interpreting your Results correctly.",
            example: "Independent: enzyme concentration. Dependent: reaction rate. Controlled: temperature, pH.",
            defaultWithRationale: "No safe default — every lab report needs at least an independent and a dependent variable named explicitly.",
          },
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "lab_manual",
          label: "Lab manual",
          tier: "recommended",
          guidance: {
            whatItIs: "The instructions or manual your department issued for this experiment.",
            whyItMatters: "Often specifies the exact format and what your module expects in each section.",
            example: "A PDF handout from your practical class.",
            defaultWithRationale: "Without one, we apply standard IMRaD lab-report conventions.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "data_files",
          label: "Raw data files",
          tier: "optional",
          guidance: {
            whatItIs: "Your recorded measurements, e.g. a spreadsheet.",
            whyItMatters: "Lets figures and tables be generated directly from your actual data rather than described from memory.",
            example: "A .xlsx or .csv of your recorded readings.",
            defaultWithRationale: "Without data files, you'll enter results manually in the editor instead.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "results_no_interpretation", description: "Results section contains no interpretation", severity: "required" },
      { id: "hypothesis_addressed", description: "Discussion addresses the hypothesis explicitly", severity: "blocking" },
      { id: "figures_referenced", description: "Every figure and table referenced in the text", severity: "blocking" },
    ],
    workflowVariant: "applied",
    complianceProfile: "coursework",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-19 Case Study — applied_professional / linear / coursework ──────
  // Anonymisation is a real scan (docs 14 §9's own note: "the same
  // machinery as OT-11's double-blind check, differently configured"), but
  // that scanner isn't built — the quality gate is descriptive only, same
  // honest gap as OT-11's page-limit gate.
  {
    id: "OT-19",
    version: 1,
    label: "Case Study",
    aliases: ["business case study", "clinical case report", "case report"],
    family: "applied_professional",
    academicLevels: ["undergraduate", "masters", "doctoral", "professional"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "executive_summary", title: "Executive Summary", required: true, countsTowardWordcount: false, wordBudget: { min: 100, max: 300, typical: 200 }, guidance: "A summary of the case, the problem, and the recommendation — written last." },
        { key: "background_context", title: "Background and Context", required: true, countsTowardWordcount: true, guidance: "The setting and circumstances the case sits within." },
        { key: "problem_statement", title: "Problem Statement", required: true, countsTowardWordcount: true, guidance: "What specifically needs to be resolved or explained." },
        { key: "analysis", title: "Analysis", required: true, countsTowardWordcount: true, guidance: "The core analytical work — applying a framework, examining evidence, or working through the clinical presentation." },
        { key: "alternatives_considered", title: "Alternatives Considered", required: true, countsTowardWordcount: true, guidance: "Other options genuinely weighed, not a token mention before the preferred answer." },
        { key: "recommendation", title: "Recommendation", required: true, countsTowardWordcount: true, guidance: "The recommended course of action, following directly from the analysis." },
        { key: "implementation", title: "Implementation", required: true, countsTowardWordcount: true, guidance: "How the recommendation would actually be carried out." },
        { key: "limitations", title: "Limitations", required: true, countsTowardWordcount: true, guidance: "What the analysis couldn't account for." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the required style." },
      ],
      frontMatter: ["executive_summary"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 1500, max: 8000, typical: 4000 },
      distribution: {
        background_context: 0.12,
        problem_statement: 0.08,
        analysis: 0.35,
        alternatives_considered: 0.15,
        recommendation: 0.12,
        implementation: 0.1,
        limitations: 0.05,
      },
    },
    sources: { targetCount: { min: 10, typical: 20 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.5, other: 0.5 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7", "vancouver"] },
    intakeSchema: {
      required: [
        {
          key: "case_subject",
          label: "Case subject",
          tier: "required",
          guidance: {
            whatItIs: "What or who the case study is about.",
            whyItMatters: "There is no generic case study — everything downstream is specific to this subject.",
            example: "A mid-sized retailer's failed ERP system rollout in 2024.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "case_type",
          label: "Case type",
          tier: "required",
          guidance: {
            whatItIs: "Whether the case is exploratory, explanatory, descriptive, clinical, or business.",
            whyItMatters: "Clinical cases carry consent and anonymisation obligations the other types don't.",
            example: "Business — a strategic decision case for a management course.",
            defaultWithRationale: "Defaults to business, the most common type in coursework contexts.",
          },
          defaultValue: "business",
          allowsProvisional: false,
        },
        {
          key: "anonymisation_required",
          label: "Is anonymisation required?",
          tier: "required",
          guidance: {
            whatItIs: "Whether names, dates, locations, or other identifiers must be removed or altered — always required for clinical cases.",
            whyItMatters: "Blocking for clinical cases: publishing identifiable patient details without proper anonymisation is a research-conduct issue, not a style preference.",
            example: "Yes — patient identifiers must be altered per the clinical case report's ethics requirements.",
            defaultWithRationale: "There is no safe default for this — assuming 'no' when anonymisation was required is exactly the failure mode this field exists to catch, so it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "framework_applied",
          label: "Framework applied",
          tier: "recommended",
          guidance: {
            whatItIs: "The analytical framework or model structuring the Analysis section, if one is expected.",
            whyItMatters: "Business cases in particular are often expected to apply a named framework (SWOT, Porter's Five Forces, a specific clinical protocol) rather than freeform analysis.",
            example: "Porter's Five Forces.",
            defaultWithRationale: "If none is given, the analysis proceeds without a named framework.",
          },
          allowsProvisional: true,
        },
        {
          key: "consent_for_case_details",
          label: "Consent for case details",
          tier: "recommended",
          guidance: {
            whatItIs: "Confirmation that consent was obtained to write about the case — required and blocking specifically for clinical cases, not universally required.",
            whyItMatters: "A clinical case report without documented consent should not proceed to drafting.",
            example: "Written consent obtained from the patient, on file with the department.",
            defaultWithRationale: "Not applicable, and left blank, for non-clinical case types.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "anonymisation_complete", description: "Anonymisation is complete where required — scans for names, dates, locations, identifiers", severity: "blocking", appliesWhen: "anonymisation_required = yes" },
      { id: "recommendation_follows_analysis", description: "The recommendation follows from the analysis rather than introducing new claims", severity: "required" },
      { id: "alternatives_genuinely_considered", description: "Alternatives are genuinely weighed, not a token mention", severity: "advisory" },
    ],
    workflowVariant: "applied",
    complianceProfile: "coursework",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-20 Policy Brief — applied_professional / argumentative / professional ──
  // The register inversion docs 14 §9 flags is real: academic hedging is a
  // defect here, not a virtue. "Every claim sourced" (usesClaimGraph)
  // compiles into a real claim_support rule against the project's
  // Claim-Evidence Graph. "Recommendation in the first 200 words" is still
  // uncompiled — it's a position-in-text check, and domain/compliance has
  // no rule type for that yet.
  {
    id: "OT-20",
    version: 1,
    label: "Policy Brief",
    aliases: ["briefing paper", "policy memo"],
    family: "applied_professional",
    academicLevels: ["masters", "doctoral", "faculty", "professional"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "argumentative",
      sections: [
        { key: "title", title: "Title", required: true, countsTowardWordcount: false, guidance: "States the issue and, ideally, the recommendation's direction." },
        { key: "executive_summary", title: "Executive Summary", required: true, countsTowardWordcount: false, wordBudget: { min: 80, max: 200, typical: 150 }, guidance: "The problem and recommendation, in brief — many readers stop here." },
        { key: "the_problem", title: "The Problem", required: true, countsTowardWordcount: true, guidance: "What the problem is and why it demands a decision now." },
        { key: "evidence", title: "Evidence", required: true, countsTowardWordcount: true, guidance: "The evidence base, presented for a non-specialist decision-maker, not a peer reviewer." },
        { key: "policy_options", title: "Policy Options", required: true, countsTowardWordcount: true, guidance: "The realistic options, including the status quo, weighed fairly before the recommendation." },
        { key: "recommendation", title: "Recommendation", required: true, countsTowardWordcount: true, guidance: "The recommended option, stated directly and early — this is not the place for academic hedging." },
        { key: "implementation", title: "Implementation", required: true, countsTowardWordcount: true, guidance: "What would need to happen to act on the recommendation." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the required style." },
      ],
      frontMatter: ["title", "executive_summary"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 1000, max: 3000, typical: 1800 },
      distribution: { the_problem: 0.2, evidence: 0.3, policy_options: 0.2, recommendation: 0.15, implementation: 0.1 },
    },
    sources: { targetCount: { min: 10, typical: 18 }, recencyExpectation: "majority within 5 years — policy briefs favour current evidence over historical depth", typeMix: { peer_reviewed: 0.5, other: 0.5 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "target_audience",
          label: "Target audience",
          tier: "required",
          guidance: {
            whatItIs: "Whether the brief is written for a legislator, a civil servant, an NGO, or the general public.",
            whyItMatters: "Changes register, length tolerance, and how much institutional context can be assumed.",
            example: "A civil servant in a policy team, already familiar with the broad issue area.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "decision_being_influenced",
          label: "Decision being influenced",
          tier: "required",
          guidance: {
            whatItIs: "The specific decision this brief is meant to inform.",
            whyItMatters: "A policy brief exists to move a specific decision, not to inform generally — without a named decision, the brief has no target to be persuasive toward.",
            example: "Whether to fund a pilot of the proposed intervention in the next budget cycle.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "length_limit",
          label: "Length limit",
          tier: "required",
          guidance: {
            whatItIs: "The brief's maximum length, often expressed in pages rather than words.",
            whyItMatters: "Policy audiences are famously unforgiving of length — briefs routinely fail by being too long before anyone reads the content.",
            example: "Two pages, per the department's standard brief template.",
            defaultWithRationale: "Defaults to two pages (roughly 1,000-1,200 words), the most common policy-brief length, until corrected.",
          },
          defaultValue: "two pages",
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "visual_requirements",
          label: "Visual requirements",
          tier: "recommended",
          guidance: {
            whatItIs: "Whether charts, infographics, or a specific visual template are expected.",
            whyItMatters: "Policy audiences often expect a scannable visual alongside the prose.",
            example: "One summary chart showing the trend the brief is responding to.",
            defaultWithRationale: "Defaults to prose only unless a visual is specifically requested.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "political_constraints",
          label: "Political constraints",
          tier: "optional",
          guidance: {
            whatItIs: "Any political sensitivities or constraints the recommendation needs to work within.",
            whyItMatters: "A technically optimal recommendation that ignores political feasibility often goes nowhere.",
            example: "The recommendation should avoid implying criticism of the previous administration's policy.",
            defaultWithRationale: "If none is given, the recommendation is drafted on technical merit alone.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      // maxGradeLevel: 10 — a policy brief's audience spans legislators,
      // civil servants, and the public (intake's target_audience is free
      // text, not a fixed enum the catalog can branch on), so this targets
      // the "informed non-specialist decision-maker" the_problem/evidence
      // sections' own guidance already names, one notch more lenient than
      // OT-17's lay-consent-form grade-8 target.
      { id: "reading_level_appropriate", description: "Written at a reading level appropriate to the target audience", severity: "required", readabilityGate: { maxGradeLevel: 10 } },
      { id: "recommendation_in_first_200_words", description: "The recommendation is stated within the first 200 words", severity: "blocking", positionInTextGate: { keywords: ["recommend", "recommendation", "we propose", "our proposal"], withinWords: 200 } },
      { id: "every_claim_sourced", description: "Every factual claim is sourced", severity: "blocking", usesClaimGraph: true },
      // maxJargonDensity: 0.15 — policy audiences are non-specialists;
      // academic prose commonly runs 20-25% complex (3+ syllable) words,
      // this targets meaningfully below that.
      { id: "jargon_density_below_threshold", description: "Academic jargon density is below the threshold for this audience", severity: "required", readabilityGate: { maxJargonDensity: 0.15 } },
    ],
    workflowVariant: "applied",
    complianceProfile: "professional",
    exportDefaults: { format: "docx", includeToc: false },
  },

  // ── OT-21 White Paper / Technical Documentation — applied_professional / linear / professional ──
  {
    id: "OT-21",
    version: 1,
    label: "White Paper / Technical Documentation",
    aliases: ["technical white paper", "technical report (industry)"],
    family: "applied_professional",
    academicLevels: ["masters", "doctoral", "faculty", "professional"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "executive_summary", title: "Executive Summary", required: true, countsTowardWordcount: false, wordBudget: { min: 150, max: 400, typical: 250 }, guidance: "A summary for a reader who will only read this section." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, guidance: "Frames the problem domain for the stated audience technical level." },
        { key: "problem", title: "Problem", required: true, countsTowardWordcount: true, guidance: "The specific problem this document addresses." },
        { key: "approach_architecture", title: "Approach or Architecture", required: true, countsTowardWordcount: true, wordBudget: { min: 700, max: 4000, typical: 2000 }, guidance: "The proposed approach, system architecture, or specification — may include code or specification blocks." },
        { key: "evaluation", title: "Evaluation", required: true, countsTowardWordcount: true, guidance: "How the approach was validated or benchmarked." },
        { key: "deployment_considerations", title: "Deployment Considerations", required: true, countsTowardWordcount: true, guidance: "Practical considerations for adopting or deploying the approach." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: true, guidance: "Summarises the contribution and its practical implications." },
        { key: "references", title: "References", required: true, countsTowardWordcount: false, guidance: "Every source cited, in the required style." },
        { key: "appendices", title: "Appendices", required: false, countsTowardWordcount: false, guidance: "Supplementary technical detail — full code listings, extended benchmarks, configuration references." },
      ],
      frontMatter: ["executive_summary"],
      backMatter: ["references", "appendices"],
    },
    budget: {
      totalWords: { min: 2000, max: 12000, typical: 6000 },
      distribution: { introduction: 0.1, problem: 0.15, approach_architecture: 0.35, evaluation: 0.2, deployment_considerations: 0.12, conclusion: 0.05 },
    },
    sources: { targetCount: { min: 10, typical: 22 }, recencyExpectation: "majority within 5 years — technical material dates quickly", typeMix: { peer_reviewed: 0.4, other: 0.6 } },
    citation: { defaultStyle: "ieee", commonStyles: ["ieee", "apa7"] },
    intakeSchema: {
      required: [
        {
          key: "document_purpose",
          label: "Document purpose",
          tier: "required",
          guidance: {
            whatItIs: "Whether the document is purely technical, marketing-technical (technical content with a promotional angle), or a standards submission.",
            whyItMatters: "Changes tone and what claims are appropriate — a standards submission can't include marketing language, and a marketing-technical piece reads differently from a pure technical report.",
            example: "Purely technical — an internal architecture document being shared with a standards body for comment.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "audience_technical_level",
          label: "Audience technical level",
          tier: "required",
          guidance: {
            whatItIs: "How much technical background the intended readers already have.",
            whyItMatters: "Determines whether jargon and unexplained acronyms are appropriate or need to be defined.",
            example: "Practising engineers in the same subfield — deep familiarity assumed.",
            defaultWithRationale: "Defaults to 'informed generalist in the field' when unspecified.",
          },
          defaultValue: "informed generalist in the field",
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "code_blocks_present",
          label: "Do code or specification blocks appear?",
          tier: "recommended",
          guidance: {
            whatItIs: "Whether the document includes code listings, API specifications, or similar formatted technical blocks.",
            whyItMatters: "Affects formatting handling on export — code blocks need monospace formatting preserved, not reflowed like prose.",
            example: "Yes, several Python code listings and one JSON schema.",
            defaultWithRationale: "Defaults to no code blocks unless the content requires them.",
          },
          defaultValue: "no",
          allowsProvisional: true,
        },
        {
          key: "organisational_template",
          label: "Organisational template",
          tier: "recommended",
          guidance: {
            whatItIs: "Your organisation's white paper template or house style, if one exists.",
            whyItMatters: "Industry white papers often have branding and formatting conventions distinct from academic templates.",
            example: "A .docx template from the organisation's technical publications team.",
            defaultWithRationale: "Without one, a generic technical-document layout is used.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "versioning_scheme",
          label: "Versioning scheme",
          tier: "optional",
          guidance: {
            whatItIs: "Whether the document follows a version-numbering convention (useful for living technical documents that get revised).",
            whyItMatters: "Standards and technical documentation are often version-controlled artifacts rather than one-off submissions.",
            example: "Semantic versioning — this is v1.2 of the specification.",
            defaultWithRationale: "If unspecified, the document is treated as a single unversioned artifact.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "structural_completeness", description: "Every required section present and non-empty", severity: "blocking" },
      { id: "budget_adherence", description: "Within ±20% of the length range", severity: "required" },
      { id: "technical_accuracy_reviewed", description: "Technical claims have been reviewed for accuracy, not just plausibility", severity: "advisory" },
    ],
    workflowVariant: "applied",
    complianceProfile: "professional",
    exportDefaults: { format: "docx", includeToc: true },
  },

  // ── OT-22 Presentation — presentation / slide_deck / visual ────────────
  {
    id: "OT-22",
    version: 1,
    label: "Presentation",
    aliases: ["slide deck", "conference talk", "defence slides"],
    family: "presentation",
    academicLevels: ["undergraduate", "masters", "doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "slide_deck",
      sections: [
        { key: "title_slide", title: "Title", required: true, countsTowardWordcount: false, guidance: "Talk title, your name, affiliation, and the event or context." },
        { key: "agenda", title: "Agenda", required: false, countsTowardWordcount: false, guidance: "A one-slide roadmap for longer talks (over ~10 minutes)." },
        { key: "context", title: "Context", required: true, countsTowardWordcount: false, guidance: "Why this matters to the audience, in their terms." },
        { key: "method", title: "Method", required: true, countsTowardWordcount: false, guidance: "What you did, at the level of detail this audience needs — usually much less than in the paper." },
        { key: "findings", title: "Findings", required: true, countsTowardWordcount: false, guidance: "Your key results, figure-led rather than text-led." },
        { key: "implications", title: "Implications", required: true, countsTowardWordcount: false, guidance: "So what? What should the audience do or think differently." },
        { key: "conclusion", title: "Conclusion", required: true, countsTowardWordcount: false, guidance: "One slide, memorable, restating the single takeaway." },
        { key: "references", title: "References", required: false, countsTowardWordcount: false, guidance: "A backup slide listing key sources, not shown live." },
      ],
      frontMatter: ["title_slide"],
      backMatter: [],
    },
    budget: {
      totalWords: { min: 200, max: 900, typical: 500 },
      distribution: { context: 0.15, method: 0.2, findings: 0.35, implications: 0.2, conclusion: 0.1 },
    },
    sources: { targetCount: { min: 5, typical: 15 }, recencyExpectation: "matches the source document, if derived from one", typeMix: { peer_reviewed: 0.7, other: 0.3 } },
    citation: { defaultStyle: "apa7", commonStyles: ["apa7", "ieee"] },
    intakeSchema: {
      required: [
        {
          key: "duration_minutes",
          label: "Duration",
          tier: "required",
          guidance: {
            whatItIs: "How long you have to present, in minutes.",
            whyItMatters: "Directly drives how many slides you can have — the most common presentation failure is simply too many slides for the time.",
            example: "12 minutes plus 3 minutes of questions.",
            defaultWithRationale: "Defaults to 15 minutes, a common conference-talk length, until you specify otherwise.",
          },
          defaultValue: "15",
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "source_document",
          label: "Source document",
          tier: "recommended",
          guidance: {
            whatItIs: "The paper, thesis chapter, or report this talk is based on.",
            whyItMatters: "Lets us derive the deck from your own text, so every slide's claim binds back to something you actually wrote and reviewed.",
            example: "Your thesis's Chapter 4, or the manuscript you're presenting.",
            defaultWithRationale: "Without one, slides are drafted from your intake answers directly instead.",
          },
          allowsProvisional: true,
        },
        {
          key: "audience_expertise",
          label: "Audience expertise",
          tier: "recommended",
          guidance: {
            whatItIs: "How much background knowledge your audience already has.",
            whyItMatters: "Determines how much context-setting the early slides need.",
            example: "Specialists in your subfield (a conference session audience).",
            defaultWithRationale: "Defaults to 'general academic audience' — informed, but not specialists in your specific topic.",
          },
          defaultValue: "general_academic",
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "qa_expected",
          label: "Q&A expected",
          tier: "optional",
          guidance: {
            whatItIs: "Whether a question-and-answer session follows.",
            whyItMatters: "If yes, we generate backup slides anticipating likely questions.",
            example: "Yes, 5 minutes of questions after a viva-style defence.",
            defaultWithRationale: "Defaults to yes, since most academic talks include Q&A.",
          },
          defaultValue: "yes",
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "slide_count_matches_duration", description: "Slide count matches the stated duration at a sustainable pace", severity: "required" },
      { id: "word_density", description: "Word density per slide below threshold", severity: "blocking" },
      { id: "claims_traceable", description: "Every claim traceable to the source document or corpus", severity: "required", usesClaimGraph: true },
    ],
    workflowVariant: "visual",
    complianceProfile: "coursework",
    exportDefaults: { format: "pdf", includeToc: false },
  },

  // ── OT-23 Poster — presentation / poster_grid / venue ───────────────────
  // The only entry using `poster_grid` — the eighth and last structure
  // variant `domain/project/types.ts` defines, now proven by real catalog
  // data alongside `linear`, `imrad`, `chapter_based`, `thematic`,
  // `argumentative`, `slide_deck`, and `funder_prescribed`. Compliance here
  // is physical (millimetres, DPI, viewing-distance-driven font size), and
  // every gate that requires layout measurement is recorded honestly
  // rather than faked — same discipline as OT-11's page-limit gate.
  {
    id: "OT-23",
    version: 1,
    label: "Poster",
    aliases: ["conference poster", "research poster"],
    family: "presentation",
    academicLevels: ["undergraduate", "masters", "doctoral", "postdoc", "faculty"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "poster_grid",
      sections: [
        { key: "title_authors", title: "Title and Authors", required: true, countsTowardWordcount: false, guidance: "Title, authors, and affiliations, sized to be readable from several metres away." },
        { key: "introduction", title: "Introduction", required: true, countsTowardWordcount: true, wordBudget: { min: 40, max: 120, typical: 80 }, guidance: "The motivation and question, compressed to a few sentences." },
        { key: "methods", title: "Methods", required: true, countsTowardWordcount: true, wordBudget: { min: 30, max: 100, typical: 60 }, guidance: "Enough to establish rigor, no more — detail belongs in the paper, not the poster." },
        { key: "results", title: "Results", required: true, countsTowardWordcount: true, wordBudget: { min: 60, max: 250, typical: 150 }, guidance: "Figure-dominant — this region is mostly figures and captions, with minimal running text." },
        { key: "conclusions", title: "Conclusions", required: true, countsTowardWordcount: true, wordBudget: { min: 30, max: 100, typical: 60 }, guidance: "The key takeaway, stated for a viewer who only reads this region." },
        { key: "references", title: "References", required: false, countsTowardWordcount: false, guidance: "A short reference list, often abbreviated given space constraints." },
        { key: "acknowledgements", title: "Acknowledgements", required: false, countsTowardWordcount: false, guidance: "Funding and collaborator acknowledgements, if space allows." },
        { key: "contact", title: "QR / Contact", required: false, countsTowardWordcount: false, guidance: "Contact details or a QR code linking to the full paper or dataset." },
      ],
      frontMatter: ["title_authors"],
      backMatter: ["references", "acknowledgements", "contact"],
    },
    budget: {
      totalWords: { min: 300, max: 800, typical: 550 },
      distribution: { introduction: 0.15, methods: 0.11, results: 0.5, conclusions: 0.11 },
    },
    sources: { targetCount: { min: 5, typical: 10 }, recencyExpectation: "majority within 10 years", typeMix: { peer_reviewed: 0.7, other: 0.3 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7", "vancouver"] },
    intakeSchema: {
      required: [
        {
          key: "physical_dimensions_orientation",
          label: "Physical dimensions and orientation",
          tier: "required",
          guidance: {
            whatItIs: "The poster's exact print dimensions and whether it's portrait or landscape.",
            whyItMatters: "Every layout decision — font sizes, figure placement, region proportions — is computed against these dimensions; there is no generic poster size.",
            example: "A0, portrait, 841mm x 1189mm.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "print_resolution",
          label: "Print resolution",
          tier: "required",
          guidance: {
            whatItIs: "The minimum resolution (DPI) figures need for print quality at the poster's physical size.",
            whyItMatters: "A figure that looks fine on screen can be visibly pixelated at A0 print size — this is checked before, not after, printing.",
            example: "300 DPI at full poster size.",
            defaultWithRationale: "Defaults to 300 DPI, the standard for print-quality output, until corrected.",
          },
          defaultValue: "300 DPI",
          allowsProvisional: true,
        },
      ],
      recommended: [
        {
          key: "conference_template",
          label: "Conference template",
          tier: "recommended",
          guidance: {
            whatItIs: "The conference or institution's poster template, if one is provided.",
            whyItMatters: "Many venues provide a required template with fixed regions and branding.",
            example: "A PowerPoint or InDesign template from the conference organisers.",
            defaultWithRationale: "Without one, a generic academic poster layout is used.",
          },
          allowsProvisional: true,
        },
        {
          key: "figure_files",
          label: "Figure files",
          tier: "recommended",
          guidance: {
            whatItIs: "The actual figure files (charts, diagrams, photos) to be placed in the Results region.",
            whyItMatters: "The poster is figure-dominant — without real figures, the layout can't be finalised.",
            example: "High-resolution PNG or vector figures exported from your analysis.",
            defaultWithRationale: "Without figures, placeholder regions are reserved pending upload.",
          },
          allowsProvisional: true,
        },
        {
          key: "viewing_distance",
          label: "Viewing distance",
          tier: "recommended",
          guidance: {
            whatItIs: "The typical distance viewers will stand from the poster.",
            whyItMatters: "Directly drives the minimum font size — a poster read from 1 metre needs much larger text than one read from 2-3 metres.",
            example: "1.5 metres, typical for a conference poster session.",
            defaultWithRationale: "Defaults to 1.5 metres, the typical conference poster-session viewing distance.",
          },
          defaultValue: "1.5 metres",
          allowsProvisional: true,
        },
      ],
      optional: [],
    },
    qualityGates: [
      { id: "word_count_below_threshold", description: "Total word count is below the venue's threshold", severity: "blocking" },
      { id: "minimum_font_size_met", description: "Font size meets the minimum for the stated viewing distance", severity: "blocking" },
      { id: "figure_resolution_adequate", description: "Figure resolution is adequate for the print size", severity: "blocking" },
      { id: "region_balance", description: "No region is visually overcrowded relative to the others", severity: "advisory" },
      { id: "contrast_aa", description: "Text-background contrast meets WCAG AA", severity: "blocking" },
    ],
    workflowVariant: "visual",
    complianceProfile: "venue",
    exportDefaults: { format: "pdf", includeToc: false },
  },

  // ── OT-24 Generic Document (escape hatch) — short_form / linear / minimal ──
  // Deliberately minimal, per docs 14 §9: "so that 'my document is not in
  // your list' is never a dead end." Structure and budget are genuinely
  // user-defined rather than type-specific, so the section list and word
  // range below are the widest reasonable default, not a real target —
  // the actual constraint comes from the approximate_length intake field.
  {
    id: "OT-24",
    version: 1,
    label: "Generic Document",
    aliases: ["something else", "other", "custom document"],
    family: "short_form",
    academicLevels: ["undergraduate", "masters", "doctoral", "postdoc", "faculty", "professional"],
    typicalDisciplines: ["all"],
    structure: {
      variant: "linear",
      sections: [
        { key: "title", title: "Title", required: true, countsTowardWordcount: false, guidance: "A working title for the document." },
        { key: "body", title: "Body", required: true, countsTowardWordcount: true, guidance: "The document's content — structure is entirely up to you." },
        { key: "references", title: "References", required: false, countsTowardWordcount: false, guidance: "Sources cited, if any, in your chosen style." },
      ],
      frontMatter: ["title"],
      backMatter: ["references"],
    },
    budget: {
      totalWords: { min: 500, max: 15000, typical: 3000 },
      distribution: { body: 0.9 },
    },
    sources: { targetCount: { min: 0, typical: 5 }, recencyExpectation: "no fixed expectation — user-defined", typeMix: { peer_reviewed: 0.5, other: 0.5 } },
    citation: { defaultStyle: "harvard", commonStyles: ["harvard", "apa7", "mla9", "chicago-author-date", "ieee", "vancouver"] },
    intakeSchema: {
      required: [
        {
          key: "title",
          label: "Title",
          tier: "required",
          guidance: {
            whatItIs: "A working title for whatever this document is.",
            whyItMatters: "Every project needs a name to be findable later, even a provisional one.",
            example: "Notes on municipal water policy — untitled draft.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
        {
          key: "purpose",
          label: "Purpose",
          tier: "required",
          guidance: {
            whatItIs: "In a sentence or two, free text: what this document is for.",
            whyItMatters: "Since nothing else about this type is fixed, this is the only thing grounding what 'good' means for this specific document. It's also logged — recurring patterns here are a catalog roadmap input, per docs 14 §9's own note.",
            example: "A briefing note for my supervisor summarising three possible thesis directions.",
            defaultWithRationale: "There is no safe default for this — it blocks progress until answered.",
          },
          allowsProvisional: false,
        },
      ],
      recommended: [
        {
          key: "approximate_length",
          label: "Approximate length",
          tier: "recommended",
          guidance: {
            whatItIs: "A rough target word count, if you have one in mind.",
            whyItMatters: "Without a type-specific budget to fall back on, this is the only length signal available.",
            example: "About 1,500 words.",
            defaultWithRationale: "Without one, the generic 500-15,000 word range above applies with no meaningful target.",
          },
          allowsProvisional: true,
        },
      ],
      optional: [
        {
          key: "citation_style",
          label: "Citation style, if any",
          tier: "optional",
          guidance: {
            whatItIs: "Your preferred citation style, if the document cites sources at all.",
            whyItMatters: "Not every generic document needs citations — this is opt-in, not assumed.",
            example: "APA 7th edition.",
            defaultWithRationale: "Defaults to no citation style enforced unless one is specified.",
          },
          allowsProvisional: true,
        },
      ],
    },
    qualityGates: [
      { id: "structural_completeness", description: "The document has a title and non-empty content", severity: "blocking" },
    ],
    workflowVariant: "short_form",
    complianceProfile: "coursework",
    exportDefaults: { format: "docx", includeToc: false },
  },
];

export default OUTPUT_TYPES;
