import { describe, it, expect } from "vitest";
import { fitWords, isAiOutline, outlineFromAi, outlineUserPrompt, requestedTotal, rescaleOutline } from "../aiOutline";

const ai = (o: unknown) => "```json\n" + JSON.stringify(o) + "\n```";
const OUTLINE = {
  sections: [
    { title: "Introduction", subsections: [{ title: "Clinical AI adoption in rural district hospitals", words: 500 }, { title: "Research questions", words: 300 }] },
    { title: "Methods", subsections: [{ title: "Interviews with hospital managers in three provinces", words: 900 }] },
    { title: "Findings", subsections: [{ title: "AI cut errors by 40%", words: 500 }, { title: "Who signs off on AI tools", words: 700 }] },
    { title: "Discussion" },
  ],
};

describe("AI-designed table of contents", () => {
  it("keeps the AI's article-specific headings and scales words to add up to the target exactly", () => {
    const bp = outlineFromAi(ai(OUTLINE), "p1", 5000)!;
    expect(bp.sections.map((s) => s.sectionName)).toEqual(["Introduction", "Methods", "Findings", "Discussion"]);
    expect(bp.sections[0].subSections[0].title).toBe("Clinical AI adoption in rural district hospitals");
    // A heading that states a result is dropped.
    expect(bp.sections[2].subSections.map((u) => u.title)).toEqual(["Who signs off on AI tools"]);
    // A section with no sub-sections becomes one writing unit.
    expect(bp.sections[3].subSections).toHaveLength(1);
    const sum = bp.sections.reduce((n, s) => n + s.subSections.reduce((m, u) => m + u.targetWords, 0), 0);
    expect(sum).toBe(5000);
    expect(bp.targetTotalWords).toBe(5000);
    expect(bp.sections[1].sectionKey).toBe("methods");
    expect(isAiOutline(bp)).toBe(true);
    expect(outlineFromAi("no json here", "p1", 5000)).toBeUndefined();
    expect(outlineFromAi(ai({ sections: [{ title: "Only one" }] }), "p1", 5000)).toBeUndefined();
  });

  it("changes the total only when the author's request names that number", () => {
    expect(requestedTotal("Make it 8,000 words in total", 8000)).toBe(8000);
    expect(requestedTotal("make it 8k words", 8000)).toBe(8000);
    expect(requestedTotal("shorten the literature review", 4000)).toBeUndefined();
    const bp = outlineFromAi(ai({ ...OUTLINE, totalWords: 8000 }), "p1", 5000, "Expand to 8000 words")!;
    expect(bp.targetTotalWords).toBe(8000);
    // An AI that changes the total unasked is ignored.
    expect(outlineFromAi(ai({ ...OUTLINE, totalWords: 9000 }), "p1", 5000, "shorten the methods")!.targetTotalWords).toBe(5000);
  });

  it("rescales an outline to a new total and gives the AI the current outline when revising", () => {
    const bp = outlineFromAi(ai(OUTLINE), "p1", 5000)!;
    const big = rescaleOutline(bp, 7000);
    expect(big.sections.reduce((n, s) => n + s.targetWords, 0)).toBe(7000);
    expect(fitWords([100, 300], 1000)).toEqual([250, 750]);
    const prompt = outlineUserPrompt({ title: "T", problem: "P", questions: ["Q?"], articleType: "", journal: "", requiredSections: ["Introduction", "Methods"], targetWords: 5000, instruction: "Merge methods", current: bp });
    expect(prompt).toContain("Required sections, in order: Introduction; Methods");
    expect(prompt).toContain("Current outline:");
    expect(prompt).toContain("The author asks: Merge methods");
  });
});
