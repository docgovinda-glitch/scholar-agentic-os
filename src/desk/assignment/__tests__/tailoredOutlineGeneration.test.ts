import { describe, it, expect, vi } from "vitest";
import {
  generateDynamicAssignmentStructure,
  generateThesisStatement,
  generateAiEnhancedOutline,
  deconstructQuestionSemantics,
  formatAcademicTopicTitle,
} from "../services/outlineService";

describe("Tailored Academic Outline Generation", () => {
  it("deconstructs universal questions into relational entities and formats academic titles", () => {
    const semantics1 = deconstructQuestionSemantics("The Impact of Quantitative Easing on Emerging Market Inflation");
    expect(semantics1.topicA).toBe("Quantitative Easing");
    expect(semantics1.topicB).toBe("Emerging Market Inflation");
    expect(semantics1.relationType).toBe("impact_on");

    const semantics2 = deconstructQuestionSemantics("Role of Microfinance in Rural Women Empowerment");
    expect(semantics2.topicA).toBe("Microfinance");
    expect(semantics2.topicB).toBe("Rural Women Empowerment");
    expect(semantics2.relationType).toBe("role_in");

    const formatted = formatAcademicTopicTitle("ai and machine learning in nlp systems");
    expect(formatted).toBe("AI and Machine Learning in NLP Systems");
  });

  it("generates strong bespoke outline for an arbitrary unknown academic prompt using semantic deconstruction", () => {
    const structure = generateDynamicAssignmentStructure({
      question: "Impact of Climate Change on Global Food Security",
      assignmentType: "essay",
      academicLevel: "undergraduate",
      targetWordCount: 2500,
      writingTone: "analytical",
    });

    expect(structure.headings[0].title).toContain("Climate Change");
    expect(structure.headings[0].title).toContain("Global Food Security");
    expect(structure.headings[1].title).toContain("Global Food Security");
    expect(structure.totalAllocated).toBe(2500);
  });

  it("generateAiEnhancedOutline returns fallback within timeout when LLM is unavailable", async () => {
    const structure = await generateAiEnhancedOutline({
      question: "Role of AI in machine learning",
      assignmentType: "essay",
      academicLevel: "undergraduate",
      targetWordCount: 2000,
      writingTone: "analytical",
      timeoutMs: 100,
    } as any);

    expect(structure.headings).toHaveLength(3);
    expect(structure.totalAllocated).toBe(2000);
    // Fallback headings come from the question itself, not a subject template.
    expect(structure.headings[0].title).toMatch(/AI in Machine Learning/);
  });
});
