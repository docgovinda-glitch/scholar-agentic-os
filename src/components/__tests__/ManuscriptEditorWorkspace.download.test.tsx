// @vitest-environment jsdom
//
// Focused test for ManuscriptEditorWorkspace.tsx's Stage 12 download buttons —
// confirms clicking "Download .DOCX"/"Download .PDF" now calls the real
// documentExportService (downloadDocx/downloadPdf), replacing the previous
// HTML-disguised-as-.doc / window.print() fakes. Not a full test of this
// large component's other behavior (AI chat, section editing, etc.) — out of
// scope for this pass.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ManuscriptEditorWorkspace from "../ManuscriptEditorWorkspace";
import { DEFAULT_STATE, PaperProject } from "../../types";

const { mockDownloadDocx, mockDownloadPdf } = vi.hoisted(() => ({
  mockDownloadDocx: vi.fn(),
  mockDownloadPdf: vi.fn(),
}));
vi.mock("../../services/documentExportService", () => ({
  downloadDocx: mockDownloadDocx,
  downloadPdf: mockDownloadPdf,
}));

vi.mock("../../services/aiService", () => ({
  draftSection: vi.fn(),
}));

// jsdom doesn't implement scrollIntoView — this component calls it on mount
// to keep the AI-chat panel scrolled to the latest message, unrelated to what
// this test file actually exercises.
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

const CONFIRMED_DISCLOSURE = {
  sectionsIncluded: ["Introduction"],
  modelsUsed: ["gemini (gemini-pro)"],
  disclosureText: "Already-confirmed disclosure text.",
  confirmedAt: "2026-07-23T00:00:00.000Z",
};

describe("ManuscriptEditorWorkspace — Stage 12 download buttons (disclosure already confirmed)", () => {
  it("calls the real downloadDocx export when 'Download .DOCX' is clicked and disclosure is already confirmed", async () => {
    mockDownloadDocx.mockResolvedValue(undefined);
    renderWorkspace({ aiUseDisclosure: CONFIRMED_DISCLOSURE });

    fireEvent.click(screen.getByText("Download .DOCX"));

    await waitFor(() => expect(mockDownloadDocx).toHaveBeenCalled());
    expect(mockDownloadPdf).not.toHaveBeenCalled();
  });

  it("calls the real downloadPdf export when 'Download .PDF' is clicked and disclosure is already confirmed", async () => {
    mockDownloadPdf.mockResolvedValue(undefined);
    renderWorkspace({ aiUseDisclosure: CONFIRMED_DISCLOSURE });

    fireEvent.click(screen.getByText("Download .PDF"));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalled());
    expect(mockDownloadDocx).not.toHaveBeenCalled();
  });

  it("surfaces an error via alert and resets the loading state when the export throws", async () => {
    mockDownloadDocx.mockRejectedValue(new Error("Export failed"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderWorkspace({ aiUseDisclosure: CONFIRMED_DISCLOSURE });

    fireEvent.click(screen.getByText("Download .DOCX"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("Export failed")));
    alertSpy.mockRestore();
  });
});

describe("ManuscriptEditorWorkspace — Stage 9 AI-use disclosure gate", () => {
  it("shows the disclosure review modal instead of downloading when no disclosure has been confirmed yet", async () => {
    renderWorkspace();

    fireEvent.click(screen.getByText("Download .DOCX"));

    expect(await screen.findByText("AI-Use Disclosure — Review Before Export")).toBeInTheDocument();
    expect(mockDownloadDocx).not.toHaveBeenCalled();
  });

  it("confirming the disclosure stores it on the project (with confirmedAt) and then proceeds with the download", async () => {
    mockDownloadDocx.mockResolvedValue(undefined);
    const updateProject = vi.fn();
    renderWorkspace({}, updateProject);

    fireEvent.click(screen.getByText("Download .DOCX"));
    await screen.findByText("AI-Use Disclosure — Review Before Export");

    fireEvent.click(screen.getByText("Confirm & Continue to Export"));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const updateArg = updateProject.mock.calls[0][0];
    expect(updateArg.aiUseDisclosure.confirmedAt).toBeTruthy();
    expect(updateArg.aiUseDisclosure.sectionsIncluded).toEqual(["Introduction"]);

    await waitFor(() => expect(mockDownloadDocx).toHaveBeenCalled());
  });

  it("cancelling the disclosure modal closes it without downloading or storing anything", async () => {
    const updateProject = vi.fn();
    renderWorkspace({}, updateProject);

    fireEvent.click(screen.getByText("Download .PDF"));
    await screen.findByText("AI-Use Disclosure — Review Before Export");

    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("AI-Use Disclosure — Review Before Export")).not.toBeInTheDocument();
    expect(mockDownloadPdf).not.toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled();
  });
});
