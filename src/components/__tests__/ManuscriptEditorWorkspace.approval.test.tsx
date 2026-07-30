// @vitest-environment jsdom
//
// Real gap found and fixed (integrity-audit follow-up, 2026-07-30):
// "Approve Manuscript" used to be a single generic confirm() with no
// reference to project.qcReport at all — approving with zero QC audit ever
// run, or after a QC run that surfaced real weaknesses, looked identical to
// approving a genuinely clean manuscript. Fixed to surface the real,
// current QC result (or an honest "none run yet" warning) in the
// confirmation prompt, so approval is informed consent rather than a blind
// rubber-stamp. Deliberately NOT a hard block on a bad score — this
// project's own established principle is that the system never issues an
// accept/reject verdict itself; a human must still make that call.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ManuscriptEditorWorkspace from "../ManuscriptEditorWorkspace";
import { DEFAULT_STATE, PaperProject, QCReport } from "../../types";
import type { IntegrityReviewReport } from "../../agents/integrityReviewer";

vi.mock("../../services/aiService", () => ({
  draftSection: vi.fn(),
}));
vi.mock("../../services/documentExportService", () => ({
  downloadDocx: vi.fn(),
  downloadPdf: vi.fn(),
}));

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWorkspace(overrides: Partial<PaperProject> = {}, updateProject = vi.fn()) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), sections: { Introduction: "Real drafted intro text." }, ...overrides };
  render(
    <ManuscriptEditorWorkspace
      project={project}
      updateProject={updateProject}
      onNext={vi.fn()}
      onBack={vi.fn()}
      isFocusMode={false}
      onToggleFocusMode={vi.fn()}
    />
  );
  return { project };
}

const GOOD_REPORT: QCReport = {
  complianceScore: 92,
  rigorScore: 88,
  alignmentWithDissertationScore: 90,
  plagiarismOriginalityCheck: "No concerns found.",
  strengths: ["Clear argument structure."],
  weaknesses: [],
  actionableEditsPlan: [],
  citationAudit: "Consistent.",
  ethicalVerification: "Declarations present.",
};

const WEAK_REPORT: QCReport = {
  complianceScore: 41,
  rigorScore: 38,
  alignmentWithDissertationScore: 45,
  plagiarismOriginalityCheck: "Several passages closely mirror source text.",
  strengths: [],
  weaknesses: ["Missing ethical approval statement.", "Citations inconsistent across sections."],
  actionableEditsPlan: ["Add declarations section.", "Reconcile citation style."],
  citationAudit: "Inconsistent formatting detected.",
  ethicalVerification: "No ethics declaration found.",
};

const WEAK_INTEGRITY_REPORT: IntegrityReviewReport = {
  executiveSummary: "Structural/completeness scan only, not semantic peer review.",
  integrityScore: 55,
  ethicsScore: 40,
  reproducibilityScore: 60,
  transparencyScore: 50,
  reportingCompliance: [],
  detectedIssues: [],
  blockingIssues: [
    { id: "1", severity: "high", category: "ethics", description: "No ethics/IRB approval statement found.", recommendation: "Add an ethics declaration." },
  ],
  warnings: [],
  recommendations: [],
  structuralCompleteness: 62,
  comparableSourceAnalysis: null,
  confidence: 0.7,
};

describe("ManuscriptEditorWorkspace — Approve Manuscript surfaces the real QC result, not a blind confirm", () => {
  it("warns honestly that no QC audit has been run yet when project.qcReport is absent", () => {
    const updateProject = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWorkspace({ qcReport: undefined }, updateProject);

    fireEvent.click(screen.getByText("Approve Manuscript"));

    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("Quality Control audit: not run yet");
    expect(message).toContain("Integrity & Ethics Review (Agent): not run yet");
    expect(updateProject).toHaveBeenCalledWith({ manuscriptApproved: true });
    confirmSpy.mockRestore();
  });

  it("shows the real compliance/rigor/alignment scores when a QC report exists", () => {
    const updateProject = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWorkspace({ qcReport: GOOD_REPORT }, updateProject);

    fireEvent.click(screen.getByText("Approve Manuscript"));

    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("Compliance: 92%");
    expect(message).toContain("Rigor: 88%");
    expect(message).toContain("Dissertation Alignment: 90%");
    confirmSpy.mockRestore();
  });

  it("surfaces real, specific weaknesses in the confirm prompt rather than hiding them behind a generic message", () => {
    const updateProject = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWorkspace({ qcReport: WEAK_REPORT }, updateProject);

    fireEvent.click(screen.getByText("Approve Manuscript"));

    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("Compliance: 41%");
    expect(message).toContain("Missing ethical approval statement.");
    expect(message).toContain("Citations inconsistent across sections.");
    confirmSpy.mockRestore();
  });

  it("does NOT block approval on a bad QC score — the human can still approve despite real weaknesses (no system-issued verdict)", () => {
    const updateProject = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWorkspace({ qcReport: WEAK_REPORT }, updateProject);

    fireEvent.click(screen.getByText("Approve Manuscript"));

    expect(updateProject).toHaveBeenCalledWith({ manuscriptApproved: true });
  });

  it("shows the persisted IntegrityReviewerAgent result (structural completeness, integrity/ethics scores, blocking issues) alongside the QC report", () => {
    const updateProject = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWorkspace({ qcReport: GOOD_REPORT, integrityReviewReport: WEAK_INTEGRITY_REPORT }, updateProject);

    fireEvent.click(screen.getByText("Approve Manuscript"));

    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toContain("Structural Completeness: 62%");
    expect(message).toContain("Integrity: 55%");
    expect(message).toContain("Ethics: 40%");
    expect(message).toContain("No ethics/IRB approval statement found.");
    confirmSpy.mockRestore();
  });

  it("cancelling the confirm prompt does not approve the manuscript", () => {
    const updateProject = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWorkspace({ qcReport: WEAK_REPORT }, updateProject);

    fireEvent.click(screen.getByText("Approve Manuscript"));

    expect(updateProject).not.toHaveBeenCalled();
  });
});
