// @vitest-environment jsdom
//
// Agent-UI adapter Step 2c (docs/planning/agent-ui-adapter-scoping.md) —
// "Run Full Pipeline (Deep Review)" in QualityControlSuite.tsx, additive to
// (not replacing) the existing "Run Integrity & Ethics Review" agent path
// characterized in QualityControlSuite.integrityAgent.test.tsx. This calls
// runResearchPipeline (src/agents/pipeline.ts) instead of executeAgent
// directly, so the same integrity-reviewer UI now reflects a real upstream
// chain (literature review, research questions, methodology, statistics)
// instead of leaving those IntegrityReviewerInput fields undefined.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import QualityControlSuite from "../QualityControlSuite";
import { DEFAULT_STATE, PaperProject } from "../../types";

const { mockRunQualityControl } = vi.hoisted(() => ({ mockRunQualityControl: vi.fn() }));
vi.mock("../../services/aiService", () => ({ runQualityControl: mockRunQualityControl }));

const { mockExecuteAgent } = vi.hoisted(() => ({ mockExecuteAgent: vi.fn() }));
vi.mock("../../services/agentService", () => ({ executeAgent: mockExecuteAgent }));

const { mockRunResearchPipeline } = vi.hoisted(() => ({ mockRunResearchPipeline: vi.fn() }));
vi.mock("../../agents/pipeline", () => ({ runResearchPipeline: mockRunResearchPipeline }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSuite(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), sections: { Introduction: "Real drafted intro text." }, ...overrides };
  render(<QualityControlSuite project={project} updateProject={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} />);
  return project;
}

function integrityReport(overrides: Record<string, unknown> = {}) {
  return {
    executiveSummary: "Integrity review complete. Average score: 92%. 0 issues detected, 0 blocking.",
    integrityScore: 0.92, ethicsScore: 0.95, reproducibilityScore: 0.85, transparencyScore: 0.8,
    reportingCompliance: [], detectedIssues: [], blockingIssues: [], warnings: [],
    recommendations: [], structuralCompleteness: 92, confidence: 0.9,
    ...overrides,
  };
}

describe("QualityControlSuite — Step 2c full-pipeline path (new, additive)", () => {
  it("calls runResearchPipeline with the project (not executeAgent directly) when 'Run Full Pipeline' is clicked", async () => {
    const project = renderSuite();
    mockRunResearchPipeline.mockResolvedValue({
      researchPlan: null, literatureReview: null, knowledgeGapReport: null,
      researchQuestionReport: null, methodologyReport: null, statisticalAnalysisReport: null,
      integrityReviewReport: integrityReport(), errors: [],
    });

    fireEvent.click(screen.getByText("Run Full Pipeline (Deep Review)"));

    await waitFor(() => expect(mockRunResearchPipeline).toHaveBeenCalledWith(project));
    expect(mockExecuteAgent).not.toHaveBeenCalled();
    expect(mockRunQualityControl).not.toHaveBeenCalled();
  });

  it("renders the pipeline's integrityReviewReport using the same display as the single-agent path", async () => {
    renderSuite();
    mockRunResearchPipeline.mockResolvedValue({
      researchPlan: null, literatureReview: null, knowledgeGapReport: null,
      researchQuestionReport: null, methodologyReport: null, statisticalAnalysisReport: null,
      integrityReviewReport: integrityReport({ executiveSummary: "Pipeline-driven integrity review complete." }),
      errors: [],
    });

    fireEvent.click(screen.getByText("Run Full Pipeline (Deep Review)"));

    expect(await screen.findByText(/Pipeline-driven integrity review complete/)).toBeInTheDocument();
  });

  it("shows individual stage errors without blocking the rendered integrity report (graceful degradation)", async () => {
    renderSuite();
    mockRunResearchPipeline.mockResolvedValue({
      researchPlan: null, literatureReview: null, knowledgeGapReport: null,
      researchQuestionReport: null, methodologyReport: null, statisticalAnalysisReport: null,
      integrityReviewReport: integrityReport(),
      errors: [{ agentId: "literature-review", message: "All literature sources failed" }],
    });

    fireEvent.click(screen.getByText("Run Full Pipeline (Deep Review)"));

    expect(await screen.findByText(/literature-review: All literature sources failed/)).toBeInTheDocument();
    expect(screen.getByText(/Integrity review complete/)).toBeInTheDocument();
  });

  it("surfaces an error message when the pipeline's terminal integrity stage itself fails, instead of crashing", async () => {
    renderSuite();
    mockRunResearchPipeline.mockResolvedValue({
      researchPlan: null, literatureReview: null, knowledgeGapReport: null,
      researchQuestionReport: null, methodologyReport: null, statisticalAnalysisReport: null,
      integrityReviewReport: null,
      errors: [{ agentId: "integrity-reviewer", message: "integrity stage crashed" }],
    });

    fireEvent.click(screen.getByText("Run Full Pipeline (Deep Review)"));

    expect(await screen.findByText(/terminal integrity-review stage did not complete/)).toBeInTheDocument();
    expect(await screen.findByText(/integrity-reviewer: integrity stage crashed/)).toBeInTheDocument();
  });

  it("does not affect the existing single-agent 'Run Integrity & Ethics Review' button (still calls executeAgent directly)", async () => {
    renderSuite();
    mockExecuteAgent.mockResolvedValue({ ok: true, data: integrityReport(), diagnostics: { modeUsed: "deterministic", executionTimeMs: 1 } });

    fireEvent.click(screen.getByText("Run Integrity & Ethics Review"));

    await waitFor(() => expect(mockExecuteAgent).toHaveBeenCalledWith("integrity-reviewer", expect.anything()));
    expect(mockRunResearchPipeline).not.toHaveBeenCalled();
  });

  // Semantic peer review (docs/planning/semantic-peer-review-scoping.md, 2026-07-24)
  describe("comparableSourceAnalysis display (additive, separate from structuralCompleteness)", () => {
    it("renders each finding with a link to its real cited paper", async () => {
      renderSuite();
      mockRunResearchPipeline.mockResolvedValue({
        researchPlan: null, literatureReview: null, knowledgeGapReport: null,
        researchQuestionReport: null, methodologyReport: null, statisticalAnalysisReport: null,
        integrityReviewReport: integrityReport({
          comparableSourceAnalysis: {
            retrievedPapers: [{ title: "A Real Paper", url: "https://doi.org/real", authors: "", year: "2023", venue: "", abstract: "", citationCount: null, source: "Crossref" }],
            findings: [{ finding: "The manuscript does not engage with this paper's framework.", citedPaper: { title: "A Real Paper", url: "https://doi.org/real" } }],
            confidence: 0.7,
          },
        }),
        errors: [],
      });

      fireEvent.click(screen.getByText("Run Full Pipeline (Deep Review)"));

      expect(await screen.findByText(/does not engage with this paper's framework/)).toBeInTheDocument();
      const link = await screen.findByText("[A Real Paper]");
      expect(link.closest("a")).toHaveAttribute("href", "https://doi.org/real");
    });

    it("shows the honest note instead of findings when nothing was available to compare", async () => {
      renderSuite();
      mockRunResearchPipeline.mockResolvedValue({
        researchPlan: null, literatureReview: null, knowledgeGapReport: null,
        researchQuestionReport: null, methodologyReport: null, statisticalAnalysisReport: null,
        integrityReviewReport: integrityReport({
          comparableSourceAnalysis: { retrievedPapers: [], findings: [], confidence: 0, note: "No comparable literature retrieved for this manuscript's topic." },
        }),
        errors: [],
      });

      fireEvent.click(screen.getByText("Run Full Pipeline (Deep Review)"));

      expect(await screen.findByText("No comparable literature retrieved for this manuscript's topic.")).toBeInTheDocument();
    });

    it("does not render the comparable-literature section at all when comparableSourceAnalysis is null", async () => {
      renderSuite();
      mockRunResearchPipeline.mockResolvedValue({
        researchPlan: null, literatureReview: null, knowledgeGapReport: null,
        researchQuestionReport: null, methodologyReport: null, statisticalAnalysisReport: null,
        integrityReviewReport: integrityReport({ comparableSourceAnalysis: null }),
        errors: [],
      });

      fireEvent.click(screen.getByText("Run Full Pipeline (Deep Review)"));

      await screen.findByText(/Integrity review complete/);
      expect(screen.queryByText(/Comparable Literature/)).not.toBeInTheDocument();
    });
  });
});
