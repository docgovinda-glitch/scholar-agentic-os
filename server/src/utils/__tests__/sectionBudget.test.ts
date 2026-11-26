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

describe("trimToSentenceWithinWords: abbreviations at the cut", () => {
  it("does not stop on 'et al.' or 'e.g.' as if it ended a sentence", () => {
    const text = "The first finding is clear and well supported. Later work confirmed it, as shown by Smith et al. and then by many others across the field.";
    // Cut falls right after "et al.", which is not the end of that sentence.
    const out = trimToSentenceWithinWords(text, 18);
    expect(out).toBe("The first finding is clear and well supported.");
    const eg = trimToSentenceWithinWords("Sleep matters for recall. Many factors matter, e.g. caffeine intake and light exposure at night.", 8);
    expect(eg).toBe("Sleep matters for recall.");
  });

  it("still ends on a real sentence that finishes with etc. or a normal word", () => {
    expect(trimToSentenceWithinWords("We measured sleep, mood, memory, etc. The rest follows from that and more words here.", 6)).toBe("We measured sleep, mood, memory, etc.");
  });
});

describe("repeatsDraft", () => {
  it("accepts new analysis and rejects a restatement", () => {
    const draft = "Central banks set the policy rate through a committee vote. The rate then moves market rates.";
    expect(repeatsDraft("Expectations matter too, because forward guidance shifts long-term yields before any change.", draft)).toBe(false);
    expect(repeatsDraft("Central banks set the policy rate through a committee vote, as noted.", draft)).toBe(true);
  });
});
