import { describe, it, expect } from "vitest";
import { applyScholarFilters, DEFAULT_SCHOLAR_FILTERS, describeFilters, hasActiveFilters } from "../scholarFilters";

const rows = [
  { year: 2018, openAccessUrl: "x" },
  { year: 2022, credibilityLevel: "preprint - not peer-reviewed" },
  { year: 2024, source: "web" },
  { year: 2023, openAccessUrl: "y" },
  { publicationDate: "n.d." },
];

describe("scholarFilters", () => {
  it("passes everything by default", () => {
    expect(applyScholarFilters(rows, DEFAULT_SCHOLAR_FILTERS)).toHaveLength(5);
    expect(hasActiveFilters(DEFAULT_SCHOLAR_FILTERS)).toBe(false);
  });
  it("filters by year range, peer review and open access", () => {
    expect(applyScholarFilters(rows, { yearPreset: "2020-2026", scopes: [] })).toHaveLength(3);
    expect(applyScholarFilters(rows, { yearPreset: "2020-2026", scopes: ["peer_reviewed"] })).toHaveLength(1);
    expect(applyScholarFilters(rows, { yearPreset: "any", scopes: ["full_text_oa"] })).toHaveLength(2);
  });
  it("describes active filters", () => {
    expect(describeFilters({ yearPreset: "custom", yearFrom: 2015, scopes: ["peer_reviewed"] })).toEqual(["2015–…", "Peer-reviewed only"]);
  });
});
