import { describe, it, expect } from "vitest";
import { allocateWordBudget } from "../wordBudget";
import type { WordBudgetSection, WordBudgetSpec } from "../wordBudget";

// OT-10's real catalog data (src/app/atlas/catalogData.ts) — an actual
// output type, not a synthetic fixture, so this pins the engine against
// what the app will really call it with.
const OT10_SECTIONS: WordBudgetSection[] = [
  { key: "title", title: "Title", guidance: "g", countsTowardWordcount: false },
  { key: "abstract", title: "Abstract", guidance: "g", countsTowardWordcount: false, wordBudget: { min: 150, max: 300, typical: 250 } },
  { key: "introduction", title: "Introduction", guidance: "g", countsTowardWordcount: true },
  { key: "methods", title: "Methods", guidance: "g", countsTowardWordcount: true },
  { key: "results", title: "Results", guidance: "g", countsTowardWordcount: true },
  { key: "discussion", title: "Discussion", guidance: "g", countsTowardWordcount: true },
  { key: "declarations", title: "Declarations", guidance: "g", countsTowardWordcount: false },
  { key: "references", title: "References", guidance: "g", countsTowardWordcount: false },
];
const OT10_BUDGET: WordBudgetSpec = {
  totalWords: { min: 3000, max: 10000, typical: 6000 },
  distribution: { introduction: 0.15, methods: 0.2, results: 0.25, discussion: 0.3 },
};

describe("allocateWordBudget", () => {
  it("excludes every section with countsTowardWordcount: false, even one with its own wordBudget (abstract)", () => {
    const plan = allocateWordBudget(OT10_SECTIONS, OT10_BUDGET);
    expect(plan.map((p) => p.key)).toEqual(["introduction", "methods", "results", "discussion"]);
  });

  it("allocates each covered section exactly its distribution fraction of the catalog's typical total", () => {
    const plan = allocateWordBudget(OT10_SECTIONS, OT10_BUDGET);
    const byKey = Object.fromEntries(plan.map((p) => [p.key, p.targetWords]));
    expect(byKey.introduction).toBe(Math.round(6000 * 0.15));
    expect(byKey.methods).toBe(Math.round(6000 * 0.2));
    expect(byKey.results).toBe(Math.round(6000 * 0.25));
    expect(byKey.discussion).toBe(Math.round(6000 * 0.3));
  });

  it("uses a venue-specific word-limit override instead of the catalog's typical total when supplied", () => {
    const plan = allocateWordBudget(OT10_SECTIONS, OT10_BUDGET, 4000);
    const byKey = Object.fromEntries(plan.map((p) => [p.key, p.targetWords]));
    expect(byKey.introduction).toBe(Math.round(4000 * 0.15));
  });

  it("splits any distribution fraction the catalog didn't cover evenly across the uncovered sections", () => {
    const sections: WordBudgetSection[] = [
      { key: "a", title: "A", guidance: "g", countsTowardWordcount: true },
      { key: "b", title: "B", guidance: "g", countsTowardWordcount: true },
    ];
    const budget: WordBudgetSpec = { totalWords: { min: 1000, max: 2000, typical: 1000 }, distribution: {} };
    const plan = allocateWordBudget(sections, budget);
    expect(plan[0].targetWords).toBe(500);
    expect(plan[1].targetWords).toBe(500);
  });

  it("gives a countsTowardWordcount section with its own wordBudget that fixed target, and subtracts it from the pool the distributed sections share", () => {
    const sections: WordBudgetSection[] = [
      { key: "summary", title: "Summary", guidance: "g", countsTowardWordcount: true, wordBudget: { min: 100, max: 100, typical: 100 } },
      { key: "body", title: "Body", guidance: "g", countsTowardWordcount: true },
    ];
    const budget: WordBudgetSpec = { totalWords: { min: 1000, max: 1000, typical: 1000 }, distribution: {} };
    const plan = allocateWordBudget(sections, budget);
    expect(plan.find((p) => p.key === "summary")?.targetWords).toBe(100);
    // The distributed pool is 1000 - 100 = 900, and "body" is the only
    // uncovered distributed section, so it gets the whole remaining pool.
    expect(plan.find((p) => p.key === "body")?.targetWords).toBe(900);
  });

  it("never allocates below the floor, even for a tiny total", () => {
    const sections: WordBudgetSection[] = [{ key: "a", title: "A", guidance: "g", countsTowardWordcount: true }];
    const budget: WordBudgetSpec = { totalWords: { min: 10, max: 10, typical: 10 }, distribution: { a: 1 } };
    const plan = allocateWordBudget(sections, budget);
    expect(plan[0].targetWords).toBe(50);
  });

  it("preserves guidance text through to the plan, so the generation prompt has real per-section instructions", () => {
    const plan = allocateWordBudget(OT10_SECTIONS, OT10_BUDGET);
    expect(plan.find((p) => p.key === "methods")?.guidance).toBe("g");
  });
});
