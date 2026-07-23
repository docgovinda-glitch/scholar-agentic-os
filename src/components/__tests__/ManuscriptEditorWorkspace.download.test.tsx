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

function renderWorkspace(overrides: Partial<PaperProject> = {}) {
  const project: PaperProject = { ...DEFAULT_STATE("jdoe"), sections: { Introduction: "Real drafted intro text." }, ...overrides };
  render(
    <ManuscriptEditorWorkspace
      project={project}
      updateProject={vi.fn()}
      onNext={vi.fn()}
      onBack={vi.fn()}
      isFocusMode={false}
      onToggleFocusMode={vi.fn()}
    />
  );
}

describe("ManuscriptEditorWorkspace — Stage 12 download buttons", () => {
  it("calls the real downloadDocx export when 'Download .DOCX' is clicked", async () => {
    mockDownloadDocx.mockResolvedValue(undefined);
    renderWorkspace();

    fireEvent.click(screen.getByText("Download .DOCX"));

    await waitFor(() => expect(mockDownloadDocx).toHaveBeenCalled());
    expect(mockDownloadPdf).not.toHaveBeenCalled();
  });

  it("calls the real downloadPdf export when 'Download .PDF' is clicked", async () => {
    mockDownloadPdf.mockResolvedValue(undefined);
    renderWorkspace();

    fireEvent.click(screen.getByText("Download .PDF"));

    await waitFor(() => expect(mockDownloadPdf).toHaveBeenCalled());
    expect(mockDownloadDocx).not.toHaveBeenCalled();
  });

  it("surfaces an error via alert and resets the loading state when the export throws", async () => {
    mockDownloadDocx.mockRejectedValue(new Error("Export failed"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderWorkspace();

    fireEvent.click(screen.getByText("Download .DOCX"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining("Export failed")));
    alertSpy.mockRestore();
  });
});
