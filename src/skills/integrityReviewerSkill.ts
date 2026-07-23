/**
 * Integrity & Ethics Review Skill
 *
 * Native (deterministic, no-AI-call) implementation of the integrity-review
 * logic previously inlined in IntegrityReviewerAgent. Registered under id
 * "integrity-review" and invoked by IntegrityReviewerAgent via
 * AgentContext.runSkill.
 *
 * Fixed 2026-07-23 (target-workflow.md Stage 10 follow-up): manuscriptText —
 * the only field the live PaperProject adapter (integrityReviewAdapter.ts)
 * can honestly populate, since the other four input fields are each another
 * agent's own structured pipeline output — was previously accepted in the
 * input type but never read anywhere. evaluateReportingCompliance() also
 * returned an identical hardcoded stub regardless of input. Both are now
 * real pattern/keyword scans over manuscriptText:
 *
 * - evaluateReportingCompliance(): checks a fixed 9-item structural
 *   checklist (heading/keyword presence) against manuscriptText. The same
 *   generic scan is reported under all three guideline names (CONSORT,
 *   STROBE, PRISMA) — disclosed here rather than hidden: this is NOT a real
 *   per-guideline checklist (CONSORT alone has ~25 specific items like
 *   randomization/blinding/allocation concealment that plain keyword
 *   matching can't honestly verify). Reporting the same coarse scan under
 *   each guideline name, clearly labeled as such, is more honest than
 *   fabricating fake per-guideline differentiation.
 * - checkTextPatterns(): five new keyword/pattern checks — leftover
 *   placeholder/scaffold markers, missing ethics/IRB/consent disclosure,
 *   missing data-availability statement, missing conflict-of-interest/
 *   funding disclosure, and absence of any in-text citation pattern in a
 *   substantial manuscript. All are keyword/regex presence checks with real
 *   false-negative risk (a disclosure phrased unusually will be missed) —
 *   each issue's description says so explicitly rather than implying a
 *   definitive verdict.
 *
 * publicationReadiness (a boolean that was always true, since nothing ever
 * populated blockingIssues from a manuscriptText-only input) is replaced by
 * structuralCompleteness (a 0-100 percentage from the same 9-item
 * checklist) — see IntegrityReviewReport in agents/integrityReviewer.ts.
 * executiveSummary now explicitly discloses that this is a structural/
 * completeness scan, not semantic peer-review judgment of scientific
 * content — deliberately not attempted here, since evaluating whether e.g.
 * "randomization was adequately described" isn't honestly derivable from
 * string matching and would just be a different flavor of fabrication.
 *
 * Stays deterministic (aiEnhanced: false, offlineCapable: true) — no LLM
 * call added.
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
    if (input.manuscriptText) {
      issues.push(...this.checkTextPatterns(input.manuscriptText));
    }

    const reportingCompliance = this.evaluateReportingCompliance(input);
    const structuralCompleteness = reportingCompliance[0]?.completionPercentage ?? 0;

    const blocking = issues.filter((i) => i.severity === "critical" || i.severity === "high");
    const warnings = issues.filter((i) => i.severity === "medium" || i.severity === "low");

    const scores = this.calculateScores(issues);

    const report: IntegrityReviewReport = {
      executiveSummary: this.generateExecutiveSummary(issues, scores, structuralCompleteness),
      integrityScore: scores.integrity,
      ethicsScore: scores.ethics,
      reproducibilityScore: scores.reproducibility,
      transparencyScore: scores.transparency,
      reportingCompliance,
      detectedIssues: issues,
      blockingIssues: blocking,
      warnings,
      recommendations: this.generateRecommendations(issues),
      structuralCompleteness,
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

  /**
   * Bracketed scaffold markers this app's own drafting templates leave
   * behind when a section is skipped (e.g. ManuscriptDraftingWorkspace.tsx's
   * "[Use the AI Drafting Agent to generate...]") — keyed on specific
   * keywords so this never false-positives on legitimate bracketed content
   * like numeric citations ([12]) or author-year brackets ([Smith, 2020]).
   */
  private static readonly PLACEHOLDER_PATTERN = /\[[^\]]*\b(?:insert|todo|placeholder|use the ai drafting agent)\b[^\]]*\]/gi;
  private static readonly ETHICS_PATTERN = /\b(institutional review board|irb\b|ethics committee|ethical approval|ethics approval|informed consent|ethical clearance)\b/i;
  private static readonly DATA_AVAILABILITY_PATTERN = /\b(data availability( statement)?|data (are|is) available|available upon (reasonable )?request)\b/i;
  private static readonly COI_PATTERN = /\b(conflicts? of interest|competing interests?|no competing interests|funding (statement|source)|declare no (competing|conflicts))\b/i;
  private static readonly CITATION_PATTERN = /\([A-Z][\w'-]*(?:\s(?:&|and)\s[A-Z][\w'-]*)?,?\s(?:19|20)\d{2}[a-z]?\)|\[\d+\]|\bet al\.?\b/i;

  /** Fixed 9-item structural checklist shared by evaluateReportingCompliance() and structuralCompleteness. */
  private static readonly STRUCTURAL_CHECKLIST: { label: string; pattern: RegExp }[] = [
    { label: "Abstract", pattern: /\babstract\b/i },
    { label: "Introduction", pattern: /\bintroduction\b/i },
    { label: "Methods", pattern: /\b(methods|methodology)\b/i },
    { label: "Results", pattern: /\bresults\b/i },
    { label: "Discussion", pattern: /\bdiscussion\b/i },
    { label: "Limitations", pattern: /\blimitations?\b/i },
    { label: "Conflict of Interest", pattern: /\b(conflicts? of interest|competing interests?)\b/i },
    { label: "Data Availability", pattern: /\bdata availability\b/i },
    { label: "Ethics/IRB Approval", pattern: /\b(irb\b|institutional review board|ethics (committee|approval)|ethical approval)\b/i },
  ];

  /**
   * Keyword/pattern checks over manuscriptText — the only field the live
   * PaperProject adapter can honestly populate. Every "missing X" issue is
   * a presence check only: it can't distinguish "genuinely absent" from
   * "present but phrased differently than the patterns checked here", and
   * each description says so rather than implying a definitive verdict.
   */
  private checkTextPatterns(text: string): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    const placeholderMatches = text.match(IntegrityReviewerSkill.PLACEHOLDER_PATTERN) || [];
    if (placeholderMatches.length > 0) {
      issues.push({
        id: "ip-placeholder-1",
        severity: "high",
        category: "integrity",
        description: `Found ${placeholderMatches.length} leftover placeholder/scaffold marker(s) in the manuscript text (e.g. "${placeholderMatches[0].slice(0, 80)}").`,
        recommendation: "Replace all placeholder text with real drafted content before submission.",
      });
    }

    if (!IntegrityReviewerSkill.ETHICS_PATTERN.test(text)) {
      issues.push({
        id: "ip-ethics-disclosure-1",
        severity: "informational",
        category: "ethics",
        description: "No ethics-approval, IRB, or informed-consent language was found in the manuscript text. This check only scans for common phrasing and may miss a disclosure written differently.",
        recommendation: "Confirm an ethics/IRB approval or informed-consent statement is included if this study involves human or animal subjects.",
      });
    }

    if (!IntegrityReviewerSkill.DATA_AVAILABILITY_PATTERN.test(text)) {
      issues.push({
        id: "ip-data-availability-1",
        severity: "informational",
        category: "transparency",
        description: "No data-availability statement was found in the manuscript text. This check only scans for common phrasing and may miss a statement written differently.",
        recommendation: "Include a data availability statement per your target journal's requirements.",
      });
    }

    if (!IntegrityReviewerSkill.COI_PATTERN.test(text)) {
      issues.push({
        id: "ip-coi-1",
        severity: "informational",
        category: "transparency",
        description: "No conflict-of-interest or funding disclosure language was found in the manuscript text. This check only scans for common phrasing and may miss a disclosure written differently.",
        recommendation: "Include a conflict-of-interest and funding disclosure statement.",
      });
    }

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 500 && !IntegrityReviewerSkill.CITATION_PATTERN.test(text)) {
      issues.push({
        id: "ip-no-citations-1",
        severity: "medium",
        category: "citation",
        description: `No in-text citation patterns (e.g. "(Author, Year)", "[1]", "et al.") were detected across ${wordCount} words of manuscript text.`,
        recommendation: "Verify in-text citations are present and correctly formatted throughout the manuscript.",
      });
    }

    return issues;
  }

  private evaluateReportingCompliance(input: IntegrityReviewerInput): ReportingCompliance[] {
    const text = input.manuscriptText || "";
    const compliantItems = IntegrityReviewerSkill.STRUCTURAL_CHECKLIST.filter((c) => c.pattern.test(text)).map((c) => c.label);
    const missingItems = IntegrityReviewerSkill.STRUCTURAL_CHECKLIST.filter((c) => !c.pattern.test(text)).map((c) => c.label);
    const completionPercentage = Math.round((compliantItems.length / IntegrityReviewerSkill.STRUCTURAL_CHECKLIST.length) * 100);

    // Same generic structural/heading-presence scan reported under all three
    // guideline names — disclosed in this file's header comment as NOT a
    // real per-guideline checklist (each has its own distinct, much more
    // detailed item list that plain keyword matching can't honestly verify).
    const guidelines: ReportingGuideline[] = ["CONSORT", "STROBE", "PRISMA"];
    return guidelines.map((guideline) => ({
      guideline,
      compliantItems,
      missingItems,
      completionPercentage,
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

  private generateExecutiveSummary(
    issues: IntegrityIssue[],
    scores: { integrity: number; ethics: number; reproducibility: number; transparency: number },
    structuralCompleteness: number
  ): string {
    const avgScore = (scores.integrity + scores.ethics + scores.reproducibility + scores.transparency) / 4;
    return "Integrity review complete. Average score: " + Math.round(avgScore * 100) + "%. " +
      issues.length + " issues detected, " + issues.filter((i) => i.severity === "critical" || i.severity === "high").length + " blocking. " +
      "Structural completeness: " + structuralCompleteness + "%. " +
      "This is an automated structural/completeness scan (heading and keyword presence) — it does not perform semantic peer-review judgment of the manuscript's scientific content.";
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
