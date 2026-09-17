// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EvidenceAnalysisStage from "../stages/EvidenceAnalysisStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  authedStreamFetch: vi.fn(),
}));

const mockProject: ProjectView = {
  projectId: "proj-anal-130",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
    primary_research_question: "How do dynamic quorum adjustments preserve throughput during WAN splits?",
    research_area: "Distributed Systems",
    article_type: "Original Research",
    study_design: "Empirical Benchmarking",
    target_journal: "ACM Transactions on Computer Systems",
    identified_gaps: JSON.stringify([
      {
        id: "gap-1",
        title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
        gap_type: "empirical",
      },
    ]),
    anchor_gap_id: "gap-1",
    approved_vault_sources: JSON.stringify([
      { id: "v-1", title: "Practical Byzantine Fault Tolerance (PBFT)" },
      { id: "v-2", title: "Dumbo Asynchronous Consensus" },
    ]),
    approved_external_sources: JSON.stringify([
      { id: "ext-1", title: "Adaptive BFT Reconfiguration Under WAN Partitions" },
    ]),
    additional_datasets: JSON.stringify([
      { id: "d-1", name: "WAN-Benchmark-Traces.csv", format: "csv" },
    ]),
    extracted_evidence: JSON.stringify([
      { id: "ev-1", quote: "Latency bounds verified under packet loss." },
    ]),
    evidence_clusters: JSON.stringify([
      {
        id: "arg-init-1",
        theme: "Latency Bounds Under Asymmetric Wide-Area Network Partitions",
        primary_claim: "Static quorum sizing imposes severe throughput penalties during geographic splits.",
        source_primary: "Castro & Liskov (2002) PBFT",
        synthesized_support: "Dynamic quorums preserve sub-second commit latency under 35% packet drops.",
        source_support: "Balasubramanian et al. (2024)",
        argument_strength: "Very High",
        status: "Mapped to Empirical Framework",
        alignment_type: "Corroboration",
        notes: "Central thesis argument.",
      },
      {
        id: "arg-init-2",
        theme: "Byzantine Safety Guarantees During Dynamic Reconfiguration",
        primary_claim: "Reconfiguring quorum memberships during active loss risks split-brain failure.",
        source_primary: "Howard et al. (2022) Flexible Paxos",
        synthesized_support: "Intersection invariants remain valid provided read/write quorums overlap by f+1 nodes.",
        source_support: "Vukolić & Gueta (2023)",
        argument_strength: "High",
        status: "Mapped to Theoretical Framework",
        alignment_type: "Extension",
        notes: "Formal safety proof.",
      },
    ]),
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 13: Evidence Analysis (EvidenceAnalysisStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({
        ...mockProject,
        answers: { ...mockProject.answers, ...answers },
      })
    );
  });

  it("renders Stage 13 header, Grounding Foundation ribbon, and initial argument clusters", async () => {
    render(
      <EvidenceAnalysisStage
        stage="evidence_analysis"
        projectId="proj-anal-130"
        project={mockProject}
      />
    );

    expect(screen.getByRole("heading", { name: /^Evidence Matrix$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase II: Evidence Matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage 13 of 25/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"Sub-Second Byzantine Agreement Under Asymmetric Partitions"/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/2 Vault Sources/i)).toBeInTheDocument();
    expect(screen.getByText(/1 External Papers/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Datasets/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Claims Mined/i)).toBeInTheDocument();

    // Check pre-populated argument clusters
    expect(
      screen.getByText(/Latency Bounds Under Asymmetric Wide-Area Network Partitions/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Byzantine Safety Guarantees During Dynamic Reconfiguration/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/theoretical argument clusters structured into matrix/i)
    ).toBeInTheDocument();
  });

  it("filters argument clusters by search query and strength pill", async () => {
    render(
      <EvidenceAnalysisStage
        stage="evidence_analysis"
        projectId="proj-anal-130"
        project={mockProject}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search argument themes, claims, or citations/i);
    fireEvent.change(searchInput, { target: { value: "split-brain" } });

    // Should only show cluster 2
    expect(
      screen.getByText(/Byzantine Safety Guarantees During Dynamic Reconfiguration/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Latency Bounds Under Asymmetric Wide-Area Network Partitions/i)
    ).not.toBeInTheDocument();

    // Clear search and test strength pill
    fireEvent.change(searchInput, { target: { value: "" } });
    const veryHighPill = screen.getByRole("button", { name: /^Very High$/i });
    fireEvent.click(veryHighPill);

    expect(
      screen.getByText(/Latency Bounds Under Asymmetric Wide-Area Network Partitions/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Byzantine Safety Guarantees During Dynamic Reconfiguration/i)
    ).not.toBeInTheDocument();
  });

  it("adds a new custom argument cluster via modal", async () => {
    render(
      <EvidenceAnalysisStage
        stage="evidence_analysis"
        projectId="proj-anal-130"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ Add Argument Cluster/i }));
    expect(screen.getByText(/Synthesize Custom Argument Cluster/i)).toBeInTheDocument();

    const themeInput = screen.getByPlaceholderText(/e\.g\. Asymmetric Latency Bounds Under Packet Drops/i);
    const claimInput = screen.getByPlaceholderText(/Primary empirical claim or observation from vault corpus/i);
    const supportInput = screen.getByPlaceholderText(/Cross-corroborating or contrasting finding from external literature/i);

    fireEvent.change(themeInput, { target: { value: "Validator Bandwidth Limits in Cross-Border Fabrics" } });
    fireEvent.change(claimInput, { target: { value: "Bandwidth saturation caps validator gossip during bursts." } });
    fireEvent.change(supportInput, { target: { value: "Asymmetric quorums reduce gossip packet duplication by 40%." } });

    fireEvent.click(screen.getByRole("button", { name: /Save Argument Cluster/i }));

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.evidence_clusters).toContain("Validator Bandwidth Limits in Cross-Border Fabrics");
      expect(
        screen.getByText(/Validator Bandwidth Limits in Cross-Border Fabrics/i)
      ).toBeInTheDocument();
    });
  });

  it("edits an existing argument cluster", async () => {
    render(
      <EvidenceAnalysisStage
        stage="evidence_analysis"
        projectId="proj-anal-130"
        project={mockProject}
      />
    );

    const editButtons = screen.getAllByRole("button", { name: /Edit Cluster/i });
    fireEvent.click(editButtons[0]);

    expect(screen.getByText(/Modify Synthesis Matrix Node/i)).toBeInTheDocument();
    const notesInput = screen.getByPlaceholderText(/e\.g\. Map to Section 4\.2: Evaluation & Latency Bounds/i);
    fireEvent.change(notesInput, {
      target: { value: "Updated: Map directly to Section 4.3 benchmark subsection." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save Cluster Changes/i }));

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.evidence_clusters).toContain(
        "Updated: Map directly to Section 4.3 benchmark subsection."
      );
      expect(
        screen.getByText(/Updated: Map directly to Section 4\.3 benchmark subsection\./i)
      ).toBeInTheDocument();
    });
  });

  it("deletes an argument cluster from the matrix", async () => {
    render(
      <EvidenceAnalysisStage
        stage="evidence_analysis"
        projectId="proj-anal-130"
        project={mockProject}
      />
    );

    const deleteButtons = screen.getAllByRole("button", { name: /Delete/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.evidence_clusters).not.toContain(
        "Latency Bounds Under Asymmetric Wide-Area Network Partitions"
      );
      expect(
        screen.queryByText(/Latency Bounds Under Asymmetric Wide-Area Network Partitions/i)
      ).not.toBeInTheDocument();
    });
  });

  it("runs Synthesizer Agent extraction via authedStreamFetch without auto-advancing prematurely", async () => {
    const onAdvance = vi.fn();
    (api.authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("log", { message: "Structuring cross-corroborated matrix..." });
        onChunk("chunk", { chunk: "Synthesized 2 theoretical clusters..." });
        onChunk("done", {
          data: [
            {
              id: "arg-stream-1",
              theme: "Throughput Invariance Under Adversarial WAN Delays",
              primary_claim: "Throughput degrades logarithmically rather than exponentially.",
              source_primary: "Vault Telemetry",
              synthesized_support: "Confirmed by external multi-datacenter benchmarking.",
              source_support: "External Study (2025)",
              argument_strength: "Very High",
              status: "Mapped to Discussion",
              alignment_type: "Corroboration",
            },
          ],
        });
      }
    );

    render(
      <EvidenceAnalysisStage
        stage="evidence_analysis"
        projectId="proj-anal-130"
        project={mockProject}
        onAdvance={onAdvance}
      />
    );

    const synthBtn = screen.getByRole("button", { name: /Re-Synthesize Matrix/i });
    fireEvent.click(synthBtn);

    await waitFor(() => {
      expect(api.authedStreamFetch).toHaveBeenCalled();
      expect(
        screen.getByText(/Throughput Invariance Under Adversarial WAN Delays/i)
      ).toBeInTheDocument();
      // CRITICAL CHECK: Must NOT auto-advance!
      expect(onAdvance).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Evidence synthesis complete! Generated 1 argument clusters\. Review and refine before proceeding\./i)
      ).toBeInTheDocument();
    });
  });

  it("handles streaming failure gracefully with fallback corpus synthesis", async () => {
    (api.authedStreamFetch as any).mockRejectedValue(new Error("Synthesizer LLM connection dropped"));

    render(
      <EvidenceAnalysisStage
        stage="evidence_analysis"
        projectId="proj-anal-130"
        project={{
          ...mockProject,
          answers: {
            ...mockProject.answers,
            evidence_clusters: "", // empty
          },
        }}
      />
    );

    const synthBtn = screen.getByRole("button", { name: /Launch Synthesizer Agent/i });
    fireEvent.click(synthBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      expect(screen.getByText(/Local corpus synthesis complete/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Telemetry Verification on Multi-Region Transatlantic Interconnects/i)
      ).toBeInTheDocument();
    });
  });

  it("locks evidence matrix and advances to Stage 14 (manual_review) on user action", async () => {
    const onAdvance = vi.fn();
    render(
      <EvidenceAnalysisStage
        stage="evidence_analysis"
        projectId="proj-anal-130"
        project={mockProject}
        onAdvance={onAdvance}
      />
    );

    const proceedBtn = screen.getByRole("button", {
      name: /Lock Evidence Matrix & Proceed to Researcher Review/i,
    });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      expect(onAdvance).toHaveBeenCalledWith("manual_review");
    });
  });
});
