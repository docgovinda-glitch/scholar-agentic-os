// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

const executeAgenticQuery = vi.fn();
const getAiOperationalStatus = vi.fn();
const executeLiveSearch = vi.fn();

vi.mock("../api", () => ({
  createProject: vi.fn(),
  listOutputTypes: vi.fn().mockResolvedValue({ items: [] }),
  listProjects: vi.fn().mockResolvedValue({ items: [] }),
  deleteProject: vi.fn(),
  saveIntakeAnswers: vi.fn(),
  executeAgenticLLM: vi.fn().mockRejectedValue(new Error("not used")),
  fetchDeepResearchPlan: vi.fn().mockResolvedValue({ fromModel: false, subQuestions: [] }),
  executeAgenticQuery: (...a: unknown[]) => executeAgenticQuery(...a),
  fetchAskSearchPlan: () => Promise.resolve(null),
  getAiOperationalStatus: (...a: unknown[]) => getAiOperationalStatus(...a),
  parseFileForAgent: vi.fn(),
}));

vi.mock("../../services/liveSearchService", async (orig) => ({
  ...(await orig<typeof import("../../services/liveSearchService")>()),
  executeLiveSearch: (...a: unknown[]) => executeLiveSearch(...a),
}));

vi.mock("../../services/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }),
  isSupabaseConfigured: () => true,
}));

const { default: ProjectListScreen } = await import("../ProjectListScreen");

const MOCK_SOURCES = [
  {
    title: "Deep Reinforcement Learning in Algorithmic Trading",
    url: "https://doi.org/10.1016/j.drl.2024.01",
    snippet: "Empirical findings show robust alpha generation in high-frequency regimes.",
    authors: ["Vaswani, A.", "Sutton, R."],
    source: "openalex" as const,
    publicationDate: "2024",
    stance: "supporting" as const,
  },
  {
    title: "Market Microstructure Noise & Overfitting Limits",
    url: "https://doi.org/10.1016/j.noise.2023.05",
    snippet: "Transaction costs and latency slippage counteract alleged gains.",
    authors: ["Lopez de Prado, M."],
    source: "crossref" as const,
    publicationDate: "2023",
    stance: "contradicting" as const,
  },
];

function open() {
  render(
    <MemoryRouter>
      <ProjectListScreen onOpen={vi.fn()} userEmail="scholar@mit.edu" onOpenAiAccess={vi.fn()} />
    </MemoryRouter>
  );
  const buttons = screen.getAllByRole("button", { name: /Ask Scholar/i });
  fireEvent.click(buttons[0]);
}

async function ask(text: string) {
  const box = screen.getByLabelText("Ask Scholar question input") as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest("form")!);
}

describe("Ask Scholar Advanced Features: Scite Stance, Citation Graph, and Peer Review 2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAiOperationalStatus.mockResolvedValue({ connected: true, statusText: "Ready", provider: "openai" });
    executeLiveSearch.mockResolvedValue(MOCK_SOURCES);
    executeAgenticQuery.mockResolvedValue({
      ok: true,
      text: "Algorithmic reinforcement learning shows promising returns [1], though empirical microstructure noise poses severe overfitting risks [2].",
      mode: "chat",
      wordCount: 18,
      verifiedSourcesCount: 2,
      citations: [
        {
          id: "1",
          sourceId: "1",
          marker: "[1]",
          title: MOCK_SOURCES[0].title,
          url: MOCK_SOURCES[0].url,
          authors: MOCK_SOURCES[0].authors,
          year: "2024",
          snippet: MOCK_SOURCES[0].snippet,
          stance: "supporting",
          sourceType: "scholarly",
        },
        {
          id: "2",
          sourceId: "2",
          marker: "[2]",
          title: MOCK_SOURCES[1].title,
          url: MOCK_SOURCES[1].url,
          authors: MOCK_SOURCES[1].authors,
          year: "2023",
          snippet: MOCK_SOURCES[1].snippet,
          stance: "contradicting",
          sourceType: "scholarly",
        },
      ],
      peerReviewAudit: {
        overallVerdict: "Methodological framework validated",
        critiques: [
          {
            type: "causal_inference",
            title: "Simulated Backtesting vs. Live Slippage",
            explanation: "Order execution assumptions fail to model endogenous market impact in illiquid hours.",
            severity: "medium",
          },
        ],
        methodologicalStrengths: [
          "Dual verification against cross-market empirical books",
          "Explicit attribution with Scite-grade stance labeling",
        ],
        counterTheories: [
          "Adaptive Market Hypothesis predicting diminishing returns to static RL policies",
        ],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the answer with one Sources panel instead of view tabs", async () => {
    open();
    await ask("How does RL perform in financial markets?");

    const panel = await screen.findByTestId("answer-sources-panel");
    expect(within(panel).getByText("Sources")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Open citation graph/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Review$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Evidence Matrix/i })).toBeNull();
  });

  it("opens the citation graph full-screen from the Sources panel", async () => {
    open();
    await ask("How does RL perform in financial markets?");

    const panel = await screen.findByTestId("answer-sources-panel");
    fireEvent.click(within(panel).getByRole("button", { name: /Open citation graph/i }));
    expect(await screen.findByTestId("citation-graph-overlay")).toBeInTheDocument();
  });

  it("puts the model-verified Peer Reviewer 2 stress-test inside the Sources panel, with no invented score", async () => {
    open();
    await ask("How does RL perform in financial markets?");

    const panel = await screen.findByTestId("answer-sources-panel");
    await waitFor(() => {
      expect(within(panel).getByText(/Peer Reviewer 2 stress-test \(model-verified\)/i)).toBeInTheDocument();
      expect(within(panel).getByText(/Simulated Backtesting vs. Live Slippage/i)).toBeInTheDocument();
      expect(within(panel).getByText(/^MEDIUM$/i)).toBeInTheDocument();
      expect(screen.queryByText(/\/100/)).toBeNull();
    });
  });
});
