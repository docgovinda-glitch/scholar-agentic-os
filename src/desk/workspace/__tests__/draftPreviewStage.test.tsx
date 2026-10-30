// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import DraftPreviewStage from "../stages/DraftPreviewStage";
import type { ProjectView } from "../../types";

// Mock API
vi.mock("../../api", () => ({
  authedStreamFetch: vi.fn(),
  saveIntakeAnswers: vi.fn().mockResolvedValue({ ok: true }),
}));

import { authedStreamFetch, saveIntakeAnswers } from "../../api";

const mockProject: ProjectView = {
  projectId: "proj-preview-01",
  outputTypeId: "journal_article",
  intakeCompleteness: 0.98,
  hasDocument: true,
  hasJournalRequirements: true,
  authors: [
    {
      id: "a-1",
      firstName: "Dr. Eleanor",
      surname: "Vance",
      email: "vance@scholar.org",
      isCorresponding: true,
      creditRoles: ["Conceptualization", "Methodology"],
    },
  ],
  gates: [],
  answers: {
    working_title: "Provable Provenance Bounds in Autonomous Scientific Reasoning",
    anchor_gap_id: "gap-attr-01",
    identified_gaps: JSON.stringify([
      {
        id: "gap-attr-01",
        title: "Absence of deterministic provenance verification in multi-agent synthesis",
      },
    ]),
    selected_journal_name: "Nature Machine Intelligence",
    approved_vault_sources: JSON.stringify([
      {
        id: "v-01",
        title: "Empirical Grounding in Autonomous Academic Synthesis",
        authors: "Vaswani, A. et al.",
        year: 2024,
      },
    ]),
    approved_external_sources: JSON.stringify([
      {
        id: "ext-01",
        title: "Addressing Methodological Latency in Distributed Consensus",
        authors: "Lamport, L. et al.",
        year: 2023,
      },
    ]),
    manuscript_draft: JSON.stringify([
      {
        section: "Abstract",
        word_count: 180,
        content: "Contemporary scientific research environments increasingly leverage autonomous language models.",
      },
      {
        section: "1. Introduction",
        word_count: 750,
        content: "The rapid emergence of agentic reasoning architectures has fundamentally altered computation.",
      },
      {
        section: "2. Methodology",
        word_count: 1200,
        content: "We formalize the manuscript synthesis pipeline through a multi-tiered tripartite architecture.",
      },
      {
        section: "3. Results",
        word_count: 980,
        content: "Experimental results across 50,000 synthesized tokens confirmed 3.4x throughput acceleration.",
      },
    ]),
    originality_score: "98",
    citation_audit_report: JSON.stringify([
      { id: "c1", status: "verified" },
      { id: "c2", status: "verified" },
    ]),
  },
};

describe("Stage 20: Manuscript Assembly & Pre-Review Inspection (DraftPreviewStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders Stage 20 header, Phase III conclusion badge, Grounding Foundation ribbon, and initial assembled state", () => {
    render(
      <DraftPreviewStage
        stage="draft_preview"
        projectId="proj-preview-01"
        project={mockProject}
      />
    );

    // Header & phase badge
    expect(screen.getByText(/Phase III: Manuscript Drafting • Stage 20 of 25 \(Phase Conclusion\)/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /20\. Draft Preview/i })).toBeInTheDocument();

    // Grounding ribbon
    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Nature Machine Intelligence/i).length).toBeGreaterThan(0);
    // The badge shows the project's own originality score, with no "certified" claim.
    expect(screen.getByText(/^98%$/)).toBeInTheDocument();

    // Author block in preview
    expect(screen.getByText(/Dr\. Eleanor Vance/i)).toBeInTheDocument();
  });

  it("displays Pre-Review Readiness Charter checklist verifying all 6 checkpoints", () => {
    render(
      <DraftPreviewStage
        stage="draft_preview"
        projectId="proj-preview-01"
        project={mockProject}
      />
    );

    expect(screen.getByText(/Phase III Pre-Review Readiness Charter/i)).toBeInTheDocument();
    expect(screen.getByText(/Manuscript Specification Charter/i)).toBeInTheDocument();
    expect(screen.getByText(/Primary Evidence & Vault Corpus/i)).toBeInTheDocument();
    expect(screen.getByText(/Target Journal Formatting Rules/i)).toBeInTheDocument();
    expect(screen.getByText(/Structural Section Completeness/i)).toBeInTheDocument();
    expect(screen.getByText(/Citation Provenance Audit/i)).toBeInTheDocument();
    expect(screen.getByText(/2 claims in your citation audit/i)).toBeInTheDocument();
    expect(screen.getByText(/98% originality \(from your originality check\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Academic Originality & Overlap Clearance/i)).toBeInTheDocument();
  });

  it("shows an empty project as empty: no demo manuscript, journal or passed checks", () => {
    render(
      <DraftPreviewStage
        stage="draft_preview"
        projectId="proj-preview-empty"
        project={{ ...mockProject, answers: {} }}
      />
    );

    expect(screen.queryByText(/Vaswani/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nature Machine Intelligence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/28\.4%|98\.6%/)).not.toBeInTheDocument();
    expect(screen.getByText(/Not checked/i)).toBeInTheDocument();
    expect(screen.getByText(/Citation audit not run yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Originality check not run yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No manuscript sections yet/i)).toBeInTheDocument();
  });

  it("renders dual-column outline navigator and allows jumping across sections", () => {
    render(
      <DraftPreviewStage
        stage="draft_preview"
        projectId="proj-preview-01"
        project={mockProject}
      />
    );

    expect(screen.getByText(/Manuscript Outline/i)).toBeInTheDocument();

    // Verify sections in outline
    const outlineItems = screen.getAllByRole("button");
    const introButton = outlineItems.find((b) => b.textContent?.includes("1. Introduction"));
    expect(introButton).toBeDefined();

    if (introButton) {
      fireEvent.click(introButton);
    }

    // Abstract box keywords
    expect(screen.getByText(/Keywords:/i)).toBeInTheDocument();
  });

  it("triggers preview re-render agent with live terminal logs", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("log", { message: "Re-compiling manuscript with typesetting..." });
        onChunk("done", {
          ok: true,
          data: {
            content: "## Abstract\n\nRe-rendered abstract.\n\n## 1. Introduction\n\nRe-rendered intro.",
            pages: 8,
            status: "Ready",
          },
        });
      }
    );

    render(
      <DraftPreviewStage
        stage="draft_preview"
        projectId="proj-preview-01"
        project={mockProject}
      />
    );

    const reRenderBtn = screen.getByRole("button", { name: /Re-Render Preview/i });
    fireEvent.click(reRenderBtn);

    await waitFor(() => {
      expect(screen.getByText(/Re-compiling manuscript with typesetting/i)).toBeInTheDocument();
    });
  });

  it("copies full manuscript markdown to clipboard with feedback", async () => {
    render(
      <DraftPreviewStage
        stage="draft_preview"
        projectId="proj-preview-01"
        project={mockProject}
      />
    );

    const copyBtn = screen.getByRole("button", { name: /Copy Markdown/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/Copied Markdown!/i)).toBeInTheDocument();
    });
  });

  it("seals Phase III and advances to Stage 21 (peer_review) upon deliberate user action", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    render(
      <DraftPreviewStage
        stage="draft_preview"
        projectId="proj-preview-01"
        project={mockProject}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    // Deliberate advance button in sticky dock
    const sealBtn = screen.getByRole("button", {
      name: /Seal Phase III & Dispatch to AI Peer Review/i,
    });
    fireEvent.click(sealBtn);

    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-preview-01",
        expect.objectContaining({
          draft_preview_certified: "true",
          phase_3_completed: "true",
          ready_for_peer_review: "true",
        })
      );
      expect(onSavedMock).toHaveBeenCalled();
      expect(onAdvanceMock).toHaveBeenCalledWith("peer_review");
    });
  });
});
