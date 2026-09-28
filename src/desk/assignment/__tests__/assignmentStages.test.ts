import { describe, it, expect } from "vitest";
import {
  ASSIGNMENT_STAGES,
  ASSIGNMENT_PHASES,
  LEGACY_STAGE_TO_PHASE_MAP,
  normalizeAssignmentPhase,
  ASSIGNMENT_TYPE_LABELS,
  COMMON_COMMAND_VERBS,
  normalizeProjectAnswers,
  getSectionPromptGuidelines,
  type AssignmentStage,
  type AssignmentPhaseId,
  type AssignmentProjectState,
} from "../types";

describe("Assignment Stages & Domain Taxonomy", () => {
  it("defines exactly 4 dedicated academic phases in correct progression", () => {
    expect(ASSIGNMENT_STAGES).toHaveLength(4);
    const stageIds: AssignmentStage[] = ASSIGNMENT_STAGES.map((s) => s.id);
    expect(stageIds).toEqual([
      "understand",
      "sources",
      "drafting",
      "submission",
    ]);
  });

  it("provides comprehensive command verb mappings for academic prompts", () => {
    expect(COMMON_COMMAND_VERBS["critically discuss"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["evaluate"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["analyse"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["compare"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["assess"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["argue"]).toBeDefined();

    expect(COMMON_COMMAND_VERBS["critically discuss"].definition).toContain("balanced");
    expect(COMMON_COMMAND_VERBS["evaluate"].keyAction).toContain("Judge strengths");
  });

  it("supports diverse assignment formats beyond standard journal templates", () => {
    expect(ASSIGNMENT_TYPE_LABELS.essay).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.report).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.case_study).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.literature_review).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.annotated_bibliography).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.reflection).toBeDefined();
  });

  it("allocates custom section word targets and injects guidance notes into adaptive outlines", async () => {
    const { generateAdaptiveDefaultOutline } = await import("../services/outlineService");

    const customSections = {
      isCustomized: true,
      intro: {
        targetWords: 250,
        guidelines: "Highlight clean energy transition barriers and thesis on regulatory policy.",
      },
      body: {
        targetWords: 1450,
        guidelines: "Evaluate solar vs wind infrastructure capEx in Section 1; regulatory hurdles in Section 2.",
      },
      conclusion: {
        targetWords: 300,
        guidelines: "Provide policy recommendations and final synthesis.",
      },
    };

    const outline = generateAdaptiveDefaultOutline(
      "essay",
      "Critically evaluate renewable energy transitions.",
      2000,
      "Central regulatory thesis.",
      customSections
    );

    expect(outline.length).toBeGreaterThanOrEqual(3);

    // Intro section
    const introSec = outline[0];
    expect(introSec.targetWordCount).toBe(250);
    expect(introSec.guidance).toContain("Highlight clean energy transition barriers and thesis on regulatory policy.");

    // Conclusion section
    const conclSec = outline[outline.length - 1];
    expect(conclSec.targetWordCount).toBe(300);
    expect(conclSec.guidance).toContain("Provide policy recommendations and final synthesis.");

    // Body sections sum
    const bodySections = outline.slice(1, outline.length - 1);
    const bodyWordsSum = bodySections.reduce((sum, s) => sum + s.targetWordCount, 0);
    expect(bodyWordsSum).toBe(1450);

    // Total words sum
    const totalWordsSum = outline.reduce((sum, s) => sum + s.targetWordCount, 0);
    expect(totalWordsSum).toBe(2000);

    // Body guidelines injected into body sections
    for (const bodySec of bodySections) {
      expect(bodySec.guidance).toContain("Evaluate solar vs wind infrastructure capEx in Section 1; regulatory hurdles in Section 2.");
    }
  });

  describe("normalizeProjectAnswers", () => {
    it("automatically generates standard 10/75/15 section allocations when sections is missing", () => {
      const answers = {
        targetWordCount: 3000,
        instructions: "Critically evaluate generative AI in higher education.",
      };

      const normalized = normalizeProjectAnswers(answers);
      expect(normalized.sections).toEqual({
        isCustomized: false,
        intro: { targetWords: 300, guidelines: "" },
        body: { targetWords: 2250, guidelines: "" },
        conclusion: { targetWords: 450, guidelines: "" },
      });
    });

    it("preserves customized section targets and guidelines without overwriting", () => {
      const answers = {
        targetWordCount: 2000,
        sections: {
          isCustomized: true,
          intro: { targetWords: 250, guidelines: "Highlight energy transition" },
          body: { targetWords: 1450, guidelines: "CapEx analysis" },
          conclusion: { targetWords: 300, guidelines: "Policy synthesis" },
        },
      };

      const normalized = normalizeProjectAnswers(answers);
      expect(normalized.sections).toEqual({
        isCustomized: true,
        intro: { targetWords: 250, guidelines: "Highlight energy transition" },
        body: { targetWords: 1450, guidelines: "CapEx analysis" },
        conclusion: { targetWords: 300, guidelines: "Policy synthesis" },
      });
    });

    it("falls back to default 2000 words when target word count is missing or invalid", () => {
      const answers = {};
      const normalized = normalizeProjectAnswers(answers);
      expect(normalized.sections).toEqual({
        isCustomized: false,
        intro: { targetWords: 200, guidelines: "" },
        body: { targetWords: 1500, guidelines: "" },
        conclusion: { targetWords: 300, guidelines: "" },
      });
    });
  });

  describe("getSectionPromptGuidelines", () => {
    it("formats section allocation and user instructions when custom guidelines exist", () => {
      const answers = {
        sections: {
          isCustomized: true,
          intro: {
            targetWords: 250,
            guidelines: "Highlight clean energy transition barriers and thesis on regulatory policy.",
          },
        },
      };

      const result = getSectionPromptGuidelines("intro", answers);
      expect(result).toBe(
        "SECTION ALLOCATION: ~250 words\nUSER INSTRUCTIONS / MANDATORY CONTENT: Highlight clean energy transition barriers and thesis on regulatory policy."
      );
    });

    it("falls back to standard academic rigor instruction when guidelines are empty", () => {
      const answers = {
        sections: {
          body: {
            targetWords: 1450,
            guidelines: "   ",
          },
        },
      };

      const result = getSectionPromptGuidelines("body", answers);
      expect(result).toBe(
        "SECTION ALLOCATION: ~1450 words\nUSER INSTRUCTIONS / MANDATORY CONTENT: Standard academic rigor and appropriate depth for this section."
      );
    });

    it("falls back to 500 words when targetWords is omitted", () => {
      const answers = {};
      const result = getSectionPromptGuidelines("conclusion", answers);
      expect(result).toBe(
        "SECTION ALLOCATION: ~500 words\nUSER INSTRUCTIONS / MANDATORY CONTENT: Standard academic rigor and appropriate depth for this section."
      );
    });
  });

  describe("Approved 4-Phase Architecture (understand -> sources -> drafting -> submission)", () => {
    it("defines exactly 4 canonical phases with metadata and Lucide icon keys", () => {
      expect(ASSIGNMENT_PHASES).toHaveLength(4);

      const phaseIds: AssignmentPhaseId[] = ASSIGNMENT_PHASES.map((p) => p.id);
      expect(phaseIds).toEqual(["understand", "sources", "drafting", "submission"]);

      // Verify numbering 1..4
      expect(ASSIGNMENT_PHASES[0].number).toBe(1);
      expect(ASSIGNMENT_PHASES[1].number).toBe(2);
      expect(ASSIGNMENT_PHASES[2].number).toBe(3);
      expect(ASSIGNMENT_PHASES[3].number).toBe(4);

      // Verify Lucide icon keys
      expect(ASSIGNMENT_PHASES[0].iconKey).toBe("FileText");
      expect(ASSIGNMENT_PHASES[1].iconKey).toBe("Library");
      expect(ASSIGNMENT_PHASES[2].iconKey).toBe("PenTool");
      expect(ASSIGNMENT_PHASES[3].iconKey).toBe("CheckCircle2");

      // Verify descriptions and labels
      for (const phase of ASSIGNMENT_PHASES) {
        expect(phase.label).toBeTruthy();
        expect(phase.shortLabel).toBeTruthy();
        expect(phase.description).toBeTruthy();
      }
    });

    it("safely maps legacy stages to the 4 phases without crashing", () => {
      // 8 Legacy Stages
      expect(normalizeAssignmentPhase("understand")).toBe("understand");
      expect(normalizeAssignmentPhase("plan")).toBe("understand");
      expect(normalizeAssignmentPhase("research")).toBe("sources");
      expect(normalizeAssignmentPhase("evidence")).toBe("sources");
      expect(normalizeAssignmentPhase("think")).toBe("drafting");
      expect(normalizeAssignmentPhase("structure")).toBe("drafting");
      expect(normalizeAssignmentPhase("draft")).toBe("drafting");
      expect(normalizeAssignmentPhase("final")).toBe("submission");

      // Direct identity mappings
      expect(normalizeAssignmentPhase("sources")).toBe("sources");
      expect(normalizeAssignmentPhase("drafting")).toBe("drafting");
      expect(normalizeAssignmentPhase("submission")).toBe("submission");

      // Fallbacks on null, undefined, or unknown
      expect(normalizeAssignmentPhase(null)).toBe("understand");
      expect(normalizeAssignmentPhase(undefined)).toBe("understand");
      expect(normalizeAssignmentPhase("unknown_stage")).toBe("understand");
    });

    it("validates unified AssignmentProjectState schema model (Section 4.2)", () => {
      const mockProjectState: AssignmentProjectState = {
        projectId: "proj-sample",
        currentPhase: "understand",
        brief: {
          instructions: "Critically analyze renewable energy transition strategies.",
          targetWordCount: 2500,
          academicLevel: "undergraduate",
          assignmentType: "critical_essay",
          citationStyle: "apa7",
          sections: {
            isCustomized: true,
            intro: { targetWords: 250, guidelines: "Intro guidelines" },
            body: { targetWords: 1950, guidelines: "Body guidelines" },
            conclusion: { targetWords: 300, guidelines: "Conclusion guidelines" },
          },
          constraints: ["Do not discuss pre-2000 policy"],
          rubricCriteria: [
            {
              id: "rc-1",
              title: "Critical Thinking",
              description: "Evidence of synthetic evaluation",
              weightPercent: 40,
            },
          ],
        },
        sources: {
          curated: [
            {
              id: "src-1",
              title: "Renewable Systems Transition",
              authors: ["Smith", "Doe"],
              year: "2024",
              type: "journal",
              relevanceScore: 95,
              mainFinding: "Decentralized grid networks accelerate transition.",
              suggestedUse: "Support decentralized policy claim.",
              citation: "Smith & Doe (2024)",
              status: "kept",
            },
          ],
          userUploaded: [
            {
              id: "doc-1",
              name: "Course_Brief.pdf",
              uploadedAt: "2026-09-27T10:00:00Z",
            },
          ],
          approvedSourceIds: ["src-1"],
        },
        drafting: {
          internalSections: [
            {
              id: "sec-1",
              title: "Introduction",
              targetWordCount: 250,
              currentWordCount: 260,
              guidance: "Intro guidelines",
              draftContent: "Global energy transition imperatives demand profound policy changes.",
              status: "reviewed",
            },
          ],
          activeSectionId: "sec-1",
          fullDocumentMarkdown: "## Introduction\n\nGlobal energy transition imperatives demand profound policy changes.",
          overallWordCount: 260,
        },
        submission: {
          rubricScoreReport: {
            overallScore: 88,
            overallBand: "1st_class",
            bandLabel: "First Class (1st) — 88%",
            summary: "Exemplary critical synthesis and evidence grounding.",
            criteria: [
              { criterion: "Critical Thinking", score: 88, maxScore: 100, feedback: "Outstanding reasoning." },
            ],
            strengths: ["Rigorous evidence"],
            priorityFixes: [],
          },
          citationAudit: {
            isValid: true,
            totalCitations: 14,
            verifiedCount: 14,
            flaggedIssues: [],
          },
          isReadyForSubmission: true,
        },
      };

      expect(mockProjectState.projectId).toBe("proj-sample");
      expect(mockProjectState.currentPhase).toBe("understand");
      expect(mockProjectState.brief.targetWordCount).toBe(2500);
      expect(mockProjectState.sources.curated).toHaveLength(1);
      expect(mockProjectState.drafting.internalSections).toHaveLength(1);
      expect(mockProjectState.submission.isReadyForSubmission).toBe(true);
    });
  });
});
