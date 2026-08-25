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

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
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

  it("renders the 3-column workspace with 8-phase navigation, active workspace, and AI tutor panel", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-123"
        initialStage="understand"
        onStageChange={vi.fn()}
      />
    );

    // Left Rail: 8 stages
    expect(await screen.findByText(/Academic Assignment Journey/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Phase 1/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Phase 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 5/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 6/i)).toBeInTheDocument();
    expect(screen.getByText(/Phase 8/i)).toBeInTheDocument();

    // Center Stage
    expect(screen.getByText(/Phase 1: Understand the Assignment/i)).toBeInTheDocument();
    expect(screen.getByText(/Target Word Count/i)).toBeInTheDocument();

    // Right AI Tutor Sidebar
    expect(screen.getByText(/Academic Thinking & Writing Tutor/i)).toBeInTheDocument();
    expect(screen.getByText(/Word Count Budget Planner/i)).toBeInTheDocument();
  });

  it("enforces mandatory target word count and citation style before analysis", async () => {
    getProject.mockResolvedValueOnce({
      projectId: "proj-123",
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
        projectId="proj-123"
        initialStage="understand"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Please provide the assignment question, word count, and citation style to continue/i)).toBeInTheDocument();
  });
});
