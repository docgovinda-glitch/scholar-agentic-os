import { describe, it, expect } from "vitest";
import {
  extractInTextCitations,
  auditCitations,
  evaluateRubricCompliance,
} from "../services/submissionAuditService";
import type { DiscoveredSource, AssignmentBriefState } from "../types";

describe("Submission Audit Services", () => {
  const sampleSources: DiscoveredSource[] = [
    {
      id: "src-1",
      title: "Foundations of Large Language Models in Education",
      authors: ["Alice Smith", "Bob Taylor"],
      year: "2020",
      type: "journal",
      journal: "Journal of Educational Technology",
      doi: "10.1016/j.jedutech.2020.01.002",
      relevanceScore: 0.95,
      mainFinding: "LLMs enhance personalized learning scaffolding.",
      suggestedUse: "Core conceptual grounding",
      citation: "Smith, A. & Taylor, B. (2020). Foundations of Large Language Models in Education. Journal of Educational Technology, 45(2), 112-128.",
      status: "kept",
    },
    {
      id: "src-2",
      title: "Algorithmic Bias and Pedagogical Ethics",
      authors: ["Catherine Johnson"],
      year: "2021",
      type: "journal",
      journal: "Ethics in Artificial Intelligence",
      relevanceScore: 0.9,
      mainFinding: "Unchecked training sets propagate racial and linguistic disparities.",
      suggestedUse: "Critical ethical analysis",
      citation: "Johnson, C. (2021). Algorithmic Bias and Pedagogical Ethics. Ethics in Artificial Intelligence, 12(4), 45-60.",
      status: "kept",
    },
  ];

  describe("extractInTextCitations", () => {
    it("extracts parenthetical author-year and bracket citations correctly", () => {
      const text = `
        According to recent empirical inquiries (Smith, 2020), personalized scaffolding yields marked improvements.
        However, algorithmic disparities often emerge across demographic subsets (Johnson, 2021).
        Furthermore, bracketed tokens like [ev-456] and numeric markers like [1] must also be captured.
      `;

      const citations = extractInTextCitations(text);
      expect(citations).toContain("Smith, 2020");
      expect(citations).toContain("Johnson, 2021");
      expect(citations).toContain("ev-456");
      expect(citations).toContain("1");
    });
  });

  describe("auditCitations (Citation Reconciliation Auditor)", () => {
    it("detects 100% matched citations as reconciled", () => {
      const draftText = `
        Recent research demonstrates the efficacy of adaptive AI tutoring frameworks (Smith, 2020).
        Nevertheless, ethical constraints must guide algorithmic deployment (Johnson, 2021).
      `;

      const result = auditCitations(draftText, sampleSources, [], ["src-1", "src-2"]);

      expect(result.totalInTextCitations).toBe(2);
      expect(result.unresolvedCitations).toHaveLength(0);
      expect(result.isReconciled).toBe(true);
      expect(result.reconciledCitations).toContain("Smith, 2020");
      expect(result.reconciledCitations).toContain("Johnson, 2021");
    });

    it("captures unmatched in-text citation tokens in unresolvedCitations", () => {
      const draftText = `
        While AI models show great promise (Smith, 2020), speculative assertions (Unknown, 2020) remain unverified.
        Another ungrounded claim was put forward by earlier work (Fictional, 2024).
      `;

      const result = auditCitations(draftText, sampleSources, [], ["src-1", "src-2"]);

      expect(result.totalInTextCitations).toBe(3);
      expect(result.isReconciled).toBe(false);
      expect(result.unresolvedCitations).toContain("Unknown, 2020");
      expect(result.unresolvedCitations).toContain("Fictional, 2024");
      expect(result.flaggedIssues).toHaveLength(2);
      expect(result.flaggedIssues[0].severity).toBe("error");
    });
  });

  describe("evaluateRubricCompliance (Rubric Evaluator)", () => {
    const sampleBrief: AssignmentBriefState = {
      instructions: "Critically evaluate the ethical implications of artificial intelligence in higher education.",
      rawPrompt: "Critically evaluate the ethical implications of artificial intelligence in higher education.",
      targetWordCount: 350,
      academicLevel: "undergraduate",
      assignmentType: "critical_essay",
      citationStyle: "harvard",
      rubricCriteria: [
        {
          id: "crit-1",
          criterion: "Critical Evaluation & Dialectical Rigor",
          weightPercentage: 50,
          description: "Depth of critique and analysis of limitations.",
        },
        {
          id: "crit-2",
          criterion: "Scholarly Evidence & Sourcing",
          weightPercentage: 50,
          description: "Integration of verified peer-reviewed academic sources.",
        },
      ],
    };

    it("outputs predicted grade, readiness percentage, and criteria feedback for a compliant draft", () => {
      const mockCompliantText = `
        ## Introduction & Background Context
        The rapid integration of generative artificial intelligence into tertiary curricula demands rigorous analytical scrutiny.
        As demonstrated by (Smith, 2020), algorithmic scaffolding offers demonstrable pedagogical utility.

        ## Dialectical Analysis & Critical Scrutiny
        However, the implementation of machine learning systems is fundamentally fraught with ethical dilemmas.
        Consequently, uncritical reliance on black-box heuristics creates systemic risks for academic integrity (Johnson, 2021).
        In contrast to deterministic instruction, neural language models synthesize probabilistic narratives.
        Furthermore, empirical evaluations demonstrate that algorithmic bias propagates socio-economic disparities.
        Nevertheless, thoughtful institutional governance can mitigate these dialectical trade-offs.

        ## Conclusion & Strategic Recommendations
        In conclusion, tertiary institutions must not adopt blanket prohibitions.
        Rather, educators should establish evidence-based guidelines and emphasize critical reflection.
      `.repeat(3); // ensures sufficient word volume

      const citationResult = auditCitations(mockCompliantText, sampleSources, [], ["src-1", "src-2"]);
      const report = evaluateRubricCompliance(mockCompliantText, sampleBrief, citationResult);

      expect(report.predictedGrade).toMatch(/First Class|Upper Second/);
      expect(report.readinessPercentage).toBeGreaterThanOrEqual(70);
      expect(report.criteriaFeedback).toBeDefined();
      expect(report.criteriaFeedback["Critical Evaluation & Dialectical Rigor"]).toBeDefined();
      expect(report.criteriaFeedback["Scholarly Evidence & Sourcing"]).toBeDefined();
      expect(report.missingRequirements).toHaveLength(0);
    });

    it("flags missing requirements and lowers readiness when draft is truncated or missing citations", () => {
      const sparseDraft = "This is a short incomplete draft without any substantive analysis.";

      const report = evaluateRubricCompliance(sparseDraft, sampleBrief);

      expect(report.missingRequirements.length).toBeGreaterThan(0);
      expect(report.readinessPercentage).toBeLessThan(70);
      expect(report.predictedGrade).toMatch(/Lower Second|Third Class|Fail/);
    });
  });
});
