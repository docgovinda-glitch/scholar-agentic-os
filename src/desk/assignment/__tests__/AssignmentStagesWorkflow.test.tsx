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
});

describe("Assignment Workspace Stages & Workflow", () => {
  beforeEach(() => {
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

  it("renders the Structure stage with proportional word count allocations", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="structure"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Phase 6: Structure & Word Count Planner/i)).toBeInTheDocument();
    expect(screen.getByText(/Mandatory Target/i)).toBeInTheDocument();
    expect(screen.getAllByText(/3,000 words/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue(/Introduction & Context/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Theoretical Framework/i)).toBeInTheDocument();
  });

  it("renders the Grounded Drafting stage with word count tracking and active section draft", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="draft"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Phase 7: Grounded Academic Drafting/i)).toBeInTheDocument();
    expect(screen.getByText(/Academic Draft Content:/i)).toBeInTheDocument();
    expect(screen.getByText(/International climate governance requires profound theoretical synthesis/i)).toBeInTheDocument();
  });

  it("renders the Finalize stage with 10-Point Submission Audit and export options", async () => {
    // Mock review API
    global.fetch = vi.fn().mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/review")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              overallScore: 92,
              readyForSubmission: true,
              criteriaResults: [
                {
                  category: "question_addressed",
                  label: "Question Addressed",
                  status: "pass",
                  summary: "Fully answers the policy prompt.",
                },
                {
                  category: "critical_thinking",
                  label: "Critical Thinking",
                  status: "pass",
                  summary: "Postgraduate depth demonstrated.",
                },
              ],
              strengths: ["Strong theoretical synthesis", "Nuanced counterarguments"],
              priorityFixes: ["Fine-tune concluding recommendation clarity"],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="final"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Phase 8: Review & Final Submission/i)).toBeInTheDocument();
    expect(screen.getByText(/Academic Readiness Assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/Download Word \(\.docx\)/i)).toBeInTheDocument();
  });
});
