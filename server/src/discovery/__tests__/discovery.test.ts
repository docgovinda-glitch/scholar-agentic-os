import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { discoverArxivSources, discoverWebSources } = await import("../discovery");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string) => { status: number; body: unknown }) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status, body } = handler(url);
    return Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body } as Response);
  }) as unknown as typeof fetch;
}

describe("discoverArxivSources", () => {
  it("maps arxiv-proxy results to source drafts, never inventing a DOI/venue the proxy didn't return", async () => {
    mockFetch((url) => {
      expect(url).toContain("/functions/v1/arxiv-proxy");
      return {
        status: 200,
        body: {
          results: [
            { id: "http://arxiv.org/abs/1234", title: "A Study of Things", authors: ["A. One", "B. Two"], abstract: "...", published: "2024-03-01T00:00:00Z", url: "http://arxiv.org/abs/1234" },
          ],
        },
      };
    });

    const drafts = await discoverArxivSources("things");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: "A Study of Things",
      authors: ["A. One", "B. Two"],
      url: "http://arxiv.org/abs/1234",
      year: 2024,
      sourceType: "scholarly",
      authorityTier: "B",
      discoveredVia: "arxiv",
    });
    expect(drafts[0]).not.toHaveProperty("doi");
    expect(drafts[0]).not.toHaveProperty("venue");
  });

  it("throws a real error rather than returning an empty list when the proxy call fails", async () => {
    mockFetch(() => ({ status: 500, body: { error: "arXiv API returned HTTP 503" } }));
    await expect(discoverArxivSources("things")).rejects.toThrow(/arxiv-proxy/i);
  });

  it("throws when Supabase itself is not configured", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    try {
      await expect(discoverArxivSources("things")).rejects.toThrow(/not configured/i);
    } finally {
      process.env.VITE_SUPABASE_URL = url;
    }
  });
});

describe("discoverWebSources", () => {
  it("classifies authority from the domain suffix actually returned, never guessing content quality", async () => {
    mockFetch((url) => {
      expect(url).toContain("/functions/v1/search-proxy");
      return {
        status: 200,
        body: {
          results: [
            { title: "CDC guidance", url: "https://www.cdc.gov/some-page", content: "...", score: 0.9 },
            { title: "A university page", url: "https://university.edu/dept", content: "...", score: 0.8 },
            { title: "A nonprofit's report", url: "https://think-tank.org/report", content: "...", score: 0.7 },
            { title: "A blog post", url: "https://randomblog.example.com/post", content: "...", score: 0.5 },
          ],
        },
      };
    });

    const drafts = await discoverWebSources("query");
    expect(drafts.map((d) => d.authorityTier)).toEqual(["A", "A", "B", "C"]);
    expect(drafts.map((d) => d.sourceType)).toEqual(["official", "official", "official", "web"]);
    expect(drafts.every((d) => d.discoveredVia === "web_search")).toBe(true);
  });

  it("falls back to tier D for an unparseable URL rather than crashing", async () => {
    mockFetch(() => ({ status: 200, body: { results: [{ title: "Weird", url: "not-a-url", content: "", score: 0 }] } }));
    const drafts = await discoverWebSources("query");
    expect(drafts[0].authorityTier).toBe("D");
  });
});
