import { describe, it, expect, vi } from "vitest";
import {
  deconstructPrompt,
  auditAndEnforceCollegiateStyle,
  evaluate10PointRubric,
  executeMinimalUnderstand,
  executeMinimalSources,
  executeMinimalDraftSection,
  executeMinimalSubmission,
  executeDetailedAutonomousSynthesis,
} from "../courseworkOrchestrator";
import type { CourseworkProgressEvent } from "../../types/orchestrator";
import type { DiscoveredSource } from "../../../../desk/assignment/types";
import { discoverRealScholarlySourcesFromServer } from "../../../../desk/assignment/services/realScholarlyDiscoveryService";
import { generateCuratedLiteratureSources as fixtureSources } from "../../../../desk/assignment/services/scholarlyDiscoveryService";

// Live discovery is a network call. Tests stand in for it with fixture
// sources; the orchestrator itself never invents sources when it fails.
vi.mock("../../../../desk/assignment/services/realScholarlyDiscoveryService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../desk/assignment/services/realScholarlyDiscoveryService")>();
  return { ...actual, discoverRealScholarlySourcesFromServer: vi.fn() };
});
const discoverMock = vi.mocked(discoverRealScholarlySourcesFromServer);
discoverMock.mockImplementation(async (question: string, style = "apa7") => fixtureSources(question, style));

describe("Coursework Dual-Mode Prompt Orchestrator", () => {
  describe("Prompt Deconstruction", () => {
    it("deconstructs command verbs, target word counts, and analytical scope", () => {
      const prompt = "Critically evaluate the strategic rationale behind Zappos' $2,000 resignation offer and Schein's model of organizational culture.";
      const result = deconstructPrompt(prompt, 2500);

      expect(result.commandVerbs).toContain("critically evaluate");
      expect(result.targetWordCount).toBe(2500);
      expect(result.scope).toContain("Zappos");
      expect(result.recommendedTone).toBe("critical");
      expect(result.extractedQuestions.length).toBeGreaterThan(0);
    });

    it("defaults to analytical tone when non-critical command verbs are used", () => {
      const prompt = "Analyze the impact of algorithmic governance in public health administrative decisions.";
      const result = deconstructPrompt(prompt, 1500);

      expect(result.commandVerbs).toContain("analyze");
      expect(result.recommendedTone).toBe("analytical");
    });
  });

  describe("Collegiate Style & Fluff Elimination (academicWritingPrompts.ts)", () => {
    it("detects and strips banned throat-clearing openings", () => {
      const text = "A critical point of departure for evaluating this dimension lies in how organizational culture functions as a strategic asset.";
      const audit = auditAndEnforceCollegiateStyle(text);

      expect(audit.violations.some((v) => v.includes("throat-clearing"))).toBe(true);
      expect(audit.sanitizedText).not.toContain("A critical point of departure for evaluating this dimension lies in how");
      expect(audit.sanitizedText).toContain("organizational culture functions");
    });

    it("flags banned pseudo-academic buzzwords", () => {
      const text = "The company relied on computational expediency and procedural objectivity to filter applicants.";
      const audit = auditAndEnforceCollegiateStyle(text);

      expect(audit.violations.some((v) => v.includes("procedural objectivity"))).toBe(true);
      expect(audit.violations.some((v) => v.includes("computational expediency"))).toBe(true);
    });

    it("replaces nominalizations with active verbs", () => {
      const text = "The researcher conducts an analysis of the empirical findings.";
      const audit = auditAndEnforceCollegiateStyle(text);

      expect(audit.sanitizedText).toContain("analyzes the empirical findings");
    });

    it("evaluates active voice ratio", () => {
      const activeText = "Leaders establish cultural values. Managers reinforce daily habits. Teams align their operations. Evidence confirms positive retention.";
      const audit = auditAndEnforceCollegiateStyle(activeText);

      expect(audit.activeVoiceRatio).toBeGreaterThanOrEqual(0.8);
      expect(audit.isCompliant).toBe(true);
    });
  });

  describe("Minimal Mode (Atomic, User-Guided Execution)", () => {
    it("Phase 1: Understand - yields control back to UI after outline planning", async () => {
      const res = await executeMinimalUnderstand({
        question: "Critically evaluate why modifying physical artifacts alone fails to create durable cultural change.",
        targetWordCount: 1800,
        academicLevel: "undergraduate",
      });

      expect(res.yieldedControlToUI).toBe(true);
      expect(res.deconstructedPrompt.commandVerbs).toContain("critically evaluate");
      expect(res.suggestedOutline.length).toBeGreaterThan(0);
      expect(res.suggestedOutline[0].targetWordCount).toBeGreaterThan(0);
    });

    it("Phase 2: Sources - discovers literature and yields control without drafting", async () => {
      const res = await executeMinimalSources({
        question: "Organizational culture Schein Edgar artifacts values assumptions",
        citationStyle: "apa7",
        maxResults: 10,
      });

      expect(res.yieldedControlToUI).toBe(true);
      expect(res.discoveredSources.length).toBeGreaterThan(0);
      expect(res.generatedQueries.length).toBeGreaterThan(0);
    }, 25000);

    it("Phase 2: Sources - returns no sources (never invented ones) when live discovery fails", async () => {
      discoverMock.mockRejectedValueOnce(new Error("network down"));
      const res = await executeMinimalSources({
        question: "Organizational culture Schein Edgar artifacts values assumptions",
        citationStyle: "apa7",
        maxResults: 10,
      });
      expect(res.yieldedControlToUI).toBe(true);
      expect(res.discoveredSources).toEqual([]);
    });

    it("Phase 3: Drafting - drafts a single section, intercepts tokens, and yields to UI", async () => {
      const res = await executeMinimalDraftSection({
        sectionId: "sec-artifacts",
        sectionTitle: "2.0 Artifacts vs Assumptions in Organizational Culture",
        targetWordCount: 300,
        assignmentQuestion: "Evaluate culture change under Schein's framework.",
        boundSources: [
          {
            id: "src-schein-2010",
            title: "Organizational Culture and Leadership",
            authors: ["Schein, E. H."],
            year: 2010,
          },
        ],
        citationStyle: "apa7",
      });

      expect(res.yieldedControlToUI).toBe(true);
      expect(res.sectionId).toBe("sec-artifacts");
      expect(res.wordCount).toBeGreaterThan(50);
      expect(res.activeVoiceRatio).toBeGreaterThanOrEqual(0.7);
      // No raw bracket token [1] left in final prose; replaced with deterministic APA citation
      expect(res.content).not.toContain("[1]");
    });

    it("Phase 4: Submission - validates uniqueness, compiles bibliography, and evaluates rubric", async () => {
      const sections = [
        {
          id: "sec-1",
          title: "1.0 Introduction",
          content: "Edgar Schein demonstrates that organizational culture operates beneath surface appearances (Schein, 2010). Visible artifacts simply reflect deeper espoused values and unconscious, shared assumptions.",
        },
        {
          id: "sec-2",
          title: "2.0 Cultural Levels",
          content: "Leaders seeking cultural change must address underlying assumptions directly. Changing an office layout produces only superficial compliance, leaving underlying practices unchanged.",
        },
      ];

      const sources: DiscoveredSource[] = [
        {
          id: "src-schein-2010",
          title: "Organizational Culture and Leadership",
          authors: ["Schein, Edgar H."],
          year: "2010",
          journal: "Jossey-Bass",
          relevanceScore: 95,
          status: "kept",
          type: "book",
        },
      ];

      const res = await executeMinimalSubmission({
        sections,
        sources,
        citationStyle: "apa7",
        targetWordCount: 500,
        assignmentQuestion: "Evaluate Schein's culture model.",
      });

      expect(res.yieldedControlToUI).toBe(true);
      expect(res.uniquenessValidation.isUnique).toBe(true);
      expect(res.bibliography).toContain("Schein, E.");
      expect(res.rubricEvaluation.totalScore).toBeGreaterThan(60);
      expect(res.rubricEvaluation.criteria.length).toBe(10);
    });
  });

  describe("Detailed Mode (Autonomous Deep Synthesis)", () => {
    it("autonomously chains all 4 phases with progress streaming and deterministic citations", async () => {
      const progressEvents: CourseworkProgressEvent[] = [];

      const result = await executeDetailedAutonomousSynthesis(
        {
          question: "Critically evaluate the strategic rationale behind Zappos' $2,000 resignation offer and Schein's model of organizational culture.",
          targetWordCount: 600,
          citationStyle: "apa7",
          academicLevel: "undergraduate",
          academicTone: "analytical",
        },
        (event) => {
          progressEvents.push(event);
        }
      );

      // Verify progress milestones were streamed sequentially
      expect(progressEvents.length).toBeGreaterThan(4);
      expect(progressEvents[0].phase).toBe("understand");
      expect(progressEvents.some((e) => e.phase === "sources")).toBe(true);
      expect(progressEvents.some((e) => e.phase === "drafting")).toBe(true);
      expect(progressEvents.some((e) => e.phase === "submission")).toBe(true);
      expect(progressEvents[progressEvents.length - 1].progressPercentage).toBe(100);

      // Verify synthesis outputs
      expect(result.mode).toBe("detailed");
      expect(result.outline.length).toBeGreaterThan(0);
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sections.length).toBe(result.outline.length);
      expect(result.stats.totalWords).toBeGreaterThan(100);

      // Verify deterministic bibliography
      expect(result.bibliography).toContain("References");

      // Verify uniqueness validator (>20% overlap rejection)
      expect(result.uniquenessValidation.isUnique).toBe(true);

      // Verify 10-point rubric assessment
      expect(result.rubricEvaluation.totalScore).toBeGreaterThan(70);
      expect(result.rubricEvaluation.criteria.length).toBe(10);
    });
  });
});
