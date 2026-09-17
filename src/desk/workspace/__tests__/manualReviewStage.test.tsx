// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ManualReviewStage from "../stages/ManualReviewStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
}));

const mockProject: ProjectView = {
  projectId: "proj-rev-140",
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
        id: "v-1",
        title: "Practical Byzantine Fault Tolerance",
        author: "Castro & Liskov",
        year: 2002,
        relevance_score: 95,
        evidentiary_role: "benchmark",
      },
    ]),
    approved_external_sources: JSON.stringify([
      {
        id: "ext-1",
        title: "Adaptive BFT Reconfiguration",
        author: "Balasubramanian et al.",
        year: 2024,
        relevance_score: 94,
        evidentiary_role: "comparative",
      },
    ]),
    additional_datasets: JSON.stringify([
      {
        id: "d-1",
        name: "WAN-Benchmark-Traces.csv",
        format: "csv",
        rowCount: 450,
        sizeBytes: 104857,
      },
    ]),
    extracted_evidence: JSON.stringify([
      {
        id: "ev-1",
        quote: "Dynamic leader rotation caps WAN latency under 35% packet drops.",
        source: "Castro & Liskov (2002)",
        strength: "Strong",
      },
    ]),
    evidence_clusters: JSON.stringify([
      {
        id: "arg-1",
        theme: "Latency Bounds Under Asymmetric Wide-Area Network Partitions",
        primary_claim: "Static quorum sizing imposes severe throughput penalties during geographic splits.",
        source_primary: "Castro & Liskov (2002) PBFT",
        synthesized_support: "Dynamic quorums preserve sub-second commit latency under 35% packet drops.",
        source_support: "Balasubramanian et al. (2024)",
        argument_strength: "Very High",
      },
    ]),
    manual_synthesis: "Initial researcher observation on partition bounds.",
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 14: Researcher Review (ManualReviewStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({
        ...mockProject,
        answers: { ...mockProject.answers, ...answers },
      })
    );
  });

  it("renders Stage 14 header, Grounding Foundation ribbon, and integrity audit", async () => {
    render(
      <ManualReviewStage
        stage="manual_review"
        projectId="proj-rev-140"
        project={mockProject}
      />
    );

    expect(screen.getByRole("heading", { name: /^Researcher Review$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase II: Evidence Review/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage 14 of 25/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/"Sub-Second Byzantine Agreement Under Asymmetric Partitions"/i).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 Vault Sources/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 External Papers/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 Datasets/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 Claims/i).length).toBeGreaterThanOrEqual(1);

    // Check Integrity Audit
    expect(
      screen.getByText(/Phase II Evidentiary Integrity & Zero-Fabrication Audit/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All 5 Evidentiary Pillars Verified/i)
    ).toBeInTheDocument();
  });

  it("navigates through the 4-pillar evidentiary ledger tabs", async () => {
    render(
      <ManualReviewStage
        stage="manual_review"
        projectId="proj-rev-140"
        project={mockProject}
      />
    );

    // Tab 1: Argument Matrix (active by default)
    expect(
      screen.getByText(/Latency Bounds Under Asymmetric Wide-Area Network Partitions/i)
    ).toBeInTheDocument();

    // Tab 2: Approved Literature
    fireEvent.click(screen.getByRole("button", { name: /Approved Literature/i }));
    expect(
      screen.getByText(/Practical Byzantine Fault Tolerance/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Adaptive BFT Reconfiguration/i)
    ).toBeInTheDocument();

    // Tab 3: Datasets
    fireEvent.click(screen.getByRole("button", { name: /Datasets/i }));
    expect(
      screen.getByText(/WAN-Benchmark-Traces\.csv/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/450 rows/i)
    ).toBeInTheDocument();

    // Tab 4: Evidence Claims
    fireEvent.click(screen.getByRole("button", { name: /Evidence Claims/i }));
    expect(
      screen.getByText(/Dynamic leader rotation caps WAN latency under 35% packet drops\./i)
    ).toBeInTheDocument();
  });

  it("appends quick-insert drafting directive chips to synthesis textarea", async () => {
    render(
      <ManualReviewStage
        stage="manual_review"
        projectId="proj-rev-140"
        project={mockProject}
      />
    );

    const directiveBtn = screen.getByRole("button", { name: /\+.*Emphasize WAN Latency Variance/i });
    fireEvent.click(directiveBtn);

    const textarea = screen.getByPlaceholderText(/Ensure the discussion highlights the 35% packet drop threshold/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain("Emphasize how asymmetric WAN latency variance degrades static quorums");
    expect(screen.getByText(/Appended directive:/i)).toBeInTheDocument();
  });

  it("edits manual synthesis textarea directly", async () => {
    render(
      <ManualReviewStage
        stage="manual_review"
        projectId="proj-rev-140"
        project={mockProject}
      />
    );

    const textarea = screen.getByPlaceholderText(/Ensure the discussion highlights the 35% packet drop threshold/i);
    fireEvent.change(textarea, {
      target: { value: "Lead investigator note: Must strictly frame byzantine limits in Section 5." },
    });
    expect(textarea).toHaveValue("Lead investigator note: Must strictly frame byzantine limits in Section 5.");
  });

  it("seals Phase II evidentiary charter and advances to Stage 15 (journal_discovery)", async () => {
    const onAdvance = vi.fn();
    render(
      <ManualReviewStage
        stage="manual_review"
        projectId="proj-rev-140"
        project={mockProject}
        onAdvance={onAdvance}
      />
    );

    const sealBtn = screen.getByRole("button", {
      name: /Seal Evidence Charter & Proceed to Phase III: Drafting/i,
    });
    fireEvent.click(sealBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const payload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(payload.phase_2_signed_off).toBe("true");
      expect(payload.phase_3_ready).toBe("true");
      expect(payload.phase_3_signed_off).toBe("true");
      expect(onAdvance).toHaveBeenCalledWith("journal_discovery");
    });
  });
});
