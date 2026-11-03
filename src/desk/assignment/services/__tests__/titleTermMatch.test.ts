import { describe, it, expect } from "vitest";
import { titleTermMatch } from "../realScholarlyDiscoveryService";

describe("live source relevance is measured, not a fixed baseline", () => {
  const q = "Critically evaluate how the rise of China has affected US-China relations";

  it("is the share of the question's key terms found in the title", () => {
    // Key terms: rise, china, relations (instruction words are ignored).
    expect(titleTermMatch(q, "The Rise of China and the Future of the West")).toBe(67);
    expect(titleTermMatch(q, "China's rise and US–China relations")).toBe(100);
    expect(titleTermMatch(q, "Deep learning for protein folding")).toBe(0);
  });

  it("gives 0, not a made-up score, when the question has no key terms", () => {
    expect(titleTermMatch("Discuss.", "Anything")).toBe(0);
  });
});
