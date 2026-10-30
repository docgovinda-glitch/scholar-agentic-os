import { describe, it, expect } from "vitest";
import {
  validateSectionUniqueness,
  assembleDraftingPrompt,
} from "../services/sectionDraftingEngine";
import { evaluateWritingQuality } from "../services/writingQualityEvaluator";
import type { AcademicTone } from "../types/drafting";

describe("Section Drafting Engine", () => {
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

  describe("Collegiate Writing Quality & Tone Audits", () => {
    const tones: AcademicTone[] = [
      "formal_academic",
      "analytical",
      "critical",
      "persuasive",
      "conversational_academic",
    ];

    it("assembles complete LLM drafting prompts with collegiate constraints and few-shot exemplars", () => {
      const prompt = assembleDraftingPrompt({
        sectionTitle: "Schein's Cultural Strata and Zappos HR Policy",
        assignmentQuestion: "How does Zappos operationalize Schein's culture framework?",
        academicLevel: "undergraduate",
        tone: "critical",
        keyPoints: ["Self-selection filtering", "Tacit assumptions"],
        targetWordCount: 500,
      });

      expect(prompt.systemPrompt).toContain("Critical");
      expect(prompt.systemPrompt).toContain("ACTIVE VOICE");
      expect(prompt.systemPrompt).toContain("FEW-SHOT CONTRASTIVE");
      expect(prompt.systemPrompt).toContain("canned buzzwords");

      expect(prompt.userPrompt).toContain("SECTION TITLE: Schein's Cultural Strata and Zappos HR Policy");
      expect(prompt.userPrompt).toContain("Self-selection filtering");
      expect(prompt.userPrompt).toContain("Ensure active voice in at least 80% of sentences");
    });
  });
});
