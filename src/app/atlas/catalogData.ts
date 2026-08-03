/**
 * The catalog data — real output type entries.
 *
 * Spec: docs/01-product/14-OUTPUT-TYPE-CATALOG.md §9. That document
 * specifies 24 output types across 6 families. This file implements one
 * representative entry per family (one per workflow variant and structure
 * variant class), proving the engine against every shape the full catalog
 * needs to support, rather than 24 entries of comparatively low incremental
 * value entered in one pass. Adding the remaining 18 is data entry against
 * an engine already proven correct — see docs/01-product/13-MODULE-SPECIFICATIONS.md
 * §8.3 for the tracked gap.
 *
 * Word budgets, source counts, and structure are drawn directly from the
 * spec document's per-type tables, not invented here.
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
      { id: "abstract_limit", description: "Abstract within the venue's word limit", severity: "blocking" },
      { id: "declarations_present", description: "All required declarations present", severity: "blocking" },
      { id: "citation_style_exact", description: "Reference style matches the venue exactly", severity: "blocking" },
    ],
    workflowVariant: "venue_targeted",
    complianceProfile: "venue",
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
      { id: "claims_traceable", description: "Every claim traceable to the source document or corpus", severity: "required" },
    ],
    workflowVariant: "visual",
    complianceProfile: "coursework",
    exportDefaults: { format: "pdf", includeToc: false },
  },
];

export default OUTPUT_TYPES;
