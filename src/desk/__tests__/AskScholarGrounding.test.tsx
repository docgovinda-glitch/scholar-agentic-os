// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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
  { title: "Social media and polarization: a review", url: "https://doi.org/10.1/abc", snippet: "Mixed effects on polarization.", authors: ["Kubin, E."], source: "openalex", publicationDate: "2024-03-01" },
  { title: "Echo chambers online?", url: "https://doi.org/10.2/def", snippet: "Echo chambers are smaller than assumed.", authors: ["Arguedas, A."], source: "crossref", publicationDate: "2022-05-01" },
];

function open() {
  render(
    <MemoryRouter>
      <ProjectListScreen onOpen={vi.fn()} userEmail="researcher@university.edu" onOpenAiAccess={vi.fn()} />
    </MemoryRouter>
  );
  const buttons = screen.getAllByRole("button", { name: /Ask Scholar/i });
  fireEvent.click(buttons[0]);
}

async function ask(text: string) {
  const box = screen.getAllByRole("textbox").find((el) => (el as HTMLTextAreaElement).placeholder?.length) as HTMLTextAreaElement;
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest("form")!);
}

describe("Ask Scholar grounds every answer in a fresh search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAiOperationalStatus.mockResolvedValue({ connected: true, statusText: "Ready", provider: "openai" });
    executeAgenticQuery.mockResolvedValue({ ok: true, text: "Effects are mixed [1]; echo chambers are smaller than assumed [2].", mode: "chat" });
  });
  afterEach(() => cleanup());

  it("has no grounding switch, says Ready, and searches before answering with numbered sources", async () => {
    executeLiveSearch.mockResolvedValue(SOURCES);
    open();
    expect(screen.queryByText(/Live Grounding/i)).toBeNull();
    expect(screen.queryByTestId("ask-scholar-live-grounding-toggle")).toBeNull();
    expect(await screen.findByText("Ready")).toBeInTheDocument();

    await ask("Does social media increase political polarisation among young voters?");
    await waitFor(() => expect(executeAgenticQuery).toHaveBeenCalled());
    expect(executeLiveSearch).toHaveBeenCalledWith("Does social media increase political polarisation among young voters?");
    // The search results go to the AI with the question.
    expect(executeAgenticQuery.mock.calls[0][0].systemPrompt).toContain('[1] "Social media and polarization: a review"');

    expect(await screen.findByText(/Sources \(2\)/)).toBeInTheDocument();
    expect(screen.getByLabelText("Source 1")).toHaveTextContent("[1]");
    expect(screen.getByRole("link", { name: /Echo chambers online\?/ })).toHaveAttribute("href", "https://doi.org/10.2/def");
  });

  it("searches a follow-up together with the question before it, and says when nothing was found", async () => {
    executeLiveSearch.mockResolvedValueOnce(SOURCES).mockResolvedValueOnce([]);
    open();
    await ask("Does social media increase political polarisation among young voters?");
    await waitFor(() => expect(executeAgenticQuery).toHaveBeenCalledTimes(1));
    await screen.findByText(/Sources \(2\)/);

    await ask("What about in Nepal?");
    await waitFor(() => expect(executeAgenticQuery).toHaveBeenCalledTimes(2));
    expect(executeLiveSearch).toHaveBeenLastCalledWith(
      "Does social media increase political polarisation among young voters? What about in Nepal?"
    );
    expect(await screen.findByTestId("no-live-sources")).toHaveTextContent("No recent sources were found");
  });

  it("the AI pill shows an AI as active only when one is really connected", async () => {
    getAiOperationalStatus.mockResolvedValue({ connected: false, statusText: "AI Disconnected", providers: [], capabilities: {} });
    const { unmount } = render(
      <MemoryRouter>
        <ProjectListScreen onOpen={vi.fn()} userEmail="researcher@university.edu" onOpenAiAccess={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId("active-ai-pill")).toHaveTextContent("Connect an AI"));
    unmount();
    getAiOperationalStatus.mockResolvedValue({ connected: true, statusText: "Ready", providers: [{ id: "groq", name: "Groq", model: "m", tier: "free" }], capabilities: {} });
    render(
      <MemoryRouter>
        <ProjectListScreen onOpen={vi.fn()} userEmail="researcher@university.edu" onOpenAiAccess={vi.fn()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId("active-ai-pill")).toHaveTextContent("AI: Groq"));
  });
});

