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

describe("a report refused by a per-minute cap", () => {
  it("waits the stated time when it is within a minute, and not for a daily cap or a long wait", async () => {
    const { reportRateLimitWaitMs } = await import("../deepResearchEngine.ts");
    const itpm = "All connected AI models failed. Last error: Rate limit reached for model `m` on input tokens per minute (ITPM): Limit 7000, Used 6139, Requested 5224. Please try again in 37.397142857s.";
    expect(reportRateLimitWaitMs(new Error(itpm))).toBe(37397);
    expect(reportRateLimitWaitMs(new Error("Rate limit reached on tokens per day (TPD). Please try again in 20s."))).toBeUndefined();
    expect(reportRateLimitWaitMs(new Error("Rate limit reached on tokens per minute. Please try again in 2m10s."))).toBeUndefined();
    expect(reportRateLimitWaitMs(new Error("provider 500"))).toBeUndefined();
  });
});

