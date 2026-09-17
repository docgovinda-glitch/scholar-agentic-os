// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DraftStage from "../stages/DraftStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  authedStreamFetch: vi.fn(),
  saveIntakeAnswers: vi.fn(),
}));

const mockProjectWithCharterAndRules: ProjectView = {
  projectId: "proj-draft-1701",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
    primary_research_question: "How do dynamic quorum adjustments preserve throughput during WAN splits?",
    research_area: "Computer Science & Distributed Systems",
    article_type: "Original Research",
    study_design: "Empirical Benchmarking",
    target_journal: "IEEE Transactions on Dependable and Secure Computing",
    identified_gaps: JSON.stringify([
      {
        id: "gap-1",
        title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
        gap_type: "empirical",
      },
    ]),
    anchor_gap_id: "gap-1",
    approved_vault_sources: JSON.stringify([
      { id: "v-src-1", title: "PBFT and Proactive Recovery" },
    ]),
    approved_external_sources: JSON.stringify([
      { id: "ext-1", title: "Dynamic Partitions in Wide-Area Consensus Networks" },
    ]),
    primary_datasets: JSON.stringify([
      { id: "ds-1", name: "wan_partition_benchmarks.csv", rowCount: 154200 },
    ]),
    evidence_matrix: JSON.stringify([
      {
        id: "cluster-1",
        theme: "Throughput Collapse in Static Byzantine Quorums",
        strength: "Very High",
        primary_claim: "Dynamic quorum reconfiguration outperforms static PBFT under asymmetric partitions.",
      },
    ]),
    journal_constraints: JSON.stringify({
      max_words: 10000,
      citation_style: "IEEE Transactions Numerical",
      required_sections: [
        "Abstract",
        "Introduction",
        "System Model & Assumptions",
        "Empirical Evaluation & Results",
        "Conclusion",
      ],
    }),
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: true,
  gates: [],
};

describe("Stage 17: AI Draft Generation (DraftStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation(
      async (id: string, answers: Record<string, string>) => ({
        ...mockProjectWithCharterAndRules,
        answers: { ...mockProjectWithCharterAndRules.answers, ...answers },
      })
    );
  });

  it("renders Stage 17 header, Grounding Foundation ribbon, and initial drafting state", () => {
    render(
      <DraftStage
        stage="draft"
        projectId="proj-draft-1701"
        project={mockProjectWithCharterAndRules}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: /^AI Draft Generation$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase III: Drafting • Stage 17 of 25/i)).toBeInTheDocument();
    expect(screen.getByText(/Sub-Second Byzantine Agreement Under Asymmetric Partitions/i)).toBeInTheDocument();
    expect(screen.getByText(/Citations/i)).toBeInTheDocument();
    expect(screen.getByText(/Datasets/i)).toBeInTheDocument();
    expect(screen.getByText(/Clusters/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Initialize Multi-Agent Drafter/i })).toBeInTheDocument();
  });

  it("triggers multi-agent drafter, compiles sections, and DOES NOT auto-advance", async () => {
    const onAdvanceMock = vi.fn();

    (api.authedStreamFetch as any).mockImplementation(
      async (url: string, method: string, body: any, onEvent: any) => {
        onEvent("log", { message: "Agent [Drafter]: Composing Introduction..." });
        onEvent("chunk", { chunk: "Formulating empirical latency graphs..." });
        onEvent("done", {
          data: [
            {
              section: "Abstract",
              status: "Drafted",
              length: 220,
              content: "This paper evaluates sub-second Byzantine consensus under dynamic network splits.",
            },
            {
              section: "Introduction",
              status: "Drafted",
              length: 1100,
              content: "Asymmetric network partitions represent a primary failure mode in modern cloud WANs.",
            },
            {
              section: "Empirical Evaluation",
              status: "Drafted",
              length: 1500,
              content: "Our benchmark replayed 154,200 transaction rounds with packet loss varying from 0% to 35%.",
            },
          ],
        });
      }
    );

    render(
      <DraftStage
        stage="draft"
        projectId="proj-draft-1701"
        project={mockProjectWithCharterAndRules}
        onSaved={vi.fn()}
        onAdvance={onAdvanceMock}
      />
    );

    const drafterBtn = screen.getByRole("button", { name: /Initialize Multi-Agent Drafter/i });
    fireEvent.click(drafterBtn);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^Abstract$/i })).toBeInTheDocument();
      expect(
        screen.getByText(/This paper evaluates sub-second Byzantine consensus under dynamic network splits/i)
      ).toBeInTheDocument();
    });

    // Verify auto-advance was eliminated
    expect(onAdvanceMock).not.toHaveBeenCalled();
  });

  it("engages local fallback drafting engine when stream fails", async () => {
    (api.authedStreamFetch as any).mockRejectedValue(new Error("Network drop during long-context generation"));

    render(
      <DraftStage
        stage="draft"
        projectId="proj-draft-1701"
        project={mockProjectWithCharterAndRules}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const drafterBtn = screen.getByRole("button", { name: /Initialize Multi-Agent Drafter/i });
    fireEvent.click(drafterBtn);

    await waitFor(() => {
      expect(screen.getByText(/Local Academic Drafting Engine/i)).toBeInTheDocument();
      expect(screen.getByText(/Wide-area distributed systems increasingly operate over heterogeneous cloud infrastructures/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Regenerate Full Draft/i })).toBeInTheDocument();
    });
  });

  it("navigates across sections in the dual-pane workspace", async () => {
    const projectWithSavedDraft: ProjectView = {
      ...mockProjectWithCharterAndRules,
      answers: {
        ...mockProjectWithCharterAndRules.answers,
        manuscript_draft: JSON.stringify([
          {
            section: "Abstract",
            status: "Drafted",
            length: 200,
            content: "Abstract content...",
          },
          {
            section: "Introduction",
            status: "Drafted",
            length: 1200,
            content: "Introduction content on WAN splits...",
          },
          {
            section: "Empirical Benchmark Evaluation",
            status: "Drafted",
            length: 1800,
            content: "Evaluation content covering 35% packet drop boundaries...",
          },
        ]),
      },
    };

    render(
      <DraftStage
        stage="draft"
        projectId="proj-draft-1701"
        project={projectWithSavedDraft}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Abstract content/i)).toBeInTheDocument();

    // Click Introduction section button
    const introBtn = screen.getByRole("button", { name: /Introduction/i });
    fireEvent.click(introBtn);

    expect(screen.getByText(/Introduction content on WAN splits/i)).toBeInTheDocument();

    // Click Evaluation section button
    const evalBtn = screen.getByRole("button", { name: /Empirical Benchmark Evaluation/i });
    fireEvent.click(evalBtn);

    expect(screen.getByText(/Evaluation content covering 35% packet drop boundaries/i)).toBeInTheDocument();
  });

  it("edits active section prose in-place and updates word count", async () => {
    const projectWithSavedDraft: ProjectView = {
      ...mockProjectWithCharterAndRules,
      answers: {
        ...mockProjectWithCharterAndRules.answers,
        manuscript_draft: JSON.stringify([
          {
            section: "Introduction",
            status: "Drafted",
            length: 10,
            content: "Initial draft intro paragraph.",
          },
        ]),
      },
    };

    render(
      <DraftStage
        stage="draft"
        projectId="proj-draft-1701"
        project={projectWithSavedDraft}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Initial draft intro paragraph/i)).toBeInTheDocument();

    // Click Edit Prose
    const editBtn = screen.getByRole("button", { name: /Edit Prose/i });
    fireEvent.click(editBtn);

    const textarea = screen.getByDisplayValue("Initial draft intro paragraph.");
    fireEvent.change(textarea, {
      target: {
        value: "Polished and expanded introduction covering asymmetric WAN latency resilience.",
      },
    });

    const saveBtn = screen.getByRole("button", { name: /Save Changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Polished and expanded introduction covering asymmetric WAN latency resilience/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Revised/i)).toBeInTheDocument();
    });
  });

  it("locks manuscript draft and advances to Stage 18 (citation_audit)", async () => {
    const onAdvanceMock = vi.fn();
    const projectWithSavedDraft: ProjectView = {
      ...mockProjectWithCharterAndRules,
      answers: {
        ...mockProjectWithCharterAndRules.answers,
        manuscript_draft: JSON.stringify([
          {
            section: "Abstract",
            status: "Drafted",
            length: 200,
            content: "Abstract content...",
          },
          {
            section: "Introduction",
            status: "Drafted",
            length: 1200,
            content: "Introduction content...",
          },
        ]),
      },
    };

    render(
      <DraftStage
        stage="draft"
        projectId="proj-draft-1701"
        project={projectWithSavedDraft}
        onSaved={vi.fn()}
        onAdvance={onAdvanceMock}
      />
    );

    const lockBtn = screen.getByRole("button", {
      name: /Lock Manuscript Draft & Proceed to Citation Audit/i,
    });
    fireEvent.click(lockBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-draft-1701",
        expect.objectContaining({
          draft_completed: "true",
        })
      );
      expect(onAdvanceMock).toHaveBeenCalledWith("citation_audit");
    });
  });
});
