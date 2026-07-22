import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_STATE } from "../../types";
import type { LiteratureResult } from "../literatureRetrievalService";

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock("../aiGateway", () => ({
  default: { generate: mockGenerate },
}));

const { mockDiscoverLiterature } = vi.hoisted(() => ({ mockDiscoverLiterature: vi.fn() }));
vi.mock("../literatureRetrievalService", () => ({
  discoverLiterature: mockDiscoverLiterature,
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
});
