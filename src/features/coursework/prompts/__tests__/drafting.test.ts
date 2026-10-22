import { describe, it, expect } from "vitest";
import {
  getLearnedStyleConstraints,
  buildCourseworkSectionDraftingPrompt,
  ARCHETYPE_TRANSITION_NGRAMS,
} from "../drafting";

describe("Coursework Drafting Prompts & Quantitative Style Injection", () => {
  it("retrieves quantitative style constraints for standard OT-01 essay", () => {
    const constraints = getLearnedStyleConstraints("essay", "formal_academic");
    expect(constraints.targetArchetype).toBe("essay");
    expect(constraints.primaryTone).toBe("Formal Academic");
    expect(constraints.targetSentenceRange).toEqual([18, 28]);
    expect(constraints.targetBurstinessStd).toEqual([6.5, 9.5]);
    expect(constraints.maxPassiveRatio).toBeLessThanOrEqual(20);
    expect(constraints.minCitationDensity).toBeGreaterThanOrEqual(0.8);
    expect(constraints.rhetoricalTransitions.length).toBeGreaterThanOrEqual(5);
  });

  it("retrieves learned constraints for OT-10 journal_article", () => {
    const constraints = getLearnedStyleConstraints("journal_article", "formal_academic");
    expect(constraints.targetArchetype).toBe("journal_article");
    expect(constraints.primaryTone).toBe("Formal Academic");
    expect(constraints.secondaryTone).toBe("Objective");
    expect(constraints.targetSentenceRange).toEqual([20, 32]);
    expect(constraints.minCitationDensity).toBe(2.2);
    expect(constraints.rhetoricalTransitions).toContain("in accordance with IMRAD methodology");
    expect(constraints.rhetoricalTransitions).toContain("experimental ablation protocols confirm");
  });

  it("retrieves learned constraints for OT-22 presentation_slides", () => {
    const constraints = getLearnedStyleConstraints("presentation_slides", "conversational_academic");
    expect(constraints.targetArchetype).toBe("presentation_slides");
    expect(constraints.primaryTone).toBe("Conversational Academic");
    expect(constraints.secondaryTone).toBe("Persuasive");
    expect(constraints.targetSentenceRange).toEqual([12, 22]);
    expect(constraints.rhetoricalTransitions).toContain("key takeaway: empirical data confirms");
    expect(constraints.rhetoricalTransitions).toContain("visual evidence highlights a 3x gain");
  });

  it("buildCourseworkSectionDraftingPrompt injects all quantitative targets into drafting prompt", () => {
    const prompt = buildCourseworkSectionDraftingPrompt({
      sectionTitle: "Empirical Analysis of Model Calibration",
      sectionGuidance: "Present 5-fold stratified cross validation results across 11 classes.",
      targetWordCount: 450,
      assignmentType: "journal_article",
      academicTone: "formal_academic",
      citationStyle: "APA 7th",
      approvedEvidenceTokens: [
        { token: "[ev-calib-1]", quote: "LinearSVC achieved 93.97% accuracy", source: "Evaluation Benchmark 2026" },
      ],
      priorSectionSummaries: ["Introduces the 110-paper open-access corpus."],
    });

    // Validates section header and targets
    expect(prompt).toContain('Section Title: "Empirical Analysis of Model Calibration"');
    expect(prompt).toContain("Target Word Budget: exactly 450 words");
    expect(prompt).toContain("JOURNAL ARTICLE");
    expect(prompt).toContain("Assigned Register / Tone: Formal Academic (Objective)");

    // Validates quantitative style targets
    expect(prompt).toContain("MEAN SENTENCE LENGTH: Maintain an average of 20 to 32 words per sentence");
    expect(prompt).toContain("SENTENCE BURSTINESS (VARIETY)");
    expect(prompt).toContain("Target sentence length standard deviation between 6.5 and 9.5 words");
    expect(prompt).toContain("ACTIVE VOICE THRESHOLD: Maintain ≥ 80% active voice. Passive voice constructions must NOT exceed 20%");
    expect(prompt).toContain("BRACKET CITATION DENSITY: Integrate at least 2.2% citation tokens");

    // Validates transition n-grams
    expect(prompt).toContain("in accordance with IMRAD methodology");
    expect(prompt).toContain("experimental ablation protocols confirm");

    // Validates negative constraints
    expect(prompt).toContain("NEGATIVE CONSTRAINTS (INSTANT REJECTION CRITERIA)");
    expect(prompt).toContain("DO NOT start any paragraph with throat-clearing fluff");
    expect(prompt).toContain("DO NOT summarize the section title or write meta-commentary");
  });
});
