import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { discoverArxivSources, discoverOpenAlexSources, discoverWebSources } = await import("../discovery");

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

describe("discoverOpenAlexSources", () => {
  it("maps OpenAlex works to source drafts, tiering a peer-reviewed journal article A and everything else B", async () => {
    mockFetch((url) => {
      expect(url).toContain("https://api.openalex.org/works?");
      expect(url).toContain("search=things");
      return {
        status: 200,
        body: {
          results: [
            {
              id: "https://openalex.org/W1",
              doi: "https://doi.org/10.1234/journal.5678",
              title: "A Peer-Reviewed Study",
              publication_year: 2023,
              type: "article",
              authorships: [{ author: { display_name: "A. One" } }, { author: { display_name: "B. Two" } }],
              primary_location: { landing_page_url: "https://example.com/w1", source: { display_name: "Journal of Things", type: "journal" } },
            },
            {
              id: "https://openalex.org/W2",
              title: "A Preprint",
              publication_year: 2024,
              type: "preprint",
              authorships: [],
              primary_location: { source: { display_name: "A Repository", type: "repository" } },
            },
          ],
        },
      };
    });

    const drafts = await discoverOpenAlexSources("things");
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      title: "A Peer-Reviewed Study",
      authors: ["A. One", "B. Two"],
      doi: "10.1234/journal.5678",
      venue: "Journal of Things",
      year: 2023,
      sourceType: "scholarly",
      authorityTier: "A",
      discoveredVia: "openalex",
    });
    expect(drafts[1]).toMatchObject({ title: "A Preprint", authorityTier: "B", discoveredVia: "openalex" });
    expect(drafts[1]).not.toHaveProperty("doi");
  });

  it("throws a real error rather than returning an empty list when OpenAlex itself fails", async () => {
    mockFetch(() => ({ status: 500, body: { error: "internal" } }));
    await expect(discoverOpenAlexSources("things")).rejects.toThrow(/OpenAlex 500/);
  });

  it("needs no Supabase configuration at all — it calls OpenAlex's public API directly", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    try {
      mockFetch(() => ({ status: 200, body: { results: [] } }));
      await expect(discoverOpenAlexSources("things")).resolves.toEqual([]);
    } finally {
      process.env.VITE_SUPABASE_URL = url;
    }
  });
});
