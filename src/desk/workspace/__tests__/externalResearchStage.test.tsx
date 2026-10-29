// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ExternalResearchStage from "../stages/ExternalResearchStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  authedStreamFetch: vi.fn(),
}));

const mockProject: ProjectView = {
  projectId: "proj-ext-110",
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
      { id: "v-1", title: "Practical Byzantine Fault Tolerance" },
      { id: "v-2", title: "Dumbo Consensus" },
    ]),
    additional_datasets: JSON.stringify([
      { id: "d-1", name: "WAN-Traces.csv", format: "csv" },
    ]),
    extracted_evidence: JSON.stringify([
      { id: "ev-1", quote: "Latency bounds verified under packet loss." },
    ]),
    pending_external_sources: JSON.stringify([
      {
        id: "ext-init-1",
        title: "Adaptive Consensus Reconfiguration Under Byzantine Adversaries",
        author: "Balasubramanian et al.",
        year: 2024,
        database: "arXiv",
        doi: "10.48550/arXiv.2403.09112",
        gap_addressed: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
        snippet: "Dynamic leader rotation limits round-trip latency to sub-second bounds.",
        relevance: 96,
        relevance_score: 96,
        evidentiary_role: "benchmark",
      },
      {
        id: "ext-init-2",
        title: "Quantifying Asymmetric Network Delays in Modern Cloud Datacenters",
        author: "Al-Kiswany & Bernstein",
        year: 2023,
        database: "IEEE Xplore",
        doi: "10.1109/TNET.2023.3289014",
        gap_addressed: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
        snippet: "Comprehensive telemetry over 1.2M multi-region network packets.",
        relevance: 91,
        relevance_score: 91,
        evidentiary_role: "empirical",
      },
    ]),
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 11: External Research (ExternalResearchStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({
        ...mockProject,
        answers: { ...mockProject.answers, ...answers },
      })
    );
  });

  it("renders Stage 11 header, Grounding Foundation ribbon, and initial discovered papers", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    expect(screen.getByRole("heading", { name: /^External Research$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase II: Evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage 11 of 25/i)).toBeInTheDocument();
    expect(
      screen.getByText(/"Sub-Second Byzantine Agreement Under Asymmetric Partitions"/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/2 Vault Sources/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Datasets/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Claims Extracted/i)).toBeInTheDocument();

    // Check pre-populated external papers
    expect(
      screen.getByText(/Adaptive Consensus Reconfiguration Under Byzantine Adversaries/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Quantifying Asymmetric Network Delays in Modern Cloud Datacenters/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/external papers discovered and queued for approval triage/i)
    ).toBeInTheDocument();
  });

  it("filters discovered papers by query and database dropdown", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search discovered papers/i);
    fireEvent.change(searchInput, { target: { value: "Telemetry" } });

    // Should only show the second paper
    expect(
      screen.getByText(/Quantifying Asymmetric Network Delays in Modern Cloud Datacenters/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Adaptive Consensus Reconfiguration Under Byzantine Adversaries/i)
    ).not.toBeInTheDocument();

    // Clear search and test database dropdown
    fireEvent.change(searchInput, { target: { value: "" } });
    const dbSelect = screen.getByDisplayValue(/All Databases/i);
    fireEvent.change(dbSelect, { target: { value: "arXiv" } });

    expect(
      screen.getByText(/Adaptive Consensus Reconfiguration Under Byzantine Adversaries/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Quantifying Asymmetric Network Delays in Modern Cloud Datacenters/i)
    ).not.toBeInTheDocument();
  });

  it("toggles targeted academic databases and adjusts query in configuration panel", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    // PubMed toggle
    const pubMedBtn = screen.getByRole("button", { name: /\+.*PubMed/i });
    fireEvent.click(pubMedBtn);
    expect(screen.getByRole("button", { name: /✓.*PubMed/i })).toBeInTheDocument();

    // Query field and reset button
    const queryInput = screen.getByPlaceholderText(/e\.g\. Byzantine fault tolerance WAN/i);
    fireEvent.change(queryInput, { target: { value: "Custom BFT query" } });
    expect(queryInput).toHaveValue("Custom BFT query");

    const resetBtn = screen.getByRole("button", { name: /Reset to Gap/i });
    fireEvent.click(resetBtn);
    expect(queryInput).not.toHaveValue("Custom BFT query");
  });

  it("opens Paper Inspector Modal and displays abstract and DOI link", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    const inspectButtons = screen.getAllByRole("button", { name: /Inspect Abstract/i });
    fireEvent.click(inspectButtons[0]);

    expect(screen.getByText(/External Paper Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/Open DOI ↗/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Dynamic leader rotation limits round-trip latency to sub-second bounds\./i).length
    ).toBeGreaterThanOrEqual(1);

    // Close modal
    fireEvent.click(screen.getByRole("button", { name: /Close Inspector/i }));
    expect(screen.queryByText(/External Paper Inspector/i)).not.toBeInTheDocument();
  });

  it("manually ingests an external paper / DOI via modal", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ Add External Paper \/ DOI/i }));
    expect(screen.getByText(/Manual Literature Ingestion/i)).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/e\.g\. Asynchronous Byzantine Agreement in Practice/i);
    const authorInput = screen.getByPlaceholderText(/e\.g\. Lamport & Melliar-Smith/i);
    const doiInput = screen.getByPlaceholderText(/10\.1145\/\.\.\. or arXiv:2401\.xxxx/i);
    const snippetInput = screen.getByPlaceholderText(/Paste excerpt, empirical proof bound, or key finding/i);

    fireEvent.change(titleInput, { target: { value: "State Machine Replication Under Latency Asymmetry" } });
    fireEvent.change(authorInput, { target: { value: "L. Lamport" } });
    fireEvent.change(doiInput, { target: { value: "10.1145/smr.2024.11" } });
    fireEvent.change(snippetInput, { target: { value: "Formal bounds on quorum liveness under WAN partitions." } });

    fireEvent.click(screen.getByRole("button", { name: /Ingest External Paper/i }));

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.pending_external_sources).toContain(
        "State Machine Replication Under Latency Asymmetry"
      );
      expect(
        screen.getByText(/State Machine Replication Under Latency Asymmetry/i)
      ).toBeInTheDocument();
    });
  });

  it("excludes / deletes an external paper from the ledger", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    const excludeButtons = screen.getAllByRole("button", { name: /Exclude/i });
    fireEvent.click(excludeButtons[0]);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.pending_external_sources).not.toContain(
        "Adaptive Consensus Reconfiguration Under Byzantine Adversaries"
      );
      expect(
        screen.queryByText(/Adaptive Consensus Reconfiguration Under Byzantine Adversaries/i)
      ).not.toBeInTheDocument();
    });
  });

  it("runs Web Crawler extraction via authedStreamFetch without auto-advancing prematurely", async () => {
    const onAdvance = vi.fn();
    (api.authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("log", { message: "Connecting to CrossRef and Semantic Scholar..." });
        onChunk("chunk", { chunk: "Crawled 3 preprints matching WAN latency..." });
        onChunk("done", {
          data: [
            {
              id: "ext-stream-99",
              title: "Streamed Discovery Paper on Adaptive Quorums",
              author: "Crawler AI Agent",
              year: 2025,
              database: "CrossRef",
              doi: "10.1016/streamed.2025",
              gap_addressed: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
              snippet: "Direct confirmation of sub-second consensus bounds.",
              relevance: 98,
            },
          ],
        });
      }
    );

    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
        onAdvance={onAdvance}
      />
    );

    const crawlBtn = screen.getByRole("button", { name: /Re-Crawl Databases/i });
    fireEvent.click(crawlBtn);

    await waitFor(() => {
      expect(api.authedStreamFetch).toHaveBeenCalled();
      expect(screen.getByText(/Streamed Discovery Paper on Adaptive Quorums/i)).toBeInTheDocument();
      // CRITICAL: Must NOT auto-advance!
      expect(onAdvance).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Found 1 records\. Review and prune before triage\./i)
      ).toBeInTheDocument();
    });
  });

  it("adds nothing and says so when the literature search fails", async () => {
    // Rewritten 2026-10-29: this used to assert invented fallback papers
    // ("Formal Bounds on Quorum Intersections…") being saved on failure.
    (api.authedStreamFetch as any).mockRejectedValue(new Error("External API Timeout"));

    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={{
          ...mockProject,
          answers: {
            ...mockProject.answers,
            pending_external_sources: "", // empty
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Launch Web Crawler Agent/i }));

    await waitFor(() => {
      expect(screen.getByText(/Literature search unavailable: nothing was added/i)).toBeInTheDocument();
    });
    expect(api.saveIntakeAnswers).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/Formal Bounds on Quorum Intersections for Partition-Resilient State Machine Replication/i)
    ).not.toBeInTheDocument();
  });

  it("locks discovered sources and advances to Stage 12 (source_approval_external) on user action", async () => {
    const onAdvance = vi.fn();
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
        onAdvance={onAdvance}
      />
    );

    const proceedBtn = screen.getByRole("button", {
      name: /Lock Discovered Sources & Proceed to External Approval Triage/i,
    });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      expect(onAdvance).toHaveBeenCalledWith("source_approval_external");
    });
  });

  it("filters discovered papers by multi-lens evidentiary role tabs", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    // Initial state shows both
    expect(screen.getByText(/Adaptive Consensus Reconfiguration Under Byzantine Adversaries/i)).toBeInTheDocument();
    expect(screen.getByText(/Quantifying Asymmetric Network Delays in Modern Cloud Datacenters/i)).toBeInTheDocument();

    // Click Benchmark tab
    const benchmarkBtn = screen.getByRole("button", { name: /🏆 Benchmark/i });
    fireEvent.click(benchmarkBtn);

    expect(screen.getByText(/Adaptive Consensus Reconfiguration Under Byzantine Adversaries/i)).toBeInTheDocument();
    expect(screen.queryByText(/Quantifying Asymmetric Network Delays in Modern Cloud Datacenters/i)).not.toBeInTheDocument();

    // Click Empirical tab
    const empiricalBtn = screen.getByRole("button", { name: /🔬 Empirical/i });
    fireEvent.click(empiricalBtn);

    expect(screen.queryByText(/Adaptive Consensus Reconfiguration Under Byzantine Adversaries/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Quantifying Asymmetric Network Delays in Modern Cloud Datacenters/i)).toBeInTheDocument();

    // Click All Roles tab
    const allRolesBtn = screen.getByRole("button", { name: /All Roles/i });
    fireEvent.click(allRolesBtn);

    expect(screen.getByText(/Adaptive Consensus Reconfiguration Under Byzantine Adversaries/i)).toBeInTheDocument();
    expect(screen.getByText(/Quantifying Asymmetric Network Delays in Modern Cloud Datacenters/i)).toBeInTheDocument();
  });

  it("appends suggested keywords to the search query on chip click", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    const queryInput = screen.getByPlaceholderText(/e\.g\. Byzantine fault tolerance WAN/i) as HTMLInputElement;
    const initialQuery = queryInput.value;

    const chips = screen.getAllByTestId(/^keyword-chip-/);
    expect(chips.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(chips[0]);
    expect(queryInput.value.length).toBeGreaterThan(initialQuery.length);
  });

  it("copies APA and BibTeX citations to clipboard with user feedback", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    const apaButtons = screen.getAllByRole("button", { name: /📋 Copy APA/i });
    fireEvent.click(apaButtons[0]);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
      expect(writeTextMock.mock.calls[0][0]).toContain("Balasubramanian");
      expect(screen.getByText(/✓ Copied APA/i)).toBeInTheDocument();
    });

    const bibtexButtons = screen.getAllByRole("button", { name: /📜 BibTeX/i });
    fireEvent.click(bibtexButtons[0]);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledTimes(2);
      expect(writeTextMock.mock.calls[1][0]).toContain("@article{");
      expect(screen.getByText(/✓ Copied BibTeX/i)).toBeInTheDocument();
    });
  });

  it("supports batch paper selection and batch exclusion", async () => {
    render(
      <ExternalResearchStage
        stage="external_research"
        projectId="proj-ext-110"
        project={mockProject}
      />
    );

    const checkboxes = screen.getAllByTitle(/Select paper for batch actions/i);
    expect(checkboxes.length).toBe(2);

    // Select the first checkbox
    fireEvent.click(checkboxes[0]);

    // Batch Exclude button should appear with count 1
    const batchExcludeBtn = screen.getByRole("button", { name: /Batch Exclude \(1\)/i });
    expect(batchExcludeBtn).toBeInTheDocument();

    fireEvent.click(batchExcludeBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalled();
      const savedPayload = (api.saveIntakeAnswers as any).mock.calls[0][1];
      expect(savedPayload.pending_external_sources).not.toContain(
        "Adaptive Consensus Reconfiguration Under Byzantine Adversaries"
      );
      expect(screen.getByText(/Excluded 1 papers from discovery ledger/i)).toBeInTheDocument();
    });
  });
});

