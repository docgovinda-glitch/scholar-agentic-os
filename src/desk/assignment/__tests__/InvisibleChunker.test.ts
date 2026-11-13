import { describe, it, expect } from "vitest";
import {
  decomposeWordBudget,
  bindApprovedSourcesToSections,
  tuneSectionsToQuestion,
  type InternalSectionPlan,
} from "../services/invisibleChunkerService";

describe("Invisible Chunker & Decomposition Service", () => {
  it("allocates 2 body sub-themes when body budget is <= 800 words", () => {
    const sections = decomposeWordBudget({
      targetWordCount: 1000,
      wordBudget: {
        intro: 100,
        body: 750,
        conclusion: 150,
      },
      approvedSourceIds: ["src-1", "src-2", "src-3", "src-4"],
      assignmentTopic: "Short Essay on Algorithmic Bias",
    });

    const bodySections = sections.filter((s) => s.sectionType === "body");
    expect(bodySections).toHaveLength(2);

    // Sum of body sections matches body budget (750)
    const totalBodyAllocated = bodySections.reduce((acc, s) => acc + s.targetWordCount, 0);
    expect(totalBodyAllocated).toBe(750);

    // Intro and Conclusion present
    expect(sections[0].sectionType).toBe("intro");
    expect(sections[sections.length - 1].sectionType).toBe("conclusion");
  });

  it("allocates 3 body sub-themes (~500w each) when body budget is between 800 and 2,500 words", () => {
    const sections = decomposeWordBudget({
      targetWordCount: 2000,
      wordBudget: {
        intro: 200,
        body: 1500,
        conclusion: 300,
      },
      approvedSourceIds: ["src-1", "src-2", "src-3", "src-4", "src-5"],
      assignmentTopic: "Undergraduate Policy Essay",
    });

    const bodySections = sections.filter((s) => s.sectionType === "body");
    expect(bodySections).toHaveLength(3);

    // Each body section gets exactly 500 words (1500 / 3)
    bodySections.forEach((sec) => {
      expect(sec.targetWordCount).toBe(500);
    });

    // Total sections: 1 intro + 3 body themes + 1 conclusion = 5 sections
    expect(sections).toHaveLength(5);
  });

  it("allocates 4 to 5 body sub-themes when body budget exceeds 2,500 words", () => {
    const sections3000 = decomposeWordBudget({
      targetWordCount: 4000,
      wordBudget: {
        intro: 400,
        body: 3000,
        conclusion: 600,
      },
      approvedSourceIds: ["src-1", "src-2", "src-3", "src-4", "src-5", "src-6"],
    });

    const body3000 = sections3000.filter((s) => s.sectionType === "body");
    expect(body3000).toHaveLength(4);

    const sections5000 = decomposeWordBudget({
      targetWordCount: 6000,
      wordBudget: {
        intro: 600,
        body: 4500,
        conclusion: 900,
      },
    });

    const body5000 = sections5000.filter((s) => s.sectionType === "body");
    expect(body5000).toHaveLength(5);
  });

  it("correctly binds approved sources across body sections based on academic function", () => {
    const approvedIds = ["src-pasquale-1", "src-kearns-2", "src-floridi-3", "src-benjamin-4", "src-citron-5"];

    const sections = decomposeWordBudget({
      targetWordCount: 2000,
      wordBudget: {
        intro: 200,
        body: 1500,
        conclusion: 300,
      },
      approvedSourceIds: approvedIds,
    });

    const bodySections = sections.filter((s) => s.sectionType === "body");
    expect(bodySections).toHaveLength(3);

    // Sub-Theme 1 -> Sources 1 & 2
    expect(bodySections[0].boundSourceIds).toEqual(["src-pasquale-1", "src-kearns-2"]);
    // Sub-Theme 2 -> Sources 3 & 4
    expect(bodySections[1].boundSourceIds).toEqual(["src-floridi-3", "src-benjamin-4"]);
    // Sub-Theme 3 -> Source 5 + dissenting/counter-argument papers
    expect(bodySections[2].boundSourceIds).toContain("src-citron-5");
  });

  it("gracefully distributes sources evenly when source count varies", () => {
    const sections = decomposeWordBudget({
      targetWordCount: 1500,
      approvedSourceIds: ["src-a", "src-b"],
    });

    const bodySections = sections.filter((s) => s.sectionType === "body");
    bodySections.forEach((sec) => {
      expect(sec.boundSourceIds.length).toBeGreaterThan(0);
    });
  });

  it("tunes section titles, functions, and guidance to the assignment question (built from the question's own words)", () => {
    const rawTopic =
      "DEPARTMENT OF COMPUTER SCIENCE & QUANTUM INFORMATION SYSTEMS Advanced Assessment: Core Branches of Quantum Computing Honours / Postgraduate";
    const sections = decomposeWordBudget({
      targetWordCount: 2000,
      approvedSourceIds: ["src-1", "src-2", "src-3", "src-4", "src-5"],
      assignmentTopic: rawTopic,
    });

    expect(sections[0].title).toMatch(/Quantum/i);
    const body1 = sections.find((s) => s.id === "sec-body-1");
    // Built from the topic's own words; no subject template.
    expect(body1?.title).toMatch(/Core Branches of Quantum Computing/i);
  });

  it("tuneSectionsToQuestion preserves existing drafted prose and word count while tuning titles", () => {
    const existing: InternalSectionPlan[] = [
      {
        id: "sec-intro",
        title: "Introduction & Contextual Thesis",
        targetWordCount: 200,
        currentWordCount: 97,
        draftContent: "Existing drafted 97 words of introductory prose...",
        status: "ready" as any,
        sectionType: "intro",
        academicFunction: "Introduction",
        guidance: "Generic intro guidance",
        boundSourceIds: ["src-1"],
      },
      {
        id: "sec-body-1",
        title: "Body Theme 1: Core Concept & Foundational Theoretical Framework",
        targetWordCount: 500,
        currentWordCount: 0,
        draftContent: "",
        status: "pending" as any,
        sectionType: "body",
        academicFunction: "Core Concept",
        guidance: "Generic body guidance",
        boundSourceIds: ["src-2"],
      },
    ];

    const tuned = tuneSectionsToQuestion({
      sections: existing,
      assignmentTopic: "Advanced Assessment: Core Branches of Quantum Computing",
    });

    expect(tuned[0].draftContent).toBe("Existing drafted 97 words of introductory prose...");
    expect(tuned[0].currentWordCount).toBe(97);
    expect(tuned[0].title).toMatch(/Quantum/i);
    expect(tuned[1].title).not.toContain("Core Concept & Foundational");
    expect(tuned[1].title).toMatch(/Qubit|Modality|Quantum/i);
  });
});
