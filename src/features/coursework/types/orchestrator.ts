/**
 * Coursework Dual-Mode Orchestrator Type Definitions
 * ---------------------------------------------------
 * Contracts for Minimal Mode (Guided Atomic Lifecycle) and
 * Detailed Mode (Autonomous Deep Synthesis) across Coursework & Essays (OT-01).
 */

import type { AcademicLevel, AssignmentType, DiscoveredSource } from "../../../desk/assignment/types";
import type { AcademicTone } from "../../drafting/types/drafting";
import type { UniquenessValidationResult } from "../../drafting/services/sectionDraftingEngine";

/**
 * Execution mode for the Coursework & Essays workspace.
 */
export type CourseworkExecutionMode = "minimal" | "detailed";

/**
 * The four sequential phases of the Coursework lifecycle.
 */
export type CourseworkPhase = "understand" | "sources" | "drafting" | "submission";

/**
 * Real-time event emitted during orchestrator execution.
 */
export interface CourseworkProgressEvent {
  phase: CourseworkPhase;
  step: string;
  progressPercentage: number;
  message: string;
  detail?: string;
  timestamp: number;
}

/**
 * Prompt deconstruction analysis result.
 */
export interface DeconstructedPrompt {
  rawPrompt: string;
  commandVerbs: string[];
  scope: string;
  targetWordCount: number;
  coreThemes: string[];
  extractedQuestions: string[];
  recommendedTone: AcademicTone;
}

/**
 * Section item in an analytical outline.
 */
export interface OrchestratorOutlineSection {
  id: string;
  numberStr: string;
  title: string;
  targetWordCount: number;
  currentWordCount?: number;
  focus: string;
  guidance?: string;
  keyPoints: string[];
  academicFunction?: string;
  sectionType?: "intro" | "body" | "conclusion";
}

/**
 * Drafted section with word count and metadata.
 */
export interface OrchestratorDraftedSection {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  targetWordCount: number;
  status: "drafted" | "reviewed" | "approved";
}

/**
 * 10-point rubric criteria evaluation item.
 */
export interface RubricCriterionScore {
  criterion: string;
  score: number; // 0 - 10
  maxScore: number; // 10
  feedback: string;
}

/**
 * Full 10-point rubric evaluation report.
 */
export interface Rubric10PointEvaluation {
  totalScore: number; // 0 - 100
  maxScore: number; // 100
  letterGrade: string; // e.g. "A", "A-", "B+"
  criteria: RubricCriterionScore[];
  summaryFeedback: string;
  evaluatedAt: number;
}

/**
 * Parameters for Phase 1: Understand (Minimal Mode).
 */
export interface MinimalUnderstandParams {
  question: string;
  targetWordCount?: number;
  academicLevel?: AcademicLevel;
  assignmentType?: AssignmentType;
  citationStyle?: string;
  academicTone?: AcademicTone | string;
  briefText?: string;
}

/**
 * Result of Phase 1: Understand (Minimal Mode).
 */
export interface MinimalUnderstandResult {
  deconstructedPrompt: DeconstructedPrompt;
  suggestedOutline: OrchestratorOutlineSection[];
  yieldedControlToUI: true;
}

/**
 * Parameters for Phase 2: Sources (Minimal Mode).
 */
export interface MinimalSourcesParams {
  question: string;
  citationStyle?: string;
  maxResults?: number;
  customQueries?: string[];
}

/**
 * Result of Phase 2: Sources (Minimal Mode).
 */
export interface MinimalSourcesResult {
  discoveredSources: DiscoveredSource[];
  generatedQueries: string[];
  yieldedControlToUI: true;
}

/**
 * Parameters for Phase 3: Drafting a single section (Minimal Mode).
 */
export interface MinimalDraftingParams {
  sectionId: string;
  sectionTitle: string;
  targetWordCount: number;
  assignmentQuestion: string;
  academicFunction?: string;
  keyPoints?: string[];
  tone?: AcademicTone | string;
  citationStyle?: string;
  boundSources?: Array<{
    id: string;
    title: string;
    authors?: string[];
    year?: string | number;
    journal?: string;
    doi?: string;
  }>;
  priorSections?: Array<{ id?: string; title: string; content: string }>;
}

/**
 * Result of Phase 3: Drafting a single section (Minimal Mode).
 */
export interface MinimalDraftingResult {
  sectionId: string;
  title: string;
  content: string;
  wordCount: number;
  activeVoiceRatio: number;
  complianceIssues: string[];
  yieldedControlToUI: true;
}

/**
 * Parameters for Phase 4: Submission & Rubric Evaluation (Minimal Mode).
 */
export interface MinimalSubmissionParams {
  sections: Array<{ id?: string; title: string; content: string }>;
  sources: DiscoveredSource[];
  citationStyle?: string;
  targetWordCount?: number;
  assignmentQuestion?: string;
}

/**
 * Result of Phase 4: Submission & Rubric Evaluation (Minimal Mode).
 */
export interface MinimalSubmissionResult {
  uniquenessValidation: UniquenessValidationResult;
  rubricEvaluation: Rubric10PointEvaluation;
  bibliography: string;
  finalDocumentMarkdown: string;
  totalWordCount: number;
  yieldedControlToUI: true;
}

/**
 * Configuration for Detailed Mode (Autonomous Deep Synthesis).
 */
export interface DetailedAutonomousSynthesisConfig {
  question: string;
  targetWordCount: number;
  citationStyle: string; // "apa7" | "harvard" | "ieee" | "mla9"
  academicLevel?: AcademicLevel;
  assignmentType?: AssignmentType;
  academicTone?: AcademicTone | string;
  briefText?: string;
  courseName?: string;
  rubricCriteria?: string[];
}

/**
 * Result of Detailed Mode (Autonomous Deep Synthesis).
 */
export interface DetailedAutonomousSynthesisResult {
  title: string;
  mode: "detailed";
  deconstructedPrompt: DeconstructedPrompt;
  outline: OrchestratorOutlineSection[];
  sources: DiscoveredSource[];
  sections: OrchestratorDraftedSection[];
  fullDraft: string;
  bibliography: string;
  uniquenessValidation: UniquenessValidationResult;
  rubricEvaluation: Rubric10PointEvaluation;
  executionTimestamp: number;
  stats: {
    totalWords: number;
    targetWords: number;
    sourceCount: number;
    sectionCount: number;
    activeVoiceScore: number;
  };
}
