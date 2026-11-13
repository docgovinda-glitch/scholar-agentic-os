// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
  executeAgenticQuery: (...a: unknown[]) => executeAgenticQuery(...a),
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

const SOURCES = [
  {
    title: "Attention Is All You Need",
    url: "https://doi.org/10.48550/arXiv.1706.03762",
    snippet: "Transformer architecture replaces recurrence with multi-head attention.",
    authors: ["Vaswani, A."],
    source: "openalex",
    publicationDate: "2017-06-12",
    stance: "supporting",
  },
  {
    title: "Direct Preference Optimization",
    url: "https://doi.org/10.48550/arXiv.2305.18290",
    snippet: "DPO eliminates the need for complex RL training loops.",
    authors: ["Rafailov, R."],
    source: "crossref",
    publicationDate: "2023-05-29",
    stance: "supporting",
  },
];

function openAskScholar() {
  render(
    <MemoryRouter>
      <ProjectListScreen onOpen={vi.fn()} userEmail="researcher@university.edu" onOpenAiAccess={vi.fn()} />
    </MemoryRouter>
  );
  const buttons = screen.getAllByRole("button", { name: /Ask Scholar/i });
  fireEvent.click(buttons[0]);
}

async function askQuestion(text: string) {
  const box = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).placeholder?.length) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest("form")!);
}

describe("Ask Scholar 2.0 Multi-Layer Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeLiveSearch.mockResolvedValue(SOURCES);
    getAiOperationalStatus.mockResolvedValue({ connected: true, statusText: "Ready", provider: "openai" });
    executeAgenticQuery.mockResolvedValue({
      ok: true,
      text: "Transformers [1] establish foundational representation learning while Direct Preference Optimization [2] achieves stable policy alignment without separate reward model estimation.",
      mode: "search",
      citations: [
        {
          id: "cite-1",
          title: "Attention Is All You Need",
          authors: ["Vaswani, A."],
          year: 2017,
          venue: "NeurIPS",
          url: "https://doi.org/10.48550/arXiv.1706.03762",
          snippet: "Transformer architecture replaces recurrence with multi-head attention.",
          stance: "supporting",
          sourceType: "scholarly",
        },
        {
          id: "cite-2",
          title: "Direct Preference Optimization",
          authors: ["Rafailov, R."],
          year: 2023,
          venue: "NeurIPS",
          url: "https://doi.org/10.48550/arXiv.2305.18290",
          snippet: "DPO eliminates the need for complex RL training loops.",
          stance: "supporting",
          sourceType: "scholarly",
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("navigates seamlessly from Ask Scholar response to Literature Discovery (Layer B), Evidence Synthesis (Layer C), and Research Export (Layer D)", async () => {
    openAskScholar();
    await askQuestion("How do transformers compare to DPO in modern alignment pipelines?");

    // 1. Verify assistant response renders
    expect(await screen.findByText(/Transformers/i)).toBeInTheDocument();

    // 2. Verify merged single-row primary tabs appear without duplicate row-2 buttons (Section 13)
    const matrixTabBtn = await screen.findByRole("button", { name: /Evidence Matrix \(2\)/i });
    const citationGraphTabBtn = await screen.findByRole("button", { name: /^Citation Graph$/i });
    const exportBtn = await screen.findByRole("button", { name: /^LaTeX$/i });

    expect(matrixTabBtn).toBeInTheDocument();
    expect(citationGraphTabBtn).toBeInTheDocument();
    expect(exportBtn).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Discovery$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Evidence Synthesis$/i })).toBeNull();

    // 3. Click Citation Graph tab -> Click Full Discovery Workspace -> Opens Literature Discovery Workspace (Layer B)
    fireEvent.click(citationGraphTabBtn);
    const fullDiscoveryBtn = await screen.findByRole("button", { name: /Full Discovery Workspace/i });
    fireEvent.click(fullDiscoveryBtn);

    expect(await screen.findByText("Literature Discovery Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Layer B · Citation Graph/i)).toBeInTheDocument();
    expect(screen.getByText("Snowball Selected Node")).toBeInTheDocument();

    // 4. From Literature Discovery, click "Synthesize Evidence" -> Transitions to Evidence Synthesis (Layer C)
    const proceedToSynthBtn = screen.getByText(/Synthesize Evidence/i);
    fireEvent.click(proceedToSynthBtn);

    expect(await screen.findByText("Evidence Synthesis Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Layer C · Matrix & Forest Plots/i)).toBeInTheDocument();

    // Check forest plot tab inside Evidence Synthesis
    const forestTab = screen.getByText("Interactive Forest Plot");
    fireEvent.click(forestTab);
    expect(screen.getByText(/Meta-Analytic Forest Plot/i)).toBeInTheDocument();

    // 5. From Evidence Synthesis, click "Export LaTeX & Overleaf Package" -> Transitions to Layer D
    const exportPackageBtn = screen.getByText("Export LaTeX & Overleaf Package");
    fireEvent.click(exportPackageBtn);

    expect(await screen.findByText("Research Export & Publishing Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Layer D · LaTeX & Overleaf/i)).toBeInTheDocument();
    expect(screen.getByText("Download Overleaf ZIP")).toBeInTheDocument();
    expect(screen.getByText("references.bib")).toBeInTheDocument();
  });
});
