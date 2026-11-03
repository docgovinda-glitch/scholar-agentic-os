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
  { title: "Echo chambers online?", url: "https://doi.org/10.2/def", snippet: "Echo chambers are smaller than assumed.", authors: ["Arguedas, A."], source: "crossref" },
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

describe("Ask Scholar answers you can follow, and failures you can act on", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeLiveSearch.mockResolvedValue(SOURCES);
  });
  afterEach(() => cleanup());

  it("links each [n] in the answer to the numbered source it came from", async () => {
    getAiOperationalStatus.mockResolvedValue({ connected: true, statusText: "Ready", provider: "openai" });
    executeAgenticQuery.mockResolvedValue({ ok: true, text: "Effects are mixed [1]; echo chambers are smaller than assumed [2].", mode: "chat" });
    open();
    await ask("Does social media increase political polarisation among young voters?");
    // Each marker opens its source, labelled in the chosen style (APA: author, year).
    const first = await screen.findByTitle(/^Source .*: Social media and polarization: a review$/);
    expect(first.closest("a")).toHaveAttribute("href", "https://doi.org/10.1/abc");
    expect(first.textContent).toMatch(/Kubin/);
    expect(screen.getByTitle(/^Source .*: Echo chambers online\?$/).closest("a")).toHaveAttribute("href", "https://doi.org/10.2/def");
  });

  it("with no AI connected, keeps the sources found and offers to connect one, without a word count or follow-ups", async () => {
    getAiOperationalStatus.mockResolvedValue({ connected: false, statusText: "AI Disconnected" });
    executeAgenticQuery.mockRejectedValue(new Error("No AI providers are configured or available on this device satisfying task requirements."));
    open();
    await ask("Does social media increase political polarisation among young voters?");
    expect(await screen.findByText(/I found 2 sources for this question \(below\), but no AI is connected on this device/)).toBeInTheDocument();
    expect(screen.queryByText(/AI Execution Error/)).toBeNull();
    expect(screen.getByRole("button", { name: "Connect an AI" })).toBeInTheDocument();
    expect(screen.getAllByText("Social media and polarization: a review").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\d+ words/)).toBeNull();
    expect(screen.queryByText(/Related Inquiries/i)).toBeNull();
  });

  it("offers Try again when the AI fails for another reason, and asks again", async () => {
    getAiOperationalStatus.mockResolvedValue({ connected: true, statusText: "Ready", provider: "openai" });
    executeAgenticQuery.mockRejectedValueOnce(new Error("Request failed (502)")).mockResolvedValueOnce({ ok: true, text: "Effects are mixed [1].", mode: "chat" });
    open();
    await ask("Does social media increase political polarisation among young voters?");
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Effects are mixed/)).toBeInTheDocument();
    expect(executeAgenticQuery).toHaveBeenCalledTimes(2);
  });
});
