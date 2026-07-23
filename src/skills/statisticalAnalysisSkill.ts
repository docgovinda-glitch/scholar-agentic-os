/**
 * Statistical Analysis Advisor Skill
 *
 * Native (deterministic, no-AI-call) implementation of the statistical-test
 * recommendation logic previously inlined in StatisticalAnalysisAdvisor.
 * Registered under id "statistical-analysis-recommendation" and invoked by
 * StatisticalAnalysisAdvisor via AgentContext.runSkill.
 *
 * Fabrication audit note: checked for the hardcoded-real-entity pattern
 * fixed elsewhere today (fake journal/dataset names presented as verified
 * recommendations) — none found. Software names here (SPSS/R, R/Python,
 * NVivo/ATLAS.ti) are generic tool-category advice, same category
 * target-workflow.md §10 already ruled out. Moved unchanged.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult } from "./types";
import type {
  StatisticalAnalysisInput,
  StatisticalAnalysisReport,
  StatisticalAnalysis,
  ParametricTest,
  NonParametricTest,
  QualitativeAnalysis,
  VisualizationType,
} from "../agents/statisticalAnalysis";
import type { ResearchQuestion } from "../agents/researchQuestion";
import type { MethodologyRecommendation } from "../agents/methodologyAdvisor";

export class StatisticalAnalysisSkill implements Skill<StatisticalAnalysisInput, StatisticalAnalysisReport> {
  readonly metadata: SkillMetadata = {
    id: "statistical-analysis-recommendation",
    name: "Statistical Analysis Recommendation",
    description: "Recommends statistical tests, visualizations, and reporting guidance from research questions and methodology — never executes analyses or fabricates results",
    version: "1.0.0",
    category: "Statistics",
    author: "System",
    offlineCapable: true,
    aiEnhanced: false,
  };

  async execute(input: StatisticalAnalysisInput, context: SkillContext): Promise<SkillResult<StatisticalAnalysisReport>> {
    context.logger.debug("Recommending statistical analyses", { variableCount: input.variables?.length ?? 0 });

    const questions = input.researchQuestionReport?.questions ?? [];
    const methodology = input.methodologyReport?.primaryRecommendation;
    const variables = input.variables ?? questions.flatMap((q) => q.variables);

    const analyses = this.recommendAnalyses(questions, methodology, variables);
    const visualizations = this.recommendVisualizations(analyses);

    const report: StatisticalAnalysisReport = {
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
    };

    return { ok: true, data: report };
  }

  private recommendAnalyses(
    questions: ResearchQuestion[],
    methodology: MethodologyRecommendation | undefined,
    variables: string[]
  ): StatisticalAnalysis[] {
    const analyses: StatisticalAnalysis[] = [];

    const paradigm = methodology?.paradigm ?? this.inferParadigm(variables);

    analyses.push({
      id: "descriptive-1",
      type: "t-test" as ParametricTest,
      variables,
      assumptions: ["Data is normally distributed", "Variables are continuous"],
      rationale: "Descriptive statistics for all variables",
    });

    if (paradigm === "quantitative") {
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

    vizMap.set("histogram", "Show variable distributions");

    return Array.from(vizMap.entries()).map(([type, purpose]) => ({ type, purpose }));
  }

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
