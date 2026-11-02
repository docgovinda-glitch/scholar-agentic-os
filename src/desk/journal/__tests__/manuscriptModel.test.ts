import { describe, it, expect } from "vitest";
import type { WordBudgetBlueprint } from "../../workspace/types";
import {
  assembleManuscript,
  countWords,
  groupUnits,
  loadTexts,
  manuscriptUnits,
  nextToWrite,
  resolveTexts,
  sectionKind,
  serializeTexts,
  splitLegacyManuscript,
  totalWords,
  writtenContext,
} from "../manuscriptModel";

const blueprint: WordBudgetBlueprint = {
  projectId: "p",
  template: "IMRaD",
  targetTotalWords: 2000,
  allocatedTotalWords: 2000,
  totalSubSections: 4,
  createdAt: "",
  updatedAt: "",
  sections: [
    { id: "s1", sectionKey: "introduction", sectionName: "Introduction", targetWords: 800, order: 1, subSections: [
      { id: "s1a", sectionId: "s1", title: "Problem Domain", targetWords: 400, order: 1, assignedSourceIds: ["src1"] },
      { id: "s1b", sectionId: "s1", title: "Research Questions", targetWords: 400, order: 2, assignedSourceIds: [] },
    ] },
    { id: "s2", sectionKey: "methods", sectionName: "Methods", targetWords: 800, order: 2, subSections: [
      { id: "s2a", sectionId: "s2", title: "Study Design", targetWords: 400, order: 1, assignedSourceIds: [] },
    ] },
    { id: "s3", sectionKey: "abstract", sectionName: "Abstract", targetWords: 250, order: 0, subSections: [] },
  ],
};

describe("manuscriptModel", () => {
  it("builds units from the blueprint in manuscript order, a section without sub-sections being one unit", () => {
    const units = manuscriptUnits(blueprint);
    expect(units.map((u) => u.id)).toEqual(["s3", "s1a", "s1b", "s2a"]);
    expect(units[0]).toMatchObject({ isWholeSection: true, title: "Abstract", kind: "abstract", targetWords: 250 });
    expect(units[1]).toMatchObject({ sectionTitle: "Introduction", kind: "introduction", assignedSourceIds: ["src1"] });
  });

  it("falls back to a plain IMRaD outline sized to the target, with no wording", () => {
    const units = manuscriptUnits(null, 6000);
    expect(units.map((u) => u.title)).toEqual(["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion"]);
    expect(units[0].targetWords).toBe(240);
    expect(units.reduce((n, u) => n + u.targetWords, 0)).toBeGreaterThan(5500);
  });

  it("orders sections the way authors write them: methods first, abstract last", () => {
    const order = groupUnits(manuscriptUnits(null), "writing").map((g) => g.sectionTitle);
    expect(order).toEqual(["Methods", "Results", "Discussion", "Introduction", "Conclusion", "Abstract"]);
    expect(sectionKind("2. Materials and Methods")).toBe("methods");
    expect(sectionKind("Related Work")).toBe("literature");
  });

  it("splits an earlier single-document draft by its sub-section headings and keeps unmatched text", () => {
    const units = manuscriptUnits(blueprint);
    const legacy = [
      "A note I wrote first.",
      "## Introduction",
      "### § Problem Domain",
      "Quantum decoders are slow.",
      "### § Something Else",
      "Orphan paragraph.",
      "## Abstract",
      "We study decoders.",
    ].join("\n");
    const t = splitLegacyManuscript(legacy, units);
    expect(t.texts).toEqual({ s1a: "Quantum decoders are slow.", s3: "We study decoders." });
    expect(t.unsorted).toContain("A note I wrote first.");
    expect(t.unsorted).toContain("Orphan paragraph.");
    // Every body word is kept: 5 + 4 + 2 + 3, plus the orphan's own heading.
    expect(totalWords(t)).toBe(countWords("A note I wrote first. Quantum decoders are slow. Orphan paragraph. We study decoders.") + countWords("### § Something Else"));
  });

  it("assembles the manuscript with the old heading format, skipping unwritten units", () => {
    const units = manuscriptUnits(blueprint);
    const md = assembleManuscript(units, { texts: { s1a: "Decoders are slow.", s3: "We study decoders." }, unsorted: "" });
    expect(md).toBe("## Abstract\n\nWe study decoders.\n\n## Introduction\n\n### § Problem Domain\n\nDecoders are slow.\n");
    // Round trip through the legacy splitter.
    expect(splitLegacyManuscript(md, units).texts).toEqual({ s3: "We study decoders.", s1a: "Decoders are slow." });
  });

  it("stored per-section texts win over the legacy markdown", () => {
    const units = manuscriptUnits(blueprint);
    const stored = serializeTexts({ texts: { s2a: "Design." }, unsorted: "" });
    expect(loadTexts(stored, "### § Problem Domain\n\nold", units)).toEqual({ texts: { s2a: "Design." }, unsorted: "" });
    expect(loadTexts(undefined, "### § Problem Domain\n\nold", units).texts).toEqual({ s1a: "old" });
  });

  it("gives the AI excerpts of other written sections, in writing order, within a budget", () => {
    const units = manuscriptUnits(blueprint);
    const t = { texts: { s2a: "We ran a trial.", s1a: "Decoders are slow.", s3: "x" }, unsorted: "" };
    const ctx = writtenContext(units, t, "s3");
    expect(ctx.indexOf("[Methods — Study Design]")).toBeLessThan(ctx.indexOf("[Introduction — Problem Domain]"));
    expect(ctx).not.toContain("[Abstract]");
    expect(writtenContext(units, { texts: { s2a: "w ".repeat(5000) }, unsorted: "" }, "s3", 1000).length).toBeLessThanOrEqual(1200);
  });

  it("suggests the next unit to write in writing order", () => {
    const units = manuscriptUnits(blueprint);
    expect(nextToWrite(units, { texts: {}, unsorted: "" })?.id).toBe("s2a");
    expect(nextToWrite(units, { texts: { s2a: "w ".repeat(300) }, unsorted: "" })?.id).toBe("s1a");
  });
});

describe("resolveTexts", () => {
  const units = manuscriptUnits(blueprint);
  const stored = { texts: { s1a: "Decoders are slow." }, unsorted: "" };

  it("uses the stored sections while the manuscript still matches them", () => {
    expect(resolveTexts(serializeTexts(stored), assembleManuscript(units, stored), units)).toEqual(stored);
  });

  it("re-splits the manuscript when something else changed it (a referee patch)", () => {
    const patched = assembleManuscript(units, stored).replace("slow", "slow at scale");
    expect(resolveTexts(serializeTexts(stored), patched, units).texts.s1a).toBe("Decoders are slow at scale.");
  });

  it("keeps text whose section left the outline", () => {
    const t = resolveTexts(serializeTexts({ texts: { gone: "Old words.", s1a: "x" }, unsorted: "" }), "", units);
    expect(t).toEqual({ texts: { s1a: "x" }, unsorted: "Old words." });
  });
});

describe("back matter", () => {
  const units = manuscriptUnits(blueprint);

  it("keeps Declarations and References added in Delivery at the end, not as unsorted text", () => {
    const md = "## Introduction\n\n### § Problem Domain\n\nDecoders are slow.\n\n## Declarations\n\n**Funding:** None.\n\n## References\n\n1. Smith (2024).";
    const t = splitLegacyManuscript(md, units);
    expect(t.unsorted).toBe("");
    expect(t.backMatter).toBe("## Declarations\n\n**Funding:** None.\n\n## References\n\n1. Smith (2024).");
    const again = assembleManuscript(units, { ...t, texts: { ...t.texts, s2a: "We ran a trial." } });
    expect(again.indexOf("## Methods")).toBeLessThan(again.indexOf("## Declarations"));
    expect(again.trimEnd().endsWith("1. Smith (2024).")).toBe(true);
    // And it survives storage.
    expect(loadTexts(serializeTexts(t), undefined, units).backMatter).toBe(t.backMatter);
  });
});

