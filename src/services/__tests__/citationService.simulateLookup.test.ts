import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CitationLookupResult } from "../citationEnrichmentService";

const { mockLookupByIdentifier } = vi.hoisted(() => ({ mockLookupByIdentifier: vi.fn() }));
vi.mock("../citationEnrichmentService", () => ({
  lookupByIdentifier: mockLookupByIdentifier,
}));

import { simulateLookup } from "../citationService";

function lookupResult(overrides: Partial<CitationLookupResult> = {}): CitationLookupResult {
  return {
    title: "A Real Paper",
    abstract: "A real abstract.",
    authors: [{ firstName: "Ada", lastName: "Lovelace" }],
    journalName: "Journal of Testing",
    publisher: "Test Publisher",
    volume: "12",
    issue: "3",
    issn: "1111-1111",
    eissn: "2222-2222",
    year: "2021",
    doi: "10.1234/test",
    openAlexId: "",
    isOpenAccess: null,
    source: "Crossref",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("simulateLookup — real retrieval (post-fix behavior)", () => {
  it("maps a real DOI match into real citation metadata, with no fabricated content anywhere", async () => {
    mockLookupByIdentifier.mockResolvedValue({ matches: [lookupResult()], sourceErrors: [], supported: true });

    const result = await simulateLookup("10.1234/test", "DOI");

    expect(mockLookupByIdentifier).toHaveBeenCalledWith("10.1234/test", "DOI");
    expect(result.title).toBe("A Real Paper");
    expect(result.authors).toEqual([{ id: "lookup-author-0", firstName: "Ada", lastName: "Lovelace", order: 1 }]);
    expect(result.publicationDetails?.journalName).toBe("Journal of Testing");
    expect(result.identifiers?.doi).toBe("10.1234/test");
    expect(result.verification).toMatchObject({ doiLookup: true, crossref: true, openAlex: false, pubmed: false });

    // None of the old stub's fabricated content survives.
    expect(JSON.stringify(result)).not.toContain("Stanford University");
    expect(JSON.stringify(result)).not.toContain("0000-0002-1825-0097");
    expect(result.extractionAudit).toBeUndefined();
    expect(result.reliability).toBeUndefined();
  });

  it("maps an ISBN match to sourceType Book", async () => {
    mockLookupByIdentifier.mockResolvedValue({
      matches: [lookupResult({ source: "Open Library", journalName: "" })],
      sourceErrors: [],
      supported: true,
    });

    const result = await simulateLookup("9780262033848", "ISBN");

    expect(result.sourceType).toBe("Book");
  });

  it("returns an empty object (honest no-op) when nothing was found", async () => {
    mockLookupByIdentifier.mockResolvedValue({ matches: [], sourceErrors: [], supported: true });

    const result = await simulateLookup("10.9999/does-not-exist", "DOI");

    expect(result).toEqual({});
  });

  it("returns an empty object for identifier types with no real lookup available (e.g. YouTube, ResearchGate)", async () => {
    mockLookupByIdentifier.mockResolvedValue({ matches: [], sourceErrors: [], supported: false });

    const result = await simulateLookup("https://youtube.com/watch?v=abc123", "YouTube");

    expect(result).toEqual({});
  });
});
