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
  // Default: no statistical matches, so existing literature-only tests (which don't
  // set this up themselves) keep seeing exactly their original expected output.
  mockDiscoverStatisticalData.mockResolvedValue({ results: [], sourceErrors: [] });
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
      approved: false,
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
    expect(wbSource.approved).toBe(false);

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

  it("skips agent-driven discovery entirely for research-proposal projects — per target-workflow.md, agents never add data for this format", async () => {
    const project = { ...DEFAULT_STATE("tester"), title: "Some Title", outputFormat: "research-proposal" as const };
    const result = await discoverDataSources(project);

    expect(mockDiscoverLiterature).not.toHaveBeenCalled();
    expect(mockDiscoverStatisticalData).not.toHaveBeenCalled();
    expect(result.sources).toEqual([]);
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
