/**
 * Scholar Core Academic Assignment Workspace Types
 * Dedicated domain models for undergraduate and postgraduate assignment research, thinking, and drafting.
 */

import type { CanonicalReference } from "../../citation_compliance/model/reference";
import type { CitationStyleType } from "../../services/vault/citationService";
import type { CanonicalDocument } from "../../domain/document/model";
import type { EvidenceLedger } from "../../domain/evidence/types";

export type AssignmentPhaseId = "understand" | "sources" | "drafting" | "submission";

export interface AssignmentPhaseDefinition {
  id: AssignmentPhaseId;
  number: number;
  label: string;
  shortLabel: string;
  description: string;
  iconKey: "FileText" | "Library" | "PenTool" | "CheckCircle2" | string;
}

export const ASSIGNMENT_PHASES: AssignmentPhaseDefinition[] = [
  {
    id: "understand",
    number: 1,
    label: "Phase 1: Understand",
    shortLabel: "Understand",
    description: "Question, word count, citation style, level, & AI analysis",
    iconKey: "FileText",
  },
  {
    id: "sources",
    number: 2,
    label: "Phase 2: Sources",
    shortLabel: "Sources",
    description: "Scholarly discovery, Knowledge Vault integration, & evidence ledger",
    iconKey: "Library",
  },
  {
    id: "drafting",
    number: 3,
    label: "Phase 3: Drafting",
    shortLabel: "Drafting",
    description: "Structured section drafting, real-time word budgets, & AI polish",
    iconKey: "PenTool",
  },
  {
    id: "submission",
    number: 4,
    label: "Phase 4: Submission",
    shortLabel: "Submission",
    description: "10-point rubric assessment, citation audit, & camera-ready export",
    iconKey: "CheckCircle2",
  },
];

export interface AssignmentAgentInfo {
  name: string;
  role: string;
  description: string;
  iconPath: string;
  quickActions: string[];
}

export const ASSIGNMENT_AGENT_CONFIGS: Record<AssignmentPhaseId, AssignmentAgentInfo> = {
  understand: {
    name: "Advisor",
    role: "Assignment Brief & Rubric Guidance",
    description: "I'll guide your understanding of the assignment brief, unpack command verbs, and align with rubric expectations.",
    iconPath: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    quickActions: [
      "Analyze prompt & key command verbs",
      "Recommend writing tone for this brief",
      "Auto-detect rubric grading criteria",
    ],
  },
  sources: {
    name: "Librarian",
    role: "Scholarly Literature & Sourcing",
    description: "I'll help you curate high-impact academic sources, analyze lecture slides, and build verified evidence cards.",
    iconPath: "M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z",
    quickActions: [
      "Recommend empirical sources",
      "Extract lecture slide concepts",
      "Verify author credentials",
    ],
  },
  drafting: {
    name: "Scribe",
    role: "Academic Drafting & Synthesis",
    description: "I'll assist you with sequential PEEL paragraph drafting, deepening critical evaluation, and analytical transitions.",
    iconPath: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    quickActions: [
      "Deepen analytical critique",
      "Strengthen PEEL structure",
      "Synthesize counterargument",
    ],
  },
  submission: {
    name: "Examiner",
    role: "Quality Audit & Final Review",
    description: "I'll audit your submission against the grading rubric, reconcile citations, and ensure formatting perfection.",
    iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    quickActions: [
      "Explain predicted grade",
      "Audit unresolved citations",
      "Check university formatting",
    ],
  },
};

export const LEGACY_STAGE_TO_PHASE_MAP: Record<string, AssignmentPhaseId> = {
  understand: "understand",
  plan: "understand",
  research: "sources",
  evidence: "sources",
  think: "drafting",
  structure: "drafting",
  draft: "drafting",
  final: "submission",
  sources: "sources",
  drafting: "drafting",
  submission: "submission",
};

export function normalizeAssignmentPhase(phaseOrStage?: string | null): AssignmentPhaseId {
  if (!phaseOrStage) return "understand";
  const normalized = phaseOrStage.toLowerCase().trim();
  if (
    normalized === "understand" ||
    normalized === "sources" ||
    normalized === "drafting" ||
    normalized === "submission"
  ) {
    return normalized as AssignmentPhaseId;
  }
  if (normalized in LEGACY_STAGE_TO_PHASE_MAP) {
    return LEGACY_STAGE_TO_PHASE_MAP[normalized];
  }
  return "understand";
}

export type LegacyAssignmentStage =
  | "understand"
  | "plan"
  | "research"
  | "evidence"
  | "think"
  | "structure"
  | "draft"
  | "final";

export type AssignmentStage =
  | AssignmentPhaseId
  | LegacyAssignmentStage;

export type AcademicLevel = "high_school" | "undergraduate" | "postgraduate" | "doctoral";

export type AssignmentType =
  | "essay"
  | "coursework"
  | "analytical_essay"
  | "critical_essay"
  | "argumentative_essay"
  | "research_paper"
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

export interface DocumentRequirement {
  lineRange: string;
  category: "prompt" | "constraint" | "rubric_band" | "formatting" | "penalty";
  description: string;
  verbatimText: string;
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
  briefLedger?: DocumentRequirement[];
}

export interface CoreResearchQuestion {
  id: string;
  question: string;
  rationale?: string;
  category?: string;
}

export interface RecommendedSearchStrategy {
  id: string;
  database: string;
  searchQuery: string;
  relevanceTarget?: string;
}

export interface ResearchPlan {
  coreQuestions: (string | CoreResearchQuestion)[];
  mainConcepts?: string[];
  keyDebates?: string[];
  evidenceTypesNeeded?: string[];
  searchStrategies: (string | RecommendedSearchStrategy)[];
  outOfScopeTopics?: string[];
  approvedByUser: boolean;
  userFeedback?: string;
}

export interface TutorWorkspacePatch {
  plan?: Partial<ResearchPlan>;
  analysis?: Partial<AssignmentAnalysis>;
  question?: string;
}

export type SourceAcademicType =
  | "journal"
  | "book"
  | "conference"
  | "institutional"
  | "report"
  | "vault"
  | "web";

export type SourceCredibilityTier =
  | "peer-reviewed"
  | "academic-press"
  | "conference-proceedings"
  | "institutional-report"
  | "working-paper"
  | "verified-academic";

export type ResearchMethodology =
  | "Empirical Study"
  | "Quantitative Meta-Analysis"
  | "Qualitative Case Study"
  | "Systematic Review"
  | "Theoretical Framework"
  | "Mixed-Methods"
  | "Doctrinal Analysis"
  | "Comparative Analysis";

export type CitationImpactLevel =
  | "Seminal Work"
  | "Highly Cited"
  | "Recent Landmark"
  | "Emerging Scholarship"
  | "Standard Academic";

export type LiteratureViewMode = "card" | "list" | "table" | "compact";

export type SourceVerificationStatus = "verified" | "unverified" | "metadata_incomplete" | "doi_invalid";

export interface DiscoveredSource {
  id: string;
  title: string;
  authors: string[];
  year: string;
  type: SourceAcademicType | string;
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

  // Canonical Source Registry Fields (Production Spec §3.3)
  verificationStatus?: SourceVerificationStatus;
  isActive?: boolean;               // true = eligible for retrieval; false = excluded
  retrievalSource?: string;         // e.g. "openalex", "crossref", "doaj", "arxiv", "datacite", "user_upload"
  retrievedAt?: string;             // ISO timestamp of discovery
  peerReviewed?: boolean | null;    // null = unknown
  volume?: string;
  issue?: string;
  pages?: string;
  publicationStatus?: string;       // e.g. "published", "preprint", "in_press"

  // Academic quality, depth, and research metadata
  abstract?: string;
  citationCount?: number;
  methodology?: ResearchMethodology | string;
  keyConcepts?: string[];
  domain?: string;
  isOpenAccess?: boolean;
  isBookmarked?: boolean;
  isExcluded?: boolean;
  sourceCredibility?: SourceCredibilityTier | string;
  isVerifiedAcademic?: boolean;
  citationImpact?: CitationImpactLevel | string;
  publisher?: string;
  volumeIssue?: string;

  // Manually Added / User Uploaded Provenance & Extracted Evidence
  isUserUploaded?: boolean;
  userDocumentId?: string;
  sourceFormatBadge?: string;
  extractedEvidences?: ExtractedSourceEvidence[];
  structuredDataSummary?: string;

  // Question-Led Alignment, Role in Assignment & Recency Metadata
  roleInAssignment?: "Empirical evidence" | "Theoretical framework" | "Comparative evidence" | "Core theory" | "Methodological framework" | "Contextual evidence" | string;
  relevanceCategory?: "Very High" | "High" | "Moderate";
  questionAlignment?: {
    directScore: number;
    supportsPart?: string;
    evidenceType?: string;
  };

  // Subheading Mapping, Explanation, Origin & Research Notes
  mappedSubheadingIds?: string[];
  whyThisSource?: string;
  sourceOrigin?: "system_found" | "user_uploaded" | "user_added" | "web_source" | "academic" | "primary" | "secondary" | string;
  originTag?: "user" | "ask-scholar" | "ai-research" | string;
  userNotes?: string;

  // Citation Anchoring (Production Spec §5.3)
  // Tracks which sections cite this source, for bidirectional sync
  citedInSections?: string[];
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
  counterargumentHandling: string;
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
  category:
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
  label: string;
  status: "pass" | "warning" | "action_required";
  summary: string;
  feedback: string;
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
  patch?: TutorWorkspacePatch;
}

export const ASSIGNMENT_STAGES: StageDefinition[] = [
  {
    id: "understand",
    number: 1,
    label: "Phase 1: Understand",
    shortLabel: "Understand",
    description: "Brief intake, word budget, rubric criteria & AI analysis",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    id: "sources",
    number: 2,
    label: "Phase 2: Sources",
    shortLabel: "Sources",
    description: "Scholarly discovery, Knowledge Vault integration & evidence ledger",
    icon: "M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z",
  },
  {
    id: "drafting",
    number: 3,
    label: "Phase 3: Drafting",
    shortLabel: "Drafting",
    description: "Structured section drafting, real-time word budgets & AI polish",
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  },
  {
    id: "submission",
    number: 4,
    label: "Phase 4: Submission",
    shortLabel: "Submission",
    description: "10-point rubric assessment, citation audit & camera-ready export",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  },
];


export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  coursework: "Coursework / Applied Assignment",
  essay: "General Academic Essay",
  analytical_essay: "Analytical Essay",
  critical_essay: "Critical Essay",
  argumentative_essay: "Argumentative Essay",
  report: "Formal Academic / Technical Report",
  case_study: "Case Study Analysis",
  literature_review: "Literature Review / Synthesis",
  research_paper: "Academic Research Paper",
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

export const CITATION_STYLES = [
  { id: "apa7", name: "APA 7th Edition (Author, Year)" },
  { id: "harvard", name: "Harvard Referencing (Author, Year)" },
  { id: "mla9", name: "MLA 9th Edition (Author, Page)" },
  { id: "chicago", name: "Chicago Manual of Style (Notes & Bibliography)" },
  { id: "ieee", name: "IEEE (Numbered [1])" },
  { id: "vancouver", name: "Vancouver (Numbered in-text)" },
];

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

export interface CourseDetails {
  courseName?: string;
  courseCode?: string;
  institution?: string;
  deadline?: string;
  rubric?: string;
}

export interface SectionDetail {
  targetWords: number;
  guidelines: string;
}

export interface SectionBreakdown {
  isCustomized: boolean;
  intro: SectionDetail;
  body: SectionDetail;
  conclusion: SectionDetail;
}

export interface AssignmentProjectAnswers {
  instructions: string;
  academicLevel: AcademicLevel;
  assignmentType: AssignmentType;
  targetWordCount: number;
  citationStyle: string;
  sections?: SectionBreakdown;
  courseDetails?: CourseDetails;
  assignment_analysis?: AssignmentAnalysis;
  brief_ledger?: DocumentRequirement[];
  assignment_plan?: ResearchPlan;
  structure?: AssignmentStructure;
  assignment_structure?: AssignmentStructure;
  analyticalSyntheses?: SectionAnalyticalSynthesis[];
  analytical_syntheses?: SectionAnalyticalSynthesis[];
  activeSourceView?: "vault" | "analysis";
  // Legacy / interoperability aliases
  assignment_question?: string;
  assignment_brief_text?: string;
  research_topic?: string;
  word_count?: number;
  word_limit?: number;
  target_word_count?: number;
  citation_style?: string;
  academic_level?: AcademicLevel;
  assignment_type?: AssignmentType;
  course_name?: string;
  institution?: string;
  deadline?: string;
  marking_rubric?: string;
  [key: string]: any;
}

export function cleanAnswerString(val: any): string {
  if (typeof val !== "string") return "";
  const trimmed = val.trim();
  if (trimmed.toLowerCase() === "provisional") return "";
  return trimmed;
}

export function extractStandardizedInstructions(answers: Record<string, any> = {}): string {
  const candidates = [
    answers.instructions,
    answers.assignment_question,
    answers.assignment_brief_text,
    answers.briefText,
    answers.brief,
    answers.prompt,
    answers.research_topic,
    answers.assignment_brief,
  ];
  for (const c of candidates) {
    const cleaned = cleanAnswerString(c);
    if (cleaned.length > 0) return cleaned;
  }
  return "";
}

export function normalizeProjectAnswers(answers: any) {
  if (!answers || typeof answers !== "object") return answers;
  const target = Number(answers.targetWordCount || answers.word_count || answers.target_word_count || answers.word_limit) || 2000;
  if (!answers.sections) {
    const intro = Math.round(target * 0.10);
    const conclusion = Math.round(target * 0.15);
    const body = Math.max(0, target - intro - conclusion);

    answers.sections = {
      isCustomized: false,
      intro: { targetWords: intro, guidelines: '' },
      body: { targetWords: body, guidelines: '' },
      conclusion: { targetWords: conclusion, guidelines: '' },
    };
  }
  return answers;
}

export function getSectionPromptGuidelines(
  sectionKey: 'intro' | 'body' | 'conclusion',
  answers: any
): string {
  const section = answers?.sections?.[sectionKey];
  const targetWords = section?.targetWords ?? 500;
  const guidelines = section?.guidelines?.trim();

  return `
SECTION ALLOCATION: ~${targetWords} words
USER INSTRUCTIONS / MANDATORY CONTENT: ${guidelines ? guidelines : 'Standard academic rigor and appropriate depth for this section.'}
`.trim();
}

/**
 * ============================================================================
 * SPEC SCHEMA (Section 4.2): 4-PHASE ASSIGNMENT PROJECT STATE
 * Unified models for brief, sources, drafting, and submission phases.
 * ============================================================================
 */

export interface AssignmentBriefRubricCriterion {
  id?: string;
  criterion?: string;
  weightPercentage?: number;
  description?: string;
  title?: string;
  weightPercent?: number;
  expectedStandard?: string;
}

export interface SectionBudgetItem {
  id: string;
  title: string;
  targetWordCount: number;
  isCustom?: boolean;
}export type WritingStylePreset =
  | "formal_academic"
  | "analytical"
  | "persuasive"
  | "objective"
  | "critical"
  | "conversational_academic"
  | "argumentative"
  | "expository"
  | "natural"
  | "custom";

export interface WritingStyleConfig {
  preset: WritingStylePreset;
  customSampleText?: string;
  customFileName?: string;
  description?: string;
}

export type SubheadingResearchStatus =
  | "not_researched"
  | "researching"
  | "limited"
  | "sufficient"
  | "gap";

export interface ResearchSourceReference {
  id: string;
  title: string;
  authors: string[];
  year: string;
  journalOrPublisher?: string;
  citation: string;
  role?:
    | "Empirical evidence"
    | "Theoretical framework"
    | "Comparative evidence"
    | "Core theory"
    | "Methodological framework"
    | "Contextual evidence"
    | string;
  relevance?: string;
  doi?: string;
  url?: string;
  keyFinding?: string;
}

export interface AssignmentSubheading {
  id: string;
  headingId: string;
  numberStr: string; // e.g. "1.1", "1.2", "2.1"
  title: string;
  targetWordCount: number;
  currentWordCount?: number;
  notes?: string; // User instructions or notes for this specific subsection
  guidance?: string; // AI guidance on what this subsection should analyze
  keyPoints?: string[];
  researchStatus?: SubheadingResearchStatus;
  evidenceGapDescription?: string;
  sourcesCount?: number;
  boundSourceIds?: string[];
  draftContent?: string;
  draftStatus?: "not_started" | "drafting" | "reviewed" | "completed";

  // Research Blueprint fields (Ask Scholar grounded)
  purpose?: string;
  assignmentQuestionAddressed?: string;
  analyticalObjective?: string;
  keyTheories?: string[];
  keyArguments?: string[];
  evidenceRequired?: string;
  counterarguments?: string[];
  expectedContribution?: string;
  scholarlySources?: ResearchSourceReference[];
}

export interface AssignmentMainHeading {
  id: string;
  number: number; // 1, 2, 3...
  title: string;
  notes?: string;
  targetWordCount: number; // Sum of subheadings
  subheadings: AssignmentSubheading[];

  // Research Blueprint fields (Ask Scholar grounded)
  purpose?: string;
  assignmentQuestionAddressed?: string;
  analyticalObjective?: string;
  keyTheories?: string[];
  keyArguments?: string[];
  evidenceRequired?: string;
  counterarguments?: string[];
  expectedContribution?: string;
  scholarlySources?: ResearchSourceReference[];
}

export interface QuestionMappingMatrixItem {
  assignmentQuestion: string;
  analyticalObjective: string;
  researchNeeded: string;
  keyArguments: string[];
  relevantSources: string[];
  proposedSectionTitle: string;
  proposedSectionNumber: number;
}

export interface ResearchBlueprintOverview {
  centralProblem: string;
  analyticalComponents: string[];
  inquiryType:
    | "comparative_analysis"
    | "causal_inquiry"
    | "theory_case_evaluation"
    | "policy_diagnostic"
    | "dialectical_argument"
    | "empirical_investigation";
  coreDebates: string[];
  expectedOutcomes: string;
  qualityControlChecklist: {
    allQuestionsCovered: boolean;
    logicallyConnected: boolean;
    freeOfGenericFluff: boolean;
    literatureGrounded: boolean;
    debatesIncluded: boolean;
    recencyBalanced: boolean;
    clearProgression: boolean;
    reviewNotes: string;
  };
}

export interface AssignmentStructure {
  version: number;
  isConfirmed: boolean;
  confirmedAt?: string;
  targetWordCount: number;
  totalAllocated: number;
  headings: AssignmentMainHeading[];
  thesisStatement?: string;
  writingTone?: string;
  rationale?: string;
  targetFrameworks?: string[];

  // Research Blueprint Architecture & Question Mapping
  researchBlueprintOverview?: ResearchBlueprintOverview;
  questionMappingMatrix?: QuestionMappingMatrixItem[];
}

export interface OutlineTreeSection {
  level: "h1" | "h2" | "h3";
  title: string;
  guidance?: string;
  targetWordCount?: number;
  ratio?: number;
  children?: OutlineTreeSection[];
}

export interface AskScholarOutlineResponse {
  thesis_statement: string;
  target_frameworks: string[];
  sections: OutlineTreeSection[];
  targetWordCount?: number;
  writingTone?: string;
  academicLevel?: string;
}

export function flattenStructureSubheadings(structure?: AssignmentStructure | null): AssignmentSubheading[] {
  if (!structure?.headings) return [];
  return structure.headings.flatMap((h) => h.subheadings || []);
}

export function calculateStructureAllocatedWords(structure?: AssignmentStructure | null): number {
  if (!structure?.headings) return 0;
  return structure.headings.reduce(
    (sum, h) =>
      sum +
      (h.subheadings && h.subheadings.length > 0
        ? h.subheadings.reduce((subSum, s) => subSum + (Number(s.targetWordCount) || 0), 0)
        : Number(h.targetWordCount) || 0),
    0
  );
}

export function structureToSectionBudgets(structure?: AssignmentStructure | null): SectionBudgetItem[] {
  if (!structure?.headings || structure.headings.length === 0) return [];
  const subs = flattenStructureSubheadings(structure);
  if (subs.length > 0) {
    return subs.map((s) => ({
      id: s.id,
      title: `${s.numberStr} ${s.title}`,
      targetWordCount: s.targetWordCount,
      isCustom: true,
    }));
  }
  return structure.headings.map((h) => ({
    id: h.id,
    title: `${h.number}.0 ${h.title}`,
    targetWordCount: h.targetWordCount,
    isCustom: true,
  }));
}

export function structureToInternalSections(structure?: AssignmentStructure | null): AssignmentDraftingSection[] {
  if (!structure?.headings || structure.headings.length === 0) return [];
  const sections: AssignmentDraftingSection[] = [];
  structure.headings.forEach((h, hIdx) => {
    if (h.subheadings && h.subheadings.length > 0) {
      h.subheadings.forEach((s) => {
        sections.push({
          id: s.id,
          title: `${s.numberStr} ${s.title}`,
          targetWordCount: s.targetWordCount,
          currentWordCount: s.currentWordCount || 0,
          guidance: s.guidance || `Analytical depth for ${s.title}. Notes: ${s.notes || ""}`,
          draftContent: s.draftContent || "",
          status: s.draftStatus || (s.draftContent && s.draftContent.trim().length > 0 ? "completed" : "not_started"),
          keyPoints: s.keyPoints || [],
          linkedEvidenceIds: [],
          boundSourceIds: s.boundSourceIds || [],
          academicFunction: h.title,
          // Propagate Research Blueprint fields to drafting phase
          purpose: s.purpose || h.purpose,
          assignmentQuestionAddressed: s.assignmentQuestionAddressed || h.assignmentQuestionAddressed,
          analyticalObjective: s.analyticalObjective || h.analyticalObjective,
          keyTheories: s.keyTheories || h.keyTheories || [],
          keyArguments: s.keyArguments || h.keyArguments || [],
          evidenceRequired: s.evidenceRequired || h.evidenceRequired,
          counterarguments: s.counterarguments || h.counterarguments || [],
          expectedContribution: s.expectedContribution || h.expectedContribution,
          scholarlySources: s.scholarlySources || h.scholarlySources || [],
        });
      });
    } else {
      sections.push({
        id: h.id,
        title: `${h.number}.0 ${h.title}`,
        targetWordCount: h.targetWordCount,
        currentWordCount: 0,
        guidance: h.notes || `Analysis for ${h.title}`,
        draftContent: "",
        status: "not_started",
        keyPoints: [],
        linkedEvidenceIds: [],
        academicFunction: h.title,
        purpose: h.purpose,
        assignmentQuestionAddressed: h.assignmentQuestionAddressed,
        analyticalObjective: h.analyticalObjective,
        keyTheories: h.keyTheories || [],
        keyArguments: h.keyArguments || [],
        evidenceRequired: h.evidenceRequired,
        counterarguments: h.counterarguments || [],
        expectedContribution: h.expectedContribution,
        scholarlySources: h.scholarlySources || [],
      });
    }
  });
  return sections;
}

export type WritingTonePreset =
  | WritingStylePreset
  | "scholarly_rigorous"
  | "critical_evaluative"
  | "objective_analytical"
  | "applied_reflective"
  | "custom_match";

export interface WritingToneConfig {
  preset: WritingTonePreset;
  customSampleText?: string;
  customFileName?: string;
  description?: string;
}

export interface AssignmentWordBudget {
  intro: number;
  body: number;
  conclusion: number;
}

export interface AssignmentBriefState {
  rawPrompt?: string;
  instructions: string;
  assignmentTopic?: string;
  targetWordCount: number;
  wordBudget?: AssignmentWordBudget;
  sectionBudgets?: SectionBudgetItem[];
  writingStyle?: WritingStyleConfig;
  structure?: AssignmentStructure;
  writingTone?: WritingToneConfig;
  minWordCount?: number;
  maxWordCount?: number;
  academicLevel: AcademicLevel;
  assignmentType: AssignmentType;
  citationStyle: string;
  sections?: SectionBreakdown;
  constraints?: string[];
  rubricCriteria?: AssignmentBriefRubricCriterion[];
  analysis?: AssignmentAnalysis | null;
  briefLedger?: DocumentRequirement[];
  courseDetails?: CourseDetails;
}

export interface ExtractedSourceEvidence {
  id: string;
  excerpt: string;
  context?: string;
  relevanceExplanation?: string;
  sourceLocation?: string;
  pageNumber?: number | string;
  section?: string;
  tableOrFigure?: string;
  claim?: string;
}

export interface UploadedSourceDocument {
  id: string;
  name: string;
  sourceType?: "pdf" | "docx" | "pptx" | "spreadsheet" | "image" | "weblink" | "text" | "other";
  fileUrl?: string;
  fileSize?: number;
  uploadedAt: string;
  mimeType?: string;
  extractedText?: string;
  url?: string;
  author?: string;
  publicationDate?: string;
  citation?: string;
  evidenceCount?: number;
  extractedEvidences?: ExtractedSourceEvidence[];
  relevanceSummary?: string;
  structuredDataSummary?: string;
  processingStatus?: "analyzing" | "extracted" | "error";
  error?: string;
  abstract?: string;
  keyFindings?: string[];
  methodology?: string;
  citationsList?: string[];
  usedInAssignment?: {
    passagesCount: number;
    findingsCount: number;
    citationsCount: number;
    passages?: { text: string; location?: string; targetSection?: string }[];
    findings?: string[];
    citations?: string[];
    mappedSections?: string[];
  };
}

export interface SectionAnalyticalSynthesis {
  id: string;
  sectionId: string;
  sectionTitle: string;
  sectionNumberStr?: string;
  claim: string;
  evidence: string;
  sourceId?: string;
  sourceTitle?: string;
  sourceAuthors?: string[];
  sourceYear?: string;
  sourceJournal?: string;
  evidenceExcerpt?: string;
  evidenceLocation?: string;
  citation: string;
  inTextCitation?: string;
  canonicalReference?: CanonicalReference;
  interpretation: string;
  counterargument: string;
  analyticalLink: string;
  isUserEdited?: boolean;
  userNotes?: string;
}

export interface AssignmentSourcesState {
  curated: DiscoveredSource[];
  userUploaded: UploadedSourceDocument[];
  approvedSourceIds: string[];
  evidenceLedger?: EvidenceLedger | null;
  evidenceItems?: EvidenceItem[];
  analyticalSyntheses?: SectionAnalyticalSynthesis[];
}

export interface AssignmentDraftingSection {
  id: string;
  title: string;
  targetWordCount: number;
  currentWordCount: number;
  guidance: string;
  draftContent: string;
  status: "not_started" | "drafting" | "reviewed" | "complete" | "pending" | "generating" | "completed";
  keyPoints?: string[];
  linkedEvidenceIds?: string[];
  boundSourceIds?: string[];
  academicFunction?: string;
  sectionType?: "intro" | "body" | "conclusion";

  // Research Blueprint fields (Ask Scholar grounded)
  purpose?: string;
  assignmentQuestionAddressed?: string;
  analyticalObjective?: string;
  keyTheories?: string[];
  keyArguments?: string[];
  evidenceRequired?: string;
  counterarguments?: string[];
  expectedContribution?: string;
  scholarlySources?: ResearchSourceReference[];
}

export interface AssignmentDraftingState {
  internalSections: AssignmentDraftingSection[];
  activeSectionId: string | null;
  fullDocumentMarkdown: string;
  overallWordCount: number;
  canonicalDocument?: CanonicalDocument | null;
  thinkingMap?: ThinkingMap | null;
}

export interface RubricScoreCriterion {
  criterion: string;
  score: number;
  maxScore: number;
  feedback: string;
  weightPercentage?: number;
}

export interface RubricScoreReport {
  predictedGrade: string; // e.g. "First Class (1st)" | "Upper Second (2:1)" | "Lower Second (2:2)"
  readinessPercentage: number; // 0 - 100
  criteriaFeedback: Record<string, string>; // criterion name -> specific qualitative feedback
  missingRequirements: string[]; // any unaddressed prompt instructions
  overallScore?: number;
  overallBand?: GradingBand;
  bandLabel?: string;
  summary?: string;
  criteria?: RubricScoreCriterion[];
  strengths?: string[];
  priorityFixes?: string[];
}

export interface CitationAuditIssue {
  citation: string;
  issue: string;
  severity: "error" | "warning" | "suggestion";
  suggestedFix?: string;
}

export interface CitationAuditResult {
  totalInTextCitations: number;
  totalBibliographyEntries: number;
  isReconciled: boolean; // true if 100% of in-text citations resolve to valid sources
  unresolvedCitations: string[]; // list of citations in text missing from reference pool
  reconciledCitations?: string[];
  verifiedCount?: number;
  flaggedIssues?: CitationAuditIssue[];
}

export type CitationAuditReport = CitationAuditResult;

export interface AssignmentSubmissionState {
  rubricScoreReport: RubricScoreReport | SubmissionCheckReport | null;
  citationAudit: CitationAuditReport | null;
  isReadyForSubmission: boolean;
  submittedAt?: string;
  exportFormats?: ("docx" | "pdf" | "markdown")[];
}

export interface AssignmentProjectState {
  projectId: string;
  currentPhase: AssignmentPhaseId;
  brief: AssignmentBriefState;
  sources: AssignmentSourcesState;
  drafting: AssignmentDraftingState;
  submission: AssignmentSubmissionState;
  updatedAt?: string;
}

