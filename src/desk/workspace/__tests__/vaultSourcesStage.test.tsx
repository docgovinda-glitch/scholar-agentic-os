// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VaultSourcesStage from "../stages/VaultSourcesStage";
import * as api from "../../api";
import * as vaultContents from "../../../services/vaultContents";
import type { ProjectView } from "../../types";
import { FeedbackProvider } from "../../../components/ui/FeedbackSystem";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  authedStreamFetch: vi.fn(),
}));

vi.mock("../../../services/supabaseClient", () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-123" } },
      }),
    },
  })),
}));

vi.mock("../../../services/vaultContents", () => ({
  listVaultItems: vi.fn(),
  addVaultItem: vi.fn(),
}));

const mockProject: ProjectView = {
  projectId: "proj-vault-701",
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
        description: "Existing BFT benchmarks assume symmetric network partitions.",
        importance_score: 95,
        feasibility_score: 88,
      },
    ]),
    selected_gaps: JSON.stringify(["gap-1"]),
    anchor_gap_id: "gap-1",
    selected_gap: "gap-1",
    title_locked: "true",
  },
  authors: [],
  intakeCompleteness: 0.9,
  hasDocument: false,
  hasJournalRequirements: false,
  gates: [],
};

const mockVaultItems: vaultContents.VaultItem[] = [
  {
    id: "v-item-1",
    title: "Practical Byzantine Fault Tolerance and Proactive Recovery",
    content: "Algorithms for state machine replication that tolerate Byzantine faults in asynchronous networks.",
    authors: ["Castro, M.", "Liskov, B."],
    year: "2002",
    journal: "ACM TOCS",
    sourceType: "file",
    tags: ["consensus", "byzantine", "replication"],
    citationStatus: "confirmed",
    createdAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "v-item-2",
    title: "Asymmetric Quorum Systems for WAN Consensus",
    content: "Benchmarking WAN partition latency and quorum consensus throughput under high latency jitter.",
    authors: ["Rostova, E."],
    year: "2023",
    journal: "IEEE S&P",
    sourceType: "reference",
    tags: ["quorum", "asymmetric", "wan"],
    citationStatus: "confirmed",
    createdAt: "2024-01-02T00:00:00Z",
  },
];

describe("Stage 7: Primary Source Vault (VaultSourcesStage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vaultContents.listVaultItems as any).mockResolvedValue(mockVaultItems);
    (api.saveIntakeAnswers as any).mockImplementation((_id: string, answers: any) =>
      Promise.resolve({
        ...mockProject,
        answers: { ...mockProject.answers, ...answers },
      })
    );
  });

  it("renders Stage 7 header, Grounding Foundation ribbon, and initial actions", async () => {
    render(
      <VaultSourcesStage
        stage="vault_sources"
        projectId="proj-vault-701"
        project={mockProject}
      />
    );

    expect(screen.getByRole("heading", { name: /^Knowledge Vault$/i })).toBeInTheDocument();
    expect(screen.getByText(/Phase II: Evidence Extraction/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/"Sub-Second Byzantine Agreement Under Asymmetric Partitions"/i).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/ACM Transactions on Computer Systems/i)).toBeInTheDocument();
    expect(screen.getByText(/Empirical Benchmarking/i)).toBeInTheDocument();
  });

  it("loads and displays vault inventory with search filtering", async () => {
    render(
      <VaultSourcesStage
        stage="vault_sources"
        projectId="proj-vault-701"
        project={mockProject}
      />
    );

    // Switch to Vault Inventory tab
    const inventoryTab = screen.getByRole("button", { name: /^Vault Inventory/i });
    fireEvent.click(inventoryTab);

    await waitFor(() => {
      expect(
        screen.getByText(/Practical Byzantine Fault Tolerance and Proactive Recovery/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Asymmetric Quorum Systems for WAN Consensus/i)
      ).toBeInTheDocument();
    });

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Search vault items/i);
    fireEvent.change(searchInput, { target: { value: "Asymmetric Quorum" } });

    expect(
      screen.queryByText(/Practical Byzantine Fault Tolerance and Proactive Recovery/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Asymmetric Quorum Systems for WAN Consensus/i)
    ).toBeInTheDocument();
  });

  it("executes semantic radar scan and displays discovered candidates", async () => {
    (api.authedStreamFetch as any).mockImplementation(
      async (_url: string, _method: string, _body: any, onChunk: any) => {
        onChunk("chunk", { message: "Analyzing primary sources in vault..." });
        onChunk("done", {
          ok: true,
          data: [
            {
              id: "v-item-1",
              title: "Practical Byzantine Fault Tolerance and Proactive Recovery",
              author: "Castro, M., Liskov, B.",
              year: 2002,
              relevance_score: 96,
              type: "PDF Document",
              snippet: "Algorithms for state machine replication that tolerate Byzantine faults.",
              themes: ["consensus", "byzantine", "replication"],
            },
          ],
        });
      }
    );

    render(
      <VaultSourcesStage
        stage="vault_sources"
        projectId="proj-vault-701"
        project={mockProject}
      />
    );

    const scanBtn = screen.getByRole("button", { name: /Run Semantic Radar Scan/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Archivist Radar Discoveries/i)).toBeInTheDocument();
      expect(screen.getByText(/96% Relevance/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Practical Byzantine Fault Tolerance and Proactive Recovery/i)
      ).toBeInTheDocument();
    });
  });

  it("toggles source selection and opens Document Inspector", async () => {
    const projectWithPending: ProjectView = {
      ...mockProject,
      answers: {
        ...mockProject.answers,
        pending_vault_sources: JSON.stringify([
          {
            id: "v-item-1",
            title: "Practical Byzantine Fault Tolerance and Proactive Recovery",
            author: "Castro, M.",
            year: 2002,
            relevance_score: 95,
            type: "PDF Document",
            snippet: "State machine replication algorithm.",
            matched_concepts: ["byzantine"],
          },
        ]),
      },
    };

    render(
      <VaultSourcesStage
        stage="vault_sources"
        projectId="proj-vault-701"
        project={projectWithPending}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Practical Byzantine Fault Tolerance and Proactive Recovery/i)
      ).toBeInTheDocument();
    });

    // Inspect document
    const inspectBtn = screen.getByRole("button", { name: /Inspect Document/i });
    fireEvent.click(inspectBtn);

    expect(screen.getByText(/Document Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified Un-retracted/i)).toBeInTheDocument();

    // Close Inspector
    const closeBtn = screen.getByRole("button", { name: /Close/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Document Inspector/i)).not.toBeInTheDocument();
  });

  it("ingests a new primary source into the vault through the modal", async () => {
    (vaultContents.addVaultItem as any).mockResolvedValue({
      id: "v-item-new",
      title: "Novel Fast Byzantine Paxos Benchmark",
      content: "Empirical evaluation of latency bounds under partial synchrony.",
      authors: ["Dr. E. Rostova"],
      year: "2024",
      journal: "OSDI 2024",
      sourceType: "file",
      tags: ["paxos", "benchmark"],
      citationStatus: "confirmed",
      createdAt: new Date().toISOString(),
    });

    render(
      <FeedbackProvider>
        <VaultSourcesStage
          stage="vault_sources"
          projectId="proj-vault-701"
          project={mockProject}
        />
      </FeedbackProvider>
    );

    // Click + Ingest to Vault
    const ingestTrigger = screen.getByRole("button", { name: /\+ Ingest to Vault/i });
    fireEvent.click(ingestTrigger);

    expect(screen.getByText(/Knowledge Vault Ingestion/i)).toBeInTheDocument();

    // Fill form
    const titleInput = screen.getByPlaceholderText(/e\.g\. Asynchronous Consensus/i);
    fireEvent.change(titleInput, { target: { value: "Novel Fast Byzantine Paxos Benchmark" } });

    const authorsInput = screen.getByPlaceholderText(/e\.g\. Lamport, L\./i);
    fireEvent.change(authorsInput, { target: { value: "Dr. E. Rostova" } });

    const submitBtn = screen.getByRole("button", { name: /Ingest & Stage Source/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(vaultContents.addVaultItem).toHaveBeenCalled();
      expect(
        screen.getByText(/Source "Novel Fast Byzantine Paxos Benchmark" successfully ingested/i)
      ).toBeInTheDocument();
    });
  });

  it("persists pending_vault_sources and advances to source_approval_vault", async () => {
    const onAdvanceMock = vi.fn();
    const onSavedMock = vi.fn();

    const projectWithPending: ProjectView = {
      ...mockProject,
      answers: {
        ...mockProject.answers,
        pending_vault_sources: JSON.stringify([
          {
            id: "v-item-2",
            title: "Asymmetric Quorum Systems for WAN Consensus",
            author: "Rostova, E.",
            year: 2023,
            relevance_score: 92,
            type: "Academic Paper",
          },
        ]),
      },
    };

    render(
      <VaultSourcesStage
        stage="vault_sources"
        projectId="proj-vault-701"
        project={projectWithPending}
        onSaved={onSavedMock}
        onAdvance={onAdvanceMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/1 primary sources selected/i)).toBeInTheDocument();
    });

    const proceedBtn = screen.getByRole("button", {
      name: /Proceed to Vault Approval Triage/i,
    });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(api.saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-vault-701",
        expect.objectContaining({
          vault_sources: "completed",
        })
      );
      expect(onAdvanceMock).toHaveBeenCalledWith("source_approval_vault");
    });
  });
});
