/**
 * Statistical Analysis Advisor Agent
 * 
 * Acts as an experienced statistician - recommends statistical methods.
 * Does NOT execute analyses or generate fabricated results.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
import type { SkillResult } from "../skills/types";
import type { ResearchQuestionReport, ResearchQuestion } from "./researchQuestion";
import type { MethodologyReport, MethodologyRecommendation } from "./methodologyAdvisor";

// ============================================================================
// Statistical Types
// ============================================================================

export type ParametricTest = "t-test" | "ANOVA" | "ANCOVA" | "MANOVA" | "linear-regression" | "multiple-regression" | "logistic-regression";

export type NonParametricTest = "mann-whitney" | "wilcoxon" | "kruskal-wallis" | "friedman" | "chi-square";

export type AdvancedTest = "SEM" | "CFA" | "EFA" | "PCA" | "cluster-analysis" | "survival-analysis" | "time-series" | "bayesian";

export type QualitativeAnalysis = "thematic-analysis" | "content-analysis" | "grounded-theory" | "narrative-analysis";

export type VisualizationType = "histogram" | "boxplot" | "scatterplot" | "bar-chart" | "heatmap" | "network-diagram";

export interface StatisticalAnalysis {
  id: string;
  type: ParametricTest | NonParametricTest | AdvancedTest | QualitativeAnalysis;
  variables: string[];
  assumptions: string[];
  rationale: string;
  software?: string;
}

export interface StatisticalAnalysisReport {
  executiveSummary: string;
  analyses: StatisticalAnalysis[];
  assumptions: string[];
  prerequisiteChecks: string[];
  visualizations: { type: VisualizationType; purpose: string }[];
  interpretationGuidance: string;
  reportingGuidance: string;
  limitations: string[];
  risks: string[];
  confidence: number;
}

// ============================================================================
// Statistical Analysis Advisor Input
// ============================================================================

export interface StatisticalAnalysisInput {
  researchQuestionReport?: ResearchQuestionReport;
  methodologyReport?: MethodologyReport;
  variables?: string[];
  sampleSize?: number;
  executionMode?: ExecutionMode;
}

// ============================================================================
// Statistical Analysis Advisor Agent
// ============================================================================

export class StatisticalAnalysisAdvisor implements Agent<StatisticalAnalysisInput, StatisticalAnalysisReport> {
  metadata: AgentMetadata = {
    id: "statistical-analysis-advisor",
    name: "Statistical Analysis Advisor Agent",
    description: "Recommends statistical methods based on research design and variables",
    version: "1.0.0",
    category: "Statistics",
    author: "System",
    offlineCapable: true,
    aiEnhanced: true,
    supportedModes: ["deterministic", "ai", "web", "hybrid"],
    defaultMode: "hybrid",
  };

  async execute(
    input: StatisticalAnalysisInput,
    context: AgentContext
  ): Promise<AgentResult<StatisticalAnalysisReport>> {
    const startTime = Date.now();

    if (!context.runSkill) {
      return {
        ok: false,
        error: {
          type: "EXECUTION_ERROR",
          message: "AgentContext.runSkill is not available — cannot reach the statistical-analysis-recommendation skill",
        },
        diagnostics: {
          modeUsed: input.executionMode ?? "deterministic",
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const result: SkillResult<StatisticalAnalysisReport> = await context.runSkill<StatisticalAnalysisReport>(
      "statistical-analysis-recommendation",
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