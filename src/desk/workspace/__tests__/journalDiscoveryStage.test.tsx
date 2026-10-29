// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import JournalDiscoveryStage from "../stages/JournalDiscoveryStage";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  authedStreamFetch: vi.fn(),
  saveIntakeAnswers: vi.fn(),
}));

const mockProjectWithCharter: ProjectView = {
  projectId: "proj-draft-1501",
  outputTypeId: "OT-10",
  answers: {
    working_title: "Sub-Second Byzantine Agreement Under Asymmetric Partitions",
    primary_research_question: "How do dynamic quorum adjustments preserve throughput during WAN splits?",
    research_area: "Computer Science & Distributed Systems",
    article_type: "Original Research",
    study_design: "Empirical Benchmarking",
    target_journal: "ACM Transactions on Computer Systems (TOCS)",
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
      { id: "v-src-2", title: "Asymmetric Quorum Systems" },
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
      },
      {
        id: "cluster-2",
        theme: "Predictive Latency Recovery via Dynamic Reconfiguration",
        strength: "High",
      },
    ]),
    manual_synthesis: "Lead investigator directive: emphasize 35% packet drop resilience boundary.",
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

describe("Stage 15: Journal Discovery (JournalDiscoveryStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.saveIntakeAnswers as any).mockImplementation(
      async (id: string, answers: Record<string, string>) => ({
        ...mockProjectWithCharter,
        answers: { ...mockProjectWithCharter.answers, ...answers },
      })
    );
  });

  it("renders Stage 15 header, Grounding Foundation ribbon, and initial pre-selected target journal", () => {
    render(
      <JournalDiscoveryStage
        stage="journal_discovery"
        projectId="proj-draft-1501"
        project={mockProjectWithCharter}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: /^Journal Discovery$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase III: Drafting • Stage 15 of 25/i)).toBeInTheDocument();
    expect(screen.getByText(/Citations/i)).toBeInTheDocument();
    expect(screen.getByText(/Datasets/i)).toBeInTheDocument();
    expect(screen.getByText(/Clusters/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Initialize Radar Scan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nominate Custom Journal/i })).toBeInTheDocument();
  });

  it("triggers venue radar agent and renders streaming discovered journal cards", async () => {
    (api.authedStreamFetch as any).mockImplementation(
      async (url: string, method: string, body: any, onEvent: any) => {
        onEvent("log", { message: "Probing IEEE and ACM indexes..." });
        onEvent("chunk", { chunk: "Evaluating impact factors and scope alignment..." });
        onEvent("done", {
          data: [
            {
              id: "j-stream-1",
              title: "IEEE Transactions on Dependable and Secure Computing",
              publisher: "IEEE Computer Society",
              impact_factor: 6.4,
              sjr_quartile: "Q1",
              match_score: 97,
              open_access: true,
              acceptance_rate: "13%",
              review_speed_weeks: 4.5,
              fit_rationale: "Direct thematic fit for Byzantine fault tolerance under asymmetric partitions.",
            },
            {
              id: "j-stream-2",
              title: "ACM Transactions on Computer Systems",
              publisher: "ACM",
              impact_factor: 5.8,
              sjr_quartile: "Q1",
              match_score: 95,
              open_access: false,
              acceptance_rate: "11%",
              review_speed_weeks: 5.0,
              fit_rationale: "Premier venue for operating systems and network partition recovery.",
            },
          ],
        });
      }
    );

    render(
      <JournalDiscoveryStage
        stage="journal_discovery"
        projectId="proj-draft-1501"
        project={mockProjectWithCharter}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const scanBtn = screen.getByRole("button", { name: /Initialize Radar Scan/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /IEEE Transactions on Dependable and Secure Computing/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /ACM Transactions on Computer Systems/i })).toBeInTheDocument();
      expect(screen.getByText(/97% Match/i)).toBeInTheDocument();
      expect(screen.getByText(/IF: 6.4/i)).toBeInTheDocument();
    });
  });

  it("suggests nothing and says so when the AI request fails", async () => {
    // Rewritten 2026-10-29: this used to assert a hardcoded fallback list of
    // journals ("ACM Transactions on Computer Systems (TOCS)" …) with invented metrics.
    (api.authedStreamFetch as any).mockRejectedValue(new Error("Network connection dropped"));

    render(
      <JournalDiscoveryStage
        stage="journal_discovery"
        projectId="proj-draft-1501"
        project={mockProjectWithCharter}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Initialize Radar Scan/i }));

    await waitFor(() => {
      expect(screen.getByText(/Journal suggestions unavailable: nothing was added/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /ACM Transactions on Computer Systems \(TOCS\)/i })).not.toBeInTheDocument();
  });

  it("filters discovered journals by text query and access model", async () => {
    const projectWithSavedJournals: ProjectView = {
      ...mockProjectWithCharter,
      answers: {
        ...mockProjectWithCharter.answers,
        discovered_journals: JSON.stringify([
          {
            id: "j-1",
            title: "IEEE Transactions on Dependable and Secure Computing",
            publisher: "IEEE",
            impact_factor: 6.4,
            sjr_quartile: "Q1",
            match_score: 97,
            open_access: true,
            acceptance_rate: "13%",
            fit_rationale: "Fit 1",
          },
          {
            id: "j-2",
            title: "ACM Transactions on Computer Systems",
            publisher: "ACM",
            impact_factor: 5.8,
            sjr_quartile: "Q1",
            match_score: 95,
            open_access: false,
            acceptance_rate: "11%",
            fit_rationale: "Fit 2",
          },
        ]),
      },
    };

    render(
      <JournalDiscoveryStage
        stage="journal_discovery"
        projectId="proj-draft-1501"
        project={projectWithSavedJournals}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: /IEEE Transactions on Dependable and Secure Computing/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ACM Transactions on Computer Systems/i })).toBeInTheDocument();

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Search candidate journals/i);
    fireEvent.change(searchInput, { target: { value: "ACM" } });

    expect(screen.queryByRole("heading", { name: /IEEE Transactions on Dependable and Secure Computing/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ACM Transactions on Computer Systems/i })).toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });

    // Open Access filter
    const accessSelect = screen.getByLabelText(/Filter by access model/i);
    fireEvent.change(accessSelect, { target: { value: "oa" } });

    expect(screen.getByRole("heading", { name: /IEEE Transactions on Dependable and Secure Computing/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /ACM Transactions on Computer Systems/i })).not.toBeInTheDocument();
  });

  it("opens and closes the scope and aims inspector modal", async () => {
    const projectWithSavedJournals: ProjectView = {
      ...mockProjectWithCharter,
      answers: {
        ...mockProjectWithCharter.answers,
        discovered_journals: JSON.stringify([
          {
            id: "j-1",
            title: "IEEE Transactions on Dependable and Secure Computing",
            publisher: "IEEE Computer Society",
            impact_factor: 6.4,
            sjr_quartile: "Q1",
            match_score: 97,
            open_access: true,
            acceptance_rate: "13%",
            review_speed_weeks: 4.8,
            aims_scope: "Dedicated to cryptographic and consensus protocols.",
            fit_rationale: "High empirical alignment.",
            indexing: ["Scopus", "Web of Science", "IEEE Xplore"],
          },
        ]),
      },
    };

    render(
      <JournalDiscoveryStage
        stage="journal_discovery"
        projectId="proj-draft-1501"
        project={projectWithSavedJournals}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const inspectBtn = screen.getByRole("button", { name: /Inspect Scope & Rules/i });
    fireEvent.click(inspectBtn);

    expect(screen.getByText(/Editorial Dossier & Compliance Rubric/i)).toBeInTheDocument();
    expect(screen.getByText(/Dedicated to cryptographic and consensus protocols/i)).toBeInTheDocument();
    expect(screen.getByText(/IEEE Xplore/i)).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /Close/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByText(/Editorial Dossier & Compliance Rubric/i)).not.toBeInTheDocument();
  });

  it("nominates a custom journal via modal and selects it", async () => {
    render(
      <JournalDiscoveryStage
        stage="journal_discovery"
        projectId="proj-draft-1501"
        project={mockProjectWithCharter}
        onSaved={vi.fn()}
        onAdvance={vi.fn()}
      />
    );

    const nominateBtn = screen.getByRole("button", { name: /Nominate Custom Journal/i });
    fireEvent.click(nominateBtn);

    expect(screen.getByText(/Nominate Custom Academic Journal/i)).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/Journal of Parallel and Distributed Computing/i);
    fireEvent.change(titleInput, { target: { value: "Journal of Network Protocols & Systems" } });

    const submitBtn = screen.getByRole("button", { name: /Nominate & Target Journal/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Journal of Network Protocols & Systems/i })).toBeInTheDocument();
    });
  });

  it("locks selected journal and advances to Stage 16 (journal_requirements)", async () => {
    const onAdvanceMock = vi.fn();
    const projectWithSavedJournals: ProjectView = {
      ...mockProjectWithCharter,
      answers: {
        ...mockProjectWithCharter.answers,
        discovered_journals: JSON.stringify([
          {
            id: "j-1",
            title: "IEEE Transactions on Dependable and Secure Computing",
            publisher: "IEEE Computer Society",
            impact_factor: 6.4,
            sjr_quartile: "Q1",
            match_score: 97,
            open_access: true,
          },
        ]),
        target_journal: "IEEE Transactions on Dependable and Secure Computing",
      },
    };

    render(
      <JournalDiscoveryStage
        stage="journal_discovery"
        projectId="proj-draft-1501"
        project={projectWithSavedJournals}
        onSaved={vi.fn()}
        onAdvance={onAdvanceMock}
      />
    );

    const lockBtn = screen.getByRole("button", {
      name: /Lock Target Journal & Proceed to Requirements Analysis/i,
    });
    fireEvent.click(lockBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-draft-1501",
        expect.objectContaining({
          target_journal: "IEEE Transactions on Dependable and Secure Computing",
          journal_discovery_completed: "true",
        })
      );
      expect(onAdvanceMock).toHaveBeenCalledWith("journal_requirements");
    });
  });
});
