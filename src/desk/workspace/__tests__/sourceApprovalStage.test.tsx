// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SourceApprovalStage from "../stages/SourceApprovalStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
}));

const mockProjectWithVaultSources: ProjectView = {
  projectId: "proj-appr-801",
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
    pending_vault_sources: JSON.stringify([
      {
        id: "v-src-1",
        title: "Practical Byzantine Fault Tolerance and Proactive Recovery",
        author: "Castro, M., Liskov, B.",
        year: 2002,
        relevance_score: 95,
        type: "PDF Document",
        snippet: "Replication algorithm tolerating Byzantine faults.",
      },
      {
        id: "v-src-2",
        title: "Asymmetric Quorum Systems for WAN Consensus",
        author: "Rostova, E.",
        year: 2023,
        relevance_score: 92,
        type: "Academic Paper",
        snippet: "Empirical benchmarking of WAN partition throughput.",
      },
      {
        id: "v-src-3",
        title: "Network Partition Diagnostic Traces",
        author: "Lab Data",
        year: 2024,
        relevance_score: 78,
        type: "Empirical Dataset",
        snippet: "Raw latency measurements under asymmetric packet loss.",
      },
    ]),
    approved_vault_sources: "[]",
    rejected_vault_sources: "[]",
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 8: Source Approval - Vault (SourceApprovalStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({
        ...mockProjectWithVaultSources,
        answers: { ...mockProjectWithVaultSources.answers, ...answers },
      })
    );
  });

  it("renders Stage 8 header, Grounding Foundation ribbon, and Anti-Fabrication shield", async () => {
    render(
      <SourceApprovalStage
        stage="source_approval_vault"
        projectId="proj-appr-801"
        project={mockProjectWithVaultSources}
      />
    );

    expect(screen.getByRole("heading", { name: /^Vault Approval$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase II: Evidence Extraction/i)).toBeInTheDocument();
    expect(screen.getByText(/Anti-Fabrication Guard/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"Sub-Second Byzantine Agreement Under Asymmetric Partitions"/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Pending Review \(3\)/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Practical Byzantine Fault Tolerance and Proactive Recovery/i)
    ).toBeInTheDocument();
  });

  it("approves a source with an evidentiary role and updates metrics", async () => {
    const onSavedMock = vi.fn();
    render(
      <SourceApprovalStage
        stage="source_approval_vault"
        projectId="proj-appr-801"
        project={mockProjectWithVaultSources}
        onSaved={onSavedMock}
      />
    );

    const approveButtons = screen.getAllByRole("button", { name: /✓ Approve Source/i });
    expect(approveButtons.length).toBe(3);

    // Approve first source
    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-appr-801",
        expect.objectContaining({
          approved_vault_sources: expect.stringContaining("Practical Byzantine Fault Tolerance"),
        })
      );
    });

    // Check footer metric & tabs
    expect(screen.getByText(/Pending Review \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Approved Library \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/sources approved for manuscript extraction/i)).toBeInTheDocument();
  });

  it("discards a source and restores it from the Discarded tab", async () => {
    render(
      <SourceApprovalStage
        stage="source_approval_vault"
        projectId="proj-appr-801"
        project={mockProjectWithVaultSources}
      />
    );

    const discardButtons = screen.getAllByRole("button", { name: /^Discard$/i });
    fireEvent.click(discardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Pending Review \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Discarded \(1\)/i)).toBeInTheDocument();
    });

    // Switch to Discarded tab
    const discardedTab = screen.getByRole("button", { name: /Discarded \(1\)/i });
    fireEvent.click(discardedTab);

    expect(
      screen.getByText(/Practical Byzantine Fault Tolerance and Proactive Recovery/i)
    ).toBeInTheDocument();

    // Restore to review
    const restoreBtn = screen.getByRole("button", { name: /Restore to Review/i });
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(screen.getByText(/Pending Review \(3\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Discarded \(0\)/i)).toBeInTheDocument();
    });
  });

  it("batch approves high-relevance sources (≥90%)", async () => {
    render(
      <SourceApprovalStage
        stage="source_approval_vault"
        projectId="proj-appr-801"
        project={mockProjectWithVaultSources}
      />
    );

    const batchBtn = screen.getByRole("button", { name: /⚡ Approve High-Match \(≥90%\)/i });
    fireEvent.click(batchBtn);

    await waitFor(() => {
      // 2 sources have score >= 90 (95% and 92%), 1 has 78%
      expect(screen.getByText(/Approved Library \(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Pending Review \(1\)/i)).toBeInTheDocument();
    });
  });

  it("opens Document Inspector modal and closes it", async () => {
    render(
      <SourceApprovalStage
        stage="source_approval_vault"
        projectId="proj-appr-801"
        project={mockProjectWithVaultSources}
      />
    );

    const inspectButtons = screen.getAllByRole("button", { name: /^Inspect$/i });
    fireEvent.click(inspectButtons[0]);

    expect(screen.getByText(/Source Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified Un-retracted/i)).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /^Close$/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByText(/Source Inspector/i)).not.toBeInTheDocument();
  });

  it("locks approved sources and advances to additional_data (Stage 9)", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    render(
      <SourceApprovalStage
        stage="source_approval_vault"
        projectId="proj-appr-801"
        project={mockProjectWithVaultSources}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    // Batch approve remaining
    const approveAllBtn = screen.getByRole("button", { name: /^Approve All$/i });
    fireEvent.click(approveAllBtn);

    await waitFor(() => {
      expect(screen.getByText(/Approved Library \(3\)/i)).toBeInTheDocument();
    });

    const proceedBtn = screen.getByRole("button", {
      name: /Lock Approved Sources & Proceed/i,
    });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-appr-801",
        expect.objectContaining({
          source_approval_vault: "completed",
        })
      );
      expect(onAdvanceMock).toHaveBeenCalledWith("additional_data");
    });
  });

  it("parameterizes correctly for Stage 12: source_approval_external", async () => {
    const onAdvanceMock = vi.fn();

    const projectExternal: ProjectView = {
      ...mockProjectWithVaultSources,
      answers: {
        ...mockProjectWithVaultSources.answers,
        pending_external_sources: JSON.stringify([
          {
            id: "ext-src-1",
            title: "Dynamic Partitions in Wide-Area Consensus Networks",
            author: "Smith, J.",
            year: 2024,
            relevance_score: 91,
          },
        ]),
        approved_external_sources: "[]",
      },
    };

    render(
      <SourceApprovalStage
        stage="source_approval_external"
        projectId="proj-appr-801"
        project={projectExternal}
        onAdvance={onAdvanceMock}
      />
    );

    expect(screen.getByRole("heading", { name: /^External Approval$/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Dynamic Partitions in Wide-Area Consensus Networks/i)
    ).toBeInTheDocument();

    const approveBtn = screen.getByRole("button", { name: /✓ Approve Source/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Approved Library \(1\)/i)).toBeInTheDocument();
    });

    const proceedBtn = screen.getByRole("button", {
      name: /Lock Approved Sources & Proceed/i,
    });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      // Stage 12 advances to evidence_analysis
      expect(onAdvanceMock).toHaveBeenCalledWith("evidence_analysis");
    });
  });
});
