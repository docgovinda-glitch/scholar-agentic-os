// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GapSelectionStage from "../stages/GapSelectionStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  executeAgenticLLM: vi.fn(),
}));

const mockProjectEmpty: ProjectView = {
  projectId: "proj-sel-101",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Fault-Tolerant Distributed Consensus in Edge Clusters",
    research_area: "Distributed Systems & Machine Learning",
  },
  authors: [],
  intakeCompleteness: 0.5,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

const mockProjectWithGaps: ProjectView = {
  projectId: "proj-sel-202",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Fault-Tolerant Distributed Consensus in Edge Clusters",
    research_area: "Distributed Systems & Machine Learning",
    identified_gaps: JSON.stringify([
      {
        id: "gap-1",
        title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
        gap_type: "empirical",
        description: "Existing BFT benchmarks assume symmetric network partitions, overlooking partial WAN splits.",
        why_it_matters: "Real-world edge nodes suffer intermittent one-way disconnects, causing catastrophic throughput collapse.",
        proposed_approach: "Deploy simulated WAN jitter testbeds and empirically validate adaptive quorum recalculation.",
        grounding_sources: ["Lamport & Castro (2024)"],
        importance_score: 95,
        feasibility_score: 88,
        status: "identified",
      },
      {
        id: "gap-2",
        title: "Formal Proof Boundaries for Dynamic Membership in Raft",
        gap_type: "theoretical",
        description: "Theoretical frameworks lack mechanized verification for concurrent multi-leader handoffs.",
        why_it_matters: "Undetected safety violations can lead to dual-leader split-brain states.",
        proposed_approach: "Develop Coq/TLA+ formal specifications proving linearizability during transitions.",
        grounding_sources: ["Gao & Miller (2023)"],
        importance_score: 90,
        feasibility_score: 75,
        status: "identified",
      },
      {
        id: "gap-3",
        title: "Standardized Microbenchmark Suites for Edge Heterogeneity",
        gap_type: "methodological",
        description: "No uniform benchmark exists that couples network latency with memory-constrained edge hardware.",
        why_it_matters: "Comparative evaluation between protocols remains irreproducible across different labs.",
        proposed_approach: "Release an open-source containerized harness with synthetic load generators.",
        grounding_sources: [],
        importance_score: 82,
        feasibility_score: 92,
        status: "identified",
      },
    ]),
    selected_gaps: JSON.stringify(["gap-1"]),
    selected_gap: "gap-1",
    anchor_gap_id: "gap-1",
  },
  authors: [],
  intakeCompleteness: 1,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 4: Gap Selection (GapSelectionStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({ ...mockProjectWithGaps, answers })
    );
  });

  it("renders empty state when no gaps are identified, with CTA to go to Stage 3", () => {
    const onAdvanceMock = vi.fn();
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-101"
        project={mockProjectEmpty}
        onAdvance={onAdvanceMock}
      />
    );

    expect(screen.getByText(/No Research Gaps Identified Yet/i)).toBeInTheDocument();
    const backBtn = screen.getByRole("button", { name: /Go to Stage 3: Gap Identification/i });
    fireEvent.click(backBtn);
    expect(onAdvanceMock).toHaveBeenCalledWith("gap_identification");
  });

  it("renders discovered gap cards with titles, scores, and typologies", () => {
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getAllByText(/Sub-Second Byzantine Agreement Under Asymmetric Partitions/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Formal Proof Boundaries for Dynamic Membership in Raft/i)).toBeInTheDocument();
    expect(screen.getByText(/Standardized Microbenchmark Suites for Edge Heterogeneity/i)).toBeInTheDocument();

    expect(screen.getByText(/95%/i)).toBeInTheDocument();
    expect(screen.getByText(/88%/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Empirical Gap/i).length).toBeGreaterThanOrEqual(1);
  });

  it("marks initially selected gap as PRIMARY ANCHOR and shows synergy blueprint", () => {
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getAllByText(/PRIMARY ANCHOR/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Research Gap Synergy Blueprint/i)).toBeInTheDocument();
  });

  it("allows selecting a second gap as SUPPORTING dimension and persists", async () => {
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    // Click on the second card (Formal Proof Boundaries)
    const secondCardTitle = screen.getByText(/Formal Proof Boundaries for Dynamic Membership in Raft/i);
    fireEvent.click(secondCardTitle);

    await waitFor(() => {
      expect(screen.getAllByText(/SUPPORTING/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/PRIMARY ANCHOR/i).length).toBeGreaterThanOrEqual(1);
    });

    expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
      "proj-sel-202",
      expect.objectContaining({
        selected_gaps: expect.stringContaining("gap-2"),
        anchor_gap_id: "gap-1",
      })
    );
  });

  it("allows promoting a supporting gap to PRIMARY ANCHOR via Set as Anchor button", async () => {
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-202"
        project={{
          ...mockProjectWithGaps,
          answers: {
            ...mockProjectWithGaps.answers,
            selected_gaps: JSON.stringify(["gap-1", "gap-2"]),
            anchor_gap_id: "gap-1",
            selected_gap: "gap-1",
          },
        }}
        onAdvance={vi.fn()}
      />
    );

    const setAnchorBtn = screen.getByRole("button", { name: /Set as Anchor/i });
    fireEvent.click(setAnchorBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-sel-202",
        expect.objectContaining({
          anchor_gap_id: "gap-2",
          selected_gap: "gap-2",
        })
      );
    });
  });

  it("filters candidate gaps by typology", () => {
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    const empiricalTab = screen.getByRole("button", { name: /🔬 Empirical/i });
    fireEvent.click(empiricalTab);

    // Empirical gap should be visible
    expect(screen.getAllByText(/Sub-Second Byzantine Agreement Under Asymmetric Partitions/i).length).toBeGreaterThanOrEqual(1);
    // Theoretical gap should be filtered out
    expect(screen.queryByText(/Formal Proof Boundaries for Dynamic Membership in Raft/i)).not.toBeInTheDocument();

    // Click All Gaps again
    const allTab = screen.getByRole("button", { name: /All Gaps/i });
    fireEvent.click(allTab);
    expect(screen.getAllByText(/Formal Proof Boundaries for Dynamic Membership in Raft/i).length).toBeGreaterThanOrEqual(1);
  });

  it("sorts candidate gaps by importance, feasibility, and title", () => {
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    const sortSelect = screen.getByLabelText(/Sort By:/i);
    fireEvent.change(sortSelect, { target: { value: "feasibility" } });
    // Feasibility: gap-3 (92%), gap-1 (88%), gap-2 (75%)
    expect(sortSelect).toHaveValue("feasibility");

    fireEvent.change(sortSelect, { target: { value: "title" } });
    expect(sortSelect).toHaveValue("title");
  });

  it("expands and collapses why it matters and proposed approach", () => {
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    const expandButtons = screen.getAllByRole("button", { name: /View Scholarly Significance/i });
    fireEvent.click(expandButtons[0]);

    expect(screen.getByText(/Why This Gap Is Consequential:/i)).toBeInTheDocument();
    expect(screen.getByText(/Proposed Methodological Resolution:/i)).toBeInTheDocument();

    const hideBtn = screen.getByRole("button", { name: /Hide Details/i });
    fireEvent.click(hideBtn);
    expect(screen.queryByText(/Why This Gap Is Consequential:/i)).not.toBeInTheDocument();
  });

  it("advances to title_selection when clicking Proceed to Title Suggestions", async () => {
    const onAdvanceMock = vi.fn();
    render(
      <GapSelectionStage
        stage="gap_selection"
        projectId="proj-sel-202"
        project={mockProjectWithGaps}
        onAdvance={onAdvanceMock}
      />
    );

    const proceedBtn = screen.getAllByRole("button", { name: /Proceed to Title Suggestions/i })[0];
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(onAdvanceMock).toHaveBeenCalledWith("title_selection");
    });
  });
});
