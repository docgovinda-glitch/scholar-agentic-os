// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
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

describe("Unified Assignment Brief & 2-Step Outline Review Progression", () => {
  beforeEach(() => {
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });
  });

  it("Requirement 1 & 2: Renders unified brief container with all 5 controls, generates tone-calibrated outline with H1/H2/H3 hierarchy", async () => {
    getProject.mockResolvedValue({
      projectId: "proj-brief-unified",
      outputTypeId: "OT-01",
      title: "Academic Assignment",
      hasDocument: false,
      answers: {},
      gates: [],
    });

    render(<AssignmentWorkspace projectId="proj-brief-unified" initialStage="understand" />);

    // Wait for understand stage
    expect(await screen.findByText(/Phase 1: Understand the Assignment Brief/i)).toBeInTheDocument();

    // 1. Unified Container Controls
    const promptInput = screen.getByPlaceholderText(/Paste your assignment prompt, essay title, or question here/i);
    const levelSelect = screen.getByLabelText(/Academic Level/i);
    const typeSelect = screen.getByLabelText(/Assignment Type/i);
    const citationSelect = screen.getByLabelText(/Citation Style/i);
    const toneSelect = screen.getByLabelText(/Writing Tone/i);

    expect(promptInput).toBeInTheDocument();
    expect(levelSelect).toBeInTheDocument();
    expect(typeSelect).toBeInTheDocument();
    expect(citationSelect).toBeInTheDocument();
    expect(toneSelect).toBeInTheDocument();

    // Fill in controls
    fireEvent.change(promptInput, {
      target: { value: "Critically evaluate the ethical implications of autonomous AI in healthcare diagnostics." },
    });
    fireEvent.change(levelSelect, { target: { value: "postgraduate" } });
    fireEvent.change(typeSelect, { target: { value: "research_paper" } });
    fireEvent.change(citationSelect, { target: { value: "ieee" } });
    fireEvent.change(toneSelect, { target: { value: "persuasive" } });

    // Primary action button: Save & Build Outline
    const buildOutlineBtn = screen.getByRole("button", { name: /Save & Build Outline/i });
    expect(buildOutlineBtn).toBeInTheDocument();
    expect(buildOutlineBtn).not.toBeDisabled();

    // Click to generate outline and advance to Step 2
    fireEvent.click(buildOutlineBtn);

    // 2. Step 2 Outline Review: Locked/collapsed brief summary appears
    await waitFor(() => {
      expect(screen.getByText(/Locked & Calibrated/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Edit Brief/i })).toBeInTheDocument();
    });

    // Check tone-tailored Introduction/Thesis statement exists
    expect(screen.getAllByText(/Introduction & Core Working Thesis/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/persuasive tone/i)[0]).toBeInTheDocument();

    // Check H1, H2, and H3 arguments/evidence exist
    const h3Inputs = screen.getAllByPlaceholderText(/\+ Add argument or evidence point|\+ Add H3 specific argument/i);
    expect(h3Inputs.length).toBeGreaterThan(0);

    // Check Regenerate Outline secondary button exists
    const regenBtns = screen.getAllByRole("button", { name: /Regenerate Outline/i });
    expect(regenBtns.length).toBeGreaterThan(0);

    // Check Phase Completion Gate button exists
    const approveBtn = screen.getByRole("button", { name: /Approve Outline & Proceed/i });
    expect(approveBtn).toBeInTheDocument();
    expect(approveBtn).not.toBeDisabled();

    // Click Approve Outline & Proceed
    fireEvent.click(approveBtn);

    // Expect saved answers with isConfirmed: true, tone, level, type, citation
    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-brief-unified",
        expect.objectContaining({
          academicLevel: "postgraduate",
          assignmentType: "research_paper",
          citationStyle: "ieee",
          writingTone: "persuasive",
          assignment_structure: expect.objectContaining({
            isConfirmed: true,
            headings: expect.any(Array),
            thesisStatement: expect.any(String),
          }),
        })
      );
    });
  });

  it("Requirement 2b: Allows toggling back to edit the brief via Edit Brief and editing H3 focus points", async () => {
    getProject.mockResolvedValue({
      projectId: "proj-edit-toggle",
      outputTypeId: "OT-01",
      title: "Academic Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "Examine the role of renewable energy adoption in developing nations.",
        academic_level: "undergraduate",
        assignment_type: "case_study",
        citation_style: "harvard",
        writing_tone: "critical",
        word_count: 2500,
        target_word_count: 2500,
      },
      gates: [],
    });

    render(<AssignmentWorkspace projectId="proj-edit-toggle" initialStage="understand" />);

    // Generate outline
    const buildBtn = await screen.findByRole("button", { name: /Save & Build Outline/i });
    fireEvent.click(buildBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Edit Brief/i })).toBeInTheDocument();
    });

    // Toggle back to edit brief
    const editBriefBtn = screen.getByRole("button", { name: /Edit Brief/i });
    fireEvent.click(editBriefBtn);

    // Verify brief inputs are visible again
    expect(screen.getByPlaceholderText(/Paste your assignment prompt, essay title, or question here/i)).toBeInTheDocument();

    // Return to outline review
    const rebuildBtn = screen.getByRole("button", { name: /Save & Build Outline/i });
    fireEvent.click(rebuildBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Approve Outline & Proceed/i })).toBeInTheDocument();
    });
  });
});
