import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE } from "../../types";
import type { LiteratureResult } from "../literatureRetrievalService";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("../aiGateway", () => ({
  default: { generate: mockGenerate },
}));

const { mockDiscoverLiterature, mockDiscoverStatisticalData } = vi.hoisted(() => ({
  mockDiscoverLiterature: vi.fn(),
  mockDiscoverStatisticalData: vi.fn(),
}));
vi.mock("../literatureRetrievalService", () => ({
  discoverLiterature: mockDiscoverLiterature,
  discoverStatisticalData: mockDiscoverStatisticalData,
}));

const { mockSearchProxy } = vi.hoisted(() => ({ mockSearchProxy: vi.fn() }));
vi.mock("../searchProxyService", () => ({
  searchProxy: mockSearchProxy,
}));

const { mockArxivProxy } = vi.hoisted(() => ({ mockArxivProxy: vi.fn() }));
vi.mock("../arxivProxyService", () => ({
  arxivProxy: mockArxivProxy,
}));

const { mockWhoProxy } = vi.hoisted(() => ({ mockWhoProxy: vi.fn() }));
vi.mock("../whoProxyService", () => ({
  whoProxy: mockWhoProxy,
}));

const { mockImfProxy } = vi.hoisted(() => ({ mockImfProxy: vi.fn() }));
vi.mock("../imfProxyService", () => ({
  imfProxy: mockImfProxy,
}));

import { discoverDataSources } from "../aiService";

function literatureResult(overrides: Partial<LiteratureResult> = {}): LiteratureResult {
  return {
    title: "A Study of Testing",
    url: "https://doi.org/10.1234/test",
    authors: "Ada Lovelace",
    year: "2024",
    venue: "Journal of Testing",
    abstract: "This paper studies testing in great detail.",
    citationCount: 12,
    source: "Crossref",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no statistical/web-search matches, so existing tests that don't set
  // these up themselves keep seeing exactly their original expected output.
  mockDiscoverStatisticalData.mockResolvedValue({ results: [], sourceErrors: [] });
  mockSearchProxy.mockResolvedValue({ results: [] });
  mockArxivProxy.mockResolvedValue({ results: [] });
  mockWhoProxy.mockResolvedValue({ results: [] });
  mockImfProxy.mockResolvedValue({ results: [] });
});

describe("discoverDataSources — real retrieval (post-fix behavior)", () => {
  it("queries real literature sources using title + keywords, and no longer calls the AI Gateway", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });

    const project = {
      ...DEFAULT_STATE("tester"),
      title: "Corporate Governance in Emerging Markets",
      keywords: "governance, compliance",
      field: "Economics",
    };

    const result = await discoverDataSources(project);

    expect(mockDiscoverLiterature).toHaveBeenCalledWith("Corporate Governance in Emerging Markets governance, compliance");
    expect(mockGenerate).not.toHaveBeenCalled();

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      name: "A Study of Testing",
      url: "https://doi.org/10.1234/test",
      type: "Mixed",
      status: "pending",
    });
    expect(result.sources[0].relevance).toContain("Ada Lovelace");
    expect(result.sources[0].relevance).toContain("This paper studies testing in great detail.");
    expect(result.sources[0].reliability).toBe("Indexed in Crossref; cited 12 times.");
    expect(result.sources[0].limitations).toContain("Crossref's public API");
  });

  it("falls back to the field when title and keywords are both empty", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [], sourceErrors: [] });

    const project = { ...DEFAULT_STATE("tester"), title: "", keywords: "", field: "Marine Biology" };
    await discoverDataSources(project);

    expect(mockDiscoverLiterature).toHaveBeenCalledWith("Marine Biology");
  });

  it("labels a missing abstract honestly instead of fabricating one", async () => {
    mockDiscoverLiterature.mockResolvedValue({
      results: [literatureResult({ abstract: "", source: "PubMed" })],
      sourceErrors: [],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(result.sources[0].relevance).toContain("Abstract not provided by PubMed.");
  });

  it("omits the citation count from reliability text when the source doesn't provide one", async () => {
    mockDiscoverLiterature.mockResolvedValue({
      results: [literatureResult({ citationCount: null, source: "PubMed" })],
      sourceErrors: [],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(result.sources[0].reliability).toBe("Indexed in PubMed.");
  });

  it("propagates an error when every literature source fails", async () => {
    mockDiscoverLiterature.mockRejectedValue(new Error("All literature sources failed: Crossref: network error"));

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    await expect(discoverDataSources(project)).rejects.toThrow(/All literature sources failed/);
  });

  it("appends World Bank/OECD statistical matches after the literature results", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });
    mockDiscoverStatisticalData.mockResolvedValue({
      results: [
        { name: "Population, total", url: "https://data.worldbank.org/indicator/SP.POP.TOTL", description: "Total population by country.", source: "World Bank" },
        { name: "Trade in goods", url: "https://sdmx.oecd.org/public/rest/dataflow/OECD.SDD.TPS/DF_TRADE/1.0", description: "Bilateral trade flows.", source: "OECD" },
      ],
      sourceErrors: [],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(mockDiscoverStatisticalData).toHaveBeenCalledWith("Some Title");
    expect(result.sources).toHaveLength(3);
    expect(result.sources[0].name).toBe("A Study of Testing"); // literature first

    const wbSource = result.sources.find((s) => s.name === "Population, total")!;
    expect(wbSource.type).toBe("Quantitative");
    expect(wbSource.url).toBe("https://data.worldbank.org/indicator/SP.POP.TOTL");
    expect(wbSource.relevance).toContain("Total population by country.");
    expect(wbSource.reliability).toContain("World Bank");
    expect(wbSource.limitations).toContain("no server-side keyword search");
    expect(wbSource.status).toBe("pending");

    const oecdSource = result.sources.find((s) => s.name === "Trade in goods")!;
    expect(oecdSource.type).toBe("Quantitative");
    expect(oecdSource.reliability).toContain("OECD");
  });

  it("still returns literature sources when statistical-data retrieval finds nothing or fails", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });
    mockDiscoverStatisticalData.mockResolvedValue({ results: [], sourceErrors: ["World Bank: network error", "OECD: network error"] });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].name).toBe("A Study of Testing");
  });

  it("appends authoritative-web-search (Tavily proxy) results after literature and statistical sources", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });
    mockDiscoverStatisticalData.mockResolvedValue({
      results: [{ name: "Population, total", url: "https://data.worldbank.org/indicator/SP.POP.TOTL", description: "Total population by country.", source: "World Bank" }],
      sourceErrors: [],
    });
    mockSearchProxy.mockResolvedValue({
      results: [
        { title: "WHO Data Portal", url: "https://www.who.int/data", content: "Global health statistics and indicators.", score: 0.87 },
      ],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(mockSearchProxy).toHaveBeenCalledWith("Some Title");
    expect(result.sources).toHaveLength(3);
    // Literature first, then statistical, then web-search — matching existing ordering.
    expect(result.sources.map((s) => s.name)).toEqual(["A Study of Testing", "Population, total", "WHO Data Portal"]);

    const webSource = result.sources.find((s) => s.name === "WHO Data Portal")!;
    expect(webSource.url).toBe("https://www.who.int/data");
    expect(webSource.relevance).toContain("Global health statistics and indicators.");
    expect(webSource.status).toBe("pending");
    expect(webSource.limitations).toContain(".gov/.edu/.org/.int");
  });

  it("still returns literature and statistical sources when the search proxy finds nothing or fails", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });
    mockSearchProxy.mockResolvedValue({ results: [], error: "Search proxy request failed: timeout" });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].name).toBe("A Study of Testing");
  });

  it("skips agent-driven discovery entirely for research-proposal projects — per target-workflow.md, agents never add data for this format", async () => {
    const project = { ...DEFAULT_STATE("tester"), title: "Some Title", outputFormat: "research-proposal" as const };
    const result = await discoverDataSources(project);

    expect(mockDiscoverLiterature).not.toHaveBeenCalled();
    expect(mockDiscoverStatisticalData).not.toHaveBeenCalled();
    expect(mockSearchProxy).not.toHaveBeenCalled();
    expect(mockArxivProxy).not.toHaveBeenCalled();
    expect(mockWhoProxy).not.toHaveBeenCalled();
    expect(mockImfProxy).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
  });

  it("appends arXiv preprints (arxiv-proxy) after literature, statistical, and web-search sources", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });
    mockDiscoverStatisticalData.mockResolvedValue({
      results: [{ name: "Population, total", url: "https://data.worldbank.org/indicator/SP.POP.TOTL", description: "Total population by country.", source: "World Bank" }],
      sourceErrors: [],
    });
    mockSearchProxy.mockResolvedValue({
      results: [{ title: "WHO Data Portal", url: "https://www.who.int/data", content: "Global health statistics and indicators.", score: 0.87 }],
    });
    mockArxivProxy.mockResolvedValue({
      results: [
        {
          id: "http://arxiv.org/abs/2401.00001v1",
          title: "A Preprint on Testing",
          authors: ["Ada Lovelace", "Charles Babbage"],
          abstract: "This preprint studies testing methodology in depth.",
          published: "2024-01-01T00:00:00Z",
          url: "http://arxiv.org/abs/2401.00001v1",
        },
      ],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(mockArxivProxy).toHaveBeenCalledWith("Some Title");
    expect(result.sources).toHaveLength(4);
    // Literature, then statistical, then web-search, then arXiv — matching existing ordering.
    expect(result.sources.map((s) => s.name)).toEqual(["A Study of Testing", "Population, total", "WHO Data Portal", "A Preprint on Testing"]);

    const arxivSource = result.sources.find((s) => s.name === "A Preprint on Testing")!;
    expect(arxivSource.url).toBe("http://arxiv.org/abs/2401.00001v1");
    expect(arxivSource.type).toBe("Mixed");
    expect(arxivSource.relevance).toContain("Ada Lovelace, Charles Babbage");
    expect(arxivSource.relevance).toContain("This preprint studies testing methodology in depth.");
    expect(arxivSource.reliability).toContain("not yet peer-reviewed");
    expect(arxivSource.limitations).toContain("not peer-reviewed");
    expect(arxivSource.status).toBe("pending");
  });

  it("labels a missing arXiv abstract honestly instead of fabricating one", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [], sourceErrors: [] });
    mockArxivProxy.mockResolvedValue({
      results: [{ id: "http://arxiv.org/abs/2401.00002v1", title: "Untitled Preprint", authors: [], abstract: "", published: "2024-01-02T00:00:00Z", url: "http://arxiv.org/abs/2401.00002v1" }],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(result.sources[0].relevance).toBe("Abstract not provided by arXiv.");
  });

  it("still returns literature, statistical, and web-search sources when the arXiv proxy finds nothing or fails", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });
    mockArxivProxy.mockResolvedValue({ results: [], error: "arXiv proxy request failed: timeout" });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].name).toBe("A Study of Testing");
  });

  it("appends WHO and IMF indicators after literature, statistical, web-search, and arXiv sources", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });
    mockArxivProxy.mockResolvedValue({
      results: [{ id: "http://arxiv.org/abs/2401.00001v1", title: "A Preprint on Testing", authors: ["Ada Lovelace"], abstract: "", published: "2024-01-01T00:00:00Z", url: "http://arxiv.org/abs/2401.00001v1" }],
    });
    mockWhoProxy.mockResolvedValue({
      results: [{ id: "MALARIA001", title: "Malaria - number of reported deaths", url: "https://www.who.int/data/gho/data/indicators/indicator-details/GHO/MALARIA001", description: "" }],
    });
    mockImfProxy.mockResolvedValue({
      results: [{ id: "NGDP_RPCH", title: "Real GDP growth", url: "https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH", description: "Gross domestic product is the most commonly used single measure of economic activity." }],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(mockWhoProxy).toHaveBeenCalledWith("Some Title");
    expect(mockImfProxy).toHaveBeenCalledWith("Some Title");
    expect(result.sources).toHaveLength(4);
    // Literature, arXiv, then WHO, then IMF — matching existing append ordering.
    expect(result.sources.map((s) => s.name)).toEqual(["A Study of Testing", "A Preprint on Testing", "Malaria - number of reported deaths", "Real GDP growth"]);

    const whoSource = result.sources.find((s) => s.name === "Malaria - number of reported deaths")!;
    expect(whoSource.url).toBe("https://www.who.int/data/gho/data/indicators/indicator-details/GHO/MALARIA001");
    expect(whoSource.type).toBe("Quantitative");
    expect(whoSource.status).toBe("pending");
    expect(whoSource.reliability).toContain("WHO");

    const imfSource = result.sources.find((s) => s.name === "Real GDP growth")!;
    expect(imfSource.url).toBe("https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH");
    expect(imfSource.type).toBe("Quantitative");
    expect(imfSource.relevance).toContain("Gross domestic product");
    expect(imfSource.status).toBe("pending");
    expect(imfSource.reliability).toContain("IMF");
  });

  it("labels a missing WHO description honestly instead of fabricating one", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [], sourceErrors: [] });
    mockWhoProxy.mockResolvedValue({
      results: [{ id: "MALARIA001", title: "Malaria - number of reported deaths", url: "https://who.int/x", description: "" }],
    });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(result.sources[0].relevance).toContain("No description provided by WHO GHO");
  });

  it("still returns other sources when the WHO or IMF proxies find nothing or fail", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });
    mockWhoProxy.mockResolvedValue({ results: [], error: "WHO proxy request failed: timeout" });
    mockImfProxy.mockResolvedValue({ results: [], error: "IMF proxy request failed: timeout" });

    const project = { ...DEFAULT_STATE("tester"), title: "Some Title" };
    const result = await discoverDataSources(project);

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].name).toBe("A Study of Testing");
  });

  it("still queries agents normally for every other format", async () => {
    mockDiscoverLiterature.mockResolvedValue({ results: [literatureResult()], sourceErrors: [] });

    for (const outputFormat of ["", "journal-article", "research-paper", "term-paper", "book-chapter", "report"] as const) {
      mockDiscoverLiterature.mockClear();
      const project = { ...DEFAULT_STATE("tester"), title: "Some Title", outputFormat };
      const result = await discoverDataSources(project);
      expect(mockDiscoverLiterature).toHaveBeenCalled();
      expect(result.sources).toHaveLength(1);
    }
  });
});
