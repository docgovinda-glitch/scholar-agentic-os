/**
 * Research Integrity & Ethics Reviewer Agent
 * 
 * Academic quality gatekeeper - reviews for integrity, ethics, and publication readiness.
 * Does NOT fabricate information or approve unsupported claims.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillResult } from "../skills/types";
import type { ResearchPlan } from "./researchPlanner";
import type { LiteratureReview } from "./literatureReview";
import type { KnowledgeGapReport } from "./knowledgeGap";
import type { ResearchQuestionReport } from "./researchQuestion";
import type { MethodologyReport } from "./methodologyAdvisor";
import type { StatisticalAnalysisReport } from "./statisticalAnalysis";

// ============================================================================
// Integrity Review Types
// ============================================================================

export type IssueSeverity = "critical" | "high" | "medium" | "low" | "informational";

export type ReportingGuideline = "PRISMA" | "CONSORT" | "STROBE" | "CARE" | "COREQ" | "ARRIVE" | "SRQR";

export interface IntegrityIssue {
  id: string;
  severity: IssueSeverity;
  category: "integrity" | "ethics" | "citation" | "methodology" | "statistics" | "reporting" | "transparency";
  description: string;
  location?: string;
  recommendation: string;
}

export interface ReportingCompliance {
  guideline: ReportingGuideline;
  compliantItems: string[];
  missingItems: string[];
  completionPercentage: number;
}

export interface IntegrityReviewReport {
  executiveSummary: string;
  integrityScore: number;
  ethicsScore: number;
  reproducibilityScore: number;
  transparencyScore: number;
  reportingCompliance: ReportingCompliance[];
  detectedIssues: IntegrityIssue[];
  blockingIssues: IntegrityIssue[];
  warnings: IntegrityIssue[];
  recommendations: string[];
  publicationReadiness: boolean;
  confidence: number;
}

// ============================================================================
// Integrity Reviewer Input
// ============================================================================

export interface IntegrityReviewerInput {
  researchPlan?: ResearchPlan;
  literatureReview?: LiteratureReview;
  knowledgeGapReport?: KnowledgeGapReport;
  researchQuestionReport?: ResearchQuestionReport;
  methodologyReport?: MethodologyReport;
  statisticalAnalysisReport?: StatisticalAnalysisReport;
  manuscriptText?: string;
  executionMode?: ExecutionMode;
}

// ============================================================================
// Research Integrity & Ethics Reviewer Agent
// ============================================================================

export class IntegrityReviewerAgent implements Agent<IntegrityReviewerInput, IntegrityReviewReport> {
  metadata: AgentMetadata = {
    id: "integrity-reviewer",
    name: "Research Integrity & Ethics Reviewer Agent",
    description: "Reviews research for integrity, ethics, transparency, and publication readiness",
    version: "1.0.0",
    category: "Validation",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: IntegrityReviewerInput,
    context: AgentContext
  ): Promise<AgentResult<IntegrityReviewReport>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the integrity-review skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const result: SkillResult<IntegrityReviewReport> = await context.runSkill<IntegrityReviewReport>(
      "integrity-review",
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
        confidence: 0.95,
      },
    };
  }
}