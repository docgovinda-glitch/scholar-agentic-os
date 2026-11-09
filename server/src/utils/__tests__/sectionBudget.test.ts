import { describe, it, expect } from "vitest";
import { sectionWordRange, trimToSentenceWithinWords } from "../sectionBudget";
import { countExactWords } from "../wordBudgetAllocator";

describe("section word budgets", () => {
  it("allows ±10% around the allocated words", () => {
    expect(sectionWordRange(300)).toEqual({ min: 270, max: 330 });
  });

  it("keeps in-budget text unchanged", () => {
    expect(trimToSentenceWithinWords("One short sentence here.", 50)).toBe("One short sentence here.");
  });

  it("trims an overrun draft back to a whole sentence", () => {
    const sentence = "This sentence has exactly seven words in it.";
    const text = Array.from({ length: 10 }, () => sentence).join(" ");
    const out = trimToSentenceWithinWords(text, 30);
    expect(countExactWords(out)).toBeLessThanOrEqual(30);
    expect(out.endsWith(".")).toBe(true);
  });
});
