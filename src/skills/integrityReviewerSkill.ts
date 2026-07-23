/**
 * Integrity & Ethics Review Skill
 *
 * Native (deterministic, no-AI-call) implementation of the integrity-review
 * logic previously inlined in IntegrityReviewerAgent. Registered under id
 * "integrity-review" and invoked by IntegrityReviewerAgent via
 * AgentContext.runSkill.
 *
 * Fabrication audit finding, moved unchanged, NOT fixed in this pass:
 * evaluateReportingCompliance() returns an identical hardcoded compliance
 * report (same completion percentage, same "compliant"/"missing" item
 * lists) for CONSORT/STROBE/PRISMA regardless of manuscriptText — it never
 * inspects the actual input at all. Arguably worse than the journal-list
 * fabrications fixed elsewhere today, since it falsely implies a real
 * evaluation of the user's actual manuscript. No existing reusable service
 * applies here (this needs real text/structure analysis of manuscriptText,
 * not external retrieval; aiService.ts's analyzeManuscriptStructure is the
 * closest existing deterministic analog but operates on a different input
 * shape — PaperProject.sections + complianceRules.sectionStructure, not a
 * plain manuscriptText string) — flagged in target-workflow.md's
 * fabrication-audit list for a dedicated future task, not fixed here.
 */

import type { Skill, SkillContext, SkillMetadata, SkillResult } from "./types";
import type {
  IntegrityReviewerInput,
  IntegrityReviewReport,
  IntegrityIssue,
  ReportingCompliance,
  ReportingGuideline,
} from "../agents/integrityReviewer";
import type { ResearchPlan } from "../agents/researchPlanner";
import type { LiteratureReview } from "../agents/literatureReview";
import type { MethodologyReport } from "../agents/methodologyAdvisor";
import type { StatisticalAnalysisReport } from "../agents/statisticalAnalysis";

export class IntegrityReviewerSkill implements Skill<IntegrityReviewerInput, IntegrityReviewReport> {
  readonly metadata: SkillMetadata = {
    id: "integrity-review",
    name: "Integrity & Ethics Review",
    description: "Reviews a research plan, literature review, methodology, and statistical analysis for integrity, ethics, and transparency issues",
    version: "1.0.0",
    category: "Validation",
    author: "System",
    offlineCapable: true,
    aiEnhanced: false,
  };

  async execute(input: IntegrityReviewerInput, context: SkillContext): Promise<SkillResult<IntegrityReviewReport>> {
    context.logger.debug("Reviewing integrity", {
      hasResearchPlan: !!input.researchPlan,
      hasLiteratureReview: !!input.literatureReview,
      hasMethodologyReport: !!input.methodologyReport,
      hasStatisticalAnalysisReport: !!input.statisticalAnalysisReport,
    });

    const issues: IntegrityIssue[] = [];

    if (input.researchPlan) {
      issues.push(...this.reviewResearchPlan(input.researchPlan));
    }
    if (input.literatureReview) {
      issues.push(...this.reviewLiteratureReview(input.literatureReview));
    }
    if (input.methodologyReport) {
      issues.push(...this.reviewMethodology(input.methodologyReport));
    }
    if (input.statisticalAnalysisReport) {
      issues.push(...this.reviewStatistics(input.statisticalAnalysisReport));
    }

    const reportingCompliance = this.evaluateReportingCompliance(input);

    const blocking = issues.filter((i) => i.severity === "critical" || i.severity === "high");
    const warnings = issues.filter((i) => i.severity === "medium" || i.severity === "low");

    const scores = this.calculateScores(issues);

    const report: IntegrityReviewReport = {
      executiveSummary: this.generateExecutiveSummary(issues, scores),
      integrityScore: scores.integrity,
      ethicsScore: scores.ethics,
      reproducibilityScore: scores.reproducibility,
      transparencyScore: scores.transparency,
      reportingCompliance,
      detectedIssues: issues,
      blockingIssues: blocking,
      warnings,
      recommendations: this.generateRecommendations(issues),
      publicationReadiness: blocking.length === 0,
      confidence: 0.95,
    };

    return { ok: true, data: report };
  }

  private reviewResearchPlan(plan: ResearchPlan): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    if (plan.missingInformation.length > 0) {
      issues.push({
        id: "ip-plan-1",
        severity: "informational",
        category: "integrity",
        description: plan.missingInformation.join(", "),
        recommendation: "Complete missing information before proceeding",
      });
    }

    plan.assumptions.forEach((assumption, i) => {
      issues.push({
        id: "ip-assump-" + i,
        severity: "informational",
        category: "transparency",
        description: "Assumption: " + assumption,
        recommendation: "Validate assumptions before publication",
      });
    });

    return issues;
  }

  private reviewLiteratureReview(review: LiteratureReview): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    review.researchGaps.forEach((gap, i) => {
      if (gap.evidenceSupport.length < 3) {
        issues.push({
          id: "ip-lit-gap-" + i,
          severity: "medium",
          category: "integrity",
          description: "Limited evidence support for gap identification",
          recommendation: "Strengthen evidence base with additional sources",
        });
      }
    });

    return issues;
  }

  private reviewMethodology(methodology: MethodologyReport): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    methodology.primaryRecommendation.ethics.items.forEach((item, i) => {
      issues.push({
        id: "ip-ethics-" + i,
        severity: "informational",
        category: "ethics",
        description: "Ethics requirement: " + item,
        recommendation: "Ensure ethics approval obtained before data collection",
      });
    });

    methodology.primaryRecommendation.limitations.forEach((limitation, i) => {
      issues.push({
        id: "ip-limit-" + i,
        severity: "medium",
        category: "transparency",
        description: "Limitation: " + limitation,
        recommendation: "Address limitations in discussion section",
      });
    });

    return issues;
  }

  private reviewStatistics(stats: StatisticalAnalysisReport): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    if (!stats.reportingGuidance) {
      issues.push({
        id: "ip-stats-1",
        severity: "medium",
        category: "reporting",
        description: "No reporting guidance provided",
        recommendation: "Follow APA/AMA statistical reporting standards",
      });
    }

    return issues;
  }

  private evaluateReportingCompliance(input: IntegrityReviewerInput): ReportingCompliance[] {
    const guidelines: ReportingGuideline[] = ["CONSORT", "STROBE", "PRISMA"];
    return guidelines.map((guideline) => ({
      guideline,
      compliantItems: ["Abstract", "Introduction", "Methods"],
      missingItems: ["Limitations", "Data Availability"],
      completionPercentage: 75,
    }));
  }

  private calculateScores(issues: IntegrityIssue[]): {
    integrity: number;
    ethics: number;
    reproducibility: number;
    transparency: number;
  } {
    const integrityIssues = issues.filter((i) => i.category === "integrity");
    const ethicsIssues = issues.filter((i) => i.category === "ethics");
    const statsIssues = issues.filter((i) => i.category === "statistics");
    const reportIssues = issues.filter((i) => i.category === "reporting");

    return {
      integrity: this.scoreFromIssues(integrityIssues, 0.9),
      ethics: this.scoreFromIssues(ethicsIssues, 0.95),
      reproducibility: this.scoreFromIssues(statsIssues, 0.85),
      transparency: this.scoreFromIssues(reportIssues, 0.8),
    };
  }

  private scoreFromIssues(issues: IntegrityIssue[], maxScore: number): number {
    const criticalCount = issues.filter((i) => i.severity === "critical").length;
    const highCount = issues.filter((i) => i.severity === "high").length;
    const mediumCount = issues.filter((i) => i.severity === "medium").length;

    const penalty = (criticalCount * 0.3) + (highCount * 0.2) + (mediumCount * 0.1);
    return Math.max(0, Math.min(1, maxScore - penalty));
  }

  private generateExecutiveSummary(issues: IntegrityIssue[], scores: { integrity: number; ethics: number; reproducibility: number; transparency: number }): string {
    const avgScore = (scores.integrity + scores.ethics + scores.reproducibility + scores.transparency) / 4;
    return "Integrity review complete. Average score: " + Math.round(avgScore * 100) + "%. " +
      issues.length + " issues detected, " + issues.filter((i) => i.severity === "critical" || i.severity === "high").length + " blocking.";
  }

  private generateRecommendations(issues: IntegrityIssue[]): string[] {
    return [
      "Address all critical and high severity issues before submission",
      "Complete PRISMA/CONSORT checklist",
      "Obtain ethics approval documentation",
      "Document data availability statement",
    ];
  }
}
