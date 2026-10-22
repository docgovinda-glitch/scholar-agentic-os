import { describe, it, expect } from "vitest";
import {
  extractStyleMetrics,
  classifyArchetype,
  auditStyleCompliance,
  ARCHETYPE_TONE_SPECS
} from "../styleEngineService";

describe("StyleEngineService (OT-01 Supervised Style & Archetype Engine)", () => {
  describe("1. Quantitative Stylistic Metrics Extraction", () => {
    it("extracts accurate sentence length, lexical diversity, passive voice, and citation density", () => {
      const sampleText = `
        The empirical investigation was conducted across five higher education institutions [1].
        Researchers analyzed student learning outcomes using longitudinal panel regressions (Smith, 2024).
        Consequently, the findings demonstrate a significant correlation between formative assessment and cognitive retention [2].
        However, institutional constraints were observed in rural campuses [3].
      `;

      const metrics = extractStyleMetrics(sampleText);

      expect(metrics.avgSentenceLength).toBeGreaterThan(10);
      expect(metrics.avgSentenceLength).toBeLessThan(35);
      expect(metrics.typeTokenRatio).toBeGreaterThan(0.4);
      expect(metrics.citationDensity).toBeGreaterThan(0);
      expect(metrics.passiveVoiceRatio).toBeGreaterThan(0);
    });

    it("handles minimal or edge-case text without division by zero", () => {
      const emptyMetrics = extractStyleMetrics("");
      expect(emptyMetrics.avgSentenceLength).toBeGreaterThanOrEqual(0);
      expect(emptyMetrics.typeTokenRatio).toBe(0);
      expect(emptyMetrics.citationDensity).toBe(0);
    });
  });

  describe("2. Archetype & Academic Tone Classification", () => {
    it("classifies literature review prompts into literature_review with Critical tone", () => {
      const prompt = "Conduct a PRISMA systematic review and scoping synthesis of digital mental health interventions.";
      const res = classifyArchetype(prompt);

      expect(res.predictedArchetype).toBe("literature_review");
      expect(res.primaryTone).toBe("Critical");
      expect(res.recommendedTone).toBe("critical");
      expect(res.confidence).toBeGreaterThan(0.3);
    });

    it("classifies empirical studies into research_paper with Formal Academic tone", () => {
      const prompt = "An empirical randomized controlled trial evaluating cognitive load and academic achievement using panel data.";
      const res = classifyArchetype(prompt);

      expect(res.predictedArchetype).toBe("research_paper");
      expect(res.primaryTone).toBe("Formal Academic");
      expect(res.recommendedTone).toBe("formal_academic");
    });

    it("classifies case analysis into case_study with Analytical tone", () => {
      const prompt = "A comprehensive case study on hospital lean management transformation and post-disaster recovery.";
      const res = classifyArchetype(prompt);

      expect(res.predictedArchetype).toBe("case_study");
      expect(res.primaryTone).toBe("Analytical");
      expect(res.recommendedTone).toBe("analytical");
    });

    it("classifies policy analysis into policy_analysis", () => {
      const prompt = "A policy analysis of carbon tax versus cap-and-trade regulatory frameworks and cost-benefit trade-offs.";
      const res = classifyArchetype(prompt);

      expect(res.predictedArchetype).toBe("policy_analysis");
      expect(res.primaryTone).toBe("Analytical");
      expect(res.recommendedTone).toBe("analytical");
    });

    it("classifies persuasive theses into argumentative_essay with Persuasive tone", () => {
      const prompt = "The case for universal basic services: why we argue for mandatory public infrastructure reform.";
      const res = classifyArchetype(prompt);

      expect(res.predictedArchetype).toBe("argumentative_essay");
      expect(res.primaryTone).toBe("Persuasive");
      expect(res.recommendedTone).toBe("persuasive");
    });

    it("classifies business strategy briefs into business_assignment", () => {
      const prompt = "Strategic management analysis of dynamic capabilities, supply chain resilience, and platform ecosystems.";
      const res = classifyArchetype(prompt);

      expect(res.predictedArchetype).toBe("business_assignment");
      expect(res.primaryTone).toBe("Analytical");
    });

    it("classifies peer-reviewed manuscripts into journal_article with Formal Academic tone", () => {
      const prompt = "A peer-reviewed journal article using IMRAD methodology with randomized trial cohorts and causal inference.";
      const res = classifyArchetype(prompt);

      expect(res.predictedArchetype).toBe("journal_article");
      expect(res.primaryTone).toBe("Formal Academic");
      expect(res.secondaryTone).toBe("Objective");
      expect(res.recommendedTone).toBe("formal_academic");
    });

    it("classifies slide decks into presentation_slides with Conversational Academic tone", () => {
      const prompt = "A conference presentation slide design utilizing assertion-evidence structure, keynote storytelling, and pitch deck visuals.";
      const res = classifyArchetype(prompt);

      expect(res.predictedArchetype).toBe("presentation_slides");
      expect(res.primaryTone).toBe("Conversational Academic");
      expect(res.secondaryTone).toBe("Persuasive");
      expect(res.recommendedTone).toBe("conversational_academic");
    });
  });

  describe("3. Style Compliance Auditing & Collegiate Recommendations", () => {
    it("evaluates collegiate draft compliance against target archetype benchmarks", () => {
      const draft = `
        The epistemological foundation of scientific inquiry requires continuous methodological scrutiny [1].
        In this essay, we examine how interdisciplinary research frameworks challenge conventional disciplinary boundaries [2].
        Furthermore, empirical evidence indicates that collaborative inquiry enhances conceptual validity across higher education curricula [3].
        Consequently, universities must foster pedagogical models that prioritize student epistemic agency [4].
      `;

      const audit = auditStyleCompliance(draft, "essay");

      expect(audit.isCompliant).toBe(true);
      expect(audit.overallScore).toBeGreaterThanOrEqual(75);
      expect(audit.primaryTone).toBe("Formal Academic");
      expect(audit.recommendations.length).toBeGreaterThan(0);
    });

    it("detects insufficient citation density and flags actionable recommendations", () => {
      const ungroundedDraft = `
        The world is changing very fast. Education is important. Many people go to school and learn things.
        Technology has an impact. We see that students are using computers every day.
        This trend will probably continue in the future because schools are buying more laptops.
      `;

      const audit = auditStyleCompliance(ungroundedDraft, "research_paper");

      expect(audit.isCompliant).toBe(false);
      expect(audit.overallScore).toBeLessThan(75);
      expect(audit.recommendations.some((r) => r.includes("citation") || r.includes("grounding") || r.includes("sentence"))).toBe(true);
    });
  });
});
