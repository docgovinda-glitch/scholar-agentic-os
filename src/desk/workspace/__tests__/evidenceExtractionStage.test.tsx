// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EvidenceExtractionStage from "../stages/EvidenceExtractionStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  authedStreamFetch: vi.fn(),
}));

const mockProject: ProjectView = {
  projectId: "proj-ev-101",
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
      {
        id: "src-1",
        title: "Practical Byzantine Fault Tolerance",
        author: "Castro & Liskov",
        year: "2002",
        relevance_score: 95,
        evidentiary_role: "benchmark",
        snippet: "PBFT provides 1-2 orders of magnitude faster state transitions under LAN networks.",
        matched_concepts: ["PBFT", "State Machine Replication"],
      },
      {
        id: "src-2",
        title: "Dumbo: Accelerating Asynchronous Byzantine Consensus",
        author: "Guo et al.",
        year: "2020",
        relevance_score: 88,
        evidentiary_role: "comparative",
        snippet: "Dumbo reduces latency variance across heterogeneous nodes.",
        matched_concepts: ["Asynchronous BFT", "Latency Reduction"],
      },
    ]),
    additional_datasets: JSON.stringify([
      {
        id: "d-1",
        name: "WAN-Benchmark-Traces.csv",
        format: "csv",
        sizeBytes: 104857,
        rowCount: 450,
        content: "node_id,latency_ms,packet_loss\nnode-1,12.4,0.01\nnode-2,89.1,0.15",
        uploadedAt: "2024-01-01T00:00:00Z",
        sourceType: "file_upload",
      },
    ]),
    extracted_evidence: JSON.stringify([
      {
        id: "ev-init-1",
        quote: "State transitions execute within 12.4ms under 30% packet loss when adaptive quorums are active.",
        source: "Castro & Liskov (2002)",
        claim_type: "Empirical Support",
        strength: "Strong",
        tags: ["Latency", "Quorum", "Adaptive"],
        page_or_loc: "p. 412, Sec 4",
        notes: "Key baseline for throughput analysis.",
      },
      {
        id: "ev-init-2",
        quote: "WAN round-trip communication introduces a quadratic overhead under uncoordinated leaders.",
        source: "Guo et al. (2020)",
        claim_type: "Theoretical Proof",
        strength: "Moderate",
        tags: ["WAN", "Quadratic Overhead"],
        page_or_loc: "Theorem 3",
        notes: "Context for leaderless designs.",
      },
    ]),
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 10: Evidence Extraction (EvidenceExtractionStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({
        ...mockProject,
        answers: { ...mockProject.answers, ...answers },
      })
    );
  });

  it("renders Stage 10 header, Grounding Foundation ribbon, and initial evidence matrix", async () => {
    render(
      <EvidenceExtractionStage
        stage="evidence_extraction"
        projectId="proj-ev-101"
        project={mockProject}
      />
    );

    expect(screen.getByRole("heading", { name: /^AI Extraction$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase II: Evidence Extraction/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage 10 of 25/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"Sub-Second Byzantine Agreement Under Asymmetric Partitions"/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/2 Authorized Sources/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Datasets Attached/i)).toBeInTheDocument();

    // Check pre-populated evidence
    expect(
      screen.getByText(/State transitions execute within 12\.4ms under 30% packet loss/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/WAN round-trip communication introduces a quadratic overhead/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/evidence claims synthesized in matrix/i)).toBeInTheDocument();
  });

  it("filters evidence claims by search term and strength", async () => {
    render(
      <EvidenceExtractionStage
        stage="evidence_extraction"
        projectId="proj-ev-101"
        project={mockProject}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search claims by quote, citation, or tag/i);
    fireEvent.change(searchInput, { target: { value: "quadratic" } });

    // Should only show the second claim
    expect(
      screen.getByText(/WAN round-trip communication introduces a quadratic overhead/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/State transitions execute within 12\.4ms under 30% packet loss/i)
    ).not.toBeInTheDocument();

    // Clear search and test strength filter button
    fireEvent.change(searchInput, { target: { value: "" } });
    const strongPill = screen.getByRole("button", { name: /Strong/i });
    fireEvent.click(strongPill);

    expect(
      screen.getByText(/State transitions execute within 12\.4ms under 30% packet loss/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/WAN round-trip communication introduces a quadratic overhead/i)
    ).not.toBeInTheDocument();
  });

  it("adds a new custom evidence claim via the modal", async () => {
    const onSaved = vi.fn();
    render(
      <EvidenceExtractionStage
        stage="evidence_extraction"
        projectId="proj-ev-101"
        project={mockProject}
        onSaved={onSaved}
      />
    );

    // Click "+ Add Evidence Claim"
    fireEvent.click(screen.getByText(/\+ Add Evidence Claim/i));
    expect(screen.getByText(/Synthesize Custom Claim/i)).toBeInTheDocument();

    // Fill form
    const quoteInput = screen.getByPlaceholderText(/Paste excerpt, statistical finding, or empirical proof/i);
    const sourceInput = screen.getByPlaceholderText(/e\.g\. Castro & Liskov \(2002\)/i);
    const pageInput = screen.getByPlaceholderText(/e\.g\. p\. 412, Section 4\.2/i);
    const tagsInput = screen.getByPlaceholderText(/e\.g\. latency, WAN, byzantine consensus/i);

    fireEvent.change(quoteInput, { target: { value: "Empirical proof of zero-downtime reconfiguration." } });
    fireEvent.change(sourceInput, { target: { value: "Author et al. (2024)" } });
    fireEvent.change(pageInput, { target: { value: "p. 15" } });
    fireEvent.change(tagsInput, { target: { value: "Consensus, Reconfig" } });

    // Save claim
    fireEvent.click(screen.getByRole("button", { name: /Save Evidence Claim/i }));

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.extracted_evidence).toContain("Empirical proof of zero-downtime reconfiguration.");
      expect(screen.getByText(/Empirical proof of zero-downtime reconfiguration\./i)).toBeInTheDocument();
      expect(screen.getByText(/New evidence claim added to matrix\./i)).toBeInTheDocument();
    });
  });

  it("edits an existing evidence claim", async () => {
    render(
      <EvidenceExtractionStage
        stage="evidence_extraction"
        projectId="proj-ev-101"
        project={mockProject}
      />
    );

    const editButtons = screen.getAllByRole("button", { name: /Edit/i });
    fireEvent.click(editButtons[0]);

    expect(screen.getByText(/Modify Extracted Quote/i)).toBeInTheDocument();
    const quoteInput = screen.getByDisplayValue(/State transitions execute within 12\.4ms/i);
    fireEvent.change(quoteInput, {
      target: { value: "Updated: State transitions execute within 8.9ms under optimized quorums." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save Claim Changes/i }));

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.extracted_evidence).toContain("Updated: State transitions execute within 8.9ms");
      expect(
        screen.getByText(/Updated: State transitions execute within 8\.9ms under optimized quorums\./i)
      ).toBeInTheDocument();
    });
  });

  it("deletes an existing evidence claim", async () => {
    render(
      <EvidenceExtractionStage
        stage="evidence_extraction"
        projectId="proj-ev-101"
        project={mockProject}
      />
    );

    const deleteButtons = screen.getAllByRole("button", { name: /Delete/i });
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.extracted_evidence).not.toContain("State transitions execute within 12.4ms");
      expect(
        screen.queryByText(/State transitions execute within 12\.4ms under 30% packet loss/i)
      ).not.toBeInTheDocument();
    });
  });

  it("runs Data Miner extraction via authedStreamFetch without auto-advancing prematurely", async () => {
    const onAdvance = vi.fn();
    (api.authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("log", { message: "Analyzing approved literature corpus..." });
        onChunk("chunk", { chunk: "Extracted 3 empirical theorems..." });
        onChunk("done", {
          data: [
            {
              id: "ev-stream-1",
              quote: "Quorum intersection is guaranteed under 2f+1 replicas even with asymmetric latency spikes.",
              source: "Streamed Miner (2024)",
              claim_type: "Theoretical Proof",
              strength: "Strong",
              tags: ["Quorum", "Replicas"],
            },
          ],
        });
      }
    );

    render(
      <EvidenceExtractionStage
        stage="evidence_extraction"
        projectId="proj-ev-101"
        project={mockProject}
        onAdvance={onAdvance}
      />
    );

    const mineBtn = screen.getByRole("button", { name: /Re-Mine Evidence/i });
    fireEvent.click(mineBtn);

    await waitFor(() => {
      expect(api.authedStreamFetch).toHaveBeenCalled();
      expect(screen.getByText(/Quorum intersection is guaranteed under 2f\+1 replicas/i)).toBeInTheDocument();
      // CRITICAL CHECK: Must NOT advance automatically! User reviews first!
      expect(onAdvance).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Successfully mined 1 evidence claims! You can now review, edit, or add custom claims\./i)
      ).toBeInTheDocument();
    });
  });

  it("handles streaming failure gracefully with fallback corpus synthesis", async () => {
    (api.authedStreamFetch as any).mockRejectedValue(new Error("Network disconnect"));

    render(
      <EvidenceExtractionStage
        stage="evidence_extraction"
        projectId="proj-ev-101"
        project={{
          ...mockProject,
          answers: {
            ...mockProject.answers,
            extracted_evidence: "", // no pre-existing
          },
        }}
      />
    );

    const mineBtn = screen.getByRole("button", { name: /Run Data Miner Agent/i });
    fireEvent.click(mineBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      // Fallback generates claims from approved sources and datasets
      expect(screen.getByText(/Local corpus synthesis complete/i)).toBeInTheDocument();
      expect(screen.getByText(/PBFT provides 1-2 orders of magnitude faster state transitions/i)).toBeInTheDocument();
    });
  });

  it("locks evidence ledger and advances to Stage 11 (external_research) on user action", async () => {
    const onAdvance = vi.fn();
    render(
      <EvidenceExtractionStage
        stage="evidence_extraction"
        projectId="proj-ev-101"
        project={mockProject}
        onAdvance={onAdvance}
      />
    );

    const proceedBtn = screen.getByRole("button", {
      name: /Lock Evidence Ledger & Proceed to External Discovery/i,
    });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      expect(onAdvance).toHaveBeenCalledWith("external_research");
    });
  });
});
