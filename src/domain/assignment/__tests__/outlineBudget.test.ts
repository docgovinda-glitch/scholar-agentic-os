import { describe, it, expect } from "vitest";
import { allocateCleanWords, applyMarksBudget, cleanWordStep } from "../outlineBudget";
import { structureFromAi } from "../aiAssignmentOutline";
import type { AssignmentStructure } from "../../../desk/assignment/types";

const BRIEF = `Word Count: 2,000 words
Q1. Compare superconducting transmon and trapped-ion qubits in terms of coherence time. [20 Marks]
Q2. Derive the quantum Fourier transform circuit and show its role in Shor's algorithm. [30 Marks]
Q3. Explain surface code error correction thresholds. [50 Marks]`;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("clean word allocation", () => {
  it("uses multiples of 5 below 1,000 words and 10 from 1,000", () => {
    expect(cleanWordStep(800)).toBe(5);
    expect(cleanWordStep(2000)).toBe(10);
  });

  it("sums exactly with the remainder on the largest share", () => {
    expect(sum(allocateCleanWords([1, 1, 1], 2000))).toBe(2000);
    expect(sum(allocateCleanWords([20, 30, 50], 1999))).toBe(1999);
  });
});

describe("marks-aware AI outlines", () => {
  const aiStructure = (): AssignmentStructure => ({
    version: 1, isConfirmed: false, targetWordCount: 2000, totalAllocated: 2000, source: "ai",
    headings: [
      { id: "h1", number: 1, title: "Q1 Qubit modalities and coherence", targetWordCount: 700, subheadings: [
        { id: "s1", headingId: "h1", numberStr: "1.1", title: "Transmon vs trapped-ion coherence", targetWordCount: 413, currentWordCount: 0 },
        { id: "s2", headingId: "h1", numberStr: "1.2", title: "Connectivity", targetWordCount: 287, currentWordCount: 0 },
      ] },
      { id: "h2", number: 2, title: "Q2 Quantum Fourier transform and Shor", targetWordCount: 650, subheadings: [
        { id: "s3", headingId: "h2", numberStr: "2.1", title: "QFT circuit", targetWordCount: 650, currentWordCount: 0 },
      ] },
      { id: "h3", number: 3, title: "Q3 Surface code thresholds", targetWordCount: 650, subheadings: [
        { id: "s4", headingId: "h3", numberStr: "3.1", title: "Threshold theorem", targetWordCount: 650, currentWordCount: 0 },
      ] },
    ],
  } as AssignmentStructure);

  it("replaces AI-invented budgets with marks-weighted clean words that sum to the target", () => {
    const out = applyMarksBudget(aiStructure(), BRIEF);
    const h = out.headings.map((x) => x.targetWordCount);
    expect(h).toEqual([400, 600, 1000]);
    expect(sum(h)).toBe(2000);
    for (const heading of out.headings) {
      expect(sum(heading.subheadings.map((s) => s.targetWordCount))).toBe(heading.targetWordCount);
      for (const s of heading.subheadings) expect(s.targetWordCount % 10).toBe(0);
    }
    expect(sum(out.headings.flatMap((x) => x.subheadings).map((s) => s.targetWordCount))).toBe(2000);
    expect(out.totalAllocated).toBe(2000);
  });

  it("keeps AI proportions but cleans and sums them when the brief has no marks", () => {
    const out = applyMarksBudget(aiStructure(), "Discuss quantum computing.");
    expect(sum(out.headings.map((x) => x.targetWordCount))).toBe(2000);
    expect(out.headings[0].targetWordCount).toBeGreaterThan(out.headings[1].targetWordCount - 1);
  });

  it("puts the rounding remainder on the largest body section for awkward totals", () => {
    const s = aiStructure();
    s.targetWordCount = 1995;
    const out = applyMarksBudget(s, BRIEF);
    expect(sum(out.headings.map((x) => x.targetWordCount))).toBe(1995);
    expect(out.headings[2].targetWordCount % 10).toBe(5);
    expect(out.headings[0].targetWordCount % 10).toBe(0);
  });

  it("is applied to what the AI returns via structureFromAi", () => {
    const aiJson = JSON.stringify({
      sections: [
        { title: "Q1 Qubit modalities", subsections: [{ title: "Coherence", words: 900 }] },
        { title: "Q2 Quantum Fourier transform", subsections: [{ title: "QFT", words: 800 }] },
        { title: "Q3 Surface code thresholds", subsections: [{ title: "Thresholds", words: 150 }] },
      ],
    });
    const out = structureFromAi(aiJson, 2000, { briefText: BRIEF });
    expect(out?.headings.map((h) => h.targetWordCount)).toEqual([400, 600, 1000]);
  });
});
