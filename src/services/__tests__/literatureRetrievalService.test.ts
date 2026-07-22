import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discoverLiterature } from "../literatureRetrievalService";

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function crossrefBody(titles: string[]) {
  return {
    message: {
      items: titles.map((title, i) => ({
        title: [title],
        DOI: `10.1234/crossref-${i}`,
        URL: `https://doi.org/10.1234/crossref-${i}`,
        author: [{ given: "Ada", family: "Lovelace" }],
        published: { "date-parts": [[2020 + i]] },
        "container-title": ["Journal of Testing"],
        abstract: `<jats:p>Crossref abstract ${i}</jats:p>`,
        "is-referenced-by-count": 10 + i,
      })),
    },
  };
}

function openAlexBody(titles: string[]) {
  return {
    results: titles.map((title, i) => ({
      title,
      id: `https://openalex.org/W${i}`,
      doi: `https://doi.org/10.5678/openalex-${i}`,
      publication_year: 2019 + i,
      primary_location: { source: { display_name: "OpenAlex Venue" } },
      authorships: [{ author: { display_name: "Grace Hopper" } }],
      abstract_inverted_index: { OpenAlex: [0], abstract: [1], reconstructed: [2] },
      cited_by_count: 5 + i,
    })),
  };
}

function pubmedSearchBody(ids: string[]) {
  return { esearchresult: { idlist: ids } };
}

function pubmedSummaryBody(ids: string[], titles: string[]) {
  const result: Record<string, unknown> = { uids: ids };
  ids.forEach((id, i) => {
    result[id] = {
      title: titles[i],
      authors: [{ name: "Alan Turing" }],
      pubdate: `${2018 + i} Jan`,
      fulljournalname: "PubMed Journal",
    };
  });
  return { result };
}

function semanticScholarBody(titles: string[]) {
  return {
    data: titles.map((title, i) => ({
      title,
      url: `https://www.semanticscholar.org/paper/${i}`,
      year: 2017 + i,
      authors: [{ name: "Katherine Johnson" }],
      abstract: `S2 abstract ${i}`,
      venue: "S2 Venue",
      citationCount: 3 + i,
    })),
  };
}

describe("literatureRetrievalService — per-source parsing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("parses Crossref, OpenAlex, PubMed, and Semantic Scholar results into a merged, deduped list", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org")) return jsonResponse(crossrefBody(["Crossref Paper A"]));
      if (url.includes("api.openalex.org")) return jsonResponse(openAlexBody(["OpenAlex Paper B"]));
      if (url.includes("esearch.fcgi")) return jsonResponse(pubmedSearchBody(["111"]));
      if (url.includes("esummary.fcgi")) return jsonResponse(pubmedSummaryBody(["111"], ["PubMed Paper C"]));
      if (url.includes("api.semanticscholar.org")) return jsonResponse(semanticScholarBody(["S2 Paper D"]));
      throw new Error(`Unexpected URL in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results, sourceErrors } = await discoverLiterature("test query");

    expect(sourceErrors).toEqual([]);
    const titles = results.map((r) => r.title);
    expect(titles).toEqual(
      expect.arrayContaining(["Crossref Paper A", "OpenAlex Paper B", "PubMed Paper C", "S2 Paper D"])
    );
    expect(results).toHaveLength(4);

    const crossrefResult = results.find((r) => r.source === "Crossref")!;
    expect(crossrefResult.url).toBe("https://doi.org/10.1234/crossref-0");
    expect(crossrefResult.authors).toBe("Ada Lovelace");
    expect(crossrefResult.abstract).toBe("Crossref abstract 0");
    expect(crossrefResult.citationCount).toBe(10);

    const openAlexResult = results.find((r) => r.source === "OpenAlex")!;
    expect(openAlexResult.abstract).toBe("OpenAlex abstract reconstructed");

    const pubmedResult = results.find((r) => r.source === "PubMed")!;
    expect(pubmedResult.url).toBe("https://pubmed.ncbi.nlm.nih.gov/111/");
    expect(pubmedResult.year).toBe("2018");

    const s2Result = results.find((r) => r.source === "Semantic Scholar")!;
    expect(s2Result.citationCount).toBe(3);
  });

  it("sends the OpenAlex API key as a query param when VITE_OPENALEX_API_KEY is set", async () => {
    vi.stubEnv("VITE_OPENALEX_API_KEY", "test-key-123");
    let capturedUrl = "";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.openalex.org")) {
        capturedUrl = url;
        return jsonResponse(openAlexBody([]));
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    await discoverLiterature("test query");

    expect(capturedUrl).toContain("api_key=test-key-123");
  });

  it("dedupes results that share the same normalized title across sources", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org")) return jsonResponse(crossrefBody(["Shared Title: A Study"]));
      if (url.includes("api.openalex.org")) return jsonResponse(openAlexBody(["Shared Title, A Study!"]));
      if (url.includes("esearch.fcgi")) return jsonResponse(pubmedSearchBody([]));
      if (url.includes("api.semanticscholar.org")) return jsonResponse(semanticScholarBody([]));
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results } = await discoverLiterature("test query");

    expect(results).toHaveLength(1);
    // Crossref runs first in the source order, so its version of the duplicate wins.
    expect(results[0].source).toBe("Crossref");
  });

  it("tolerates individual source failures and still returns the others", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.crossref.org")) return jsonResponse(crossrefBody(["Surviving Paper"]));
      if (url.includes("api.openalex.org")) throw new Error("network error");
      if (url.includes("esearch.fcgi")) return jsonResponse({}, false, 429);
      if (url.includes("api.semanticscholar.org")) return jsonResponse({}, false, 429);
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results, sourceErrors } = await discoverLiterature("test query");

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Surviving Paper");
    expect(sourceErrors.length).toBeGreaterThanOrEqual(2);
    expect(sourceErrors.some((e) => e.startsWith("OpenAlex:"))).toBe(true);
  });

  it("throws a combined error when every source fails", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverLiterature("test query")).rejects.toThrow(/All literature sources failed/);
  });

  it("throws immediately without calling fetch when the query is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(discoverLiterature("   ")).rejects.toThrow(/Cannot discover literature/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
