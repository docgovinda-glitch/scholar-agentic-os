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

  it("sets executionMode to deterministic (diagnostic label only — doesn't gate the skill's own real behavior)", () => {
    const project = { ...DEFAULT_STATE("tester"), sections: { Introduction: "Text." } };

    const input = buildIntegrityReviewerInput(project);

    expect(input.executionMode).toBe("deterministic");
  });

  // Semantic peer review (docs/planning/semantic-peer-review-scoping.md, 2026-07-24)
  describe("title/keywords/aiSettings — real fields for the semantic-review query, never invented", () => {
    it("maps a real title and splits comma-separated keywords into a real array", () => {
      const project = { ...DEFAULT_STATE("tester"), title: "Real Manuscript Title", keywords: "ethics, dharma, trusteeship" };

      const input = buildIntegrityReviewerInput(project);

      expect(input.title).toBe("Real Manuscript Title");
      expect(input.keywords).toEqual(["ethics", "dharma", "trusteeship"]);
    });

    it("leaves title/keywords undefined when the project has none, rather than fabricating a query", () => {
      const project = { ...DEFAULT_STATE("tester"), title: "", keywords: "" };

      const input = buildIntegrityReviewerInput(project);

      expect(input.title).toBeUndefined();
      expect(input.keywords).toBeUndefined();
    });

    it("passes the project's real aiSettings through untouched", () => {
      const project = { ...DEFAULT_STATE("tester"), aiSettings: { provider: "gemini" as const } };

      const input = buildIntegrityReviewerInput(project);

      expect(input.aiSettings).toEqual({ provider: "gemini" });
    });
  });
});
