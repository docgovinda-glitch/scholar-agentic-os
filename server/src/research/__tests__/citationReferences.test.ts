import { describe, expect, it } from "vitest";
import { validateAndRefineCitations } from "../citationValidator";
import type { SearchResultItem } from "../webSearchEngine";

const source = (over: Partial<SearchResultItem>): SearchResultItem => ({
  title: "Sleep and memory consolidation",
  url: "https://doi.org/10.1000/xyz123",
  snippet: "",
  domain: "doi.org",
  sourceType: "scholarly",
  authorityTier: "A",
  authorityBadge: "Scholarly index",
  score: 90,
  ...over,
});

describe("reference list built from real source fields", () => {
  it("uses the real authors, year and DOI link, and never turns a publisher into an author", () => {
    const out = validateAndRefineCitations(
      "Sleep supports memory [1].",
      [source({ authors: ["Walker, Matthew", "Stickgold, Robert"], publishedDate: "2023-03-15", doi: "10.1000/xyz123", venue: "Nature Reviews" })],
      { citationStyle: "apa" }
    );
    expect(out.text).toContain("Walker");
    expect(out.text).toContain("2023");
    expect(out.text).not.toContain("2023-03-15-01-01");
    expect(out.text).toContain("https://doi.org/10.1000/xyz123");
  });

  it("gives a source without a DOI its own URL and adds no DOI", () => {
    const out = validateAndRefineCitations(
      "Policy changed [1].",
      [source({ title: "Annual report", url: "https://www.example.gov/report", domain: "example.gov", sourceType: "official", publisher: "Example Agency", doi: undefined })],
      { citationStyle: "apa" }
    );
    expect(out.text).toContain("https://www.example.gov/report");
    expect(out.text).not.toContain("doi.org");
  });
});
