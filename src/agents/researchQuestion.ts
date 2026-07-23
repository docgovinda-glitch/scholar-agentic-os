/**
 * Research Question & Hypothesis Agent
 * 
 * Transforms research gaps into high-quality, publishable questions and hypotheses.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillResult } from "../skills/types";
import type { KnowledgeGapReport, KnowledgeGap } from "./knowledgeGap";
import type { ResearchPlan } from "./researchPlanner";

// ============================================================================
// Question & Hypothesis Types
// ============================================================================

export interface ResearchQuestion {
  id: string;
  primary: boolean;
  text: string;
  justification: string;
  noveltyScore: number;
  clarityScore: number;
  significanceScore: number;
  feasibilityScore: number;
  publicationPotentialScore: number;
  variables: string[];
  ethicalConsiderations?: string[];
}

export interface Hypothesis {
  id: string;
  questionId: string;
  text: string;
  nullHypothesis: string;
  variables: string[];
  constructs: string[];
  testable: boolean;
}

export interface ResearchObjective {
  id: string;
  questionId: string;
  text: string;
  expectedContribution: string;
}

export interface ResearchQuestionReport {
  executiveSummary: string;
  questions: ResearchQuestion[];
  hypotheses: Hypothesis[];
  objectives: ResearchObjective[];
  variables: string[];
  recommendedMethodology: string;
  recommendedDatasets: string[];
  confidence: number;
  diagnostics: {
    questionsGenerated: number;
    hypothesesGenerated: number;
    avgNovelty: number;
    avgFeasibility: number;
  };
}

// ============================================================================
// Research Question Agent Input
// ============================================================================

export interface ResearchQuestionInput {
  researchPlan?: ResearchPlan;
  knowledgeGapReport?: KnowledgeGapReport;
  maxQuestions?: number;
  executionMode?: ExecutionMode;
}

// ============================================================================
// Research Question Agent
// ============================================================================

export class ResearchQuestionAgent implements Agent<ResearchQuestionInput, ResearchQuestionReport> {
  metadata: AgentMetadata = {
    id: "research-question",
    name: "Research Question Agent",
    description: "Transforms research gaps into publishable questions and hypotheses",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: ResearchQuestionInput,
    context: AgentContext
  ): Promise<AgentResult<ResearchQuestionReport>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the research-question-generation skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const result: SkillResult<ResearchQuestionReport> = await context.runSkill<ResearchQuestionReport>(
      "research-question-generation",
      input
    );
    const executionTimeMs = Date.now() - startTime;

    if (result.ok === false) {
      return {
        ok: false,
        error: result.error,
        diagnostics: { modeUsed: input.executionMode ?? "deterministic", executionTimeMs },
      };
    }

    return {
      ok: true,
      data: result.data,
      diagnostics: {
        modeUsed: input.executionMode ?? "deterministic",
        executionTimeMs,
        confidence: 0.9,
      },
    };
  }
}