/**
 * The AI decides the outline: its headings, levels, purposes and word
 * proportions are kept; code only fits the total, covers a marked question the
 * AI missed (titled from the brief) and notes what it changed.
 */
import { describe, it, expect } from "vitest";
import { replaceSectionFromAi, structureFromAi } from "../aiAssignmentOutline";
import { structureToInternalSections } from "../../../desk/assignment/types";

const BRIEF = `Q1. Evaluate how loyalty schemes shape customer retention in UK supermarkets. [40 Marks]
Q2. Recommend how one supermarket should redesign its scheme. [60 Marks]`;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("AI outline fitting", () => {
  it("keeps the AI's headings, levels, purposes and dependencies verbatim", () => {
    const ai = {
      thesisOptions: [
        { statement: "Loyalty schemes retain customers mainly through data-driven personalisation.", angle: "Data" },
        "Loyalty schemes matter less than price for retention.",
      ],
      sections: [
        { title: "Retention economics of loyalty schemes", questionRef: "Q1", purpose: "Answer Q1 with evidence on retention.", subsections: [
          { title: "Mechanisms", words: 300, purpose: "Explain how schemes work.", subsections: [
            { title: "Points and rewards", words: 150 },
            { title: "Personalised offers", words: 150 },
          ] },
          { title: "Evidence from UK grocers", words: 300, dependsOn: ["Mechanisms"] },
        ] },
        { title: "Redesigning Tesco Clubcard", questionRef: "Q2", purpose: "Answer Q2.", subsections: [{ title: "Recommendations", words: 900 }] },
      ],
    };
    const out = structureFromAi(JSON.stringify(ai), 1500, { briefText: BRIEF })!;
    expect(out.headings.map((h) => h.title)).toEqual(["Retention economics of loyalty schemes", "Redesigning Tesco Clubcard"]);
    expect(out.headings[0].purpose).toBe("Answer Q1 with evidence on retention.");
    const units = out.headings[0].subheadings;
    expect(units.map((u) => [u.numberStr, u.title, u.level ?? 2])).toEqual([
      ["1.1.1", "Points and rewards", 3],
      ["1.1.2", "Personalised offers", 3],
      ["1.2", "Evidence from UK grocers", 2],
    ]);
    expect(units[0].parentTitle).toBe("Mechanisms");
    expect(units[2].dependsOn).toEqual(["Mechanisms"]);
    expect(sum(out.headings.map((h) => h.targetWordCount))).toBe(1500);
    expect(out.headings.map((h) => h.targetWordCount)).toEqual([600, 900]);
    expect(out.budgetNotes).toEqual([]);
    expect(out.thesisOptions?.map((t) => t.statement)).toHaveLength(2);
    expect(out.thesisStatement).toMatch(/personalisation/);
    expect(out.source).toBe("ai");
  });

  it("makes an undivided section one writing unit under its own title (no filler sub-heading)", () => {
    const out = structureFromAi(JSON.stringify({ sections: [{ title: "Introduction", words: 200 }, { title: "Argument", words: 800 }] }), 1000)!;
    const titles = out.headings.flatMap((h) => h.subheadings.map((s) => s.title));
    expect(titles).toEqual(["Introduction", "Argument"]);
    expect(titles.join(" ")).not.toMatch(/Key points and evidence/);
    expect(structureToInternalSections(out).map((s) => s.targetWordCount)).toEqual([200, 800]);
  });

  it("adds a section for a marked question the AI left out, titled from the brief, and says so", () => {
    const out = structureFromAi(JSON.stringify({ sections: [{ title: "Retention and loyalty schemes", questionRef: "Q1", words: 800 }] }), 2000, { briefText: BRIEF })!;
    expect(out.headings).toHaveLength(2);
    expect(out.headings[0].title).toBe("Retention and loyalty schemes");
    expect(out.headings[1].title).toMatch(/Recommend how one supermarket should redesign/);
    expect(sum(out.headings.map((h) => h.targetWordCount))).toBe(2000);
    expect(out.budgetNotes?.[0]).toMatch(/no section for Q2/);
  });

  it("scales an AI total that misses the target, keeping its proportions, and notes it", () => {
    const out = structureFromAi(JSON.stringify({ sections: [{ title: "A", words: 100 }, { title: "B", words: 300 }] }), 800)!;
    expect(out.headings.map((h) => h.targetWordCount)).toEqual([200, 600]);
    expect(out.budgetNotes?.join(" ")).toMatch(/added up to 400; they were scaled to the 800-word target/);
  });
});

describe("rewriting one section", () => {
  it("keeps text under sub-sections that survive, and keeps dropped written ones at the end with no budget", () => {
    const base = structureFromAi(JSON.stringify({ sections: [{ title: "Intro", words: 200 }, { title: "Body", subsections: [{ title: "Point A", words: 400 }, { title: "Point B", words: 400 }] }] }), 1000)!;
    const body = base.headings[1];
    const written = body.subheadings.map((u, i) => ({ id: u.id, title: u.title, targetWordCount: u.targetWordCount, draftContent: i === 0 ? "Text for A." : "Text for B.", status: "completed" })) as never[];
    const next = replaceSectionFromAi(base, body.id, JSON.stringify({ section: { title: "Body, sharper", subsections: [{ title: "Point A", words: 500 }, { title: "Point C", words: 300 }] } }), written)!;
    const h = next.headings[1];
    expect(h.id).toBe(body.id);
    expect(h.title).toBe("Body, sharper");
    expect(h.targetWordCount).toBe(800);
    expect(h.subheadings.map((u) => [u.title, u.targetWordCount, u.draftContent])).toEqual([
      ["Point A", 500, "Text for A."],
      ["Point C", 300, ""],
      ["Point B", 0, "Text for B."],
    ]);
    expect(next.headings[0]).toEqual(base.headings[0]);
    expect(replaceSectionFromAi(base, body.id, "not json")).toBeUndefined();
  });
});
