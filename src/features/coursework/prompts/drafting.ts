/**
 * Coursework Section Drafting Prompt Builder
 * --------------------------------------------
 * Injects learned collegiate style targets and quantitative rhetorical constraints
 * derived from the peer-reviewed corpus (sentence length, burstiness, citation density,
 * passive voice thresholds, and archetype transition n-grams).
 */

import type { AssignmentType } from "../../../desk/assignment/types";
import type { AcademicTone } from "../../drafting/types/drafting";
import {
  ARCHETYPE_TONE_SPECS,
  type CorpusArchetype
} from "../services/styleEngineService";

export interface CourseworkDraftingConstraintParams {
  assignmentType: AssignmentType | string;
  academicTone?: AcademicTone | string;
  targetWordCount?: number;
}

export interface LearnedStyleConstraints {
  targetArchetype: string;
  primaryTone: string;
  secondaryTone: string;
  targetSentenceRange: [number, number];
  targetBurstinessStd: [number, number]; // [minStd, maxStd]
  maxPassiveRatio: number; // percentage <= 20%
  minCitationDensity: number; // percentage
  minLexicalDiversity: number; // TTR
  rhetoricalTransitions: string[];
}

/**
 * Top rhetorical transition n-grams learned from the open-access corpus per archetype.
 */
export const ARCHETYPE_TRANSITION_NGRAMS: Record<string, string[]> = {
  essay: [
    "furthermore, this inquiry demonstrates",
    "in examining these conceptual boundaries",
    "consequently, pedagogical frameworks must",
    "this perspective illuminates",
    "on an epistemological level",
    "taken together, these observations suggest"
  ],
  literature_review: [
    "across the synthesized literature",
    "a systematic evaluation reveals",
    "methodological heterogeneity across cohorts",
    "in contrast to prior scoping reviews",
    "the preponderance of empirical evidence indicates",
    "a critical gap persists regarding"
  ],
  research_paper: [
    "the empirical findings demonstrate",
    "multivariate panel regressions indicate",
    "controlling for baseline covariates",
    "statistically significant correlation (p < 0.01)",
    "robustness tests confirm that",
    "these experimental results corroborate"
  ],
  case_study: [
    "within this organizational context",
    "implementation telemetry demonstrates",
    "stakeholder evaluations highlight",
    "observed institutional adaptations indicate",
    "as evidenced by the intervention timeline",
    "comparative operational outcomes reveal"
  ],
  report: [
    "surveillance monitoring indicates",
    "the technical assessment confirms",
    "audit findings substantiate",
    "performance benchmarks demonstrate",
    "feasibility projections suggest",
    "key metrics indicate compliance with"
  ],
  critical_essay: [
    "a critique of this assumption exposes",
    "deconstructing this institutional framing",
    "power relations inherently structure",
    "counter to prevailing orthodoxies",
    "this epistemic stance overlooks",
    "scrutinizing these foundational premises reveals"
  ],
  argumentative_essay: [
    "we argue that mandatory reform is essential",
    "the compelling evidence substantiates",
    "counter-arguments regarding costs fail because",
    "principled regulatory intervention demands",
    "this ethical imperative necessitates",
    "it is therefore vital to establish"
  ],
  policy_analysis: [
    "evaluating regulatory trade-offs confirms",
    "cost-benefit modeling projects",
    "stakeholder compliance incentives suggest",
    "policy implementation requires balancing",
    "fiscal impact assessments indicate",
    "an optimal governance architecture entails"
  ],
  business_assignment: [
    "leveraging dynamic capabilities enables",
    "supply chain resilience metrics indicate",
    "platform ecosystem network effects drive",
    "unit economics and customer retention corroborate",
    "from a strategic management perspective",
    "synergies resulting from organizational integration"
  ],
  journal_article: [
    "in accordance with IMRAD methodology",
    "the hypothesis was substantiated through",
    "instrumental variable causal estimates indicate",
    "longitudinal cohort tracking reveals",
    "experimental ablation protocols confirm",
    "multicenter epidemiological evidence corroborates"
  ],
  presentation_slides: [
    "key takeaway: empirical data confirms",
    "as shown in the comparative metrics",
    "the core strategic lever is",
    "visual evidence highlights a 3x gain",
    "immediate action item:",
    "in summary, three decisive factors emerge"
  ]
};

/**
 * Returns quantitative style constraints for any assignment archetype and tone.
 */
export function getLearnedStyleConstraints(
  assignmentType: AssignmentType | string = "essay",
  academicTone?: AcademicTone | string
): LearnedStyleConstraints {
  const normType = (assignmentType || "essay").toLowerCase();
  const spec = ARCHETYPE_TONE_SPECS[normType] || ARCHETYPE_TONE_SPECS.essay;
  const transitions = ARCHETYPE_TRANSITION_NGRAMS[normType] || ARCHETYPE_TRANSITION_NGRAMS.essay;

  return {
    targetArchetype: normType,
    primaryTone: spec.primaryTone,
    secondaryTone: spec.secondaryTone,
    targetSentenceRange: spec.targetSentenceRange,
    targetBurstinessStd: [6.5, 9.5],
    maxPassiveRatio: 20.0, // <= 20% passive voice (>= 80% active voice)
    minCitationDensity: spec.minCitationDensity,
    minLexicalDiversity: spec.minLexicalDiversity,
    rhetoricalTransitions: transitions
  };
}

export interface BuildSectionPromptParams {
  sectionTitle: string;
  assignmentQuestion: string;
  targetWordCount: number;
  assignmentType: AssignmentType | string;
  academicTone?: AcademicTone | string;
  academicFunction?: string;
  keyPoints?: string[];
  boundSources?: Array<{
    id: string;
    title: string;
    citation: string;
    authors?: string[];
    year?: string | number;
    doi?: string;
  }>;
  priorSections?: Array<{ title: string; content: string }>;
}

/**
 * Constructs a collegiate prompt for section drafting that injects:
 * 1. Scope and section task definition.
 * 2. Explicit learned quantitative style targets (sentence length, burstiness, citation density, passive threshold).
 * 3. Learned rhetorical transition n-grams for the selected archetype.
 * 4. Strict exclusion of empty openings and pseudo-intellectual buzzwords.
 */
export function buildCourseworkSectionDraftingPrompt(params: BuildSectionPromptParams): string {
  const constraints = getLearnedStyleConstraints(params.assignmentType, params.academicTone);

  const sourcesList = (params.boundSources || []).length > 0
    ? params.boundSources!
        .map((s, idx) => `  - Source ${idx + 1}: "${s.title}" (${Array.isArray(s.authors) ? s.authors.join(", ") : s.authors || "author unknown"}, ${s.year || "n.d."}) -> Use token ${s.citation || `[${idx + 1}]`}`)
        .join("\n")
    : "  - Ground claims using numbered bracket citation tokens like [1], [2] where empirical evidence is referenced.";

  const priorSummaries = (params.priorSections || []).length > 0
    ? params.priorSections!
        .map((s) => `  * "${s.title}": ${s.content.slice(0, 140).trim()}...`)
        .join("\n")
    : "  * None (This is the opening section).";

  const keyPointsList = (params.keyPoints || []).length > 0
    ? params.keyPoints!.map((kp) => `  - ${kp}`).join("\n")
    : `  - Substantively develop the analytical core of "${params.sectionTitle}".`;

  return `You are a collegiate academic writing expert drafting a rigorous scholarly section for a ${constraints.targetArchetype.replace(/_/g, " ").toUpperCase()}.

ASSIGNMENT BRIEF & RESEARCH CONTEXT:
- Assignment Topic / Research Question: "${params.assignmentQuestion}"
- Section Title: "${params.sectionTitle}"
- Target Word Budget: exactly ${params.targetWordCount} words (±10% acceptable tolerance)
- Rhetorical Function: ${params.academicFunction || "Substantive analytical argumentation and empirical evidence synthesis"}
- Assigned Register / Tone: ${constraints.primaryTone} (${constraints.secondaryTone})

PRIOR SECTIONS ALREADY DRAFTED (Avoid redundant repetition, maintain semantic continuity):
${priorSummaries}

CORE SECTION FOCUS & KEY POINTS:
${keyPointsList}

AVAILABLE SOURCES FOR GROUNDING:
${sourcesList}

EXPLICIT LEARNED QUANTITATIVE STYLE CONSTRAINTS (STRICTLY ENFORCED):
1. MEAN SENTENCE LENGTH: Maintain an average of ${constraints.targetSentenceRange[0]} to ${constraints.targetSentenceRange[1]} words per sentence.
2. SENTENCE BURSTINESS (VARIETY): Vary sentence structures deliberately (short punchy analytical claims paired with compound evidentiary structures). Target sentence length standard deviation between ${constraints.targetBurstinessStd[0]} and ${constraints.targetBurstinessStd[1]} words.
3. ACTIVE VOICE THRESHOLD: Maintain ≥ 80% active voice. Passive voice constructions must NOT exceed ${constraints.maxPassiveRatio}%. Use strong analytical verbs (e.g., "demonstrates", "substantiates", "reveals", "corroborates", "evaluates", "challenges").
4. BRACKET CITATION DENSITY: Integrate at least ${constraints.minCitationDensity}% citation tokens (anchor at least one citation token like [1] or [2] per 70-100 words of substantive analytical prose).
5. LEXICAL DIVERSITY: Target a Type-Token Ratio ≥ ${constraints.minLexicalDiversity}. Avoid repetitive jargon; deploy precise, discipline-appropriate domain terminology.

ARCHETYPE RHETORICAL TRANSITIONS:
Strategically integrate authentic transitions characteristic of peer-reviewed ${constraints.targetArchetype.replace(/_/g, " ")} literature:
${constraints.rhetoricalTransitions.map((t) => `  - "${t}"`).join("\n")}

NEGATIVE CONSTRAINTS (INSTANT REJECTION CRITERIA):
- DO NOT start any paragraph with throat-clearing fluff (e.g., "In today's society", "Throughout history", "A critical point of departure for evaluating this dimension lies in how", "Needless to say").
- DO NOT use ungrounded buzzwords or thesaurus inflation (e.g., "procedural objectivity", "computational expediency", "primary phenomenon").
- DO NOT summarize the section title or write meta-commentary like "In this section I will explain". Dive directly into the substantive argument in sentence 1.
- Output clean academic markdown prose without bulleted summaries or conversational disclaimers.`;
}
