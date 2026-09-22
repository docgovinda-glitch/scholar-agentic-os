// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GapIdentificationStage from "../stages/GapIdentificationStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  executeAgenticLLM: vi.fn(),
}));

const mockProjectEmpty: ProjectView = {
  projectId: "proj-gap-101",
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
  projectId: "proj-gap-202",
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
        grounding_sources: ["Lamport & Castro (2024)", "Gao & Miller (2023)"],
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
  },
  authors: [],
  intakeCompleteness: 1,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 3: Gap Identification (GapIdentificationStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({ ...mockProjectWithGaps, answers })
    );
  });

  it("renders empty hero state when no gaps are identified yet", () => {
    render(
      <GapIdentificationStage
        stage="gap_identification"
        projectId="proj-gap-101"
        project={mockProjectEmpty}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/Discover High-Impact Research Gaps/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run Gap Identification/i })).toBeInTheDocument();
  });

  it("renders discovered gap cards with titles, scores, typologies, and literature grounding", () => {
    render(
      <GapIdentificationStage
        stage="gap_identification"
        projectId="proj-gap-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    // Check titles
    expect(screen.getByText(/Sub-Second Byzantine Agreement Under Asymmetric Partitions/i)).toBeInTheDocument();
    expect(screen.getByText(/Formal Proof Boundaries for Dynamic Membership in Raft/i)).toBeInTheDocument();
    expect(screen.getByText(/Standardized Microbenchmark Suites for Edge Heterogeneity/i)).toBeInTheDocument();

    // Check typology labels
    expect(screen.getByText(/Empirical Gap/i)).toBeInTheDocument();
    expect(screen.getByText(/Theoretical Gap/i)).toBeInTheDocument();
    expect(screen.getByText(/Methodological Gap/i)).toBeInTheDocument();

    // Check dual scores
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();

    // Check literature evidence grounding tag
    expect(screen.getByText(/Lamport & Castro \(2024\)/i)).toBeInTheDocument();
  });

  it("renders typology distribution breakdown summary strip correctly", () => {
    render(
      <GapIdentificationStage
        stage="gap_identification"
        projectId="proj-gap-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByText(/3 Discovered/i)).toBeInTheDocument();
    expect(screen.getAllByText(/🔬 Empirical/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/📐 Theoretical/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/⚙️ Methodological/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/💡 Knowledge/i).length).toBeGreaterThanOrEqual(1);
  });

  it("expands and collapses why it matters and proposed approach", () => {
    render(
      <GapIdentificationStage
        stage="gap_identification"
        projectId="proj-gap-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    const expandButtons = screen.getAllByRole("button", { name: /View Scholarly Significance/i });
    expect(expandButtons.length).toBeGreaterThan(0);

    // Expand the first gap
    fireEvent.click(expandButtons[0]);

    expect(screen.getByText(/Why This Gap Is Consequential:/i)).toBeInTheDocument();
    expect(screen.getByText(/Real-world edge nodes suffer intermittent one-way disconnects/i)).toBeInTheDocument();
    expect(screen.getByText(/Proposed Methodological Resolution:/i)).toBeInTheDocument();
    expect(screen.getByText(/Deploy simulated WAN jitter testbeds/i)).toBeInTheDocument();

    // Collapse
    const hideBtn = screen.getByRole("button", { name: /Hide Details/i });
    fireEvent.click(hideBtn);

    expect(screen.queryByText(/Why This Gap Is Consequential:/i)).not.toBeInTheDocument();
  });

  it("allows dismissing a candidate gap and persists change", async () => {
    render(
      <GapIdentificationStage
        stage="gap_identification"
        projectId="proj-gap-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    const dismissButtons = screen.getAllByRole("button", { name: /Dismiss/i });
    expect(dismissButtons.length).toBe(3);

    // Dismiss first gap
    fireEvent.click(dismissButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText(/Sub-Second Byzantine Agreement Under Asymmetric Partitions/i)).not.toBeInTheDocument();
    });

    expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
      "proj-gap-202",
      expect.objectContaining({
        current_stage: "gap_identification",
      })
    );
  });

  it("allows adding a custom gap via modal and persists it", async () => {
    render(
      <GapIdentificationStage
        stage="gap_identification"
        projectId="proj-gap-202"
        project={mockProjectWithGaps}
        onAdvance={vi.fn()}
      />
    );

    const addBtn = screen.getAllByRole("button", { name: /Add Custom Gap/i })[0];
    fireEvent.click(addBtn);

    expect(screen.getByText(/Add Custom Identified Gap/i)).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/Sub-Second Consensus Under Network Partitions/i);
    const descInput = screen.getByPlaceholderText(/Explain precisely what is missing/i);

    fireEvent.change(titleInput, { target: { value: "Security Voids in P2P Node Discovery" } });
    fireEvent.change(descInput, { target: { value: "Sybil attacks during DHT bootstrapping are unaddressed." } });

    const submitBtn = screen.getByRole("button", { name: /Add Candidate Gap/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Security Voids in P2P Node Discovery/i)).toBeInTheDocument();
      expect(screen.getByText(/Custom Added/i)).toBeInTheDocument();
    });

    expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
      "proj-gap-202",
      expect.objectContaining({
        identified_gaps: expect.stringContaining("Security Voids in P2P Node Discovery"),
      })
    );
  });

  it("advances to gap_selection when clicking Review & Select Gaps", () => {
    const onAdvanceMock = vi.fn();
    render(
      <GapIdentificationStage
        stage="gap_identification"
        projectId="proj-gap-202"
        project={mockProjectWithGaps}
        onAdvance={onAdvanceMock}
      />
    );

    const advanceBtn = screen.getAllByRole("button", { name: /Review & Select Gaps/i })[0];
    fireEvent.click(advanceBtn);

    expect(onAdvanceMock).toHaveBeenCalledWith("gap_selection");
  });

  it("falls back to local heuristic synthesis when executeAgenticLLM throws", async () => {
    (api.executeAgenticLLM as any).mockRejectedValue(new Error("AI quota exhausted or offline"));

    render(
      <GapIdentificationStage
        stage="gap_identification"
        projectId="proj-gap-101"
        project={mockProjectEmpty}
        onAdvance={vi.fn()}
      />
    );

    const runBtn = screen.getByRole("button", { name: /Run Gap Identification/i });
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Run Gap Identification/i })).not.toBeInTheDocument();
    });

    expect(screen.getAllByText(/Candidate Research Gaps/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Empirical Gap/i)).toBeInTheDocument();

    expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
      "proj-gap-101",
      expect.objectContaining({
        identified_gaps: expect.any(String),
        current_stage: "gap_identification",
      })
    );
  });
});
