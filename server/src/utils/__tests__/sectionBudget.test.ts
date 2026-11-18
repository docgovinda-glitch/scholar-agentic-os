import { describe, it, expect, vi } from "vitest";
import { repeatsDraft, sectionWordRange, trimToSentenceWithinWords } from "../sectionBudget";
import { countProseWords } from "../../../../src/shared/proseBlocks";
import { countExactWords } from "../wordBudgetAllocator";

describe("section word budgets", () => {
  it("allows ±5% around the allocated words", () => {
    expect(sectionWordRange(300)).toEqual({ min: 285, max: 315 });
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

describe("repeatsDraft", () => {
  it("accepts new analysis and rejects a restatement", () => {
    const draft = "Central banks set the policy rate through a committee vote. The rate then moves market rates.";
    expect(repeatsDraft("Expectations matter too, because forward guidance shifts long-term yields before any change.", draft)).toBe(false);
    expect(repeatsDraft("Central banks set the policy rate through a committee vote, as noted.", draft)).toBe(true);
  });
});
