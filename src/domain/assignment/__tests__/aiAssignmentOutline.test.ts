import { describe, it, expect } from "vitest";
import { assignmentOutlinePrompt, assignmentOutlineUserPrompt, structureFromAi, isAiAssignmentOutline } from "../aiAssignmentOutline";
import type { AssignmentDraftingSection } from "../../../desk/assignment/types";

const AI = JSON.stringify({
  thesis: "Tesco uses social media mainly for service, not engagement.",
  sections: [
    { title: "Introduction", subsections: [{ title: "Purpose and scope of the report", words: 250, guidance: "Say what the report evaluates." }] },
    {
      title: "Tesco's social media engagement",
      subsections: [
        { title: "Channels and content strategy", words: 600 },
        { title: "Engagement evaluated against the customer engagement framework", words: 700 },
      ],
    },
    { title: "Recommendations", subsections: [{ title: "What Tesco should change", words: 450 }] },
    { title: "Conclusion", subsections: [{ title: "Answer to the brief", words: 250 }] },
  ],
});

const sec = (id: string, title: string, draftContent = ""): AssignmentDraftingSection =>
  ({ id, title, targetWordCount: 300, currentWordCount: draftContent ? draftContent.split(" ").length : 0, draftContent, status: draftContent ? "completed" : "not_started", linkedEvidenceIds: [], boundSourceIds: [] }) as AssignmentDraftingSection;

describe("coursework outline written by the student's AI", () => {
  it("asks for a structure that fits the brief, not a fixed template", () => {
    const p = assignmentOutlinePrompt();
    expect(p).toMatch(/do not use a fixed template/);
    expect(p).not.toMatch(/EXACTLY 3/);
    expect(p).toMatch(/marking criteria/);
    const u = assignmentOutlineUserPrompt({
      brief: "Write a 2,500-word report on a UK retailer's social media.",
      assignmentType: "report",
      discipline: "business",
      targetWords: 2500,
      criteria: ["critical analysis 40%", "use of theory 25%"],
    });
    expect(u).toMatch(/UK retailer/);
    expect(u).toMatch(/critical analysis 40%/);
    expect(u).toMatch(/SUBJECT AREA: Business/);
    expect(assignmentOutlineUserPrompt({ brief: "x", targetWords: 1000 })).toMatch(/no marking criteria/);
  });

  it("keeps the AI's sections and makes word targets add up to the total", () => {
    const s = structureFromAi("Here you go:\n```json\n" + AI + "\n```", 2500)!;
    expect(s.source).toBe("ai");
    expect(isAiAssignmentOutline(s)).toBe(true);
    expect(s.headings.map((h) => h.title)).toEqual(["Introduction", "Tesco's social media engagement", "Recommendations", "Conclusion"]);
    expect(s.headings[1].subheadings.map((x) => x.numberStr)).toEqual(["2.1", "2.2"]);
    const sum = s.headings.flatMap((h) => h.subheadings).reduce((a, b) => a + b.targetWordCount, 0);
    expect(sum).toBe(2500);
    expect(s.thesisStatement).toMatch(/Tesco/);
    expect(s.headings[0].subheadings[0].guidance).toBe("Say what the report evaluates.");
  });

  it("changes the total only when the student named it", () => {
    const withTotal = JSON.stringify({ ...JSON.parse(AI), totalWords: 3000 });
    expect(structureFromAi(withTotal, 2500, { instruction: "make it 3,000 words" })!.targetWordCount).toBe(3000);
    expect(structureFromAi(withTotal, 2500, { instruction: "add a section on ethics" })!.targetWordCount).toBe(2500);
  });

  it("never loses written text when the outline is revised", () => {
    const previous = [
      sec("s-a", "2.1 Channels and content strategy", "Tesco posts daily on Instagram and TikTok."),
      sec("s-b", "3.1 Old section about pricing", "Prices were discussed here."),
      sec("s-c", "1.1 Empty one"),
    ];
    const s = structureFromAi(AI, 2500, { instruction: "tighten it", previous })!;
    const all = s.headings.flatMap((h) => h.subheadings);
    const kept = all.find((x) => x.title === "Channels and content strategy")!;
    expect(kept.id).toBe("s-a");
    expect(kept.draftContent).toMatch(/Instagram/);
    const last = s.headings[s.headings.length - 1];
    expect(last.title).toBe("Kept from your earlier outline");
    expect(last.subheadings.map((x) => [x.id, x.title, x.draftContent])).toEqual([["s-b", "Old section about pricing", "Prices were discussed here."]]);
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    expect(s.rationale).toMatch(/tighten it/);
  });

  it("returns nothing for an unusable answer", () => {
    expect(structureFromAi("Sorry, I can't help.", 2000)).toBeUndefined();
    expect(structureFromAi('{"sections": []}', 2000)).toBeUndefined();
  });
});
