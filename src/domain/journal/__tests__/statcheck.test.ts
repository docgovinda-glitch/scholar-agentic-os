import { describe, it, expect } from "vitest";
import { checkStatistics, formatP, pValue } from "../statcheck";

describe("pValue", () => {
  // Critical values from standard tables: each should give p = .05.
  it.each([
    ["t", 2.228, 10, undefined],
    ["t", 1.96, 100000, undefined],
    ["F", 4.17, 1, 30],
    ["F", 3.35, 2, 27],
    ["chi2", 3.841, 1, undefined],
    ["chi2", 9.488, 4, undefined],
    ["z", 1.96, undefined, undefined],
  ] as const)("%s = %s (df %s, %s) gives p ≈ .05", (test, value, df1, df2) => {
    expect(pValue(test, value, df1, df2)).toBeCloseTo(0.05, 3);
  });

  it("matches known exact values", () => {
    expect(pValue("t", 2.2, 28)).toBeCloseTo(0.0362, 4);
    expect(pValue("r", 0.28, 48)).toBeCloseTo(0.0489, 4);
    expect(pValue("t", -2.2, 28)).toBeCloseTo(0.0362, 4);
    expect(pValue("r", 1, 10)).toBe(0);
  });
});

describe("checkStatistics", () => {
  const text = [
    "A difference, t(28) = 2.20, p = .036, was found.",
    "Another *t*(28) = 2.20, *p* = .36.",
    "No effect: F(2, 27) = 1.10, p < .05.",
    "Association χ2(1, N = 90) = 6.62, p = .01.",
    "Correlation r(48) = −.28, p = .049.",
    "Directional z = 1.70, p = .045 (one-tailed).",
    "Rounded t(30) = 2.04, p = .050.",
    "Not a result: t = 4 in the equation, and p < .05 alone.",
  ].join(" ");
  const results = checkStatistics(text);
  const byText = (start: string) => results.find((r) => r.text.startsWith(start))!;

  it("finds every APA-style result and nothing else", () => {
    expect(results.map((r) => r.test)).toEqual(["t", "t", "F", "chi2", "r", "z", "t"]);
  });

  it("accepts results that add up, allowing for rounding of the statistic", () => {
    for (const r of [results[0], byText("χ2"), byText("r(48)"), byText("t(30)")]) {
      expect(r.consistent).toBe(true);
      expect(r.decisionError).toBe(false);
    }
  });

  it("flags results that don't add up, and those that change the conclusion", () => {
    const typo = results[1];
    expect(typo).toMatchObject({ consistent: false, decisionError: true });
    expect(typo.computedP).toBeCloseTo(0.0362, 3);
    expect(byText("F(2, 27)")).toMatchObject({ consistent: false, decisionError: true });
  });

  it("recognises a result that only fits as one-tailed, without calling it an error", () => {
    expect(byText("z =")).toMatchObject({ consistent: false, oneTailedFits: true, decisionError: false });
  });

  it("prints p the way journals do", () => {
    expect(formatP(0.0004)).toBe("< .001");
    expect(formatP(0.0362)).toBe(".036");
  });
});
