import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
process.env.GEMINI_API_KEY = "test-gemini-key";

const { runOpportunityResearch } = await import("../opportunityAgent");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(handlers: { searchProxy?: unknown; gemini?: string; insertedRows?: any[] }) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/functions/v1/search-proxy")) {
      return Promise.resolve({ ok: true, status: 200, text: async () => JSON.stringify(handlers.searchProxy ?? { results: [] }), json: async () => handlers.searchProxy ?? { results: [] } } as Response);
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: handlers.gemini ?? "[]" }] } }] }),
      } as Response);
    }
    if (url.includes("/rest/v1/ai_opportunities")) {
      if (init?.body) handlers.insertedRows?.push(...JSON.parse(init.body as string));
      return Promise.resolve({ ok: true, status: 201, text: async () => "" } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, text: async () => "[]" } as Response);
  }) as unknown as typeof fetch;
}

describe("runOpportunityResearch", () => {
  it("stores zero rows and does not error when search returns nothing", async () => {
    mockFetch({ searchProxy: { results: [] } });
    const count = await runOpportunityResearch("free AI API tiers 2026");
    expect(count).toBe(0);
  });

  it("stores zero rows when the model correctly reports no genuine opportunity found", async () => {
    mockFetch({ searchProxy: { results: [{ title: "Some blog", url: "https://blog.example.com", content: "..." }] }, gemini: "[]" });
    const count = await runOpportunityResearch("query");
    expect(count).toBe(0);
  });

  it("stores a well-formed opportunity with all fields mapped correctly", async () => {
    const inserted: any[] = [];
    mockFetch({
      searchProxy: { results: [{ title: "Gemini API pricing", url: "https://ai.google.dev/pricing", content: "Free tier..." }] },
      gemini: JSON.stringify([
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
    mockFetch({
      searchProxy: { results: [{ title: "x", url: "https://x.com", content: "x" }] },
      gemini: JSON.stringify([{ providerName: "Missing URL Corp", opportunityName: "Something", multiUserAllowed: "unclear", confidence: "low", risk: "medium" }]),
      insertedRows: inserted,
    });

    const count = await runOpportunityResearch("query");
    expect(count).toBe(0);
    expect(inserted).toEqual([]);
  });

  it("tolerates the model wrapping its JSON in markdown code fences", async () => {
    const inserted: any[] = [];
    mockFetch({
      searchProxy: { results: [{ title: "x", url: "https://x.com", content: "x" }] },
      gemini: "```json\n" + JSON.stringify([{ providerName: "P", opportunityName: "O", officialUrl: "https://p.com", multiUserAllowed: "unclear", confidence: "low", risk: "low" }]) + "\n```",
      insertedRows: inserted,
    });

    const count = await runOpportunityResearch("query");
    expect(count).toBe(1);
  });

  it("does not throw on unparseable model output — treats it as zero findings", async () => {
    mockFetch({ searchProxy: { results: [{ title: "x", url: "https://x.com", content: "x" }] }, gemini: "not json at all" });
    const count = await runOpportunityResearch("query");
    expect(count).toBe(0);
  });

  it("never sends a Tavily key — search goes through search-proxy only", async () => {
    let sawTavilyKey = false;
    global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const headers = JSON.stringify(init?.headers ?? {});
      if (/tavily/i.test(headers) || url.includes("api.tavily.com")) sawTavilyKey = true;
      if (url.includes("/functions/v1/search-proxy")) return Promise.resolve({ ok: true, status: 200, text: async () => "{}", json: async () => ({ results: [] }) } as Response);
      return Promise.resolve({ ok: true, status: 200, text: async () => "[]" } as Response);
    }) as unknown as typeof fetch;

    await runOpportunityResearch("query");
    expect(sawTavilyKey).toBe(false);
  });
});
