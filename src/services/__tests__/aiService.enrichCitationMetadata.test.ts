import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CitationMetadata } from "../../types";
import type { CitationLookupResult } from "../citationEnrichmentService";

const { mockLookupCitation } = vi.hoisted(() => ({ mockLookupCitation: vi.fn() }));
vi.mock("../citationEnrichmentService", () => ({
  lookupCitation: mockLookupCitation,
}));

import { enrichCitationMetadata } from "../aiService";

function partialMeta(overrides: Partial<CitationMetadata> = {}): Partial<CitationMetadata> {
  return {
    title: "Some Real Paper Title",
    authors: [],
    ...overrides,
  };
}

function lookupResult(overrides: Partial<CitationLookupResult> = {}): CitationLookupResult {
  return {
    title: "Some Real Paper Title",
    abstract: "A real abstract from a real source.",
    authors: [{ firstName: "Ada", lastName: "Lovelace" }],
    journalName: "Journal of Testing",
    publisher: "Test Publisher",
    volume: "12",
    issue: "3",
    issn: "1111-1111",
    eissn: "2222-2222",
    year: "2021",
    doi: "10.1234/test",
    openAlexId: "https://openalex.org/W123",
    isOpenAccess: true,
    source: "Crossref",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("enrichCitationMetadata — real retrieval (post-fix behavior)", () => {
  it("fills in real gaps from a matched source instead of fabricating content", async () => {
    mockLookupCitation.mockResolvedValue({ matches: [lookupResult()], sourceErrors: [] });

    const result = await enrichCitationMetadata(partialMeta());

    expect(mockLookupCitation).toHaveBeenCalledWith({ doi: undefined, title: "Some Real Paper Title" });
    expect(result.abstract).toBe("A real abstract from a real source.");
    expect(result.authors).toEqual([{ id: "enriched-author-0", firstName: "Ada", lastName: "Lovelace", order: 1 }]);
    expect(result.publicationDetails?.journalName).toBe("Journal of Testing");
    expect(result.dates?.publicationDate).toBe("2021");
    expect(result.identifiers?.doi).toBe("10.1234/test");
    expect(result.verification).toMatchObject({ crossref: true, openAlex: false, doiLookup: false });

    // No fabricated content anywhere — none of the old stub's hardcoded fields appear.
    expect(JSON.stringify(result)).not.toContain("Stanford University");
    expect(JSON.stringify(result)).not.toContain("Crossref API");
  });

  it("never overwrites fields the caller already has", async () => {
    mockLookupCitation.mockResolvedValue({ matches: [lookupResult({ abstract: "A different abstract entirely." })], sourceErrors: [] });

    const result = await enrichCitationMetadata(
      partialMeta({ abstract: "The user's own confirmed abstract.", authors: [{ id: "existing", firstName: "Existing", lastName: "Author", order: 1 }] })
    );

    expect(result.abstract).toBe("The user's own confirmed abstract.");
    expect(result.authors).toEqual([{ id: "existing", firstName: "Existing", lastName: "Author", order: 1 }]);
  });

  it("returns the input unchanged (honest no-op) when no source has a match", async () => {
    mockLookupCitation.mockResolvedValue({ matches: [], sourceErrors: [] });

    const input = partialMeta();
    const result = await enrichCitationMetadata(input);

    expect(result).toEqual(input);
  });

  it("returns the input unchanged when there's no DOI or title to look up", async () => {
    mockLookupCitation.mockRejectedValue(new Error("Cannot enrich a citation without a DOI or a title to look up."));

    const input: Partial<CitationMetadata> = { authors: [] };
    const result = await enrichCitationMetadata(input);

    expect(result).toEqual(input);
  });

  it("does not leave any hardcoded fabricated content in the output, even indirectly", async () => {
    mockLookupCitation.mockResolvedValue({ matches: [lookupResult()], sourceErrors: [] });

    const result = await enrichCitationMetadata(partialMeta());

    expect(result.extraction).toBeUndefined();
    expect(result.classification).toBeUndefined();
    expect(result.aiKnowledge).toBeUndefined();
  });
});
