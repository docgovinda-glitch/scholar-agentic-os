/**
 * Knowledge Gap Agent
 * 
 * Identifies what is NOT known from available evidence.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillResult } from "../skills/types";
import type { KnowledgeGapSkillInput } from "../skills/knowledgeGapSkill";
import type { LiteratureReview } from "./literatureReview";
import type { ResearchPlan } from "./researchPlanner";

// ============================================================================
// Gap Types
// ============================================================================

export type GapType =
  | "unanswered-question"
  | "contradictory-finding"
  | "weak-evidence"
  | "under-researched"
  | "outdated-finding"
  | "methodological"
  | "population"
  | "geographic"
  | "temporal"
  | "theoretical"
  | "practical"
  | "opportunity"
  | "human-subjects";

export interface KnowledgeGap {
  id: string;
  type: GapType;
  description: string;
  evidenceSupport: string[]; // reference IDs
  confidence: number;
  noveltyScore: number;
  feasibilityScore: number;
  publicationPotentialScore: number;
}

export interface KnowledgeGapReport {
  executiveSummary: string;
  gaps: KnowledgeGap[];
  topRecommendations: {
    studies: string[];
    datasets: string[];
    journals: string[];
  };
  diagnostics: {
    gapsAnalyzed: number;
    avgConfidence: number;
    avgNovelty: number;
    avgFeasibility: number;
  };
}

// ============================================================================
// Knowledge Gap Agent Input
// ============================================================================

export interface KnowledgeGapInput {
  literatureReview?: LiteratureReview;
  researchPlan?: ResearchPlan;
  executionMode?: ExecutionMode;
}

// ============================================================================
// Knowledge Gap Agent
// ============================================================================

export class KnowledgeGapAgent implements Agent<KnowledgeGapInput, KnowledgeGapReport> {
  metadata: AgentMetadata = {
    id: "knowledge-gap",
    name: "Knowledge Gap Agent",
    description: "Identifies unknown areas and opportunities in research landscape",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: KnowledgeGapInput,
    context: AgentContext
  ): Promise<AgentResult<KnowledgeGapReport>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the knowledge-gap-analysis skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Get references from Knowledge Vault
    const references = await context.getReferences?.() ?? [];

    const skillInput: KnowledgeGapSkillInput = {
      ...input,
      references,
    };

    const result: SkillResult<KnowledgeGapReport> = await context.runSkill<KnowledgeGapReport>("knowledge-gap-analysis", skillInput);
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
        confidence: 0.85,
      },
    };
  }
}