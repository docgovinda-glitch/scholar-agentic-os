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

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  isEphemeralProject: () => false,
  commitProjectToDatabase: vi.fn(),
  authedJsonFetch: vi.fn(),
  authedFetch: vi.fn(),
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

describe("Scholar Core Assignment Workspace", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-123",
      outputTypeId: "OT-01",
      title: "Ethics of Artificial Intelligence Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate the ethical implications of autonomous decision systems.",
        word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "critical_essay",
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

  it("renders the 3-column workspace with 5-stage navigation, active workspace, and AI tutor panel", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="deconstruct"
        onStageChange={vi.fn()}
      />
    );

    // Left Rail: 5 guided stages
    expect(await screen.findByText(/1. Deconstruct/i)).toBeInTheDocument();
    expect(screen.getByText(/2. Thesis & Budget/i)).toBeInTheDocument();
    expect(screen.getByText(/3. PEEL Matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/4. Citations/i)).toBeInTheDocument();
    expect(screen.getByText(/5. Audit & Export/i)).toBeInTheDocument();

    // Center Stage (lazy loaded)
    expect(await screen.findByText(/Stage 01 • Deconstruction/i)).toBeInTheDocument();
    expect(screen.getByText(/Target Word Count/i)).toBeInTheDocument();

    // Right AI Tutor Sidebar
    const tutorPanel = await screen.findByRole("complementary");
    expect(within(tutorPanel).getByRole("button", { name: /socratic/i })).toBeInTheDocument();
    expect(within(tutorPanel).getByRole("button", { name: /rubric/i })).toBeInTheDocument();
    expect(within(tutorPanel).getByRole("button", { name: /counter-args/i })).toBeInTheDocument();
    expect(within(tutorPanel).getByRole("button", { name: /polish/i })).toBeInTheDocument();
  });

  it("handles prompt input and analysis trigger", async () => {
    getProject.mockResolvedValueOnce({
      projectId: "proj-123",
      outputTypeId: "OT-01",
      title: "Untitled Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "",
        word_count: 2000,
        citation_style: "apa7",
      },
      gates: [],
    });

    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="deconstruct"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Enter prompt \(10\+ chars\) to run analysis/i)).toBeInTheDocument();
  });

  it("renders a minimalist, decluttered workspace header", async () => {
    const handleClose = vi.fn();
    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="deconstruct"
        onStageChange={vi.fn()}
        onClose={handleClose}
      />
    );

    // 1. Clean Left Section: Back button and plain text title
    const header = await screen.findByRole("banner");
    const backBtn = within(header).getByRole("button", { name: /back/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Inline-editable title with auto-save
    const titleInput = await within(header).findByLabelText("Assignment Title");
    expect(titleInput).toBeInTheDocument();
    fireEvent.change(titleInput, { target: { value: "Renamed Assignment" } });
    fireEvent.blur(titleInput);
    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-123",
        expect.objectContaining({ assignment_title: "Renamed Assignment" })
      );
    });

    // 2. Simplified AI Tutor: minimalist icon button
    const tutorToggle = within(header).getByRole("button", { name: /toggle ai tutor/i });
    expect(tutorToggle).toBeInTheDocument();

    // 3. Compact status badge: 0 / 2,000 words
    expect(within(header).getByText(/0 \/ 2,000 words/i)).toBeInTheDocument();
  });
});
