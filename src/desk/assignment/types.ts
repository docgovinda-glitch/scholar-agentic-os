/**
 * Scholar Core Academic Assignment Workspace Types
 * Dedicated domain models for undergraduate and postgraduate assignment research, thinking, and drafting.
 */

import type { CanonicalReference } from "../../citation_compliance/model/reference";
import type { CitationStyleType } from "../../services/vault/citationService";

export type GuidedAssignmentStage =
  | "deconstruct"
  | "thesis_budget"
  | "peel_matrix"
  | "citations"
  | "audit_export";

export type AssignmentStage =
  | GuidedAssignmentStage
  | "understand"
  | "plan"
  | "research"
  | "evidence"
  | "think"
  | "structure"
  | "draft"
  | "final";

export function normalizeAssignmentStage(stage?: string | null): GuidedAssignmentStage {
  if (!stage) return "deconstruct";
  switch (stage) {
    case "deconstruct":
    case "understand":
      return "deconstruct";
    case "thesis_budget":
    case "plan":
    case "structure":
      return "thesis_budget";
    case "peel_matrix":
    case "think":
    case "draft":
      return "peel_matrix";
    case "citations":
    case "research":
    case "evidence":
      return "citations";
    case "audit_export":
    case "final":
      return "audit_export";
    default:
      return "deconstruct";
  }
}

export type AcademicLevel = "undergraduate" | "postgraduate";

export type AssignmentType =
  | "essay"
  | "analytical_essay"
  | "critical_essay"
  | "argumentative_essay"
  | "report"
  | "case_study"
  | "literature_review"
  | "annotated_bibliography"
  | "reflection"
  | "article_critique"
  | "book_review"
  | "policy_analysis"
  | "business_assignment"
  | "lab_report"
  | "short_answer"
  | "other";

export interface StageDefinition {
  id: AssignmentStage;
  number: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}

export type StageStatus =
  | "completed"
  | "active"
  | "available"
  | "locked"
  | "needs_review"
  | "ai_processing";

export interface CommandVerbDetail {
  verb: string;
  meaning: string;
  academicExpectation: string;
}

export interface GradeBandDescriptor {
  band: "1st_class" | "2_1_upper_second" | "2_2_lower_second" | "3rd_class";
  label: string; // e.g. "First Class (70%+ / Grade A)"
  minScore: number;
  criteria: string[];
  whatExaminersLookFor: string;
}

export interface SubQuestions {
  explicit: string[];
  implicit: string[];
}

export interface AssignmentDeconstruction {
  commandVerbs: CommandVerbDetail[];
  gradeBandDescriptors: GradeBandDescriptor[];
  subQuestions: SubQuestions;
  constraints: string[];
  summary: string;
  keyConcepts: string[];
  scopeBoundaries: {
    included: string[];
    excluded: string[];
  };
  expectedResponseType: string;
  evidenceRequirements: string;
  markingCriteriaInsights: string[];
  wordCountImplications: string;
  citationGuidance: string;
  academicLevelNotes: string;
  approvedByUser: boolean;
  userFeedback?: string;
}

export interface WordBudgetSection {
  id: string;
  title: string;
  type: "introduction" | "body_theme" | "conclusion";
  targetWordCount: number;
  currentWordCount: number;
  targetPercent: number; // e.g. 10%, 25%, etc.
  guidance: string;
  keyPoints: string[];
}

export interface ThesisAndWordBudget {
  selectedThesis: string;
  thesisRationale?: string;
  counterargumentHandling?: string;
  alternativeTheses?: Array<{
    id: string;
    statement: string;
    stance?: string;
    rationale: string;
  }>;
  thesisOptions?: ThesisOption[];
  totalTargetWords: number;
  tolerancePercent?: number; // e.g. 10 for ±10%
  sections: WordBudgetSection[];
  approvedByUser?: boolean;
}

export interface PeelTheme {
  id: string;
  themeTitle: string;
  targetWords: number;
  currentWords: number;
  targetWordCount?: number;
  currentWordCount?: number;
  point: string; // Point: Topic sentence defending the thesis
  evidence: string; // Evidence: Scholarly / empirical backing
  explanation: string; // Explanation: Critical mechanism and analysis
  counterargument: string; // Counterargument: Competing viewpoint / critical objection
  rebuttal: string; // Rebuttal: Addressing the counterargument
  link: string; // Link: Synthesis back to thesis and forward transition
  draftContent: string; // Assembled polished prose
  status?: "not_started" | "drafting" | "reviewed" | "complete";
  linkedSourceIds?: string[];
}

export interface PeelMatrixData {
  themes: PeelTheme[];
  introductionDraft?: string;
  conclusionDraft?: string;
  totalWordCount?: number;
}

export interface GroundedCitationItem {
  id: string;
  sourceTitle: string;
  authors: string[];
  year: string;
  journalOrPublisher?: string;
  doi?: string;
  doiOrUrl?: string;
  citationText?: string;
  inTextCitation: string;
  citationStyle?: string; // "apa7" | "harvard" | "ieee" | "mla"
  verifiedPeerReviewed?: boolean;
  peerReviewed?: boolean;
  fromVault?: boolean;
  linkedThemeIds?: string[];
  themeId?: string;
  quoteOrFindingSnippet?: string;
  claim?: string;
  fullReference?: string;
  relevanceExplanation?: string;
}

export interface SubmissionAuditReport {
  overallScore: number; // e.g. 76
  overallBand?: "1st_class" | "2_1_upper_second" | "2_2_lower_second" | "3rd_class";
  bandLabel: string; // e.g. "First Class (1st) — 76%"
  estimatedGradeBand?: string;
  summary: string;
  rubricAlignmentScore: number;
  wordCountAdherence: {
    actual: number;
    target: number;
    minAllowed: number;
    maxAllowed: number;
    status: "compliant" | "over_budget" | "under_budget";
    deviationPercent: number;
  };
  criteriaResults: ReviewCriteriaResult[];
  strengths: string[];
  priorityFixes: string[];
  readyForSubmission: boolean;
}

export interface AssignmentAnalysis {
  commandVerbs: CommandVerbDetail[];
  summary: string;
  keyConcepts: string[];
  scopeBoundaries: {
    included: string[];
    excluded: string[];
  };
  expectedResponseType: string;
  evidenceRequirements: string;
  markingCriteriaInsights: string[];
  wordCountImplications: string;
  citationGuidance: string;
  academicLevelNotes: string;
  approvedByUser: boolean;
  userFeedback?: string;
}

export interface ResearchPlan {
  coreQuestions: string[];
  mainConcepts: string[];
  keyDebates: string[];
  evidenceTypesNeeded: string[];
  searchStrategies: string[];
  outOfScopeTopics: string[];
  approvedByUser: boolean;
}

export interface DiscoveredSource {
  id: string;
  title: string;
  authors: string[];
  year: string;
  type: "journal" | "book" | "institutional" | "vault" | "web";
  journal?: string;
  doi?: string;
  url?: string;
  relevanceScore: number;
  mainFinding: string;
  suggestedUse: string;
  citation: string;
  canonicalReference?: CanonicalReference;
  status: "unreviewed" | "kept" | "removed";
  fromVault?: boolean;
}

export interface EvidenceItem {
  id: string;
  claim: string;
  evidenceSnippet: string;
  sourceTitle: string;
  sourceType: "file" | "vault" | "web" | "drive" | "custom";
  authors?: string[];
  year?: string;
  citation: string;
  theme?: string;
  status: "approved" | "rejected" | "pending";
}

export interface ThinkingPerspective {
  id: string;
  schoolOfThought: string;
  keyProponents: string[];
  coreArgument: string;
  strengths: string[];
  weaknesses: string[];
  underlyingAssumptions: string[];
}

export interface ThesisOption {
  id: string;
  statement: string;
  rationale: string;
  counterargumentHandling?: string;
  direction?: string;
  argumentativeStance?: string;
  stance?: string;
}

export interface ThinkingMap {
  perspectives: ThinkingPerspective[];
  agreements: string[];
  disagreements: string[];
  contradictions: string[];
  thesisOptions: ThesisOption[];
  selectedThesisId?: string;
  customThesis?: string;
}

export interface OutlineSection {
  id: string;
  title: string;
  targetWordCount: number;
  currentWordCount: number;
  guidance: string;
  keyPoints: string[];
  linkedEvidenceIds: string[];
  draftContent?: string;
  status: "not_started" | "drafting" | "reviewed" | "complete";
}

export interface ReviewCriteriaResult {
  category?:
    | "question_addressed"
    | "argument_logic"
    | "evidence_sufficiency"
    | "critical_thinking"
    | "structure_coherence"
    | "rubric_alignment"
    | "academic_level"
    | "word_count"
    | "citation_accuracy"
    | "originality";
  label?: string;
  name?: string;
  status: "pass" | "warning" | "action_required" | string;
  summary?: string;
  feedback: string;
  awardedMarks?: number;
  maxMarks?: number;
}

export interface SubmissionCheckReport {
  overallScore: number; // 0 - 100
  readyForSubmission: boolean;
  criteriaResults: ReviewCriteriaResult[];
  rubricScores?: { criterion: string; score: number; maxScore: number; comment: string }[];
  strengths: string[];
  priorityFixes: string[];
}

export type TutorMode = "socratic" | "rubric" | "counterargument" | "writing_polish";

export type GradingBand =
  | "1st_class"
  | "2_1_upper_second"
  | "2_2_lower_second"
  | "3rd_class"
  | "fail";

export interface RubricCriterionEstimate {
  id: string;
  criterion: string;
  weightPercent?: number;
  currentBand: GradingBand;
  score: number; // e.g. 74
  maxScore: number; // e.g. 100
  critique: string;
  howToReachNextBand: string;
}

export interface RubricGradeEstimation {
  overallScore: number; // 0 - 100
  overallBand: GradingBand;
  bandLabel: string; // e.g. "First Class (1st) — 74%"
  summary: string;
  criteria: RubricCriterionEstimate[];
  keyStrengths: string[];
  keyRecommendations: string[];
  targetBandRoadmap: {
    targetBand: string;
    actionableSteps: string[];
  };
}

export interface SocraticQuestion {
  id: string;
  question: string;
  targetConcept: string;
  challengeType:
    | "probe_assumptions"
    | "request_evidence"
    | "explore_implications"
    | "counter_perspective"
    | "clarify_concepts";
  rationale: string;
}

export interface CounterArgument {
  id: string;
  opposingViewpoint: string;
  theoreticalGrounding: string;
  keyScholarsOrSchools: string[];
  suggestedRebuttalStrategy: string;
}

export interface TutorChatMessage {
  id: string;
  sender: "user" | "tutor";
  text: string;
  timestamp: string;
  mode?: TutorMode;
  socraticQuestions?: SocraticQuestion[];
  rubricEstimation?: RubricGradeEstimation;
  counterArguments?: CounterArgument[];
  actionableSuggestion?: {
    type: "replace_text" | "reduce_words" | "add_evidence" | "rephrase";
    targetSectionId?: string;
    suggestedText?: string;
  };
}

export const ASSIGNMENT_STAGES: StageDefinition[] = [
  {
    id: "deconstruct",
    number: 1,
    label: "1. Rubric & Brief Deconstruction",
    shortLabel: "1. Deconstruct",
    description: "Prompt parsing, grade band descriptors, sub-questions, and constraints",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    id: "thesis_budget",
    number: 2,
    label: "2. Thesis & Word Budgeting",
    shortLabel: "2. Thesis & Budget",
    description: "Formulate central argumentative thesis & allocate target word count mathematically",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    id: "peel_matrix",
    number: 3,
    label: "3. PEEL Argument Matrix",
    shortLabel: "3. PEEL Matrix",
    description: "Point-Evidence-Explanation-Link structure with dialectical counterarguments",
    icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
  },
  {
    id: "citations",
    number: 4,
    label: "4. Citation & Academic Grounding",
    shortLabel: "4. Citations",
    description: "Ground claims in verified peer-reviewed sources in APA 7th, Harvard, IEEE, or MLA",
    icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  },
  {
    id: "audit_export",
    number: 5,
    label: "5. Submission Audit & Export",
    shortLabel: "5. Audit & Export",
    description: "Rubric compliance evaluation against the brief & publication-ready .docx/PDF export",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

export const LEGACY_ASSIGNMENT_STAGES: StageDefinition[] = [
  {
    id: "understand",
    number: 1,
    label: "1. Understand the Brief",
    shortLabel: "Understand",
    description: "Question, word count, citation style, level, & AI analysis",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    id: "plan",
    number: 2,
    label: "2. Research Plan",
    shortLabel: "Plan",
    description: "Core questions, scope boundaries, & search strategy",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  },
  {
    id: "research",
    number: 3,
    label: "3. Research Agent & Vault",
    shortLabel: "Research",
    description: "Multi-source scholarly discovery & Knowledge Vault matching",
    icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  },
  {
    id: "evidence",
    number: 4,
    label: "4. Evidence Board",
    shortLabel: "Evidence",
    description: "Claim → Evidence → Source → Citation verification",
    icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4",
  },
  {
    id: "think",
    number: 5,
    label: "5. Think & Critique",
    shortLabel: "Think",
    description: "Critical perspectives, counterarguments, & thesis formulation",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    id: "structure",
    number: 6,
    label: "6. Structure & Word Plan",
    shortLabel: "Structure",
    description: "Adaptive outline & section word-count budget allocation",
    icon: "M4 6h16M4 10h16M4 14h16M4 18h16",
  },
  {
    id: "draft",
    number: 7,
    label: "7. Draft with AI Assistant",
    shortLabel: "Draft",
    description: "Grounded drafting, inline AI tutor, & academic writing polishing",
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  },
  {
    id: "final",
    number: 8,
    label: "8. Review & Finalize",
    shortLabel: "Finalize",
    description: "10-point submission check, document editor, & DOCX/PDF export",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];

export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  essay: "General Academic Essay",
  analytical_essay: "Analytical Essay",
  critical_essay: "Critical Essay",
  argumentative_essay: "Argumentative Essay",
  report: "Formal Academic / Technical Report",
  case_study: "Case Study Analysis",
  literature_review: "Literature Review / Synthesis",
  annotated_bibliography: "Annotated Bibliography",
  reflection: "Critical Reflection / Reflective Essay",
  article_critique: "Article Critique / Evaluation",
  book_review: "Academic Book Review",
  policy_analysis: "Policy Analysis / Briefing Paper",
  business_assignment: "Business / Management Assignment",
  lab_report: "Scientific Lab Report",
  short_answer: "Structured Short-Answer Assignment",
  other: "Custom Assignment Format",
};

export const COMMON_COMMAND_VERBS: Record<string, { definition: string; keyAction: string }> = {
  "critically discuss": {
    definition: "Give a balanced and reasoned argument investigating different viewpoints, with substantiated evaluation of strengths and flaws.",
    keyAction: "Weigh competing perspectives with evidence rather than just stating opinions.",
  },
  evaluate: {
    definition: "Assess the value, effectiveness, or validity of something based on specific academic criteria or evidence.",
    keyAction: "Judge strengths vs limitations and reach a justified conclusion.",
  },
  analyse: {
    definition: "Break down a complex issue into component parts to examine relationships, causes, and underlying principles.",
    keyAction: "Explain 'how' and 'why', not merely 'what'.",
  },
  compare: {
    definition: "Identify both similarities and differences between two or more concepts, theories, or models.",
    keyAction: "Synthesize comparative points systematically across themes.",
  },
  explain: {
    definition: "Clarify how or why a phenomenon occurs, demonstrating deep conceptual understanding.",
    keyAction: "Provide clear reasoning, mechanisms, and illustrative examples.",
  },
  assess: {
    definition: "Estimate the nature, quality, or significance of an argument or approach.",
    keyAction: "Measure against established benchmarks or counter-theories.",
  },
  argue: {
    definition: "Present a well-supported point of view and defend it logically against potential counterarguments.",
    keyAction: "Build a structured line of reasoning leading to a clear conclusion.",
  },
  describe: {
    definition: "Provide detailed factual characteristics, processes, or features.",
    keyAction: "Detail specific traits accurately (usually foundational for analysis).",
  },
};
