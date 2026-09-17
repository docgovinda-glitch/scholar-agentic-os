// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AdditionalDataStage from "../stages/AdditionalDataStage";
import * as api from "../../api";
import * as vaultContents from "../../../services/vaultContents";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
}));

vi.mock("../../../services/supabaseClient", () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-901" } },
      }),
    },
  })),
}));

vi.mock("../../../services/vaultContents", () => ({
  addVaultItem: vi.fn().mockResolvedValue({ id: "vault-item-new" }),
}));

const mockProject: ProjectView = {
  projectId: "proj-data-901",
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
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 9: Primary Data Ingestion (AdditionalDataStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({
        ...mockProject,
        answers: { ...mockProject.answers, ...answers },
      })
    );
  });

  it("renders Stage 9 header, Grounding Foundation ribbon, and initial datasets", async () => {
    render(
      <AdditionalDataStage
        stage="additional_data"
        projectId="proj-data-901"
        project={mockProject}
      />
    );

    expect(screen.getByRole("heading", { name: /^Primary Data$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase II: Evidence Extraction/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"Sub-Second Byzantine Agreement Under Asymmetric Partitions"/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/WAN-Benchmark-Traces\.csv/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Datasets Attached/i)).toBeInTheDocument();
  });

  it("attaches tabular data via direct paste workbench", async () => {
    render(
      <AdditionalDataStage
        stage="additional_data"
        projectId="proj-data-901"
        project={mockProject}
      />
    );

    // Switch to Paste Tab
    const pasteTab = screen.getByRole("button", { name: /Paste Tabular Data/i });
    fireEvent.click(pasteTab);

    // Fill form
    const nameInput = screen.getByPlaceholderText(/e\.g\. WAN Byzantine Latency/i);
    fireEvent.change(nameInput, { target: { value: "Cross-Datacenter RTT Measurements" } });

    const contentInput = screen.getByPlaceholderText(/Paste CSV rows, markdown table/i);
    fireEvent.change(contentInput, {
      target: { value: "region,rtt_ms\nus-east,14\neu-west,85\nap-south,190" },
    });

    const submitBtn = screen.getByRole("button", { name: /\+ Attach Data to Manuscript/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Cross-Datacenter RTT Measurements/i).length).toBeGreaterThan(0);
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-data-901",
        expect.objectContaining({
          additional_datasets: expect.stringContaining("Cross-Datacenter RTT Measurements"),
        })
      );
    });
  });

  it("opens dataset preview drawer and removes a dataset", async () => {
    render(
      <AdditionalDataStage
        stage="additional_data"
        projectId="proj-data-901"
        project={mockProject}
      />
    );

    // Click Preview Excerpt
    const previewBtn = screen.getByRole("button", { name: /Preview Excerpt →/i });
    fireEvent.click(previewBtn);

    expect(screen.getByText(/^Dataset Preview$/i)).toBeInTheDocument();
    expect(screen.getByText(/node_id,latency_ms,packet_loss/i)).toBeInTheDocument();

    // Close preview
    const closeBtn = screen.getByRole("button", { name: /^Close$/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByText(/^Dataset Preview$/i)).not.toBeInTheDocument();

    // Remove dataset
    const removeBtn = screen.getByTitle(/Remove dataset/i);
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/WAN-Benchmark-Traces\.csv/i)).not.toBeInTheDocument();
      expect(screen.getByText(/No Primary Datasets Attached/i)).toBeInTheDocument();
    });
  });

  it("locks primary data and advances to evidence_extraction", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    render(
      <AdditionalDataStage
        stage="additional_data"
        projectId="proj-data-901"
        project={mockProject}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    const proceedBtn = screen.getByRole("button", {
      name: /Proceed to Evidence Extraction/i,
    });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-data-901",
        expect.objectContaining({
          additional_data: "completed",
        })
      );
      expect(onAdvanceMock).toHaveBeenCalledWith("evidence_extraction");
    });
  });

  it("allows skipping supplementary data when 0 datasets are attached", async () => {
    const onAdvanceMock = vi.fn();

    const emptyProject: ProjectView = {
      ...mockProject,
      answers: {
        ...mockProject.answers,
        additional_datasets: "[]",
      },
    };

    render(
      <AdditionalDataStage
        stage="additional_data"
        projectId="proj-data-901"
        project={emptyProject}
        onAdvance={onAdvanceMock}
      />
    );

    expect(screen.getByText(/Skip Supplementary Data →/i)).toBeInTheDocument();

    const skipBtn = screen.getByRole("button", { name: /Skip Supplementary Data →/i });
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(onAdvanceMock).toHaveBeenCalledWith("evidence_extraction");
    });
  });
});
