import { describe, it, expect, vi } from "vitest";
import { fitDraftToBudget, repeatsDraft, sectionWordRange, trimToSentenceWithinWords } from "../sectionBudget";
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

describe("fitDraftToBudget", () => {
  const words = (n: number, w = "word") => Array.from({ length: n }, () => w).join(" ") + ".";
  const range = sectionWordRange(400); // 380-420

  it("leaves a draft already in range untouched (no extra model calls)", async () => {
    const steps = { rewriteLonger: vi.fn(), continueDraft: vi.fn() };
    expect(await fitDraftToBudget(words(400), range, steps)).toBe(words(400));
    expect(steps.rewriteLonger).not.toHaveBeenCalled();
  });

  it("uses the rewrite when it reaches the range, and does not continue", async () => {
    const steps = { rewriteLonger: vi.fn().mockResolvedValue(words(395)), continueDraft: vi.fn() };
    const out = await fitDraftToBudget(words(200), range, steps);
    expect(countProseWords(out)).toBe(395);
    expect(steps.continueDraft).not.toHaveBeenCalled();
  });

  it("continues a still-short draft by the missing words, appended as a new paragraph", async () => {
    const steps = {
      rewriteLonger: vi.fn().mockResolvedValue(words(300)),
      continueDraft: vi.fn().mockImplementation(async (_d: string, missing: number) => words(missing, "more")),
    };
    const out = await fitDraftToBudget(words(200), range, steps);
    expect(steps.continueDraft.mock.calls[0][1]).toBe(100); // midpoint 400 - 300
    expect(out).toMatch(/\.\n\nmore/);
    expect(countProseWords(out)).toBe(400);
  });

  it("drops a continuation that only repeats the draft", async () => {
    const draft = "Groups shape decisions through shared norms and early proposals. Members anchor on the first idea offered.";
    const steps = { rewriteLonger: vi.fn().mockResolvedValue(draft), continueDraft: vi.fn().mockResolvedValue(draft) };
    expect(await fitDraftToBudget(draft, range, steps)).toBe(draft);
  });

  it("never makes a draft shorter, and survives failing steps", async () => {
    const steps = { rewriteLonger: vi.fn().mockResolvedValue(words(50)), continueDraft: vi.fn().mockRejectedValue(new Error("down")) };
    expect(countProseWords(await fitDraftToBudget(words(200), range, steps))).toBe(200);
  });

  it("counts like the app: table rules and markup are not words", () => {
    const table = "| A | B |\n| --- | --- |\n| x | y |";
    expect(trimToSentenceWithinWords(table, 4)).toBe(table);
  });
});

describe("repeatsDraft", () => {
  it("accepts new analysis and rejects a restatement", () => {
    const draft = "Central banks set the policy rate through a committee vote. The rate then moves market rates.";
    expect(repeatsDraft("Expectations matter too, because forward guidance shifts long-term yields before any change.", draft)).toBe(false);
    expect(repeatsDraft("Central banks set the policy rate through a committee vote, as noted.", draft)).toBe(true);
  });
});
