// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import RevisionStage from "../stages/RevisionStage";
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
  projectId: "proj-revision-01",
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
    peer_review_critiques: JSON.stringify([
      {
        id: "crit-01",
        lens: "Methodological Rigor",
        section: "Section 2: Methodology",
        severity: "Major",
        feedback: "The computational complexity assumes balanced bipartite cardinality without proof.",
        revisionDirective: "Formalize Lemma 1 stating the pruned search complexity.",
        waived: false,
      },
      {
        id: "crit-02",
        lens: "Logical Flow & Coherence",
        section: "Section 1: Introduction",
        severity: "Moderate",
        feedback: "The transition between background and problem statement is abrupt.",
        revisionDirective: "Bridge the gap between multi-agent reasoning and epistemic divergence.",
        waived: false,
      },
      {
        id: "crit-03",
        lens: "Stylistic Register & Tone",
        section: "Section 4: Discussion",
        severity: "Advisory",
        feedback: "Use active scholarly tone in boundary condition descriptions.",
        revisionDirective: "Convert passive formulations to active assertions.",
        waived: true, // Waived
      },
    ]),
    manuscript_draft: JSON.stringify([
      {
        section: "Introduction",
        word_count: 32,
        content:
          "Autonomous reasoning architectures demonstrate an average variance reduction. However, deterministic bounds remain unaddressed in multi-agent configurations, which may compromise stability during adversarial divergence.",
      },
      {
        section: "Methodology",
        word_count: 22,
        content:
          "The computational complexity is assumed to scale linearly across participating agents under symmetric communications.",
      },
      {
        section: "Results",
        word_count: 24,
        content:
          "Evaluation against synthetic benchmark suites indicates a 94.2% fidelity rate. The empirical runtime exhibits minimal latency degradation across varying agent group sizes up to n=128.",
      },
      {
        section: "Discussion",
        word_count: 12,
        content: "Further research is necessary to evaluate high-noise sensor regimes.",
      },
    ]),
  },
};

describe("Stage 22: AI Revision (RevisionStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Stage 22 header, Phase IV badge, Grounding Foundation ribbon, critique queue, and initial state", () => {
    render(
      <RevisionStage
        stage="revision"
        projectId="proj-revision-01"
        project={mockProject}
      />
    );

    // Phase badge & Header
    expect(screen.getByText(/Phase IV: Peer Review • Stage 22 of 25/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /22\. AI Revision/i })).toBeInTheDocument();

    // Grounding Foundation ribbon
    expect(screen.getByText(/Grounding Foundation:/i)).toBeInTheDocument();
    expect(screen.getByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i)).toBeInTheDocument();
    expect(screen.getByText(/Nature Machine Intelligence/i)).toBeInTheDocument();
    expect(screen.getByText(/2 Active/i)).toBeInTheDocument(); // 2 active critiques (1 waived)

    // Critique Queue
    expect(screen.getByText(/Peer Review Critique Queue \(2 items to resolve\)/i)).toBeInTheDocument();
    expect(screen.getByText(/The computational complexity assumes balanced bipartite cardinality without proof\./i)).toBeInTheDocument();

    // CTA button
    expect(screen.getByRole("button", { name: /Begin Automated Revision Mapping/i })).toBeInTheDocument();
  });

  it("triggers revision agent with streaming logs, progress indicator, and DOES NOT auto-advance", async () => {
    const onAdvanceMock = vi.fn();

    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("log", { message: "Mapping critiques to sections..." });
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "patch-stream-01",
              section: "Methodology",
              critiqueLens: "Methodological Rigor",
              severity: "Major",
              find: "The computational complexity is assumed to scale linearly across participating agents under symmetric communications.",
              replace:
                "To substantiate tractability, we establish Lemma 1: Under symmetric sparse communication topologies, the bipartite matching operator terminates in O(V · E log V) steps, strictly bounding computational overhead and preventing algorithmic stall.",
              explanation: "Formalizes asymptotic runtime bounds and establishes Lemma 1.",
              accepted: true,
            },
            {
              id: "patch-stream-02",
              section: "Introduction",
              critiqueLens: "Logical Flow & Coherence",
              severity: "Major",
              find: "Autonomous reasoning architectures demonstrate an average variance reduction. However, deterministic bounds remain unaddressed in multi-agent configurations, which may compromise stability during adversarial divergence.",
              replace:
                "Autonomous reasoning architectures demonstrate reproducible variance reduction across multi-agent benchmarks. Crucially, established formalisms fail to guarantee deterministic convergence bounds in decentralized synthesis—inducing systemic failure modes under adversarial epistemic divergence.",
              explanation: "Clarifies causal link between decentralized agent interaction and epistemic instability.",
              accepted: true,
            },
          ],
        });
      }
    );

    render(
      <RevisionStage
        stage="revision"
        projectId="proj-revision-01"
        project={mockProject}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Automated Revision Mapping/i }));

    await waitFor(() => {
      expect(screen.getByText(/Patches Generated/i)).toBeInTheDocument();
    });

    // HUD metrics
    expect(screen.getAllByText(/Patches Accepted/i).length).toBeGreaterThan(0);
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(screen.getByText(/Net Word Delta/i)).toBeInTheDocument();

    // Verify rendered diffs
    expect(screen.getAllByText(/Original Manuscript Excerpt/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Proposed Revision Patch/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/To substantiate tractability, we establish Lemma 1/i)).toBeInTheDocument();

    // Critical assertion: NO auto-advance after timeout
    await new Promise((r) => setTimeout(r, 400));
    expect(onAdvanceMock).not.toHaveBeenCalled();
  });

  it("proposes no patches and says so when the revision agent fails", async () => {
    // Rewritten 2026-10-29: this used to assert four locally invented patches
    // ("…we establish Lemma 1…") appearing on network failure.
    (authedStreamFetch as any).mockRejectedValue(new Error("Network drop during revision stream"));

    render(
      <RevisionStage
        stage="revision"
        projectId="proj-revision-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Automated Revision Mapping/i }));

    await waitFor(() => {
      expect(screen.getByText(/Revision agent unavailable: nothing was changed/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/To substantiate tractability, we establish Lemma 1/i)).not.toBeInTheDocument();
  });

  it("allows toggling patch acceptance (accept, revert) and updates HUD count and bulk actions", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "p1",
              section: "Methodology",
              find: "The computational complexity is assumed to scale linearly across participating agents under symmetric communications.",
              replace: "Revised methodology text here.",
              explanation: "Explanation 1.",
              accepted: true,
            },
            {
              id: "p2",
              section: "Results",
              find: "Further research is necessary to evaluate high-noise sensor regimes.",
              replace: "Revised results text here.",
              explanation: "Explanation 2.",
              accepted: true,
            },
          ],
        });
      }
    );

    render(
      <RevisionStage
        stage="revision"
        projectId="proj-revision-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Automated Revision Mapping/i }));

    await waitFor(() => {
      expect(screen.getByText("2/2")).toBeInTheDocument();
    });

    // Revert patch 1
    const revertButtons = screen.getAllByRole("button", { name: /Revert to Original/i });
    fireEvent.click(revertButtons[0]);

    expect(screen.getByText("1/2")).toBeInTheDocument();

    // Re-accept patch 1
    const acceptButton = screen.getByRole("button", { name: /Accept Patch/i });
    fireEvent.click(acceptButton);

    expect(screen.getByText("2/2")).toBeInTheDocument();

    // Bulk actions
    const revertAllBtn = screen.getByRole("button", { name: /Revert All Patches/i });
    fireEvent.click(revertAllBtn);
    expect(screen.getByText("0/2")).toBeInTheDocument();

    const acceptAllBtn = screen.getByRole("button", { name: /Accept All Patches/i });
    fireEvent.click(acceptAllBtn);
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("allows author inline editing of a replacement patch", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "p-edit",
              section: "Methodology",
              find: "The computational complexity is assumed to scale linearly across participating agents under symmetric communications.",
              replace: "Standard replacement text.",
              explanation: "Explanation.",
              accepted: true,
            },
          ],
        });
      }
    );

    render(
      <RevisionStage
        stage="revision"
        projectId="proj-revision-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Automated Revision Mapping/i }));

    await waitFor(() => {
      expect(screen.getByText(/Standard replacement text\./i)).toBeInTheDocument();
    });

    // Click Edit Revision
    const editBtn = screen.getByRole("button", { name: /Edit Revision/i });
    fireEvent.click(editBtn);

    // Edit the text area
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Author tailored Lemma 1.1 proof." } });

    // Click Save Revision
    const saveBtn = screen.getByRole("button", { name: /Save Revision/i });
    fireEvent.click(saveBtn);

    // Verify updated text and Author Edited badge
    expect(screen.getByText(/Author tailored Lemma 1\.1 proof\./i)).toBeInTheDocument();
    expect(screen.getByText(/Author Edited/i)).toBeInTheDocument();
  });

  it("switches view between 'Patch Diff Workbench' and 'Assembled Manuscript Preview'", async () => {
    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "p-view",
              section: "Introduction",
              find: "Autonomous reasoning architectures demonstrate an average variance reduction. However, deterministic bounds remain unaddressed in multi-agent configurations, which may compromise stability during adversarial divergence.",
              replace: "Autonomous reasoning architectures demonstrate reproducible bounds.",
              explanation: "Explanation.",
              accepted: true,
            },
          ],
        });
      }
    );

    render(
      <RevisionStage
        stage="revision"
        projectId="proj-revision-01"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Automated Revision Mapping/i }));

    await waitFor(() => {
      expect(screen.getByText(/Original Manuscript Excerpt/i)).toBeInTheDocument();
    });

    // Switch to Assembled Manuscript Preview
    const previewTab = screen.getByRole("button", { name: /Assembled Manuscript Preview/i });
    fireEvent.click(previewTab);

    expect(screen.getByText(/Manuscript Assembled with Accepted Patches/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Provable Provenance Bounds in Autonomous Scientific Reasoning/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Autonomous reasoning architectures demonstrate reproducible bounds\./i)).toBeInTheDocument();

    // Switch back to Patch Diff Workbench
    const diffTab = screen.getByRole("button", { name: /Patch Diff Workbench/i });
    fireEvent.click(diffTab);

    expect(screen.getByText(/Original Manuscript Excerpt/i)).toBeInTheDocument();
  });

  it("advances to Stage 23 (final_editor) upon deliberate user approval and persists updated draft and patches to project answers", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    (authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "p-adv",
              section: "Methodology",
              find: "The computational complexity is assumed to scale linearly across participating agents under symmetric communications.",
              replace: "Strict asymptotic proof establishing Lemma 1.",
              explanation: "Addressed rigor critique.",
              accepted: true,
            },
          ],
        });
      }
    );

    render(
      <RevisionStage
        stage="revision"
        projectId="proj-revision-01"
        project={mockProject}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Begin Automated Revision Mapping/i }));

    await waitFor(() => {
      expect(screen.getByText(/Patches Generated/i)).toBeInTheDocument();
    });

    // Advance button in sticky dock
    const advanceBtn = screen.getByRole("button", {
      name: /Approve Revisions & Proceed to Final Editor →/i,
    });
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-revision-01",
        expect.objectContaining({
          manuscript_draft: expect.any(String),
          revision_patches: expect.any(String),
          revision_completed: "true",
          revision_status: "approved",
        })
      );
      expect(onSavedMock).toHaveBeenCalled();
      expect(onAdvanceMock).toHaveBeenCalledWith("final_editor");
    });
  });
});
