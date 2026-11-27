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

describe("citation numbers match the returned list", () => {
  it("renumbers [n] when some sources were not cited, so each number points at the right paper", async () => {
    const { validateAndRefineCitations } = await import("../citationValidator");
    const mk = (i: number) => ({ title: `Paper ${i}`, url: `https://example.org/p${i}`, snippet: "", domain: "example.org" }) as never;
    const sources = [mk(1), mk(2), mk(3), mk(4)];
    const out = validateAndRefineCitations("First [1]. Then [3]. Also [4] and [3, 4].", sources, { requireSourcesSection: false });
    expect(out.citations.map((c: { title: string }) => c.title)).toEqual(["Paper 1", "Paper 3", "Paper 4"]);
    expect(out.text).toBe("First [1]. Then [2]. Also [3] and [2, 3].");
  });
});
