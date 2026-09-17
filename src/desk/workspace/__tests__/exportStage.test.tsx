// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import ExportStage from "../stages/ExportStage";
import type { ProjectView } from "../../types";

// Mock API
vi.mock("../../api", () => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true }),
  authedJsonFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      ok: true,
      data: {
        success: true,
        pdfUrl: "/downloads/test.pdf",
      },
    }),
    blob: async () => new Blob(["% Mock PDF Content"], { type: "application/pdf" }),
  }),
  saveIntakeAnswers: vi.fn().mockResolvedValue({ ok: true }),
}));

import { authedJsonFetch, saveIntakeAnswers } from "../../api";

const mockProject: ProjectView = {
  projectId: "proj-export-01",
  outputTypeId: "journal_article",
  intakeCompleteness: 1.0,
  hasDocument: true,
  hasJournalRequirements: true,
  authors: [],
  gates: [],
  answers: {
    working_title: "Provable Provenance Bounds in Autonomous Scientific Reasoning",
    anchor_gap_id: "gap-attr-01",
    identified_gaps: JSON.stringify([
      {
        id: "gap-attr-01",
        title: "Deterministic provenance verification in multi-agent synthesis",
      },
    ]),
    selected_journal_name: "Nature Machine Intelligence",
    assembled_draft: `# Provable Provenance Bounds in Autonomous Scientific Reasoning\n\n## Abstract\nAutonomous scientific reasoning under provable bounds.\n\n## 1. Introduction\nMulti-agent synthesis workflows require continuous verification.`,
  },
};

describe("Stage 25: Format & Export (ExportStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
  });

  it("renders Stage 25 header, Phase V finale badge, Grounding Foundation ribbon, and template selectors", () => {
    render(
      <ExportStage
        stage="export"
        projectId="proj-export-01"
        project={mockProject}
      />
    );

    // Header & Phase badge
    expect(screen.getByText(/Phase V: Publication • Stage 25 of 25 \(Final Stage\)/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /25\. Format & Export/i })).toBeInTheDocument();

    // Grounding ribbon
    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Nature Machine Intelligence/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/100% Certified/i)).toBeInTheDocument();

    // Templates
    expect(screen.getAllByText(/Nature \/ Springer SN-JNL/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/IEEE Transactions \/ Conference/i)).toBeInTheDocument();
    expect(screen.getByText(/ACM Conference \(acmart\)/i)).toBeInTheDocument();
    expect(screen.getByText(/APA 7th Edition Style/i)).toBeInTheDocument();
    expect(screen.getByText(/Modern Typst Academic/i)).toBeInTheDocument();
  });

  it("triggers typesetting compilation and renders download cards for all 4 primary formats without auto-advancing", async () => {
    const onAdvanceMock = vi.fn();

    render(
      <ExportStage
        stage="export"
        projectId="proj-export-01"
        project={mockProject}
        onAdvance={onAdvanceMock}
      />
    );

    // Click Generate Camera-Ready Package
    const compileBtn = screen.getByRole("button", { name: /Generate Camera-Ready Package/i });
    fireEvent.click(compileBtn);

    await waitFor(() => {
      expect(screen.getByText(/Camera-Ready Typesetting Complete/i)).toBeInTheDocument();
    });

    // 4 download cards
    expect(screen.getByText(/Camera-Ready PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/LaTeX Source \(\.tex\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Typst Source \(\.typ\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Word \(\.docx\)/i)).toBeInTheDocument();

    // Dossier button
    expect(screen.getByRole("button", { name: /Download Complete Dossier \(ZIP\)/i })).toBeInTheDocument();

    // Critical assertion: NO auto-advance after timeout
    await new Promise((r) => setTimeout(r, 400));
    expect(onAdvanceMock).not.toHaveBeenCalled();
  });

  it("allows switching academic template and recompiling", async () => {
    render(
      <ExportStage
        stage="export"
        projectId="proj-export-01"
        project={mockProject}
      />
    );

    // Select IEEE template
    const ieeeBtn = screen.getByRole("button", { name: /IEEE Transactions \/ Conference/i });
    fireEvent.click(ieeeBtn);

    expect(screen.getByText(/Selected: IEEE Transactions \/ Conference/i)).toBeInTheDocument();

    // Compile
    fireEvent.click(screen.getByRole("button", { name: /Generate Camera-Ready Package/i }));

    await waitFor(() => {
      expect(screen.getByText(/Camera-Ready Typesetting Complete/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Formatted strictly to IEEE Transactions \/ Conference specifications/i)).toBeInTheDocument();
  });

  it("triggers file downloads for each export format", async () => {
    render(
      <ExportStage
        stage="export"
        projectId="proj-export-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate Camera-Ready Package/i }));

    await waitFor(() => {
      expect(screen.getByText(/Camera-Ready Typesetting Complete/i)).toBeInTheDocument();
    });

    // Trigger PDF download
    const pdfBtn = screen.getByRole("button", { name: /Download PDF/i });
    fireEvent.click(pdfBtn);

    // Trigger LaTeX download
    const latexBtn = screen.getByRole("button", { name: /Download \.tex/i });
    fireEvent.click(latexBtn);

    // Trigger Typst download
    const typstBtn = screen.getByRole("button", { name: /Download \.typ/i });
    fireEvent.click(typstBtn);

    // Trigger Word download
    const docxBtn = screen.getByRole("button", { name: /Download \.docx/i });
    fireEvent.click(docxBtn);

    await waitFor(() => {
      expect(window.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it("finalizes workspace upon user clicking Complete Research button", async () => {
    const onSavedMock = vi.fn();

    render(
      <ExportStage
        stage="export"
        projectId="proj-export-01"
        project={mockProject}
        onSaved={onSavedMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate Camera-Ready Package/i }));

    await waitFor(() => {
      expect(screen.getByText(/Journal Article Workspace: 25 of 25 Stages 100% Completed/i)).toBeInTheDocument();
    });

    // Finalize button in bottom dock
    const finalizeBtn = screen.getByRole("button", {
      name: /Complete Research & Finalize Workspace ✓/i,
    });
    fireEvent.click(finalizeBtn);

    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-export-01",
        expect.objectContaining({
          export_completed: "true",
          workspace_status: "completed",
          workspace_all_stages_completed: "true",
        })
      );
      expect(onSavedMock).toHaveBeenCalled();
    });
  });
});
