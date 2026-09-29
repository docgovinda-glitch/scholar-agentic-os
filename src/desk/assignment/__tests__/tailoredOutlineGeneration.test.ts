import { describe, it, expect, vi } from "vitest";
import {
  generateDynamicAssignmentStructure,
  generateThesisStatement,
  generateAiEnhancedOutline,
  deconstructQuestionSemantics,
  formatAcademicTopicTitle,
} from "../services/outlineService";

describe("Tailored Academic Outline Generation", () => {
  it("generates deeply tailored AI & Machine Learning headings for 'Role of AI in machine learning'", () => {
    const structure = generateDynamicAssignmentStructure({
      question: "Role of AI in machine learning",
      assignmentType: "essay",
      academicLevel: "undergraduate",
      targetWordCount: 2000,
      writingTone: "analytical",
      citationStyle: "apa7",
    });

    // 3 Main Headings
    expect(structure.headings).toHaveLength(3);

    // Main Heading 1
    const h1 = structure.headings[0];
    expect(h1.title).toBe("Foundational Paradigms: The Symbiosis of Artificial Intelligence and Machine Learning");
    expect(h1.subheadings).toHaveLength(2);
    expect(h1.subheadings[0].title).toBe("Taxonomic Delineation: Symbolic Reasoning vs. Empirical Induction");
    expect(h1.subheadings[0].targetWordCount).toBe(240); // 12%
    expect(h1.subheadings[0].keyPoints).toContain("Symbolic manipulation (GOFAI) vs. statistical learning");
    expect(h1.subheadings[1].title).toBe("Mathematical Formulations and Loss Optimization Landscapes");
    expect(h1.subheadings[1].targetWordCount).toBe(360); // 18%
    expect(h1.subheadings[1].keyPoints).toContain("Empirical risk minimization (ERM) & loss functions");
    expect(h1.targetWordCount).toBe(600); // 30%

    // Main Heading 2
    const h2 = structure.headings[1];
    expect(h2.title).toBe("Algorithmic Architectures, Representation Learning, and Scaling Frontiers");
    expect(h2.subheadings).toHaveLength(2);
    expect(h2.subheadings[0].title).toBe("Deep Representation Learning and Latent Space Topology");
    expect(h2.subheadings[0].targetWordCount).toBe(400); // 20%
    expect(h2.subheadings[0].keyPoints).toContain("Hierarchical feature extraction in deep neural networks");
    expect(h2.subheadings[1].title).toBe("Attention Mechanisms, Transformer Architectures, and Scaling Dynamics");
    expect(h2.subheadings[1].targetWordCount).toBe(400); // 20%
    expect(h2.subheadings[1].keyPoints).toContain("Scaled dot-product attention and quadratic complexity trade-offs");
    expect(h2.targetWordCount).toBe(800); // 40%

    // Main Heading 3
    const h3 = structure.headings[2];
    expect(h3.title).toBe("Systemic Bottlenecks, Mechanistic Interpretability, and Neuro-Symbolic Horizons");
    expect(h3.subheadings).toHaveLength(2);
    expect(h3.subheadings[0].title).toBe("Generalization Vulnerabilities, Data Poisoning, and Black-Box Opacity");
    expect(h3.subheadings[0].targetWordCount).toBe(320); // 16%
    expect(h3.subheadings[0].keyPoints).toContain("Mechanistic interpretability (probing circuits & activation spaces)");
    expect(h3.subheadings[1].title).toBe("Neuro-Symbolic Integration and the Trajectory Toward Robust Generalization");
    expect(h3.subheadings[1].targetWordCount).toBe(280); // 14%
    expect(h3.subheadings[1].keyPoints).toContain("Hybrid neuro-symbolic reasoning architectures");
    expect(h3.targetWordCount).toBe(600); // 30%

    // Word allocation totals exactly 2000
    expect(structure.totalAllocated).toBe(2000);
    expect(structure.targetWordCount).toBe(2000);

    // Thesis statement is academically calibrated and non-generic
    expect(structure.thesisStatement).toContain("Artificial Intelligence and Machine Learning");
    expect(structure.thesisStatement).toContain("statistical learning theory");
    expect(structure.thesisStatement).toContain("deep representation architectures");
  });

  it("generates clinical informatics outline for Healthcare AI topics", () => {
    const structure = generateDynamicAssignmentStructure({
      question: "Applications of Deep Learning in Clinical Diagnostics",
      assignmentType: "essay",
      academicLevel: "undergraduate",
      targetWordCount: 1500,
      writingTone: "objective",
    });

    expect(structure.headings[0].title).toContain("Clinical Informatics");
    expect(structure.headings[0].subheadings[0].title).toContain("Medical Imaging");
    expect(structure.headings[1].title).toContain("Empirical Translation");
    expect(structure.headings[2].title).toContain("Regulatory Compliance");
    expect(structure.totalAllocated).toBe(1500);
  });

  it("generates algorithmic justice outline for AI Ethics and Law topics", () => {
    const structure = generateDynamicAssignmentStructure({
      question: "Ethical and Regulatory Challenges of Algorithmic Decision-Making Systems",
      assignmentType: "essay",
      academicLevel: "undergraduate",
      targetWordCount: 2000,
      writingTone: "critical",
    });

    expect(structure.headings[0].title).toContain("Algorithmic Justice");
    expect(structure.headings[1].title).toContain("Disparate Impact, Opacity, and Structural Bias");
    expect(structure.headings[2].title).toContain("Regulatory Architectures");
    expect(structure.totalAllocated).toBe(2000);
  });

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
    expect(structure.headings[0].title).toBe("Foundational Paradigms: The Symbiosis of Artificial Intelligence and Machine Learning");
  });
});
