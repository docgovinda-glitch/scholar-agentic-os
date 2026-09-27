// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Assignment Phase 1 Wiring & Phase 2 Sources Workspace", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-sources-1",
      outputTypeId: "OT-01",
      title: "Algorithmic Ethics Essay",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate the ethics of autonomous decision-making systems.",
        word_count: 2000,
        target_word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "critical_essay",
        marking_rubric: "1. Critical Analysis: 40%\n2. Evidence & Citations: 30%\n3. Structure & Cohesion: 30%",
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({
      id: "OT-01",
      label: "Assignment",
    });
  });

  describe("Phase 1: Understand Wiring & Exit Gate Enforcement", () => {
    it("enforces exit gate: enables Proceed to Sources button when mandatory fields exist", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-sources-1"
          initialStage="understand"
          onStageChange={vi.fn()}
        />
      );

      const proceedBtn = await screen.findByRole("button", { name: /Proceed to Sources/i });
      expect(proceedBtn).toBeInTheDocument();
      expect(proceedBtn).not.toBeDisabled();

      fireEvent.click(proceedBtn);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-sources-1",
          expect.objectContaining({
            rawPrompt: expect.stringContaining("autonomous decision-making systems"),
            targetWordCount: 2000,
            wordBudget: expect.objectContaining({
              intro: 200,
              conclusion: 300,
              body: 1500,
            }),
            citationStyle: "apa7",
            rubricCriteria: expect.arrayContaining([
              expect.objectContaining({
                criterion: expect.stringContaining("Critical Analysis"),
                weightPercentage: 40,
              }),
            ]),
          })
        );
      });
    });

    it("disables Proceed to Sources when prompt or word count is missing", async () => {
      getProject.mockResolvedValueOnce({
        projectId: "proj-sources-empty",
        outputTypeId: "OT-01",
        title: "Untitled Assignment",
        hasDocument: false,
        answers: {
          assignment_question: "",
          word_count: 0,
          citation_style: "",
        },
        gates: [],
      });

      render(
        <AssignmentWorkspace
          projectId="proj-sources-empty"
          initialStage="understand"
          onStageChange={vi.fn()}
        />
      );

      const proceedBtn = await screen.findByRole("button", { name: /Proceed to Sources/i });
      expect(proceedBtn).toBeDisabled();
      expect(screen.getByText(/Please provide the assignment question, word count, and citation style to continue/i)).toBeInTheDocument();
    });
  });

  describe("Phase 2: Sources Stage & Evidence Exit Gate", () => {
    it("renders curated literature cards with venue, authors, and rationale", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-sources-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      // Phase 2 Header & Section Headings
      expect(await screen.findByText(/Curated Literature & Course Sources/i)).toBeInTheDocument();
      expect(screen.getByText(/Course Materials & Syllabus Upload/i)).toBeInTheDocument();
      expect(screen.getByText(/Curated Scholarly Literature/i)).toBeInTheDocument();

      // Curated Literature Cards (Titles, Authors, Venue)
      expect(screen.getByText(/Algorithmic Governance and the Politics of Predictive Accountability/i)).toBeInTheDocument();
      expect(screen.getByText(/Pasquale, F., Zarsky, T./i)).toBeInTheDocument();
      expect(screen.getByText(/Harvard Law Review/i)).toBeInTheDocument();
      expect(screen.getByText(/Critical Synthesis of Empirical Evidence in Socio-Technical Decision Making/i)).toBeInTheDocument();

      // Exit Gate Counter & initial disabled Proceed to Drafting button
      const counter = screen.getByTestId("evidence-counter");
      expect(counter).toHaveTextContent("0 / 4 minimum");

      const proceedDraftingBtn = screen.getByTestId("proceed-to-drafting-btn");
      expect(proceedDraftingBtn).toBeDisabled();
    });

    it("allows one-click approve and dismiss actions on curated cards", async () => {
      render(
        <AssignmentWorkspace
          projectId="proj-sources-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      await screen.findByText(/Curated Literature & Course Sources/i);

      // Approve card 1
      const approveBtn1 = screen.getByRole("button", { name: /Approve Algorithmic Governance and the Politics of Predictive Accountability/i });
      fireEvent.click(approveBtn1);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-sources-1",
          expect.objectContaining({
            approved_source_ids: expect.arrayContaining(["src-curated-1"]),
          })
        );
      });

      // Dismiss card 2
      const dismissBtn = screen.getByRole("button", { name: /Dismiss or replace Critical Synthesis of Empirical Evidence in Socio-Technical Decision Making/i });
      fireEvent.click(dismissBtn);

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-sources-1",
          expect.objectContaining({
            assignment_sources: expect.arrayContaining([
              expect.objectContaining({ id: "src-curated-alt-1" }),
            ]),
          })
        );
      });
    });

    it("accepts lecture file uploads, auto-approves them, and unlocks Proceed to Drafting at 4 approved sources", async () => {
      getProject.mockResolvedValueOnce({
        projectId: "proj-sources-1",
        outputTypeId: "OT-01",
        title: "Algorithmic Ethics Essay",
        hasDocument: false,
        answers: {
          assignment_question: "Critically evaluate the ethics of autonomous decision-making systems.",
          word_count: 2000,
          citation_style: "apa7",
          academic_level: "undergraduate",
          assignment_type: "critical_essay",
          approved_source_ids: ["src-curated-1", "src-curated-2", "src-curated-3"],
        },
        gates: [],
      });

      render(
        <AssignmentWorkspace
          projectId="proj-sources-1"
          initialStage="sources"
          onStageChange={vi.fn()}
        />
      );

      await screen.findByText(/Curated Literature & Course Sources/i);

      // Check current count: 3 / 4 minimum
      const counter = screen.getByTestId("evidence-counter");
      expect(counter).toHaveTextContent("3 / 4 minimum");
      const proceedDraftingBtn = screen.getByTestId("proceed-to-drafting-btn");
      expect(proceedDraftingBtn).toBeDisabled();

      // Upload 1 lecture slides PDF to meet 4 minimum threshold
      const fileInput = screen.getByTestId("lecture-file-input");
      const file = new File(["lecture notes content"], "Week_04_Algorithmic_Ethics_Slides.pdf", {
        type: "application/pdf",
      });

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(saveIntakeAnswers).toHaveBeenCalledWith(
          "proj-sources-1",
          expect.objectContaining({
            assignment_user_uploaded_sources: expect.arrayContaining([
              expect.objectContaining({ name: "Week_04_Algorithmic_Ethics_Slides.pdf" }),
            ]),
            approved_source_ids: expect.arrayContaining([
              "src-curated-1",
              "src-curated-2",
              "src-curated-3",
              expect.stringMatching(/^doc-/),
            ]),
          })
        );
      });
    });
  });
});
