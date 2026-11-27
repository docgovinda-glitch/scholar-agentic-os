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

import { searchCrossref } from "../providers";
describe("searchCrossref: only citable works", () => {
  it("drops figure/table components and peer-review reports", async () => {
    const items = [
      { type: "journal-article", title: ["Policy rates and lending"], DOI: "10.1/a", author: [{ family: "Lee", given: "K." }] },
      { type: "component", title: ["2.2. Central bank policy interest rate in real terms"], DOI: "10.1787/x" },
      { type: "peer-review", title: ["Review of: Policy rates"], DOI: "10.1/r" },
    ];
    const fetchImpl = (async () => new Response(JSON.stringify({ message: { items } }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
    const res = await searchCrossref("central bank policy rate", 15, 1, { fetchImpl });
    expect(res.items.map((i) => i.title)).toEqual(["Policy rates and lending"]);
  });
});

import { isPlausibleRecord } from "../providers";
describe("isPlausibleRecord (repository spam)", () => {
  it("drops keyword-stuffed titles and number-only authors", () => {
    expect(isPlausibleRecord({ title: "x ".repeat(200), authors: ["Lee, K."] })).toBe(false);
    expect(isPlausibleRecord({ title: "Stroke rehabilitation", authors: ["33"] })).toBe(false);
    expect(isPlausibleRecord({ title: "Policy rates and lending", authors: ["Lee, K."] })).toBe(true);
    expect(isPlausibleRecord({ title: "A dataset with no listed authors", authors: [] })).toBe(true);
  });
});

describe("titleText", () => {
  it("drops a 'Title:' label a record carries inside its title, and keeps real titles whole", async () => {
    const { titleText } = await import("../providers");
    expect(titleText("Title: Spaced-Repetition Learning as a tool in medical education")).toBe("Spaced-Repetition Learning as a tool in medical education");
    expect(titleText("<i>Title</i>: Echo chambers")).toBe("Echo chambers");
    expect(titleText("Title IX and campus policy")).toBe("Title IX and campus policy");
  });
});
