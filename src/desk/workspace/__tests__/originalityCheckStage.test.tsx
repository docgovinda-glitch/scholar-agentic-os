// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import OriginalityCheckStage from "../stages/OriginalityCheckStage";
import type { ProjectView } from "../../types";

// Mock API
vi.mock("../../api", () => ({
  authedStreamFetch: vi.fn(),
  saveIntakeAnswers: vi.fn().mockResolvedValue({ ok: true }),
}));

import { authedStreamFetch, saveIntakeAnswers } from "../../api";

const mockProject: ProjectView = {
  projectId: "proj-orig-check-01",
  outputTypeId: "journal_article",
  intakeCompleteness: 0.95,
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
        section: "Introduction",
        word_count: 900,
        content: "Autonomous reasoning architectures demonstrate an average variance reduction of 28.4%.",
      },
      {
        section: "Methodology",
        word_count: 1400,
        content: "We formulate the verification problem as a deterministic bipartite matching operator.",
      },
    ]),
    journal_requirements_extracted: JSON.stringify({
      maxSimilarity: 15,
    }),
  },
};

describe("Stage 19: Originality & Academic Integrity Check (OriginalityCheckStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Stage 19 header, Phase III badge, Grounding Foundation ribbon, and initial state", () => {
    render(
      <OriginalityCheckStage
        stage="originality_check"
        projectId="proj-orig-check-01"
        project={mockProject}
      />
    );

    // Header & phase badge
    expect(screen.getByText(/Phase III: Manuscript Drafting • Stage 19 of 25/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /19\. Originality Check/i })).toBeInTheDocument();

    // Grounding ribbon
    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i)).toBeInTheDocument();
    expect(screen.getByText(/Nature Machine Intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/Tolerance Cap:/i)).toBeInTheDocument();
    expect(screen.getByText(/< 15% Overlap/i)).toBeInTheDocument();

    // Initial action prompt
    expect(screen.getByText(/Ready for Academic Originality & Overlap Verification/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Begin Originality Scan/i })).toBeInTheDocument();
  });

  it("triggers originality scan agent, streams results, renders HUD, and DOES NOT auto-advance", async () => {
    const onAdvanceMock = vi.fn();

    (authedStreamFetch as any).mockImplementation(
      async (url: string, method: string, body: any, onChunk: any) => {
        onChunk("log", { message: "Executing 16-gram shingle overlap analysis..." });
        onChunk("done", {
          ok: true,
          data: {
            score: 95,
            flags: [
              {
                id: "flag-stream-01",
                section: "Introduction",
                issue: "Conventional Academic Phrasing",
                severity: "low",
                similarity: 2.2,
                snippet: "In recent years, the rapid proliferation of generative multi-agent systems has underscored the necessity for rigorous evaluation.",
                matchedSource: "ACM Computing Surveys (2023 Review Article)",
                suggestion: "Recast opening claim with direct empirical grounding.",
              },
            ],
          },
        });
      }
    );

    render(
      <OriginalityCheckStage
        stage="originality_check"
        projectId="proj-orig-check-01"
        project={mockProject}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Originality Scan/i }));

    // Await scan completion
    await waitFor(() => {
      expect(screen.getByText(/^Originality Score$/i)).toBeInTheDocument();
    });

    // Verify HUD metrics
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText(/Publication Safe/i)).toBeInTheDocument();
    expect(screen.getByText(/Below 15% tolerance/i)).toBeInTheDocument();

    // Verify flag rendered
    expect(screen.getByText(/Conventional Academic Phrasing/i)).toBeInTheDocument();
    expect(screen.getByText(/ACM Computing Surveys \(2023 Review Article\)/i)).toBeInTheDocument();

    // Critical assertion: NO auto-advance after timeout
    await new Promise((r) => setTimeout(r, 400));
    expect(onAdvanceMock).not.toHaveBeenCalled();
  });

  it("engages local fallback scanning engine when stream fails and generates valid report", async () => {
    (authedStreamFetch as any).mockRejectedValue(new Error("Network drop during originality check stream"));

    render(
      <OriginalityCheckStage
        stage="originality_check"
        projectId="proj-orig-check-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Originality Scan/i }));

    await waitFor(() => {
      expect(screen.getByText(/^Originality Score$/i)).toBeInTheDocument();
    });

    expect(screen.getByText("96%")).toBeInTheDocument();
    expect(screen.getByText(/Standard Mathematical Formulation Overlap/i)).toBeInTheDocument();
    expect(screen.getByText(/IEEE Transactions on Information Theory/i)).toBeInTheDocument();
  });

  it("filters flags by tab (All, Unresolved, Resolved) and searches by query", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: {
            score: 94,
            flags: [
              {
                id: "f1",
                section: "Introduction",
                issue: "Alpha Overlap Issue",
                snippet: "Alpha snippet phrasing",
                suggestion: "Fix alpha",
              },
              {
                id: "f2",
                section: "Methodology",
                issue: "Beta Overlap Issue",
                snippet: "Beta snippet phrasing",
                suggestion: "Fix beta",
              },
            ],
          },
        });
      }
    );

    render(
      <OriginalityCheckStage
        stage="originality_check"
        projectId="proj-orig-check-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Originality Scan/i }));

    await waitFor(() => {
      expect(screen.getByText(/Alpha Overlap Issue/i)).toBeInTheDocument();
    });

    // Search for Beta
    const searchInput = screen.getByPlaceholderText(/Filter snippets or issues/i);
    fireEvent.change(searchInput, { target: { value: "Beta" } });

    expect(screen.getByText(/Beta Overlap Issue/i)).toBeInTheDocument();
    expect(screen.queryByText(/Alpha Overlap Issue/i)).not.toBeInTheDocument();
  });

  it("interactively remediates flag with AI Paraphrase and Whitelist Terminology", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: {
            score: 95,
            flags: [
              {
                id: "flag-interactive-01",
                section: "Methodology",
                issue: "Standard Formulation Overlap",
                snippet: "Standard formulation text.",
                suggestion: "Paraphrase or whitelist.",
              },
            ],
          },
        });
      }
    );

    render(
      <OriginalityCheckStage
        stage="originality_check"
        projectId="proj-orig-check-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Originality Scan/i }));

    await waitFor(() => {
      expect(screen.getByText(/Standard Formulation Overlap/i)).toBeInTheDocument();
    });

    // Click Apply AI Paraphrase
    const paraphraseBtn = screen.getByRole("button", { name: /Apply AI Paraphrase/i });
    fireEvent.click(paraphraseBtn);

    expect(screen.getByText(/Remediated Manuscript Formulation:/i)).toBeInTheDocument();
    expect(screen.getByText(/Resolved \(paraphrased\)/i)).toBeInTheDocument();

    // Click Undo
    const undoBtn = screen.getByRole("button", { name: /Undo/i });
    fireEvent.click(undoBtn);

    expect(screen.queryByText(/Remediated Manuscript Formulation:/i)).not.toBeInTheDocument();

    // Whitelist Terminology
    const whitelistBtn = screen.getByRole("button", { name: /Whitelist Terminology/i });
    fireEvent.click(whitelistBtn);

    expect(screen.getByText(/Resolved \(whitelisted\)/i)).toBeInTheDocument();
  });

  it("advances to Stage 20 (draft_preview) upon deliberate user confirmation and persists report", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: {
            score: 97,
            flags: [],
          },
        });
      }
    );

    render(
      <OriginalityCheckStage
        stage="originality_check"
        projectId="proj-orig-check-01"
        project={mockProject}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Originality Scan/i }));

    await waitFor(() => {
      expect(screen.getByText(/^Originality Score$/i)).toBeInTheDocument();
    });

    // Click deliberate advance button
    const advanceBtn = screen.getByRole("button", {
      name: /Confirm Originality Attestation & Proceed to Draft Preview/i,
    });
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-orig-check-01",
        expect.objectContaining({
          originality_report: expect.any(String),
          originality_score: "97",
          originality_signed_off_at: expect.any(String),
        })
      );
      expect(onSavedMock).toHaveBeenCalled();
      expect(onAdvanceMock).toHaveBeenCalledWith("draft_preview");
    });
  });
});
