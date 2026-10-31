import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
process.env.OPENROUTER_API_KEY = "test-openrouter-key";

// Mock the AI call (router bridge) so tests don't make real HTTP calls.
// The mock is set up before the module under test is imported.
const mockRoutedCompletion = vi.fn();
vi.mock("../../ai/routerBridge.ts", () => ({
  routedCompletion: mockRoutedCompletion,
}));

const { runOpportunityResearch } = await import("../opportunityAgent");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  mockRoutedCompletion.mockReset();
});

/** Helper: stub the search-proxy and gateway synthesis result. */
function mockDeps(opts: { searchResults?: any[]; geminiText?: string; insertedRows?: any[] }) {
  const results = opts.searchResults ?? [];
  const geminiText = opts.geminiText ?? "[]";

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/functions/v1/search-proxy")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ results }),
        json: async () => ({ results }),
      } as Response);
    }
    if (url.includes("/rest/v1/ai_opportunities")) {
      if (init?.body) opts.insertedRows?.push(...JSON.parse(init.body as string));
      return Promise.resolve({ ok: true, status: 201, text: async () => "" } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, text: async () => "[]" } as Response);
  }) as unknown as typeof fetch;

  if (results.length > 0) {
    mockRoutedCompletion.mockResolvedValue(geminiText);
  }
}

describe("runOpportunityResearch", () => {
  it("stores zero rows and does not error when search returns nothing", async () => {
    mockDeps({ searchResults: [] });
    const count = await runOpportunityResearch("free AI API tiers 2026");
    expect(count).toBe(0);
  });

  it("stores zero rows when the model correctly reports no genuine opportunity found", async () => {
    mockDeps({
      searchResults: [{ title: "Some blog", url: "https://blog.example.com", content: "..." }],
      geminiText: "[]",
    });
    const count = await runOpportunityResearch("query");
    expect(count).toBe(0);
  });

  it("stores a well-formed opportunity with all fields mapped correctly", async () => {
    const inserted: any[] = [];
    mockDeps({
      searchResults: [{ title: "Gemini API pricing", url: "https://ai.google.dev/pricing", content: "Free tier..." }],
      geminiText: JSON.stringify([
        {
          providerName: "Google",
          opportunityName: "Gemini API free tier",
          officialUrl: "https://ai.google.dev/pricing",
          eligibility: "Any developer",
          multiUserAllowed: "allowed",
          confidence: "high",
          risk: "low",
          sourceNotes: "Official pricing page",
        },
      ]),
      insertedRows: inserted,
    });

    const count = await runOpportunityResearch("query");
    expect(count).toBe(1);
    expect(inserted[0]).toMatchObject({
      provider_name: "Google",
      opportunity_name: "Gemini API free tier",
      official_url: "https://ai.google.dev/pricing",
      multi_user_allowed: "allowed",
      confidence: "high",
      risk: "low",
      status: "new",
    });
  });

  it("filters out a malformed entry missing a required field rather than storing garbage", async () => {
    const inserted: any[] = [];
    mockDeps({
      searchResults: [{ title: "x", url: "https://x.com", content: "x" }],
      geminiText: JSON.stringify([
        { providerName: "Missing URL Corp", opportunityName: "Something", multiUserAllowed: "unclear", confidence: "low", risk: "medium" },
      ]),
      insertedRows: inserted,
    });

    const count = await runOpportunityResearch("query");
    expect(count).toBe(0);
    expect(inserted).toEqual([]);
  });

  it("tolerates the model wrapping its JSON in markdown code fences", async () => {
    const inserted: any[] = [];
    mockDeps({
      searchResults: [{ title: "x", url: "https://x.com", content: "x" }],
      geminiText:
        "```json\n" +
        JSON.stringify([
          { providerName: "P", opportunityName: "O", officialUrl: "https://p.com", multiUserAllowed: "unclear", confidence: "low", risk: "low" },
        ]) +
        "\n```",
      insertedRows: inserted,
    });

    const count = await runOpportunityResearch("query");
    expect(count).toBe(1);
  });

  it("does not throw on unparseable model output — treats it as zero findings", async () => {
    mockDeps({
      searchResults: [{ title: "x", url: "https://x.com", content: "x" }],
      geminiText: "not json at all",
    });
    const count = await runOpportunityResearch("query");
    expect(count).toBe(0);
  });

  it("never sends a Tavily key — search goes through search-proxy only", async () => {
    let sawTavilyKey = false;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = JSON.stringify(init?.headers ?? {});
      if (/tavily/i.test(headers) || url.includes("api.tavily.com")) sawTavilyKey = true;
      if (url.includes("/functions/v1/search-proxy"))
        return Promise.resolve({ ok: true, status: 200, text: async () => "{}", json: async () => ({ results: [] }) } as Response);
      return Promise.resolve({ ok: true, status: 200, text: async () => "[]" } as Response);
    }) as unknown as typeof fetch;

    await runOpportunityResearch("query");
    expect(sawTavilyKey).toBe(false);
  });
});
