import { describe, it, expect } from "vitest";
import { clampWordLimit } from "../wordLimit";

describe("clampWordLimit", () => {
  it("clamps instead of resetting", () => {
    expect(clampWordLimit(60000)).toBe(50000);
    expect(clampWordLimit(50)).toBe(100);
    expect(clampWordLimit("1500")).toBe(1500);
  });
  it("uses the default for missing or invalid values", () => {
    expect(clampWordLimit(undefined)).toBe(2000);
    expect(clampWordLimit("abc")).toBe(2000);
    expect(clampWordLimit(0)).toBe(2000);
    expect(clampWordLimit("2000150")).toBe(2000);
  });
});

import { allocateCleanWords } from "../outlineBudget";

describe("allocateCleanWords with many sections", () => {
  it("never gives a section zero or negative words and always sums to the total", () => {
    for (const [n, total] of [[11, 100], [10, 100], [40, 150], [3, 100]] as const) {
      const r = allocateCleanWords(Array.from({ length: n }, (_, i) => (i % 4 === 0 ? 0 : i + 1)), total);
      expect(r.reduce((a, b) => a + b, 0)).toBe(total);
      expect(Math.min(...r), JSON.stringify([n,total,r])).toBeGreaterThan(0);
    }
  });
});
