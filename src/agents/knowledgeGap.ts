/**
 * Knowledge Gap Agent
 * 
 * Identifies what is NOT known from available evidence.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
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

    // Get references from Knowledge Vault
    const references = await context.getReferences?.() ?? [];

    // Identify gaps
    const gaps = this.identifyGaps(input, references);

    return {
      ok: true,
      data: {
        executiveSummary: this.generateExecutiveSummary(gaps),
        gaps,
        topRecommendations: this.generateRecommendations(gaps),
        diagnostics: {
          gapsAnalyzed: gaps.length,
          avgConfidence: this.average(gaps.map((g) => g.confidence)),
          avgNovelty: this.average(gaps.map((g) => g.noveltyScore)),
          avgFeasibility: this.average(gaps.map((g) => g.feasibilityScore)),
        },
      },
      diagnostics: {
        modeUsed: input.executionMode ?? "deterministic",
        executionTimeMs: Date.now() - startTime,
        confidence: 0.85,
      },
    };
  }

  // ============================================================================
  // Gap Identification
  // ============================================================================

  private identifyGaps(input: KnowledgeGapInput, references: unknown[]): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];

    // From literature review
    if (input.literatureReview) {
      // Unanswered research questions
      gaps.push({
        id: "gap-1",
        type: "unanswered-question",
        description: "Research questions from literature review remain unanswered",
        evidenceSupport: input.literatureReview.researchGaps.flatMap((g) => g.suggestedSearchTerms),
        confidence: 0.9,
        noveltyScore: 0.7,
        feasibilityScore: 0.8,
        publicationPotentialScore: 0.85,
      });

      // Contradictory findings
      input.literatureReview.conflictingFindings.forEach((cf, i) => {
        gaps.push({
          id: "gap-contra-" + i,
          type: "contradictory-finding",
          description: "Conflicting evidence on: " + cf.claim,
          evidenceSupport: [...cf.supportingStudies, ...cf.opposingStudies],
          confidence: 0.85,
          noveltyScore: 0.6,
          feasibilityScore: 0.7,
          publicationPotentialScore: 0.9,
        });
      });
    }

    // From research plan
    if (input.researchPlan) {
      input.researchPlan.missingInformation.forEach((mi, i) => {
        gaps.push({
          id: "gap-miss-" + i,
          type: "unanswered-question",
          description: mi,
          evidenceSupport: [],
          confidence: 0.8,
          noveltyScore: 0.5,
          feasibilityScore: 0.9,
          publicationPotentialScore: 0.7,
        });
      });
    }

    // Temporal gaps from reference timeline
    const years = (references as { publicationDate?: string }[]).map((r) =>
      r.publicationDate ? new Date(r.publicationDate).getFullYear() : null
    ).filter((y): y is number => y !== null);

    const recentYears = years.filter((y) => y >= 2020);
    const oldYears = years.filter((y) => y < 2020);

    if (oldYears.length > recentYears.length * 2) {
      gaps.push({
        id: "gap-temporal",
        type: "temporal",
        description: "Limited recent research - knowledge may be outdated",
        evidenceSupport: [],
        confidence: 0.9,
        noveltyScore: 0.8,
        feasibilityScore: 0.7,
        publicationPotentialScore: 0.95,
      });
    }

    return gaps;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateExecutiveSummary(gaps: KnowledgeGap[]): string {
    const highPriority = gaps.filter((g) => g.noveltyScore > 0.7 && g.feasibilityScore > 0.7);
    return "Identified " + gaps.length + " knowledge gaps, with " + highPriority.length + " high-priority opportunities for novel research.";
  }

  private generateRecommendations(gaps: KnowledgeGap[]): { studies: string[]; datasets: string[]; journals: string[] } {
    return {
      studies: gaps.slice(0, 3).map((g) => g.id),
      datasets: ["dataset-recommendation-1"],
      journals: ["Nature", "Science", "IEEE Transactions"],
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}