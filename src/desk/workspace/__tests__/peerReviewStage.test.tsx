// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import PeerReviewStage from "../stages/PeerReviewStage";
import type { ProjectView } from "../../types";

// Mock API
vi.mock("../../api", () => ({
  authedFetch: vi.fn().mockResolvedValue({ ok: true }),
  authedJsonFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [] }),
  }),
  authedStreamFetch: vi.fn(),
  saveIntakeAnswers: vi.fn().mockResolvedValue({ ok: true }),
}));

import { authedStreamFetch, saveIntakeAnswers } from "../../api";

const mockProject: ProjectView = {
  projectId: "proj-peer-review-01",
  outputTypeId: "journal_article",
  intakeCompleteness: 0.98,
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
        word_count: 850,
        content: "Autonomous reasoning architectures demonstrate an average variance reduction.",
      },
      {
        section: "Methodology",
        word_count: 1200,
        content: "We formulate the verification problem as a deterministic bipartite matching operator.",
      },
    ]),
    originality_score: "96",
  },
};

describe("Stage 21: AI Peer Review (PeerReviewStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Stage 21 header, Phase IV badge, Grounding Foundation ribbon, and initial state", () => {
    render(
      <PeerReviewStage
        stage="peer_review"
        projectId="proj-peer-review-01"
        project={mockProject}
      />
    );

    // Header & phase badge
    expect(screen.getByText(/Phase IV: Peer Review • Stage 21 of 25/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /21\. AI Peer Review/i })).toBeInTheDocument();

    // Grounding ribbon
    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i)).toBeInTheDocument();
    expect(screen.getByText(/Nature Machine Intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/96%/i)).toBeInTheDocument();

    // Initial prompt
    expect(screen.getByText(/Ready for 7-Lens Academic Peer Review/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Begin 7-Lens Critique/i })).toBeInTheDocument();
  });

  it("triggers 7-lens critique agent with streaming logs, progress indicator, and DOES NOT auto-advance", async () => {
    const onAdvanceMock = vi.fn();

    (authedStreamFetch as any).mockImplementation(
      async (url: string, method: string, body: any, onChunk: any) => {
        onChunk("log", { message: "Evaluating Lens 1/7: [Logical Flow & Coherence]..." });
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "crit-stream-01",
              lens: "Methodological Rigor",
              section: "Section 2: Methodology",
              severity: "Major",
              feedback: "The asymptotic runtime analysis assumes balanced bipartite cardinality.",
              revisionDirective: "Formalize Lemma 1 stating the pruned search complexity.",
            },
            {
              id: "crit-stream-02",
              lens: "Argument Strength & Falsifiability",
              section: "Section 4: Discussion",
              severity: "Moderate",
              feedback: "The manuscript does not adequately discuss threats to validity.",
              revisionDirective: "Add Threats to Validity subsection.",
            },
          ],
        });
      }
    );

    render(
      <PeerReviewStage
        stage="peer_review"
        projectId="proj-peer-review-01"
        project={mockProject}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin 7-Lens Critique/i }));

    await waitFor(() => {
      expect(screen.getByText(/^Recommendation$/i)).toBeInTheDocument();
    });

    // Verify HUD metrics
    expect(screen.getByText(/Minor Revisions/i)).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);

    // Verify rendered critiques
    expect(screen.getByText(/The asymptotic runtime analysis assumes balanced bipartite cardinality./i)).toBeInTheDocument();
    expect(screen.getByText(/The manuscript does not adequately discuss threats to validity./i)).toBeInTheDocument();

    // Critical assertion: NO auto-advance after timeout
    await new Promise((r) => setTimeout(r, 400));
    expect(onAdvanceMock).not.toHaveBeenCalled();
  });

  it("generates no critiques and says so when the AI review fails", async () => {
    // Rewritten 2026-10-29: this used to assert seven locally invented
    // "reviewer" critiques appearing on network failure.
    (authedStreamFetch as any).mockRejectedValue(new Error("Network drop during peer review stream"));

    render(
      <PeerReviewStage
        stage="peer_review"
        projectId="proj-peer-review-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin 7-Lens Critique/i }));

    await waitFor(() => {
      expect(screen.getByText(/AI review unavailable: nothing was generated/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/^Recommendation$/i)).not.toBeInTheDocument();
  });

  it("filters critiques by status (Active, Waived) and by Lens dropdown", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "c1",
              lens: "Methodological Rigor",
              severity: "Major",
              feedback: "Rigor feedback Alpha.",
              waived: false,
            },
            {
              id: "c2",
              lens: "Stylistic Register & Tone",
              severity: "Advisory",
              feedback: "Stylistic feedback Beta.",
              waived: true,
            },
          ],
        });
      }
    );

    render(
      <PeerReviewStage
        stage="peer_review"
        projectId="proj-peer-review-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin 7-Lens Critique/i }));

    await waitFor(() => {
      expect(screen.getByText(/Rigor feedback Alpha/i)).toBeInTheDocument();
    });

    // Filter to Active
    const activeBtn = screen.getByRole("button", { name: /^Active/i });
    fireEvent.click(activeBtn);

    expect(screen.getByText(/Rigor feedback Alpha/i)).toBeInTheDocument();
    expect(screen.queryByText(/Stylistic feedback Beta/i)).not.toBeInTheDocument();

    // Filter to Waived
    const waivedBtn = screen.getByRole("button", { name: /^Waived/i });
    fireEvent.click(waivedBtn);

    expect(screen.getByText(/Stylistic feedback Beta/i)).toBeInTheDocument();
    expect(screen.queryByText(/Rigor feedback Alpha/i)).not.toBeInTheDocument();
  });

  it("interactively waives critique, restores critique, and saves author rebuttal note", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "c-interactive",
              lens: "Methodological Rigor",
              severity: "Major",
              feedback: "Asymmetric partition analysis requires bounds.",
              waived: false,
            },
          ],
        });
      }
    );

    render(
      <PeerReviewStage
        stage="peer_review"
        projectId="proj-peer-review-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin 7-Lens Critique/i }));

    await waitFor(() => {
      expect(screen.getByText(/Asymmetric partition analysis requires bounds/i)).toBeInTheDocument();
    });

    // Click Waive Critique
    const waiveBtn = screen.getByRole("button", { name: /Waive Critique/i });
    fireEvent.click(waiveBtn);

    expect(screen.getByRole("button", { name: /Restore Critique/i })).toBeInTheDocument();

    // Restore
    const restoreBtn = screen.getByRole("button", { name: /Restore Critique/i });
    fireEvent.click(restoreBtn);

    expect(screen.getByRole("button", { name: /Waive Critique/i })).toBeInTheDocument();

    // Add Author Rebuttal
    const addNoteBtn = screen.getByRole("button", { name: /\+ Add Author Rebuttal/i });
    fireEvent.click(addNoteBtn);

    const noteInput = screen.getByPlaceholderText(/Add author response or rebuttal directive/i);
    fireEvent.change(noteInput, { target: { value: "Addressed in revised Lemma 1.2" } });

    const saveNoteBtn = screen.getByRole("button", { name: /Save Note/i });
    fireEvent.click(saveNoteBtn);

    expect(screen.getByText(/Lead Investigator Rebuttal \/ Note:/i)).toBeInTheDocument();
    expect(screen.getByText(/Addressed in revised Lemma 1\.2/i)).toBeInTheDocument();
  });

  it("advances to Stage 22 (revision) upon deliberate user approval and persists critiques to project answers", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "c-adv",
              lens: "Methodological Rigor",
              severity: "Moderate",
              feedback: "Rigor feedback.",
            },
          ],
        });
      }
    );

    render(
      <PeerReviewStage
        stage="peer_review"
        projectId="proj-peer-review-01"
        project={mockProject}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin 7-Lens Critique/i }));

    await waitFor(() => {
      expect(screen.getByText(/^Recommendation$/i)).toBeInTheDocument();
    });

    // Advance button in sticky dock
    const advanceBtn = screen.getByRole("button", {
      name: /Approve Critiques & Proceed to AI Revision/i,
    });
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-peer-review-01",
        expect.objectContaining({
          peer_review_critiques: expect.any(String),
          peer_review_completed: "true",
          peer_review_status: "ready",
        })
      );
      expect(onSavedMock).toHaveBeenCalled();
      expect(onAdvanceMock).toHaveBeenCalledWith("revision");
    });
  });
});
