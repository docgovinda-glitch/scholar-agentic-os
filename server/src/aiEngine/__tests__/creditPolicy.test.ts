import { describe, it, expect } from "vitest";
import { creditsForUsage, estimateMaxCreditsForInput } from "../creditPolicy";

describe("creditsForUsage", () => {
  it("charges at least 1 credit for any usage, however small", () => {
    expect(creditsForUsage(1, 1)).toBe(1);
    expect(creditsForUsage(0, 0)).toBe(1);
  });

  it("weights output tokens 3x input tokens", () => {
    // 100 input, 0 output = 100 weighted -> 1 credit (ceil(100/750))
    expect(creditsForUsage(100, 0)).toBe(1);
    // 0 input, 100 output = 300 weighted -> 1 credit (ceil(300/750))
    expect(creditsForUsage(0, 100)).toBe(1);
    // Same total token count, output-heavy costs more.
    const inputHeavy = creditsForUsage(3000, 0); // 3000 weighted
    const outputHeavy = creditsForUsage(0, 3000); // 9000 weighted
    expect(outputHeavy).toBeGreaterThan(inputHeavy);
  });

  it("rounds up rather than down (never undercharges a partial credit)", () => {
    expect(creditsForUsage(751, 0)).toBe(2);
    expect(creditsForUsage(750, 0)).toBe(1);
  });

  it("scales roughly linearly for large usage", () => {
    expect(creditsForUsage(7500, 0)).toBe(10);
  });
});

describe("estimateMaxCreditsForInput", () => {
  it("returns a positive estimate for real input text", () => {
    const text = "a".repeat(4000); // ~1000 tokens
    expect(estimateMaxCreditsForInput(text)).toBeGreaterThan(0);
  });

  it("is a worst-case ceiling: exceeds creditsForUsage() for the same input assuming realistic (smaller) output", () => {
    const text = "a".repeat(4000);
    const inputTokens = Math.ceil(text.length / 4);
    const realisticCharge = creditsForUsage(inputTokens, inputTokens); // output ~= input, a typical refinement
    const worstCase = estimateMaxCreditsForInput(text);
    expect(worstCase).toBeGreaterThanOrEqual(realisticCharge);
  });

  it("grows with input length", () => {
    const short = estimateMaxCreditsForInput("a".repeat(100));
    const long = estimateMaxCreditsForInput("a".repeat(100000));
    expect(long).toBeGreaterThan(short);
  });
});
