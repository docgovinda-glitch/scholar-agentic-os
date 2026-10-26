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
const authedJsonFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
const authedFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  authedJsonFetch: (...a: unknown[]) => authedJsonFetch(...a),
  authedFetch: (...a: unknown[]) => authedFetch(...a),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([
    {
      id: "vault-item-1",
      title: "Foundations of Autonomous Ethics",
      content: "Empirical study on autonomous moral decision architectures.",
      citation: "Smith & Doe (2024)",
      canonicalReference: { authors: [{ family: "Smith", given: "John" }], year: 2024 },
    },
  ]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

const { default: AssignmentWorkspace } = await import("../AssignmentWorkspace");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe("Assignment Workspace Stages & Workflow", () => {
  beforeEach(() => {
    localStorage.clear();
    getProject.mockResolvedValue({
      projectId: "proj-456",
      outputTypeId: "OT-01",
      title: "Postgraduate Policy Analysis",
      hasDocument: false,
      answers: {
        assignment_question: "Critically analyse international climate governance frameworks and equity implications.",
        word_count: 3000,
        citation_style: "harvard",
        academic_level: "postgraduate",
        assignment_type: "policy_analysis",
        assignment_outline: [
          {
            id: "sec-1",
            title: "Introduction & Context",
            targetWordCount: 300,
            currentWordCount: 310,
            draftContent: "International climate governance requires profound theoretical synthesis.",
            guidance: "Set up the international context.",
            keyPoints: ["Context", "Thesis"],
            status: "drafted",
          },
          {
            id: "sec-2",
            title: "Theoretical Framework",
            targetWordCount: 1200,
            currentWordCount: 1150,
            draftContent: "Regime theory and constructivist dynamics elucidate state compliance.",
            guidance: "Synthesize competing regime theories.",
            keyPoints: ["Regimes", "Equity"],
            status: "drafted",
          },
          {
            id: "sec-3",
            title: "Conclusion & Policy Recommendations",
            targetWordCount: 500,
            currentWordCount: 480,
            draftContent: "Substantive policy recalibration is imperative.",
            guidance: "Offer actionable policy insights.",
            keyPoints: ["Policy", "Next steps"],
            status: "drafted",
          },
        ],
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

  it("safely maps legacy Structure stage to Phase 3 Drafting with word count allocations", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="structure"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Grounded Section-by-Section Drafting/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(/Drafting & Synthesis/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/3,000 words/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Introduction & Context/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Theoretical Framework/i).length).toBeGreaterThanOrEqual(1);
  });

  it("safely maps legacy Grounded Drafting stage to Phase 3 Drafting with word count tracking", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="draft"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Overall Draft Progress/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(/Drafting & Synthesis/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/3,000 words/i).length).toBeGreaterThanOrEqual(1);
  });

  it("safely maps legacy Finalize stage to Phase 4 Submission Quality Audit and export options", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="final"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Submission Quality Audit & Camera-Ready Export/i, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getAllByText(/Submission & Review/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Word Document \(\.docx\)/i)).toBeInTheDocument();
    expect(screen.getByText(/PDF Document/i)).toBeInTheDocument();
  });
});
