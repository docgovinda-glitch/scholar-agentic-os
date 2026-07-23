import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  discoverLiterature,
  discoverStatisticalData,
  __resetStatisticalDataCacheForTests,
} from "../literatureRetrievalService";

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

function worldBankIndicatorBody(indicators: Array<{ id: string; name: string; sourceNote?: string }>) {
  return [{ total: indicators.length }, indicators];
}

function oecdDataflowBody(flows: Array<{ id: string; agencyID: string; version: string; name: string; description?: string }>) {
  return { data: { dataflows: flows } };
}

describe("literatureRetrievalService — statistical data (World Bank / OECD)", () => {
  beforeEach(() => {
    __resetStatisticalDataCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("matches World Bank indicators and OECD dataflows by keyword against name/description, merged and deduped", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.worldbank.org")) {
        return jsonResponse(
          worldBankIndicatorBody([
            { id: "SP.POP.TOTL", name: "Population, total", sourceNote: "Total population is based on the de facto definition." },
            { id: "NY.GDP.MKTP.CD", name: "GDP (current US$)", sourceNote: "GDP at purchaser's prices." },
          ])
        );
      }
      if (url.includes("sdmx.oecd.org")) {
        return jsonResponse(
          oecdDataflowBody([
            { id: "DF_POP", agencyID: "OECD.ELS.SAE", version: "1.0", name: "Population statistics", description: "<p>Annual population statistics by country.</p>" },
            { id: "DF_TRADE", agencyID: "OECD.SDD.TPS", version: "2.0", name: "Trade in goods", description: "Bilateral trade flows." },
          ])
        );
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results, sourceErrors } = await discoverStatisticalData("population statistics");

    expect(sourceErrors).toEqual([]);
    const names = results.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(["Population, total", "Population statistics"]));
    // "Trade in goods" and "GDP (current US$)" don't match "population statistics" — shouldn't appear.
    expect(names).not.toContain("Trade in goods");
    expect(names).not.toContain("GDP (current US$)");

    const wb = results.find((r) => r.source === "World Bank")!;
    expect(wb.url).toBe("https://data.worldbank.org/indicator/SP.POP.TOTL");
    expect(wb.description).toContain("de facto definition");

    const oecd = results.find((r) => r.source === "OECD")!;
    expect(oecd.url).toBe("https://sdmx.oecd.org/public/rest/dataflow/OECD.ELS.SAE/DF_POP/1.0");
    // HTML tags stripped from the description.
    expect(oecd.description).toBe("Annual population statistics by country.");
    expect(oecd.description).not.toContain("<p>");
  });

  it("excludes non-OECD-agency dataflows (e.g. Eurostat-hosted entries in the same registry)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.worldbank.org")) return jsonResponse(worldBankIndicatorBody([]));
      if (url.includes("sdmx.oecd.org")) {
        return jsonResponse(
          oecdDataflowBody([
            { id: "DF_EDU", agencyID: "ESTAT", version: "1.0", name: "Education statistics", description: "Eurostat education data." },
          ])
        );
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results } = await discoverStatisticalData("education statistics");
    expect(results).toEqual([]);
  });

  it("caches the fetched catalogs across repeated calls instead of re-fetching every time", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.worldbank.org")) return jsonResponse(worldBankIndicatorBody([{ id: "X", name: "Test indicator" }]));
      if (url.includes("sdmx.oecd.org")) return jsonResponse(oecdDataflowBody([]));
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    await discoverStatisticalData("test");
    await discoverStatisticalData("test");

    const wbCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("api.worldbank.org"));
    const oecdCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("sdmx.oecd.org"));
    expect(wbCalls).toHaveLength(1);
    expect(oecdCalls).toHaveLength(1);
  });

  it("tolerates one source failing and still returns the other's matches", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.worldbank.org")) throw new Error("network error");
      if (url.includes("sdmx.oecd.org")) {
        return jsonResponse(
          oecdDataflowBody([{ id: "DF_POP", agencyID: "OECD.ELS.SAE", version: "1.0", name: "Population statistics", description: "" }])
        );
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { results, sourceErrors } = await discoverStatisticalData("population");

    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("OECD");
    expect(sourceErrors.some((e) => e.startsWith("World Bank:"))).toBe(true);
  });

  it("never throws — returns empty results with no source errors when the query is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { results, sourceErrors } = await discoverStatisticalData("   ");
    expect(results).toEqual([]);
    expect(sourceErrors).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws even when both sources fail — returns empty results with source errors recorded", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    const { results, sourceErrors } = await discoverStatisticalData("population");
    expect(results).toEqual([]);
    expect(sourceErrors).toHaveLength(2);
  });
});
