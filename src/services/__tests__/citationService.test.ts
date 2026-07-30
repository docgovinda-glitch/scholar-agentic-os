import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CitationAuthor, CitationMetadata } from "../../types";
import {
  formatAuthorList,
  generateCitation,
  validateCitationRecord,
} from "../citationService";

function author(overrides: Partial<CitationAuthor> = {}): CitationAuthor {
  return {
    id: "a1",
    firstName: "John",
    lastName: "Smith",
    order: 1,
    ...overrides,
  };
}

function metadata(overrides: Partial<CitationMetadata> = {}): CitationMetadata {
  return {
    sourceType: "DOI Lookup",
    title: "A Study of Things",
    authors: [author()],
    publicationDetails: { journalName: "Journal of Studies", volume: "12", pages: "1-10" },
    dates: { publicationDate: "2021-05-01" },
    identifiers: { doi: "10.1234/abcd" },
    reliability: { peerReviewed: "Yes", evidenceLevel: "High", publicationType: "Primary" },
    extraction: {},
    classification: {},
    aiKnowledge: {},
    verification: {},
    personal: { importance: 3, readStatus: "Unread", priority: "Medium", privacy: "Private" },
    relationships: [],
    ...overrides,
  };
}

describe("citationService.ts - formatAuthorList", () => {
  it("returns 'Anonymous' for empty/undefined author lists", () => {
    expect(formatAuthorList([], "APA")).toBe("Anonymous");
    expect(formatAuthorList(undefined as any, "APA")).toBe("Anonymous");
  });

  it("sorts authors by order before formatting", () => {
    const authors = [author({ order: 2, lastName: "Second" }), author({ order: 1, lastName: "First" })];
    const result = formatAuthorList(authors, "APA");
    expect(result.startsWith("First,")).toBe(true);
  });

  describe("APA/Harvard/Vancouver style (shared formatting)", () => {
    for (const style of ["APA", "Harvard", "Vancouver"] as const) {
      it(`formats a single author for ${style}`, () => {
        expect(formatAuthorList([author({ firstName: "Jane", lastName: "Doe" })], style)).toBe("Doe, J.");
      });

      it(`formats a single author with middle name for ${style}`, () => {
        expect(formatAuthorList([author({ firstName: "Jane", middleName: "Marie", lastName: "Doe" })], style)).toBe("Doe, J. M.");
      });

      it(`formats two authors for ${style}`, () => {
        const authors = [author({ order: 1, firstName: "Jane", lastName: "Doe" }), author({ order: 2, firstName: "John", lastName: "Roe" })];
        expect(formatAuthorList(authors, style)).toBe("Doe, J., & Roe, J.");
      });

      it(`formats 3+ authors with et al. for ${style}`, () => {
        const authors = [
          author({ order: 1, firstName: "Jane", lastName: "Doe" }),
          author({ order: 2, firstName: "John", lastName: "Roe" }),
          author({ order: 3, firstName: "Sam", lastName: "Poe" }),
        ];
        expect(formatAuthorList(authors, style)).toBe("Doe, J., et al.");
      });
    }
  });

  it("formats MLA style", () => {
    expect(formatAuthorList([author({ firstName: "Jane", lastName: "Doe" })], "MLA")).toBe("Doe, Jane.");
    const two = [author({ order: 1, firstName: "Jane", lastName: "Doe" }), author({ order: 2, firstName: "John", lastName: "Roe" })];
    expect(formatAuthorList(two, "MLA")).toBe("Doe, Jane, and John Roe.");
    const three = [...two, author({ order: 3, firstName: "Sam", lastName: "Poe" })];
    expect(formatAuthorList(three, "MLA")).toBe("Doe, Jane, et al.");
  });

  it("formats IEEE style", () => {
    expect(formatAuthorList([author({ firstName: "Jane", lastName: "Doe" })], "IEEE")).toBe("J. Doe");
    const three = [
      author({ order: 1, firstName: "Jane", lastName: "Doe" }),
      author({ order: 2, firstName: "John", lastName: "Roe" }),
      author({ order: 3, firstName: "Sam", lastName: "Poe" }),
    ];
    expect(formatAuthorList(three, "IEEE")).toBe("J. Doe, J. Roe, S. Poe");
    const four = [...three, author({ order: 4, firstName: "Amy", lastName: "Loe" })];
    expect(formatAuthorList(four, "IEEE")).toBe("J. Doe et al.");
  });

  it("formats BibTeX style", () => {
    const two = [author({ order: 1, firstName: "Jane", lastName: "Doe" }), author({ order: 2, firstName: "John", lastName: "Roe" })];
    expect(formatAuthorList(two, "BibTeX")).toBe("Doe, Jane and Roe, John");
  });

  it("falls back to 'First Last' formatting for an unrecognized style", () => {
    expect(formatAuthorList([author({ firstName: "Jane", lastName: "Doe" })], "Chicago")).toBe("Jane Doe");
  });
});

describe("citationService.ts - generateCitation", () => {
  it("defaults year to 'n.d.' when no publication date is present", () => {
    const meta = metadata({ dates: {} });
    expect(generateCitation(meta, "APA")).toContain("n.d.");
  });

  it("defaults title to 'Untitled Document' when missing", () => {
    const meta = metadata({ title: "" });
    expect(generateCitation(meta, "APA")).toContain("Untitled Document");
  });

  it("uses publisher as a fallback journal name when journalName is absent", () => {
    const meta = metadata({ publicationDetails: { publisher: "Acme Press" } });
    expect(generateCitation(meta, "APA")).toContain("Acme Press");
  });

  it("generates an APA citation with year, title, journal, volume, pages, and DOI link", () => {
    const meta = metadata();
    const citation = generateCitation(meta, "APA 7");
    expect(citation).toContain("2021");
    expect(citation).toContain("A Study of Things");
    expect(citation).toContain("Journal of Studies");
    expect(citation).toContain("(12)");
    expect(citation).toContain("1-10");
    expect(citation).toContain("https://doi.org/10.1234/abcd");
  });

  it("uses the raw URL when no DOI is present", () => {
    const meta = metadata({ identifiers: { url: "https://example.com/paper" } });
    expect(generateCitation(meta, "APA")).toContain("https://example.com/paper");
  });

  it("generates a BibTeX citation with a lastname+year tag", () => {
    const meta = metadata();
    const citation = generateCitation(meta, "BibTeX");
    expect(citation).toContain("@article{smith2021,");
    expect(citation).toContain("author = {Smith, John}");
  });

  it("defaults the BibTeX tag to 'anon' when there are no authors", () => {
    const meta = metadata({ authors: [] });
    const citation = generateCitation(meta, "BibTeX");
    expect(citation).toContain("@article{anon2021,");
  });

  it("generates valid CSL JSON with parsed integer year", () => {
    const meta = metadata();
    const citation = generateCitation(meta, "CSL JSON");
    const parsed = JSON.parse(citation);
    expect(parsed.title).toBe("A Study of Things");
    expect(parsed.issued["date-parts"][0][0]).toBe(2021);
    expect(parsed.DOI).toBe("10.1234/abcd");
  });

  it("generates an RIS record with TY/TI/AU/JO/PY tags", () => {
    const citation = generateCitation(metadata(), "RIS");
    expect(citation).toContain("TY  - JOUR");
    expect(citation).toContain("TI  - A Study of Things");
    expect(citation).toContain("AU  - Smith, John");
    expect(citation).toContain("PY  - 2021");
  });

  it("falls back to a minimal '<title> (<year>).' format for an unrecognized style", () => {
    expect(generateCitation(metadata(), "SomeUnknownStyle")).toBe("A Study of Things (2021).");
  });

  it("generates distinct output across several supported named styles without throwing", () => {
    const meta = metadata();
    for (const style of ["MLA 9", "Chicago", "Chicago Author-Date", "AMA", "ACS", "CSE", "Bluebook", "Harvard", "IEEE", "Vancouver", "OSCOLA", "EndNote", "Zotero Export"]) {
      expect(() => generateCitation(meta, style)).not.toThrow();
      expect(generateCitation(meta, style).length).toBeGreaterThan(0);
    }
  });
});

describe("citationService.ts - validateCitationRecord", () => {
  it("returns no errors for a complete, valid citation record", () => {
    const errors = validateCitationRecord(metadata());
    expect(errors).toEqual([]);
  });

  it("flags a missing title as an error", () => {
    const errors = validateCitationRecord(metadata({ title: "" }));
    expect(errors.some((e) => e.id === "err-title" && e.severity === "error")).toBe(true);
  });

  it("flags missing authors as an error", () => {
    const errors = validateCitationRecord(metadata({ authors: [] }));
    expect(errors.some((e) => e.id === "err-auth" && e.severity === "error")).toBe(true);
  });

  it("flags an author with an empty or 'Unknown' surname as a warning", () => {
    const errors = validateCitationRecord(metadata({ authors: [author({ lastName: "" })] }));
    expect(errors.some((e) => e.id === "err-surname-0" && e.severity === "warning")).toBe(true);

    const errors2 = validateCitationRecord(metadata({ authors: [author({ lastName: "Unknown" })] }));
    expect(errors2.some((e) => e.id === "err-surname-0")).toBe(true);
  });

  it("flags a missing or 'Unknown' publication date as a warning", () => {
    const errors = validateCitationRecord(metadata({ dates: {} }));
    expect(errors.some((e) => e.id === "err-year" && e.severity === "warning")).toBe(true);

    const errors2 = validateCitationRecord(metadata({ dates: { publicationDate: "Unknown" } }));
    expect(errors2.some((e) => e.id === "err-year")).toBe(true);
  });

  it("flags a DOI missing its prefix/suffix slash as an error", () => {
    const errors = validateCitationRecord(metadata({ identifiers: { doi: "not-a-real-doi" } }));
    expect(errors.some((e) => e.id === "err-doi-fmt" && e.severity === "error")).toBe(true);
  });

  it("does not flag a well-formed DOI", () => {
    const errors = validateCitationRecord(metadata({ identifiers: { doi: "10.1234/abcd" } }));
    expect(errors.some((e) => e.id === "err-doi-fmt")).toBe(false);
  });

  it("flags a potential duplicate when an existing record shares the same title (case-insensitive)", () => {
    const meta = metadata({ title: "Duplicate Title" });
    const existing = metadata({ title: "duplicate title" }); // different object reference, same title
    const errors = validateCitationRecord(meta, [existing]);
    expect(errors.some((e) => e.id === "err-dup" && e.severity === "warning")).toBe(true);
  });

  it("does not flag itself as a duplicate when the exact same object reference is in existingRecords", () => {
    const meta = metadata({ title: "Same Title" });
    const errors = validateCitationRecord(meta, [meta]);
    expect(errors.some((e) => e.id === "err-dup")).toBe(false);
  });

  it("does not flag a duplicate when no existing records are provided", () => {
    const errors = validateCitationRecord(metadata());
    expect(errors.some((e) => e.id === "err-dup")).toBe(false);
  });
});

// ============================================================================
// Network-boundary test: simulateLookup() delegates to
// citationEnrichmentService.lookupByIdentifier (real network I/O). Mocked at
// that narrow boundary to confirm the pure mapping logic
// (citationLookupResultsToMetadata, internal/unexported) behaves correctly:
// empty matches -> {}, and multiple matches are merged with sensible
// primary/secondary fallback ("pick") behavior.
// ============================================================================
vi.mock("../citationEnrichmentService", () => ({
  lookupByIdentifier: vi.fn(),
}));

import { lookupByIdentifier } from "../citationEnrichmentService";
import { simulateLookup } from "../citationService";

describe("citationService.ts - simulateLookup (network boundary, result-mapping logic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an honest empty object when no matches are found (no fabrication)", async () => {
    (lookupByIdentifier as any).mockResolvedValue({ matches: [], sourceErrors: [], supported: true });
    const result = await simulateLookup("10.1234/nomatch", "DOI");
    expect(result).toEqual({});
  });

  it("maps a single Crossref match into CitationMetadata fields", async () => {
    (lookupByIdentifier as any).mockResolvedValue({
      matches: [
        {
          title: "Found Paper",
          abstract: "An abstract.",
          authors: [{ firstName: "Ada", lastName: "Lovelace" }],
          journalName: "Journal of Computing",
          publisher: "ACM",
          volume: "5",
          issue: "2",
          issn: "1234-5678",
          eissn: "",
          year: "2020",
          doi: "10.1234/found",
          openAlexId: "",
          isOpenAccess: true,
          source: "Crossref",
        },
      ],
      sourceErrors: [],
      supported: true,
    });
    const result = await simulateLookup("10.1234/found", "DOI");
    expect(result.title).toBe("Found Paper");
    expect(result.authors?.[0]).toMatchObject({ firstName: "Ada", lastName: "Lovelace" });
    expect(result.publicationDetails?.journalName).toBe("Journal of Computing");
    expect(result.identifiers?.doi).toBe("10.1234/found");
    expect(result.verification?.crossref).toBe(true);
    expect(result.verification?.doiLookup).toBe(true);
    expect(result.sourceType).toBe("Journal Article");
  });

  it("falls back to secondary match's fields when primary lacks them (the 'pick' merge logic)", async () => {
    (lookupByIdentifier as any).mockResolvedValue({
      matches: [
        {
          title: "Primary Title",
          abstract: "",
          authors: [],
          journalName: "",
          publisher: "",
          volume: "",
          issue: "",
          issn: "",
          eissn: "",
          year: "",
          doi: "",
          openAlexId: "",
          isOpenAccess: null,
          source: "OpenAlex",
        },
        {
          title: "Secondary Title (ignored, primary title wins)",
          abstract: "Secondary abstract",
          authors: [{ firstName: "Bob", lastName: "Fallback" }],
          journalName: "Secondary Journal",
          publisher: "Secondary Publisher",
          volume: "9",
          issue: "1",
          issn: "9999",
          eissn: "",
          year: "2018",
          doi: "10.1234/secondary",
          openAlexId: "OA123",
          isOpenAccess: false,
          source: "OpenAlex",
        },
      ],
      sourceErrors: [],
      supported: true,
    });
    const result = await simulateLookup("OA123", "OPENALEX");
    expect(result.title).toBe("Primary Title"); // primary always wins if present
    expect(result.abstract).toBe("Secondary abstract"); // falls back since primary's was empty
    expect(result.authors?.[0]).toMatchObject({ firstName: "Bob", lastName: "Fallback" });
    expect(result.publicationDetails?.journalName).toBe("Secondary Journal");
    expect(result.dates?.publicationDate).toBe("2018");
    expect(result.identifiers?.doi).toBe("10.1234/secondary");
  });

  it("classifies ISBN lookups as 'Book' sourceType", async () => {
    (lookupByIdentifier as any).mockResolvedValue({
      matches: [
        {
          title: "A Book",
          abstract: "",
          authors: [{ firstName: "Ann", lastName: "Author" }],
          journalName: "",
          publisher: "Some Publisher",
          volume: "",
          issue: "",
          issn: "",
          eissn: "",
          year: "2015",
          doi: "",
          openAlexId: "",
          isOpenAccess: null,
          source: "Open Library" as any,
        },
      ],
      sourceErrors: [],
      supported: true,
    });
    const result = await simulateLookup("9781234567890", "ISBN");
    expect(result.sourceType).toBe("Book");
  });
});
