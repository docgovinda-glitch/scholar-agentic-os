import { describe, it, expect } from "vitest";
import {
  generateSectionDraft,
  validateSectionUniqueness,
} from "../services/sectionDraftingEngine";

describe("Section Drafting Engine", () => {
  it("generates grounded academic synthesis for Zappos $2,000 quit bonus", () => {
    const draft = generateSectionDraft({
      sectionTitle: "Why would Zappos offer new employees $2,000 to quit after their first week of training?",
      assignmentQuestion: "Why would Zappos offer new employees $2,000 to quit after their first week of training?",
      academicLevel: "undergraduate",
    });

    expect(draft).toContain("Zappos");
    expect(draft).toContain("$2,000");
    expect(draft).toContain("self-selection");
    expect(draft).toContain("person-organization fit");
    expect(draft).toContain("turnover");
    expect(draft).toContain("Hsieh, 2010");

    // Must NOT contain the old boilerplate
    expect(draft).not.toContain("computational expediency");
    expect(draft).not.toContain("Pasquale, 2023");
    expect(draft).not.toContain("Kearns & Roth, 2022");
  });

  it("generates grounded academic synthesis for Artifacts vs. Assumptions", () => {
    const draft = generateSectionDraft({
      sectionTitle: "Can organizational culture be changed by changing artifacts alone (e.g., redesigning offices, changing dress codes)? Why or why not?",
      assignmentQuestion: "Can organizational culture be changed by changing artifacts alone?",
      academicLevel: "undergraduate",
    });

    expect(draft).toContain("artifacts");
    expect(draft).toContain("assumptions");
    expect(draft).toContain("compliance");
    expect(draft).toContain("Schein, 2010");

    expect(draft).not.toContain("computational expediency");
    expect(draft).not.toContain("Pasquale");
    expect(draft).not.toContain("Kearns & Roth");
  });

  it("generates grounded academic synthesis for Leadership Intervention Level", () => {
    const draft = generateSectionDraft({
      sectionTitle: "As a leader, which level of Schein's model would you start with to change organizational culture, and why?",
      assignmentQuestion: "Which level of Schein's model would you start with as a leader?",
      academicLevel: "undergraduate",
    });

    expect(draft).toContain("Espoused Values");
    expect(draft).toContain("assumptions");
    expect(draft).toContain("Lewin");
    expect(draft).toContain("Schein, 2010");

    expect(draft).not.toContain("computational expediency");
    expect(draft).not.toContain("Pasquale");
  });

  it("generates grounded academic synthesis for Interview Culture Assessment", () => {
    const draft = generateSectionDraft({
      sectionTitle: "How would you assess a company's culture during a job interview using Schein's model?",
      assignmentQuestion: "How would you assess culture during a job interview?",
      academicLevel: "undergraduate",
    });

    expect(draft).toContain("interview");
    expect(draft).toContain("triangulate");
    expect(draft).toContain("Artifacts");
    expect(draft).toContain("Assumptions");
    expect(draft).toContain("Schein, 2010");

    expect(draft).not.toContain("computational expediency");
    expect(draft).not.toContain("Pasquale");
  });

  it("permanently eliminates hardcoded Pasquale/Kearns boilerplate across general sections", () => {
    const draft = generateSectionDraft({
      sectionTitle: "Critical Evaluation of International Monetary Policy",
      assignmentQuestion: "Assess the systemic drivers of exchange rate volatility",
      academicLevel: "undergraduate",
      keyPoints: ["Macroeconomic stabilization", "Capital mobility trade-offs"],
    });

    expect(draft).not.toContain("computational expediency");
    expect(draft).not.toContain("Pasquale, 2023");
    expect(draft).not.toContain("Kearns & Roth, 2022");
    expect(draft).toContain("International Monetary Policy");
    expect(draft).toContain("Macroeconomic stabilization");
  });

  it("validates section uniqueness and rejects duplicate blocks >25% overlap", () => {
    const duplicateParagraph =
      "This is a repeated analytical sentence that appears across multiple sections of the document to test uniqueness. " +
      "We want to ensure that our uniqueness validator catches duplicate sentences and flags conflicting pairs accurately. " +
      "Scholarly integrity requires that each section advances a distinct academic argument rather than repeating boilerplate claims.";

    const sections = [
      {
        id: "sec-1",
        title: "Section 1: Leadership Foundations",
        content: `${duplicateParagraph} In this section we explore leadership intervention strategies in deep detail.`,
      },
      {
        id: "sec-2",
        title: "Section 2: Cultural Realignment",
        content: `${duplicateParagraph} In this second section we explore organizational culture mechanics in detail.`,
      },
    ];

    const validation = validateSectionUniqueness(sections);
    expect(validation.isUnique).toBe(false);
    expect(validation.maxSimilarity).toBeGreaterThan(0.25);
    expect(validation.conflictingPair).toBeDefined();

    // Unique sections should pass
    const uniqueSections = [
      {
        id: "sec-1",
        title: "Section 1",
        content: "Zappos uses a two-thousand-dollar quit bonus to filter for intrinsic commitment and cultural alignment among all newly hired employees.",
      },
      {
        id: "sec-2",
        title: "Section 2",
        content: "Edgar Schein conceptualizes organizational culture across three discrete analytical strata ranging from tangible artifacts to tacit assumptions.",
      },
    ];

    const passValidation = validateSectionUniqueness(uniqueSections);
    expect(passValidation.isUnique).toBe(true);
    expect(passValidation.maxSimilarity).toBeLessThanOrEqual(0.25);
  });
});
