import { describe, it, expect } from "vitest";
import { DEFAULT_STATE } from "../../types";
import { buildIntegrityReviewerInput } from "../integrityReviewAdapter";

describe("buildIntegrityReviewerInput — Stage 10 honest adapter", () => {
  it("compiles all non-empty sections into manuscriptText, labeled by section name", () => {
    const project = { ...DEFAULT_STATE("tester"), sections: { Introduction: "Real intro text.", Methodology: "Real methodology text.", Empty: "" } };

    const input = buildIntegrityReviewerInput(project);

    expect(input.manuscriptText).toContain("=== SECTION: Introduction ===");
    expect(input.manuscriptText).toContain("Real intro text.");
    expect(input.manuscriptText).toContain("=== SECTION: Methodology ===");
    expect(input.manuscriptText).toContain("Real methodology text.");
    expect(input.manuscriptText).not.toContain("Empty");
  });

  it("returns undefined manuscriptText, not an empty string, when no sections are drafted", () => {
    const project = { ...DEFAULT_STATE("tester"), sections: {} };

    const input = buildIntegrityReviewerInput(project);

    expect(input.manuscriptText).toBeUndefined();
  });

  it("never synthesizes fake researchPlan/literatureReview/methodologyReport/statisticalAnalysisReport — only genuinely-available data is mapped", () => {
    const project = { ...DEFAULT_STATE("tester"), sections: { Introduction: "Text." } };

    const input = buildIntegrityReviewerInput(project);

    expect(input.researchPlan).toBeUndefined();
    expect(input.literatureReview).toBeUndefined();
    expect(input.knowledgeGapReport).toBeUndefined();
    expect(input.researchQuestionReport).toBeUndefined();
    expect(input.methodologyReport).toBeUndefined();
    expect(input.statisticalAnalysisReport).toBeUndefined();
  });

  it("sets executionMode to deterministic (no AI call, matches the skill's own offlineCapable/aiEnhanced:false metadata)", () => {
    const project = { ...DEFAULT_STATE("tester"), sections: { Introduction: "Text." } };

    const input = buildIntegrityReviewerInput(project);

    expect(input.executionMode).toBe("deterministic");
  });
});
