import { describe, it, expect } from "vitest";
import { countActiveFilters, DEFAULT_SOURCE_FILTERS, filterAndSortSources, normalizeRelevance, splitNeedsChecking } from "../sourceFilters";
import type { DiscoveredSource } from "../../types";

const src = (id: string, extra: Partial<DiscoveredSource> = {}) =>
  ({ id, title: `Paper ${id}`, authors: ["Kuncoro, H."], year: "2020", type: "journal", relevanceScore: 0.5, status: "kept", ...extra }) as DiscoveredSource;

const ids = { approvedSourceIds: ["b"], bookmarkedIds: ["c"], excludedIds: ["d"] };
const list = [src("a"), src("b", { relevanceScore: 0.9 }), src("c", { year: "2025" }), src("d"), src("e", { prescribedInBrief: true, relevanceScore: 0.1 })];

describe("Stage 3 source list", () => {
  it("the All tab hides excluded sources and puts prescribed ones first, then by relevance", () => {
    expect(filterAndSortSources(list, DEFAULT_SOURCE_FILTERS, ids).map((s) => s.id)).toEqual(["e", "b", "a", "c"]);
  });

  it("tabs show the approved, bookmarked and excluded sets", () => {
    const tab = (activeTab: typeof DEFAULT_SOURCE_FILTERS.activeTab) => filterAndSortSources(list, { ...DEFAULT_SOURCE_FILTERS, activeTab }, ids).map((s) => s.id);
    expect(tab("approved")).toEqual(["b"]);
    expect(tab("bookmarked")).toEqual(["c"]);
    expect(tab("excluded")).toEqual(["d"]);
  });

  it("search, year and relevance filters combine; the active count ignores tab and search", () => {
    const f = { ...DEFAULT_SOURCE_FILTERS, searchQuery: "paper", selectedYearRange: "recent", minRelevance: 40 };
    expect(filterAndSortSources(list, f, ids).map((s) => s.id)).toEqual(["c"]);
    expect(countActiveFilters(f)).toBe(2);
    expect(normalizeRelevance(0.42)).toBe(42);
    expect(normalizeRelevance(87)).toBe(87);
    expect(normalizeRelevance(undefined)).toBe(0);
  });
});

describe("Needs checking", () => {
  const s = (id: string, extra: Partial<DiscoveredSource> = {}): DiscoveredSource =>
    ({ id, title: id, authors: ["A, B."], year: "2020", type: "journal", citation: "", mainFinding: "", suggestedUse: "", status: "kept", ...extra }) as DiscoveredSource;
  it("puts search results that cannot be cited apart, unless the student approved them, added them, or the brief names them", () => {
    const list = [
      s("ok", { verificationStatus: "verified" }),
      s("thin", { verificationStatus: "metadata_incomplete", authors: [] }),
      s("approved-thin", { verificationStatus: "metadata_incomplete" }),
      s("prescribed-thin", { verificationStatus: "metadata_incomplete", prescribedInBrief: true }),
      s("mine-thin", { verificationStatus: "metadata_incomplete", sourceOrigin: "user_added" }),
    ];
    const { main, needsChecking } = splitNeedsChecking(list, ["approved-thin"]);
    expect(needsChecking.map((x) => x.id)).toEqual(["thin"]);
    expect(main.map((x) => x.id)).toEqual(["ok", "approved-thin", "prescribed-thin", "mine-thin"]);
  });
});

describe("ranking by relevance", () => {
  const s = (id: string, extra: Partial<DiscoveredSource> = {}): DiscoveredSource =>
    ({ id, title: id, authors: [], year: "2020", type: "journal", citation: "", mainFinding: "", suggestedUse: "", status: "kept", ...extra }) as DiscoveredSource;
  it("puts the AI's high and medium reads first and its low reads last, then measured relevance", () => {
    const list = [s("lowAi", { aiRelevance: "low", relevanceScore: 90 }), s("unread", { relevanceScore: 70 }), s("highAi", { aiRelevance: "high", relevanceScore: 30 }), s("medAi", { aiRelevance: "medium", relevanceScore: 50 })];
    const out = filterAndSortSources(list, DEFAULT_SOURCE_FILTERS, { approvedSourceIds: [], bookmarkedIds: [], excludedIds: [] });
    expect(out.map((x) => x.id)).toEqual(["highAi", "medAi", "unread", "lowAi"]);
  });
});
