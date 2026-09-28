// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { DraftingSectionIndex } from "../components/DraftingSectionIndex";
import { DraftingActiveEditor } from "../components/DraftingActiveEditor";
import { AssignmentDraftingStage } from "../stages/AssignmentDraftingStage";
import { AssignmentProvider } from "../context/AssignmentContext";
import type { AssignmentDraftingSection } from "../types";

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockSections: AssignmentDraftingSection[] = [
  {
    id: "sec-intro",
    title: "Introduction & Contextual Thesis",
    targetWordCount: 200,
    currentWordCount: 0,
    guidance: "Introduce the problem and central thesis statement.",
    draftContent: "",
    status: "pending",
    sectionType: "intro",
    academicFunction: "Introduction & Problem Statement",
    boundSourceIds: ["src-1"],
  },
  {
    id: "sec-body-1",
    title: "Body Theme 1: Core Theoretical Paradigms",
    targetWordCount: 500,
    currentWordCount: 0,
    guidance: "Articulate foundational philosophical paradigms.",
    draftContent: "",
    status: "pending",
    sectionType: "body",
    academicFunction: "Core Concept & Foundational Framework",
    boundSourceIds: ["src-1", "src-2"],
  },
  {
    id: "sec-body-2",
    title: "Body Theme 2: Empirical Case Evidence",
    targetWordCount: 500,
    currentWordCount: 0,
    guidance: "Synthesize empirical metrics and case studies.",
    draftContent: "",
    status: "pending",
    sectionType: "body",
    academicFunction: "Empirical Evidence & Contemporary Context",
    boundSourceIds: ["src-3", "src-4"],
  },
  {
    id: "sec-body-3",
    title: "Body Theme 3: Critical Counter-Perspectives",
    targetWordCount: 500,
    currentWordCount: 0,
    guidance: "Evaluate dialectical trade-offs and dissent.",
    draftContent: "",
    status: "pending",
    sectionType: "body",
    academicFunction: "Critical Evaluation & Trade-offs",
    boundSourceIds: ["src-5"],
  },
  {
    id: "sec-conclusion",
    title: "Conclusion & Strategic Synthesis",
    targetWordCount: 300,
    currentWordCount: 0,
    guidance: "Synthesize core findings and future implications.",
    draftContent: "",
    status: "pending",
    sectionType: "conclusion",
    academicFunction: "Conclusion & Strategic Synthesis",
    boundSourceIds: ["src-5"],
  },
];

describe("Assignment Phase 3: Drafting Engine Components & Flow", () => {
  describe("DraftingSectionIndex Component", () => {
    it("renders all sections with titles, word counts, and status indicators", () => {
      const onSelect = vi.fn();
      render(
        <DraftingSectionIndex
          sections={mockSections}
          activeSectionId="sec-body-1"
          onSelectSection={onSelect}
        />
      );

      expect(screen.getByText("Introduction & Contextual Thesis")).toBeInTheDocument();
      expect(screen.getByText("Body Theme 1: Core Theoretical Paradigms")).toBeInTheDocument();
      expect(screen.getByText("Conclusion & Strategic Synthesis")).toBeInTheDocument();
      expect(screen.getByText("0/5 completed")).toBeInTheDocument();
    });

    it("triggers onSelectSection when clicking a section in the left rail", () => {
      const onSelect = vi.fn();
      render(
        <DraftingSectionIndex
          sections={mockSections}
          activeSectionId="sec-intro"
          onSelectSection={onSelect}
        />
      );

      const body2Btn = screen.getByText("Body Theme 2: Empirical Case Evidence").closest("button");
      expect(body2Btn).toBeInTheDocument();
      fireEvent.click(body2Btn!);

      expect(onSelect).toHaveBeenCalledWith("sec-body-2");
    });
  });

  describe("DraftingActiveEditor Component", () => {
    it("renders formatted prose with highlighted in-text citation anchors", () => {
      const prose =
        "Algorithmic decision systems redistribute power (Pasquale, 2023). " +
        "Empirical benchmarks show significant trade-offs (Kearns & Roth, 2022).";

      const sectionWithContent: AssignmentDraftingSection = {
        ...mockSections[1],
        draftContent: prose,
        currentWordCount: 16,
        status: "completed",
      };

      render(
        <DraftingActiveEditor
          section={sectionWithContent}
          onUpdateContent={vi.fn()}
        />
      );

      const citationAnchors = screen.getAllByTestId("citation-anchor");
      expect(citationAnchors).toHaveLength(2);
      expect(citationAnchors[0]).toHaveTextContent("(Pasquale, 2023)");
      expect(citationAnchors[1]).toHaveTextContent("(Kearns & Roth, 2022)");
    });

    it("allows entering Manual Edit mode and updates live content", () => {
      const onUpdate = vi.fn();
      render(
        <DraftingActiveEditor
          section={mockSections[1]}
          onUpdateContent={onUpdate}
        />
      );

      // Click Manual Edit
      const editBtn = screen.getByRole("button", { name: /Manual Edit/i });
      fireEvent.click(editBtn);

      const textarea = screen.getByLabelText("Manual Section Prose Editor");
      expect(textarea).toBeInTheDocument();

      fireEvent.change(textarea, { target: { value: "New manual prose paragraph (Smith, 2024)." } });
      expect(onUpdate).toHaveBeenCalledWith("New manual prose paragraph (Smith, 2024).");
    });
  });

  describe("Phase 3 Exit Gate & Word Count Integration in Workspace Context", () => {
    beforeEach(() => {
      getProject.mockResolvedValue({
        projectId: "proj-draft-1",
        outputTypeId: "OT-01",
        title: "Drafting Test Project",
        hasDocument: false,
        answers: {
          assignment_question: "Critically assess algorithmic governance.",
          word_count: 2000,
          target_word_count: 2000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "critical_essay",
          approved_source_ids: ["src-1", "src-2", "src-3", "src-4", "src-5"],
          assignment_current_phase: "drafting",
        },
        gates: [],
      });
      getDocument.mockResolvedValue(null);
      getRubric.mockResolvedValue(null);
      getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });
    });

    it("keeps Phase 3 exit gate locked when sections are empty or word count is below tolerance", async () => {
      render(
        <AssignmentProvider
          projectId="proj-draft-1"
          initialStage="drafting"
          onStageChangeCallback={vi.fn()}
        >
          <AssignmentDraftingStage onProceed={vi.fn()} />
        </AssignmentProvider>
      );

      // Wait for sections to initialize from decomposition formula
      await waitFor(() => {
        expect(screen.getByText(/Section Outline/i)).toBeInTheDocument();
      });

      // Exit gate button must be disabled
      const proceedButtons = screen.getAllByRole("button", { name: /Proceed to Submission Audit/i });
      proceedButtons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });

      // Status indicator explains gate locking
      expect(
        screen.getByText(/Complete all sections.*to unlock submission audit/i)
      ).toBeInTheDocument();
    });

    it("unlocks Phase 3 exit gate when all sections are completed and within ±10% margin", async () => {
      // Mock project with completed sections reaching 1,950 words (within 2,000w ± 10% [1,800 - 2,200w])
      const completedSections: AssignmentDraftingSection[] = [
        {
          id: "sec-intro",
          title: "Introduction & Contextual Thesis",
          targetWordCount: 200,
          currentWordCount: 200,
          draftContent: Array(200).fill("word").join(" "),
          status: "completed",
          sectionType: "intro",
          guidance: "Intro",
        },
        {
          id: "sec-body-1",
          title: "Body Theme 1: Theoretical Paradigms",
          targetWordCount: 500,
          currentWordCount: 500,
          draftContent: Array(500).fill("word").join(" "),
          status: "completed",
          sectionType: "body",
          guidance: "Body 1",
        },
        {
          id: "sec-body-2",
          title: "Body Theme 2: Empirical Evidence",
          targetWordCount: 500,
          currentWordCount: 500,
          draftContent: Array(500).fill("word").join(" "),
          status: "completed",
          sectionType: "body",
          guidance: "Body 2",
        },
        {
          id: "sec-body-3",
          title: "Body Theme 3: Critical Evaluation",
          targetWordCount: 500,
          currentWordCount: 450,
          draftContent: Array(450).fill("word").join(" "),
          status: "completed",
          sectionType: "body",
          guidance: "Body 3",
        },
        {
          id: "sec-conclusion",
          title: "Conclusion & Synthesis",
          targetWordCount: 300,
          currentWordCount: 300,
          draftContent: Array(300).fill("word").join(" "),
          status: "completed",
          sectionType: "conclusion",
          guidance: "Conclusion",
        },
      ];

      getProject.mockResolvedValue({
        projectId: "proj-draft-1",
        outputTypeId: "OT-01",
        title: "Drafting Test Project",
        hasDocument: false,
        answers: {
          assignment_question: "Critically assess algorithmic governance.",
          word_count: 2000,
          target_word_count: 2000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "critical_essay",
          assignment_internal_sections: completedSections,
          assignment_current_phase: "drafting",
        },
        gates: [],
      });

      const onProceedMock = vi.fn();

      render(
        <AssignmentProvider
          projectId="proj-draft-1"
          initialStage="drafting"
          onStageChangeCallback={vi.fn()}
        >
          <AssignmentDraftingStage onProceed={onProceedMock} />
        </AssignmentProvider>
      );

      // Verify all sections marked as ready
      await waitFor(() => {
        expect(screen.getByText("5/5 completed")).toBeInTheDocument();
      });

      // Verify exit gate feedback message
      expect(
        screen.getByText(/Phase 3 Exit Gate Unlocked: All 5 sections completed & word count is within ±10% margin/i)
      ).toBeInTheDocument();

      // Verify proceed button is enabled and triggers callback
      const proceedButtons = screen.getAllByRole("button", { name: /Proceed to Submission Audit/i });
      expect(proceedButtons[0]).not.toBeDisabled();

      fireEvent.click(proceedButtons[0]);
      expect(onProceedMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Question-Led Outline Tuning & Inline Title Editing", () => {
    it("renders tuning banner and button when generic outline titles exist", () => {
      const onTune = vi.fn();
      const genericSections: AssignmentDraftingSection[] = [
        {
          id: "sec-intro",
          title: "Introduction & Contextual Thesis",
          targetWordCount: 200,
          currentWordCount: 0,
          draftContent: "",
          status: "pending",
          sectionType: "intro",
          guidance: "Intro",
        },
        {
          id: "sec-body-1",
          title: "Body Theme 1: Core Concept & Foundational Theoretical Framework",
          targetWordCount: 500,
          currentWordCount: 0,
          draftContent: "",
          status: "pending",
          sectionType: "body",
          guidance: "Body 1",
        },
      ];

      render(
        <DraftingSectionIndex
          sections={genericSections}
          activeSectionId="sec-intro"
          onSelectSection={vi.fn()}
          onTuneToQuestion={onTune}
        />
      );

      expect(screen.getByText("Generic Outline Detected")).toBeInTheDocument();
      const tuneBtn = screen.getByRole("button", { name: /Tune Outline to Question/i });
      expect(tuneBtn).toBeInTheDocument();

      fireEvent.click(tuneBtn);
      expect(onTune).toHaveBeenCalledTimes(1);
    });

    it("allows inline section title editing in DraftingSectionIndex", () => {
      const onUpdateTitle = vi.fn();
      render(
        <DraftingSectionIndex
          sections={mockSections}
          activeSectionId="sec-body-1"
          onSelectSection={vi.fn()}
          onUpdateSectionTitle={onUpdateTitle}
        />
      );

      // Find the edit button for Body Theme 1
      const editButtons = screen.getAllByTitle("Edit section title");
      expect(editButtons.length).toBeGreaterThan(0);

      // Click edit button for the first one
      fireEvent.click(editButtons[0]);

      // An input field should appear with current title
      const input = screen.getByDisplayValue("Introduction & Contextual Thesis");
      expect(input).toBeInTheDocument();

      // Change title and press Save
      fireEvent.change(input, { target: { value: "Physical Qubit Modalities in Quantum Computing" } });
      const saveBtn = screen.getByTitle("Save title");
      fireEvent.click(saveBtn);

      expect(onUpdateTitle).toHaveBeenCalledWith("sec-intro", "Physical Qubit Modalities in Quantum Computing");
    });

    it("allows inline section title editing in DraftingActiveEditor header", () => {
      const onUpdateTitle = vi.fn();
      render(
        <DraftingActiveEditor
          section={mockSections[1]}
          onUpdateContent={vi.fn()}
          onUpdateTitle={onUpdateTitle}
        />
      );

      // Click edit button in the header
      const editBtn = screen.getByTitle("Edit section title");
      expect(editBtn).toBeInTheDocument();
      fireEvent.click(editBtn);

      // Input appears in header
      const input = screen.getByDisplayValue("Body Theme 1: Core Theoretical Paradigms");
      expect(input).toBeInTheDocument();

      // Type new title and submit form
      fireEvent.change(input, { target: { value: "Superconducting Transmon Qubits vs Trapped Ions" } });
      const saveBtn = screen.getByTitle("Save title");
      fireEvent.click(saveBtn);

      expect(onUpdateTitle).toHaveBeenCalledWith("Superconducting Transmon Qubits vs Trapped Ions");
    });
  });
});
