import { describe, it, expect } from "vitest";
import { DEEP_REPORT_MAX_SOURCES, selectReportSources } from "../deepResearchEngine";
import type { SearchResultItem } from "../webSearchEngine";

const make = (i: number, over: Partial<SearchResultItem> = {}): SearchResultItem =>
  ({
    title: `Source ${i}`,
    url: `https://example.org/${i}`,
    snippet: "Evidence sentence. ".repeat(80),
    domain: "example.org",
    sourceType: "web",
    isPrimary: false,
    ...over,
  }) as SearchResultItem;

describe("Deep Research report budget", () => {
  it("sends at most DEEP_REPORT_MAX_SOURCES sources, Vault and scholarly first, with short excerpts", () => {
    const all = [
      ...Array.from({ length: 60 }, (_, i) => make(i)),
      make(100, { sourceType: "scholarly" }),
      make(101, { sourceType: "vault" }),
    ];
    const picked = selectReportSources(all);
    expect(picked).toHaveLength(DEEP_REPORT_MAX_SOURCES);
    expect(picked[0].title).toBe("Source 101");
    expect(picked[1].title).toBe("Source 100");
    expect(picked.every((s) => (s.snippet || "").length <= 600)).toBe(true);
  });

  it("keeps the original order among equally ranked sources and never adds any", () => {
    const picked = selectReportSources([make(1), make(2), make(3)]);
    expect(picked.map((s) => s.title)).toEqual(["Source 1", "Source 2", "Source 3"]);
  });
});
