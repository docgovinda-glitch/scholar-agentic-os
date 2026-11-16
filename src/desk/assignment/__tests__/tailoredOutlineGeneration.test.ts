import { describe, it, expect, vi } from "vitest";
import {
  generateDynamicAssignmentStructure,
  deconstructQuestionSemantics,
  formatAcademicTopicTitle,
} from "../services/outlineService";

describe("Tailored Academic Outline Generation", () => {
  it("deconstructs universal questions into relational entities and formats academic titles", () => {
    const semantics1 = deconstructQuestionSemantics("The Impact of Quantitative Easing on Emerging Market Inflation");
    expect(semantics1.topicA).toBe("Quantitative Easing");
    expect(semantics1.topicB).toBe("Emerging Market Inflation");
    expect(semantics1.relationType).toBe("impact_on");

    const semantics2 = deconstructQuestionSemantics("Role of Microfinance in Rural Women Empowerment");
    expect(semantics2.topicA).toBe("Microfinance");
    expect(semantics2.topicB).toBe("Rural Women Empowerment");
    expect(semantics2.relationType).toBe("role_in");

    const formatted = formatAcademicTopicTitle("ai and machine learning in nlp systems");
    expect(formatted).toBe("AI and Machine Learning in NLP Systems");
  });

  it("generates strong bespoke outline for an arbitrary unknown academic prompt using semantic deconstruction", () => {
    const structure = generateDynamicAssignmentStructure({
      question: "Impact of Climate Change on Global Food Security",
      assignmentType: "essay",
      academicLevel: "undergraduate",
      targetWordCount: 2500,
      writingTone: "analytical",
    });

    // One section per concept the question names, between an introduction and a conclusion.
    const titles = structure.headings.map((h) => h.title);
    expect(titles[0]).toMatch(/Introduction/);
    expect(titles.join(" ")).toContain("Climate Change");
    expect(titles.join(" ")).toContain("Global Food Security");
    expect(titles[titles.length - 1]).toMatch(/Conclusion/);
    expect(structure.totalAllocated).toBe(2500);
  });

});

import { balanceAroundHeading } from "../services/outlineService";
describe("balanceAroundHeading (word-budget stepper)", () => {
  const sub = (id: string, w: number) => ({ id, title: id, targetWordCount: w, currentWordCount: 0, notes: "", guidance: "", keyPoints: [] });
  const structure = {
    version: 1, isConfirmed: false, targetWordCount: 1000, totalAllocated: 1000, thesisStatement: "", targetFrameworks: [],
    headings: [
      { id: "h1", number: 1, title: "One", targetWordCount: 450, subheadings: [sub("s1", 450)] },
      { id: "h2", number: 2, title: "Two", targetWordCount: 600, subheadings: [sub("s2", 600)] },
    ],
  } as never;
  it("keeps the edited section exactly and fits the rest to the target", () => {
    const out = balanceAroundHeading(structure, "h1", 1000) as unknown as { headings: Array<{ targetWordCount: number }> };
    expect(out.headings.map((h) => h.targetWordCount)).toEqual([450, 550]);
  });
});

import { removeSubheading } from "../services/outlineService";
it("never removes a section's last part (its budget would fall to 0)", () => {
  const s = { version: 1, headings: [{ id: "h", subheadings: [{ id: "only", targetWordCount: 500 }] }] } as never;
  expect(removeSubheading(s, "only")).toBe(s);
});

describe("no made-up thesis or generic themes", () => {
  it("a brief with no grounded thesis gets an empty thesis, not a template claim", async () => {
    const { generateDynamicAssignmentStructure } = await import("../services/dynamicStructure");
    const st = generateDynamicAssignmentStructure({ question: "Discuss the role of central banks in the economy.", assignmentType: "essay", academicLevel: "undergraduate", targetWordCount: 1500 });
    expect(st.thesisStatement).not.toMatch(/decisive operational catalyst|problematizes|systemic transformation|This (paper|study|analysis) (contends|investigates|examines)/);
    for (const h of st.headings) expect(h.title).not.toMatch(/^Theme \d|Long-Term Trajectories|Systemic Horizons/);
  });
});
