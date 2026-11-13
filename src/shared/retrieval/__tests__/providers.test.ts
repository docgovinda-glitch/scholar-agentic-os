import { describe, expect, it } from "vitest";
import { isLowCredibilityDomain } from "../credibility";
import { cleanSearchTopic, extractQueryKeywords, scoreRelevance, stripMarkup } from "../providers";

describe("shared retrieval helpers", () => {
  it("strips question scaffolding so providers search the topic", () => {
    expect(cleanSearchTopic("What is the effect of sleep on memory?")).toBe("the effect of sleep on memory");
    expect(extractQueryKeywords("Explain how sleep affects memory")).toEqual(["sleep", "affects", "memory"]);
  });

  it("scores topical overlap, citations and recency without inventing a minimum", () => {
    const hit = scoreRelevance("sleep and memory consolidation", "Sleep and memory consolidation in adults", "", { citedByCount: 500, year: new Date().getFullYear() });
    const miss = scoreRelevance("sleep and memory consolidation", "Tax policy in small economies", "");
    expect(hit.score).toBeGreaterThan(miss.score);
    expect(miss.titleMatches).toBe(0);
  });

  it("removes markup and entities from provider abstracts", () => {
    expect(stripMarkup("<jats:p>Fish &amp; chips &lt;3</jats:p>")).toBe("Fish & chips <3");
  });

  it("flags low-credibility hosts, including subdomains and any letter case", () => {
    expect(isLowCredibilityDomain("www.Quora.com")).toBe(true);
    expect(isLowCredibilityDomain("foo.blogspot.com")).toBe(true);
    expect(isLowCredibilityDomain("who.int")).toBe(false);
  });
});
