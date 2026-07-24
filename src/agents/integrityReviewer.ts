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
import type { LiteratureResult } from "../services/literatureRetrievalService";
import type { AISettings } from "../types";

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

// Semantic peer review (docs/planning/semantic-peer-review-scoping.md,
// 2026-07-24 build session). Deliberately NOT a rigor/novelty/publishability
// verdict — see that doc's "do not attempt" list. Every finding is anchored
// to one specific, really-retrieved paper: citedPaper is never model-echoed
// free text, it's looked up by the skill from the real papers it retrieved
// (see integrityReviewerSkill.ts), so a finding can never cite a paper that
// wasn't actually found by literatureRetrievalService.discoverLiterature().
export interface ComparableSourceFinding {
  /** A single, comparative, citation-anchored sentence — never a quality/rigor/publishability judgment. */
  finding: string;
  /** The real, retrieved paper this finding is about — looked up by the skill, never taken from model output. */
  citedPaper: { title: string; url: string };
}

export interface ComparableSourceAnalysis {
  /** Every real paper retrieved for comparison, regardless of whether the AI comparison pass produced a finding about it. */
  retrievedPapers: LiteratureResult[];
  findings: ComparableSourceFinding[];
  /** Real, computed — reflects whether retrieval AND the AI comparison pass both actually succeeded, never a fabricated constant. */
  confidence: number;
  /** Set when there's nothing to compare (no query derivable, retrieval found nothing, or no manuscript text) — honest gap, not a fabricated result. */
  note?: string;
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
  /**
   * 0-100 percentage of a fixed structural/heading-presence checklist found
   * in manuscriptText (Abstract, Introduction, Methods, Results, Discussion,
   * Limitations, Conflict of Interest, Data Availability, Ethics/IRB
   * approval) — replaces the previous publicationReadiness boolean, which
   * was always true because nothing ever fed it real signal. This is a
   * coarse structural/completeness scan, not semantic peer-review judgment
   * of the manuscript's actual scientific content — see executiveSummary,
   * which discloses this explicitly.
   */
  structuralCompleteness: number;
  /**
   * Additive, separate from structuralCompleteness above — a literature-
   * grounded comparison, not a heading-presence scan. null when nothing was
   * available to compare against (no title/keywords to search with, no
   * manuscript text, or retrieval found nothing) — never a fabricated
   * result. See ComparableSourceAnalysis's comment and
   * docs/planning/semantic-peer-review-scoping.md for the full design.
   */
  comparableSourceAnalysis: ComparableSourceAnalysis | null;
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
  /** Real manuscript title/keywords — used only to derive a real search query
   *  for comparable-literature retrieval, never invented. */
  title?: string;
  keywords?: string[];
  aiSettings?: AISettings;
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