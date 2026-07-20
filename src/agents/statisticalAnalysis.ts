/**
 * Statistical Analysis Advisor Agent
 * 
 * Acts as an experienced statistician - recommends statistical methods.
 * Does NOT execute analyses or generate fabricated results.
 */

import type { Agent, AgentContext, AgentResult, ExecutionMode, AgentMetadata } from "../agents/types";
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

    // Determine analyses based on questions and methodology
    const questions = input.researchQuestionReport?.questions ?? [];
    const methodology = input.methodologyReport?.primaryRecommendation;
    const variables = input.variables ?? questions.flatMap((q) => q.variables);

    // Generate analysis recommendations
    const analyses = this.recommendAnalyses(questions, methodology, variables);
    const visualizations = this.recommendVisualizations(analyses);

    return {
      ok: true,
      data: {
        executiveSummary: this.generateExecutiveSummary(analyses),
        analyses,
        assumptions: this.generateAssumptions(analyses),
        prerequisiteChecks: this.generatePrerequisiteChecks(analyses),
        visualizations,
        interpretationGuidance: this.generateInterpretationGuidance(analyses),
        reportingGuidance: this.generateReportingGuidance(analyses),
        limitations: ["Actual analysis results not generated"],
        risks: ["Assumptions may not hold in practice"],
        confidence: 0.9,
      },
      diagnostics: {
        modeUsed: input.executionMode ?? "deterministic",
        executionTimeMs: Date.now() - startTime,
        confidence: 0.9,
      },
    };
  }

  // ============================================================================
  // Analysis Recommendation
  // ============================================================================

  private recommendAnalyses(
    questions: ResearchQuestion[],
    methodology: MethodologyRecommendation | undefined,
    variables: string[]
  ): StatisticalAnalysis[] {
    const analyses: StatisticalAnalysis[] = [];

    // Determine paradigm from methodology or questions
    const paradigm = methodology?.paradigm ?? this.inferParadigm(variables);

    // Descriptive statistics (always recommended)
    analyses.push({
      id: "descriptive-1",
      type: "t-test" as ParametricTest,
      variables,
      assumptions: ["Data is normally distributed", "Variables are continuous"],
      rationale: "Descriptive statistics for all variables",
    });

    if (paradigm === "quantitative") {
      // Inferential based on variables
      if (variables.length === 1) {
        analyses.push({
          id: "inferential-1",
          type: "t-test" as ParametricTest,
          variables,
          assumptions: ["Independent samples", "Normal distribution"],
          rationale: "Single variable comparison appropriate for experimental design",
          software: "SPSS/R",
        });
      } else if (variables.length <= 5) {
        analyses.push({
          id: "inferential-2",
          type: "ANOVA" as ParametricTest,
          variables,
          assumptions: ["Homogeneity of variance", "Normal distribution"],
          rationale: "Multiple variables suitable for ANOVA analysis",
          software: "SPSS/R",
        });
      } else {
        analyses.push({
          id: "inferential-3",
          type: "multiple-regression" as ParametricTest,
          variables,
          assumptions: ["Linearity", "No multicollinearity", "Independence"],
          rationale: "Multiple regression for complex variable relationships",
          software: "R/Python",
        });
      }

      // Assumption testing
      analyses.push({
        id: "assumption-1",
        type: "shapiro-wilk" as NonParametricTest,
        variables,
        assumptions: ["Sample size adequate for normality test"],
        rationale: "Test normality assumptions before parametric tests",
      });
    } else if (paradigm === "qualitative") {
      analyses.push({
        id: "qualitative-1",
        type: "thematic-analysis" as QualitativeAnalysis,
        variables,
        assumptions: ["Data saturation achieved"],
        rationale: "Thematic analysis for qualitative research questions",
        software: "NVivo/ATLAS.ti",
      });
    } else {
      // Mixed methods
      analyses.push({
        id: "mixed-1",
        type: "thematic-analysis" as QualitativeAnalysis,
        variables: variables.slice(0, Math.ceil(variables.length / 2)),
        assumptions: ["Qualitative data available"],
        rationale: "Qualitative component of mixed methods",
      });
      analyses.push({
        id: "mixed-2",
        type: "multiple-regression" as ParametricTest,
        variables: variables.slice(Math.ceil(variables.length / 2)),
        assumptions: ["Quantitative data available"],
        rationale: "Quantitative component of mixed methods",
      });
    }

    // Effect size recommendation
    analyses.push({
      id: "effect-1",
      type: "cohen-d" as NonParametricTest,
      variables: [],
      assumptions: ["Valid effect size calculation"],
      rationale: "Calculate effect sizes for all main analyses",
    });

    return analyses;
  }

  private inferParadigm(variables: string[]): "quantitative" | "qualitative" | "mixed-methods" {
    return variables.length > 0 ? "quantitative" : "qualitative";
  }

  // ============================================================================
  // Visualization Recommendations
  // ============================================================================

  private recommendVisualizations(analyses: StatisticalAnalysis[]): { type: VisualizationType; purpose: string }[] {
    const vizMap = new Map<VisualizationType, string>();

    analyses.forEach((a) => {
      if (a.type === "t-test" || a.type === "ANOVA") {
        vizMap.set("boxplot", "Compare group distributions");
        vizMap.set("bar-chart", "Show mean differences");
      }
      if (a.type === "multiple-regression" || a.type === "linear-regression") {
        vizMap.set("scatterplot", "Show variable relationships");
      }
      if (a.type === "thematic-analysis" || a.type === "content-analysis") {
        vizMap.set("heatmap", "Show theme frequency");
        vizMap.set("network-diagram", "Show theme relationships");
      }
    });

    // Default visualizations
    vizMap.set("histogram", "Show variable distributions");

    return Array.from(vizMap.entries()).map(([type, purpose]) => ({ type, purpose }));
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private generateExecutiveSummary(analyses: StatisticalAnalysis[]): string {
    const testCount = analyses.filter((a) =>
      ["t-test", "ANOVA", "ANOVA", "multiple-regression", "thematic-analysis"].includes(a.type)
    ).length;
    return "Recommended " + analyses.length + " statistical analyses including " + testCount + " primary tests. Confidence: 0.9";
  }

  private generateAssumptions(analyses: StatisticalAnalysis[]): string[] {
    return [
      "Normality of data",
      "Homogeneity of variance",
      "Independence of observations",
      "No multicollinearity",
    ];
  }

  private generatePrerequisiteChecks(analyses: StatisticalAnalysis[]): string[] {
    return [
      "Check for missing data",
      "Test normality assumptions",
      "Verify sample size adequacy",
      "Validate measurement scales",
    ];
  }

  private generateInterpretationGuidance(analyses: StatisticalAnalysis[]): string {
    return "Focus on effect sizes and confidence intervals alongside p-values. Consider practical significance.";
  }

  private generateReportingGuidance(analyses: StatisticalAnalysis[]): string {
    return "Report all assumptions tested, effect sizes with 95% CIs, and descriptive statistics for all variables.";
  }
}