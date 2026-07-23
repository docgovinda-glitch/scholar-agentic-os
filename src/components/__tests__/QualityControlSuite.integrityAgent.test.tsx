// @vitest-environment jsdom
//
// Stage 10 (target-workflow.md) — connects IntegrityReviewerAgent to the live
// UI peer-review path in QualityControlSuite.tsx, additive to (not
// replacing) the existing runQualityControl flow, which stays exactly as it
// was — characterized here before the new agent path is exercised.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import QualityControlSuite from "../QualityControlSuite";
import { DEFAULT_STATE, PaperProject } from "../../types";

const { mockRunQualityControl } = vi.hoisted(() => ({ mockRunQualityControl: vi.fn() }));
vi.mock("../../services/aiService", () => ({
  runQualityControl: mockRunQualityControl,
}));

const { mockExecuteAgent } = vi.hoisted(() => ({ mockExecuteAgent: vi.fn() }));
vi.mock("../../services/agentService", () => ({
  executeAgent: mockExecuteAgent,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSuite(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), sections: { Introduction: "Real drafted intro text." }, ...overrides };
  render(
    <QualityControlSuite project={project} updateProject={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} />
  );
}

describe("QualityControlSuite — existing runQualityControl path (characterization, unchanged)", () => {
  it("still calls the real runQualityControl (not the agent) when 'Run Compliance & Style Checks' is clicked", async () => {
    mockRunQualityControl.mockResolvedValue({
      complianceScore: 90, rigorScore: 90, alignmentWithDissertationScore: 90,
      plagiarismOriginalityCheck: "x", strengths: [], weaknesses: [], actionableEditsPlan: [],
      citationAudit: "x", ethicalVerification: "x",
    });
    renderSuite();

    fireEvent.click(screen.getByText("Run Compliance & Style Checks"));

    await waitFor(() => expect(mockRunQualityControl).toHaveBeenCalled());
    expect(mockExecuteAgent).not.toHaveBeenCalled();
  });
});

describe("QualityControlSuite — Stage 10 IntegrityReviewerAgent path (new)", () => {
  it("calls agentService.executeAgent('integrity-reviewer', ...) with manuscriptText built from real drafted sections when the integrity-review button is clicked", async () => {
    mockExecuteAgent.mockResolvedValue({
      ok: true,
      data: {
        executiveSummary: "Integrity review complete. Average score: 90%. 0 issues detected, 0 blocking.",
        integrityScore: 0.9, ethicsScore: 0.95, reproducibilityScore: 0.85, transparencyScore: 0.8,
        reportingCompliance: [{ guideline: "PRISMA", compliantItems: ["Abstract"], missingItems: ["Limitations"], completionPercentage: 75 }],
        detectedIssues: [], blockingIssues: [], warnings: [],
        recommendations: ["Address all critical and high severity issues before submission"],
        publicationReadiness: true, confidence: 0.95,
      },
      diagnostics: { modeUsed: "deterministic", executionTimeMs: 5 },
    });
    renderSuite();

    fireEvent.click(screen.getByText("Run Integrity & Ethics Review"));

    await waitFor(() => expect(mockExecuteAgent).toHaveBeenCalled());
    expect(mockExecuteAgent.mock.calls[0][0]).toBe("integrity-reviewer");
    const sentInput = mockExecuteAgent.mock.calls[0][1];
    expect(sentInput.manuscriptText).toContain("Real drafted intro text.");
    expect(mockRunQualityControl).not.toHaveBeenCalled();
  });

  it("renders the returned IntegrityReviewReport's executive summary and publication-readiness after a successful run", async () => {
    mockExecuteAgent.mockResolvedValue({
      ok: true,
      data: {
        executiveSummary: "Integrity review complete. Average score: 87%. 0 issues detected, 0 blocking.",
        integrityScore: 0.9, ethicsScore: 0.95, reproducibilityScore: 0.85, transparencyScore: 0.8,
        reportingCompliance: [],
        detectedIssues: [], blockingIssues: [], warnings: [],
        recommendations: [],
        publicationReadiness: true, confidence: 0.95,
      },
      diagnostics: { modeUsed: "deterministic", executionTimeMs: 5 },
    });
    renderSuite();

    fireEvent.click(screen.getByText("Run Integrity & Ethics Review"));

    expect(await screen.findByText(/Integrity review complete/)).toBeInTheDocument();
  });

  it("surfaces an error message when the agent returns ok: false, instead of crashing", async () => {
    mockExecuteAgent.mockResolvedValue({
      ok: false,
      error: { type: "EXECUTION_ERROR", message: "Something went wrong" },
      diagnostics: { modeUsed: "deterministic", executionTimeMs: 5 },
    });
    renderSuite();

    fireEvent.click(screen.getByText("Run Integrity & Ethics Review"));

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
  });
});
