import { describe, it, expect } from "vitest";
import { decomposeQuery, interleaveResults, parseYearFrom } from "../queryDecomposition";

describe("queryDecomposition", () => {
  it("splits a comparative two-theorist question into per-concept and recent queries", () => {
    const d = decomposeQuery("Compare Wendt and Mearsheimer on regional security in East Asia and Europe, 2020–2026");
    expect(d.decomposed).toBe(true);
    expect(d.queries.length).toBeGreaterThanOrEqual(2);
    expect(d.queries.length).toBeLessThanOrEqual(3);
    expect(d.queries[0]).toMatch(/Wendt/);
    expect(d.queries[1]).toMatch(/Mearsheimer/);
    expect(d.yearFrom).toBe(2020);
  });
  it("leaves a simple question as one query", () => {
    const d = decomposeQuery("effects of sleep on memory consolidation");
    expect(d).toMatchObject({ decomposed: false, queries: ["effects of sleep on memory consolidation"] });
  });
  it("parses year filters", () => {
    expect(parseYearFrom("papers since 2021")).toBe(2021);
    expect(parseYearFrom("no dates")).toBeUndefined();
  });
  it("interleaves lists", () => {
    expect(interleaveResults([[1, 2, 3], [4, 5]], 4)).toEqual([1, 4, 2, 5]);
  });
});
