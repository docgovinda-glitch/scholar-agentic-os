import { describe, it, expect, beforeAll } from "vitest";
import { IntegrityReviewerAgent } from "../integrityReviewer";
import type { AgentContext } from "../types";
import type { ResearchPlan } from "../researchPlanner";
import type { LiteratureReview } from "../literatureReview";
import type { MethodologyReport } from "../methodologyAdvisor";
import type { StatisticalAnalysisReport } from "../statisticalAnalysis";
import { SkillRegistry } from "../../skills/registry";
import { runSkill } from "../../skills/executor";
import { IntegrityReviewerSkill } from "../../skills/integrityReviewerSkill";

// Exercises the real production wiring: the same SkillRegistry singleton and
// runSkill helper that agentService.ts's createAgentContext() uses, not a mock.
function createContext(): AgentContext {
  return { log: () => {}, config: {}, emit: () => {}, runSkill: (skillId, input) => runSkill(skillId, input) };
}

function researchPlan(overrides: Partial<ResearchPlan> = {}): ResearchPlan {
  return {
    projectId: "p1",
    projectSummary: "",
    phases: [],
    milestones: [],
    dependencies: [],
    requiredSkills: [],
    requiredAgents: [],
    confidence: 0.85,
    assumptions: ["Topic scope is well-defined"],
    recommendations: [],
    estimatedEffortDays: 0,
    missingInformation: [],
    ...overrides,
  };
}

function literatureReview(overrides: Partial<LiteratureReview> = {}): LiteratureReview {
  return {
    executiveSummary: "",
    keyFindings: [],
    themes: [],
    evidenceMap: { methodologyDistribution: {} as any, yearDistribution: {}, journalDistribution: {} },
    researchGaps: [],
    conflictingFindings: [],
    recommendedPapers: [],
    recommendedJournals: [],
    recommendedSearchTerms: [],
    confidence: 0.8,
    assumptions: [],
    diagnostics: { localStudies: 0, webStudies: 0, duplicatesRemoved: 0, avgEvidenceQuality: "medium" },
    ...overrides,
  };
}

function methodologyReport(overrides: Partial<MethodologyReport["primaryRecommendation"]> = {}): MethodologyReport {
  return {
    executiveSummary: "",
    primaryRecommendation: {
      paradigm: "quantitative",
      design: "experimental",
      methods: [],
      sampling: { approach: "probability", sampleSize: 30, justification: "" },
      instruments: [],
      dataCollection: [],
      analysis: { approach: "statistical", techniques: [] },
      validity: { strategies: [], justification: "" },
      reliability: { strategies: [], justification: "" },
      ethics: { items: ["Informed consent"], requiredApprovals: ["IRB/Ethics Board"] },
      limitations: ["Sample may not be representative"],
      risks: [],
      confidence: 0.85,
      ...overrides,
    },
    alternativeRecommendations: [],
    justification: "",
    assumptions: [],
    confidence: 0.85,
  };
}

function statisticalAnalysisReport(overrides: Partial<StatisticalAnalysisReport> = {}): StatisticalAnalysisReport {
  return {
    executiveSummary: "",
    analyses: [],
    assumptions: [],
    prerequisiteChecks: [],
    visualizations: [],
    interpretationGuidance: "",
    reportingGuidance: "Report all assumptions",
    limitations: [],
    risks: [],
    confidence: 0.9,
    ...overrides,
  };
}

describe("IntegrityReviewerAgent -> IntegrityReviewerSkill (native skill round trip)", () => {
  beforeAll(() => {
    SkillRegistry.getInstance().register(new IntegrityReviewerSkill());
  });

  it("fails cleanly when the context has no runSkill wired (regression guard for the old no-op stub)", async () => {
    const agent = new IntegrityReviewerAgent();
    const context: AgentContext = { log: () => {}, config: {}, emit: () => {} };

    const result = await agent.execute({}, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error?.type).toBe("EXECUTION_ERROR");
  });

  it("flags missing research-plan information and lists each assumption as a transparency issue", async () => {
    const agent = new IntegrityReviewerAgent();
    const plan = researchPlan({ missingInformation: ["Target journal not specified"], assumptions: ["A1", "A2"] });

    const result = await agent.execute({ researchPlan: plan }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-plan-1")).toBeDefined();
    expect(result.data.detectedIssues.filter((i) => i.category === "transparency")).toHaveLength(2);
  });

  it("flags a literature-review gap with fewer than 3 supporting sources as a medium-severity integrity issue", async () => {
    const agent = new IntegrityReviewerAgent();
    const review = literatureReview({
      researchGaps: [{ id: "g1", description: "gap", relatedThemes: [], suggestedSearchTerms: [], evidenceSupport: ["a", "b"] }],
    });

    const result = await agent.execute({ literatureReview: review }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const issue = result.data.detectedIssues.find((i) => i.id === "ip-lit-gap-0");
    expect(issue).toMatchObject({ severity: "medium", category: "integrity" });
  });

  it("does not flag a literature-review gap with 3 or more supporting sources", async () => {
    const agent = new IntegrityReviewerAgent();
    const review = literatureReview({
      researchGaps: [{ id: "g1", description: "gap", relatedThemes: [], suggestedSearchTerms: [], evidenceSupport: ["a", "b", "c"] }],
    });

    const result = await agent.execute({ literatureReview: review }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-lit-gap-0")).toBeUndefined();
  });

  it("flags each methodology ethics item as informational and each limitation as a medium transparency issue", async () => {
    const agent = new IntegrityReviewerAgent();
    const methodology = methodologyReport({ ethics: { items: ["Informed consent", "Right to withdraw"], requiredApprovals: [] } });

    const result = await agent.execute({ methodologyReport: methodology }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.filter((i) => i.category === "ethics")).toHaveLength(2);
    expect(result.data.detectedIssues.find((i) => i.id === "ip-limit-0")).toMatchObject({ severity: "medium" });
  });

  it("flags a missing reporting guidance as a medium reporting issue", async () => {
    const agent = new IntegrityReviewerAgent();
    const stats = statisticalAnalysisReport({ reportingGuidance: "" });

    const result = await agent.execute({ statisticalAnalysisReport: stats }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-stats-1")).toMatchObject({ severity: "medium", category: "reporting" });
  });

  it("[fixed 2026-07-23] reportingCompliance now varies with manuscriptText instead of returning an identical hardcoded stub", async () => {
    const agent = new IntegrityReviewerAgent();

    const emptyResult = await agent.execute({}, createContext());
    const withTextResult = await agent.execute({ manuscriptText: "=== SECTION: Abstract ===\nAn abstract.\n=== SECTION: Introduction ===\nAn introduction." }, createContext());

    expect(emptyResult.ok).toBe(true);
    expect(withTextResult.ok).toBe(true);
    if (!emptyResult.ok || !withTextResult.ok) return;
    // No longer identical — varies with what's actually found in manuscriptText.
    expect(emptyResult.data.reportingCompliance).not.toEqual(withTextResult.data.reportingCompliance);
    expect(emptyResult.data.reportingCompliance[0].completionPercentage).toBe(0);
    expect(withTextResult.data.reportingCompliance[0].compliantItems).toEqual(expect.arrayContaining(["Abstract", "Introduction"]));
  });

  it("classifies critical/high severity issues as blocking and medium/low as warnings, gating structuralCompleteness (0% with no manuscriptText)", async () => {
    const agent = new IntegrityReviewerAgent();
    const review = literatureReview({
      researchGaps: [{ id: "g1", description: "gap", relatedThemes: [], suggestedSearchTerms: [], evidenceSupport: [] }],
    });

    const result = await agent.execute({ literatureReview: review }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings.length).toBeGreaterThan(0);
    expect(result.data.blockingIssues).toEqual([]);
    // No manuscriptText was provided here — structuralCompleteness is 0%,
    // honestly reflecting that nothing was found (there was no text to scan).
    expect(result.data.structuralCompleteness).toBe(0);
  });

  it("computes scores by category with penalties from critical/high/medium counts", async () => {
    const agent = new IntegrityReviewerAgent();
    const review = literatureReview({
      researchGaps: [{ id: "g1", description: "gap", relatedThemes: [], suggestedSearchTerms: [], evidenceSupport: [] }],
    });

    const result = await agent.execute({ literatureReview: review }, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // One medium integrity issue: 0.9 - 0.1 = 0.8
    expect(result.data.integrityScore).toBeCloseTo(0.8);
    expect(result.data.ethicsScore).toBe(0.95); // no ethics issues
  });

  it("returns zero issues and full scores with no input at all", async () => {
    const agent = new IntegrityReviewerAgent();

    const result = await agent.execute({}, createContext());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues).toEqual([]);
    expect(result.data.structuralCompleteness).toBe(0); // no manuscriptText provided, nothing to scan
    expect(result.data.integrityScore).toBe(0.9);
  });
});
