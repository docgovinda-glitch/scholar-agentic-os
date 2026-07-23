/**
 * Literature Review Agent
 * 
 * Primary engine for literature discovery, evidence synthesis, and gap identification.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillResult } from "../skills/types";
import type { LiteratureReviewSkillInput } from "../skills/literatureReviewSkill";

// ============================================================================
// Literature Review Types
// ============================================================================

export type EvidenceQuality = "high" | "medium" | "low";

export type StudyMethodology =
  | "experimental"
  | "quasi-experimental"
  | "observational"
  | "theoretical"
  | "review"
  | "meta-analysis"
  | "case-study";

export interface StudyClassification {
  methodology: StudyMethodology;
  publicationType: string;
  discipline: string;
  publicationYear: number;
}

export interface LiteratureTheme {
  id: string;
  name: string;
  description: string;
  studies: string[]; // reference IDs
  confidence: number;
}

export interface EvidenceMap {
  methodologyDistribution: Record<StudyMethodology, number>;
  yearDistribution: Record<number, number>;
  journalDistribution: Record<string, number>;
}

export interface ResearchGap {
  id: string;
  description: string;
  relatedThemes: string[];
  suggestedSearchTerms: string[];
  evidenceSupport?: string[];
}

export interface ConflictingFinding {
  id: string;
  claim: string;
  supportingStudies: string[];
  opposingStudies: string[];
}

export interface LiteratureReview {
  executiveSummary: string;
  keyFindings: string[];
  themes: LiteratureTheme[];
  evidenceMap: EvidenceMap;
  researchGaps: ResearchGap[];
  conflictingFindings: ConflictingFinding[];
  recommendedPapers: string[];
  recommendedJournals: string[];
  recommendedSearchTerms: string[];
  confidence: number;
  assumptions: string[];
  diagnostics: {
    localStudies: number;
    webStudies: number;
    duplicatesRemoved: number;
    avgEvidenceQuality: EvidenceQuality;
  };
}

// ============================================================================
// Literature Review Input
// ============================================================================

export interface LiteratureReviewInput {
  researchQuestions: string[];
  discipline?: string;
  minYear?: number;
  maxResults?: number;
  executionMode?: ExecutionMode;
}

// ============================================================================
// Literature Provider Interface
// ============================================================================

export interface LiteratureProvider {
  search(query: string, options?: { discipline?: string; year?: number }): Promise<unknown[]>;
  getId(): string;
}

// ============================================================================
// Literature Review Agent
// ============================================================================

export class LiteratureReviewAgent implements Agent<LiteratureReviewInput, LiteratureReview> {
  metadata: AgentMetadata = {
    id: "literature-review",
    name: "Literature Review Agent",
    description: "Discovers literature, synthesizes evidence, identifies research gaps",
    version: "1.0.0",
    category: "Research",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: LiteratureReviewInput,
    context: AgentContext
  ): Promise<AgentResult<LiteratureReview>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the literature-review skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    // Get local studies from Knowledge Vault
    const localStudies = await context.getReferences?.() ?? [];

    // Get web studies if available
    let webStudies: unknown[] = [];
    if (input.executionMode !== "deterministic") {
      webStudies = await this.fetchWebStudies(input, context);
    }

    const skillInput: LiteratureReviewSkillInput = {
      researchQuestions: input.researchQuestions,
      discipline: input.discipline,
      minYear: input.minYear,
      maxResults: input.maxResults,
      localStudies,
      webStudies,
    };

    const result: SkillResult<LiteratureReview> = await context.runSkill<LiteratureReview>("literature-review", skillInput);
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

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async fetchWebStudies(
    input: LiteratureReviewInput,
    context: AgentContext
  ): Promise<unknown[]> {
    // Would call web search providers through abstraction
    return [];
  }
}