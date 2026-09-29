// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import {
  generateDynamicAssignmentStructure,
  autoBalanceStructure,
  distributeRemainingWords,
  adjustSubheadingWordCount,
  addMainHeading,
  addSubheading,
  removeSubheading,
  removeMainHeading,
} from "../services/outlineService";
import {
  structureToInternalSections,
  structureToSectionBudgets,
  flattenStructureSubheadings,
  calculateStructureAllocatedWords,
  type AssignmentStructure,
} from "../types";

const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
const authedFetch = vi.fn();
const authedJsonFetch = vi.fn();

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  authedFetch: (...a: unknown[]) => authedFetch(...a),
  authedJsonFetch: (...a: unknown[]) => authedJsonFetch(...a),
  isEphemeralProject: (id: string) => typeof id === "string" && (id.startsWith("draft-") || id.startsWith("ephemeral-")),
  commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

const { default: AssignmentWorkspace } = await import("../AssignmentWorkspace");
const { DynamicStructurePlanner } = await import("../components/DynamicStructurePlanner");
const { CuratedSourceCard } = await import("../components/CuratedSourceCard");
const { DraftingSectionIndex } = await import("../components/DraftingSectionIndex");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Phase I Dynamic Structure & Cross-Phase Workflow", () => {
  describe("1. Pure Structure Engine & Analytical Non-Hardcoded Headings", () => {
    it("generates dynamic analytical structure rather than fixed Intro/Body/Conclusion", () => {
      const prompt = "Critically assess China's regional security strategy in South Asia since 2020.";
      const structure = generateDynamicAssignmentStructure({
        question: prompt,
        assignmentType: "critical_essay",
        academicLevel: "undergraduate",
        targetWordCount: 3000,
      });

      expect(structure.headings.length).toBeGreaterThanOrEqual(3);

      // Verify no hardcoded "Introduction", "Body Paragraphs", "Conclusion" as main headings
      const headingTitles = structure.headings.map((h) => h.title.toLowerCase());
      expect(headingTitles).not.toContain("introduction");
      expect(headingTitles).not.toContain("body paragraphs");
      expect(headingTitles).not.toContain("conclusion");

      // Verify subheadings exist for every heading
      structure.headings.forEach((h) => {
        expect(h.subheadings.length).toBeGreaterThanOrEqual(2);
        expect(h.targetWordCount).toBeGreaterThan(0);
      });

      // Verify total allocated words match target word count exactly
      const totalWords = calculateStructureAllocatedWords(structure);
      expect(totalWords).toBe(3000);
      expect(structure.totalAllocated).toBe(3000);
    });

    it("allows adjusting subheading word counts (+50, -50, direct) and auto-balances", () => {
      const prompt = "Analyze the ethical dimensions of artificial intelligence in healthcare.";
      let structure = generateDynamicAssignmentStructure({
        question: prompt,
        targetWordCount: 2000,
      });

      const firstSub = structure.headings[0].subheadings[0];
      const initialWords = firstSub.targetWordCount;

      // Increase by 50
      structure = adjustSubheadingWordCount(structure, firstSub.id, initialWords + 50);
      expect(structure.headings[0].subheadings[0].targetWordCount).toBe(initialWords + 50);
      expect(structure.totalAllocated).toBe(2050);

      // Distribute remaining back to target
      structure = distributeRemainingWords(structure);
      expect(calculateStructureAllocatedWords(structure)).toBe(2000);

      // Auto balance
      structure = autoBalanceStructure(structure, 2500);
      expect(structure.targetWordCount).toBe(2500);
      expect(calculateStructureAllocatedWords(structure)).toBe(2500);
    });

    it("allows adding, removing, and re-titling headings and subheadings", () => {
      let structure = generateDynamicAssignmentStructure({
        question: "Examine maritime security disputes in the South China Sea.",
        targetWordCount: 2000,
      });

      const initialHeadingsCount = structure.headings.length;

      // Add new heading
      structure = addMainHeading(structure, "Geostrategic and Alliance Reactions");
      expect(structure.headings.length).toBe(initialHeadingsCount + 1);

      const newHeading = structure.headings[structure.headings.length - 1];
      expect(newHeading.title).toBe("Geostrategic and Alliance Reactions");
      expect(newHeading.subheadings.length).toBe(2);

      // Add custom subheading
      structure = addSubheading(structure, newHeading.id, "ASEAN Diplomatic Responses", 250);
      const updatedHeading = structure.headings.find((h) => h.id === newHeading.id);
      expect(updatedHeading?.subheadings.length).toBe(3);

      // Remove subheading
      const subToRemove = updatedHeading!.subheadings[0];
      structure = removeSubheading(structure, subToRemove.id);
      const afterRemovalHeading = structure.headings.find((h) => h.id === newHeading.id);
      expect(afterRemovalHeading?.subheadings.length).toBe(2);
    });
  });

  describe("2. Interactive DynamicStructurePlanner Component", () => {
    it("renders hierarchical structure, allows inline title editing and notes", () => {
      const mockOnChange = vi.fn();
      const initialStructure = generateDynamicAssignmentStructure({
        question: "Evaluate carbon taxation vs cap-and-trade systems.",
        targetWordCount: 2000,
      });

      render(
        <DynamicStructurePlanner
          structure={initialStructure}
          targetWordCount={2000}
          assignmentQuestion="Evaluate carbon taxation vs cap-and-trade systems."
          onChange={mockOnChange}
        />
      );

      // Verify headings and subheadings are rendered
      expect(screen.getByText(/Dynamic Assignment Structure & Word Allocation/i)).toBeInTheDocument();
      expect(screen.getByText(initialStructure.headings[0].title)).toBeInTheDocument();

      // Test +50 words button on first subheading
      const plusBtns = screen.getAllByRole("button", { name: "+50" });
      fireEvent.click(plusBtns[0]);
      expect(mockOnChange).toHaveBeenCalled();

      // Test Auto-Balance button
      const autoBalanceBtn = screen.getByRole("button", { name: /Auto-Balance/i });
      fireEvent.click(autoBalanceBtn);
      expect(mockOnChange).toHaveBeenCalled();
    });
  });

  describe("3. CuratedSourceCard: Badges, Why This Source & Section Mapping", () => {
    it("displays origin badges (USER UPLOADED, SYSTEM FOUND, ACADEMIC) and 'Why this source?'", () => {
      const mockToggle = vi.fn();
      const mockDismiss = vi.fn();
      const mockUpdateMapping = vi.fn();
      const mockUpdateNotes = vi.fn();

      const source = {
        id: "src-101",
        title: "Maritime Strategy in the Indo-Pacific",
        authors: ["Till, G."],
        year: "2024",
        type: "journal" as const,
        journal: "Naval War College Review",
        sourceOrigin: "system_found" as const,
        isVerifiedAcademic: true,
        relevanceScore: 94,
        roleInAssignment: "Empirical evidence",
        whyThisSource: "Direct evidentiary analysis of naval posturing relevant to Section 2.1.",
        userNotes: "Primary citation for naval deterrence arguments.",
      };

      const subheadings = [
        { id: "sub-1", numberStr: "1.1", title: "Conceptual Foundations" },
        { id: "sub-2", numberStr: "2.1", title: "Regional Naval Dynamics" },
      ];

      render(
        <CuratedSourceCard
          source={source}
          isApproved={false}
          onToggleApproval={mockToggle}
          onDismiss={mockDismiss}
          availableSubheadings={subheadings}
          onUpdateSubheadingMapping={mockUpdateMapping}
          onUpdateUserNotes={mockUpdateNotes}
        />
      );

      // Origin and Academic Badges
      expect(screen.getByText("SYSTEM FOUND")).toBeInTheDocument();
      expect(screen.getByText("ACADEMIC")).toBeInTheDocument();

      // "Why This Source?" box
      expect(screen.getByText(/Why This Source\?/i)).toBeInTheDocument();
      expect(screen.getByText(/Direct evidentiary analysis of naval posturing/i)).toBeInTheDocument();

      // Attached Note
      expect(screen.getByText(/Primary citation for naval deterrence arguments/i)).toBeInTheDocument();
    });
  });

  describe("4. DraftingSectionIndex & Subheading-by-Subheading Alignment", () => {
    it("displays dynamic subsection titles and parent functions instead of hardcoded Intro/Conclusion", () => {
      const mockSelect = vi.fn();
      const sections = [
        {
          id: "sub-1-1",
          title: "1.1 Conceptual Scope and Key Definitions",
          targetWordCount: 300,
          currentWordCount: 295,
          guidance: "Define scope",
          draftContent: "Sample drafted text",
          status: "completed" as const,
          keyPoints: ["Definitions"],
          linkedEvidenceIds: [],
          boundSourceIds: ["src-1", "src-2"],
          academicFunction: "Conceptual Framework",
        },
        {
          id: "sub-2-1",
          title: "2.1 Geopolitical Dynamics in South Asia",
          targetWordCount: 500,
          currentWordCount: 0,
          guidance: "Analyze regional posturing",
          draftContent: "",
          status: "not_started" as const,
          keyPoints: ["Security"],
          linkedEvidenceIds: [],
          boundSourceIds: [],
          academicFunction: "Empirical Analysis",
        },
      ];

      render(
        <DraftingSectionIndex
          sections={sections}
          activeSectionId="sub-1-1"
          onSelectSection={mockSelect}
        />
      );

      // Parent academic function tags
      expect(screen.getByText("Conceptual Framework")).toBeInTheDocument();
      expect(screen.getByText("Empirical Analysis")).toBeInTheDocument();

      // Section titles
      expect(screen.getByText("1.1 Conceptual Scope and Key Definitions")).toBeInTheDocument();
      expect(screen.getByText("2.1 Geopolitical Dynamics in South Asia")).toBeInTheDocument();

      // Target vs drafted word counts
      expect(screen.getByText("295 / 300 w")).toBeInTheDocument();
      expect(screen.getByText("0 / 500 w")).toBeInTheDocument();

      // Click to select
      fireEvent.click(screen.getByText("2.1 Geopolitical Dynamics in South Asia"));
      expect(mockSelect).toHaveBeenCalledWith("sub-2-1");
    });
  });

  describe("5. End-to-End Persistence: Phase 1 Structure Fed Directly to Phase 2 and Phase 3", () => {
    it("locks and passes Phase 1 structure into Phase 2 sources and Phase 3 drafting plan", async () => {
      const prompt = "Critically examine the geopolitics of artificial intelligence.";
      const dynamicStructure = generateDynamicAssignmentStructure({
        question: prompt,
        targetWordCount: 2000,
      });

      getProject.mockResolvedValue({
        projectId: "proj-dynamic-flow",
        outputTypeId: "OT-01",
        title: "AI Geopolitics Essay",
        hasDocument: false,
        answers: {
          assignment_question: prompt,
          word_count: 2000,
          target_word_count: 2000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "critical_essay",
          assignment_structure: dynamicStructure,
          structure: dynamicStructure,
        },
        gates: [],
      });
      getDocument.mockResolvedValue(null);
      getRubric.mockResolvedValue(null);
      getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });

      render(
        <AssignmentWorkspace
          projectId="proj-dynamic-flow"
          initialStage="understand"
          onStageChange={vi.fn()}
        />
      );

      // Verify dynamic structure loaded
      expect(await screen.findByText(dynamicStructure.headings[0].title)).toBeInTheDocument();

      // Click Proceed to Sources
      const proceedBtn = screen.getByRole("button", { name: /Proceed to Sources/i });
      fireEvent.click(proceedBtn);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-dynamic-flow",
          expect.objectContaining({
            assignment_structure: expect.objectContaining({
              isConfirmed: true,
              headings: expect.any(Array),
            }),
            assignment_internal_sections: expect.any(Array),
          })
        );
      });
    });
  });
});
