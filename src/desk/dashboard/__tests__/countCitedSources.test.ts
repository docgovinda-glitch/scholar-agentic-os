import { describe, expect, it } from "vitest";
import { countCitedSources } from "../askScholarAnswer";
import { classifySourceTypeAndCredibility } from "../../../citation_compliance/cslEngine";
import { isGreeting } from "../../../shared/askRouting";

const sources = [
  { authors: ["Ama Samarasinghe"], year: 2025, doi: "10.1000/one" },
  { authors: ["Lee, Min"], year: 2021 },
  { authors: ["Cheesehead TV"], year: 2024, url: "https://example.com/x" },
];

describe("countCitedSources", () => {
  it("counts nothing when the answer cites nothing", () => {
    expect(countCitedSources("Hello! How can I help?", sources)).toBe(0);
  });
  it("counts numbered, ranged and author-year citations", () => {
    expect(countCitedSources("A claim [1]. Another (Lee, 2021).", sources)).toBe(2);
    expect(countCitedSources("Both agree [1-3].", sources)).toBe(3);
  });
  it("ignores an appended reference list", () => {
    expect(countCitedSources("No markers here.\n## References\n[1] x [2] y", sources)).toBe(0);
  });
});

describe("news and greetings", () => {
  it("never rates a news feed item as peer-reviewed or high", () => {
    for (const source of [
      { title: "HELLO", venue: "HELLO! Magazine", url: "https://news.google.com/rss/articles/abc" },
      { title: "Packers", venue: "Cheesehead TV", sourceType: "media", url: "https://cheeseheadtv.com/a" },
    ]) {
      const result = classifySourceTypeAndCredibility(source);
      expect(result.sourceTypeLabel).toBe("news article");
      expect(result.credibilityLevel).toBe("moderate");
    }
  });
  it("recognises greetings but not questions that start with one", () => {
    expect(isGreeting("Hello")).toBe(true);
    expect(isGreeting("hi there!")).toBe(true);
    expect(isGreeting("Hello, what causes inflation?")).toBe(false);
  });
});
