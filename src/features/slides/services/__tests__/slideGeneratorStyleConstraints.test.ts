import { describe, it, expect } from "vitest";
import {
  buildPresentationPromptConstraints,
  PRESENTATION_STYLE_PROFILES,
} from "../slideGenerator";

describe("OT-22 Slide Generator Learned Style Constraints", () => {
  it("exports learned benchmarks for presentation_slides matching 110-paper corpus", () => {
    const profile = PRESENTATION_STYLE_PROFILES.presentation_slides;
    expect(profile).toBeDefined();
    expect(profile.writingTone).toContain("Conversational Academic");
    expect(profile.writingTone).toContain("Persuasive");
    expect(profile.bulletRule).toBe("strict-6x6");
    expect(profile.systemInstruction).toContain("assertion-evidence");
    expect(profile.systemInstruction).toContain("zero throat-clearing");
    expect(profile.systemInstruction).toContain("6x6 bullet density");
  });

  it("buildPresentationPromptConstraints returns quantitative prompt injection for OT-22", () => {
    const constraints = buildPresentationPromptConstraints();
    expect(constraints.primaryTone).toBe("Conversational Academic");
    expect(constraints.secondaryTone).toBe("Persuasive");
    expect(constraints.assertionEvidenceRule).toContain("assertive");
    expect(constraints.throatClearingPolicy).toContain("Zero throat-clearing");
    expect(constraints.bulletDensityRule).toContain("Strict 6x6 Density");
    expect(constraints.targetSentenceRange).toEqual([12, 22]);

    expect(constraints.systemPromptInjection).toContain("ACADEMIC STYLE CONSTRAINTS (Learned OT-22 presentation_slides Benchmark)");
    expect(constraints.systemPromptInjection).toContain("Strict 6x6 rule");
    expect(constraints.systemPromptInjection).toContain("Zero Throat-Clearing");
    expect(constraints.systemPromptInjection).toContain("Assertion-Evidence");
  });
});
