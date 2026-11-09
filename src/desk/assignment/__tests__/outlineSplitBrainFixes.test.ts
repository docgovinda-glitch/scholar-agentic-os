import { describe, it, expect } from "vitest";
import { extractWordCountFromText } from "../../../utils/briefExtractor";
import { extractBriefInquiriesAndConcepts, generateDynamicAssignmentStructure } from "../services/outlineService";

describe("outlineService split-brain fixes (OT-01)", () => {
  it("never reads a hyphenated module code as the word count", () => {
    expect(extractWordCountFromText("Module Code: QNT-4020 Word Count: 2,000 words")).toBe(2000);
    expect(extractWordCountFromText("Module Code: QNT-4020\nTarget length 1500 words")).toBe(1500);
  });

  it("does not turn Word Count lines or PART marks headers into questions", () => {
    const brief = [
      "Word Count: 2,000 words",
      "PART 1: Strategic Analysis - 25 MARKS",
      "PART 2: Recommendations - 25 MARKS",
      "1. Evaluate how Schein's culture model explains the firm's decline",
      "2. Recommend two interventions and justify them",
    ].join("\n");
    const { extractedTasks, subQuestions } = extractBriefInquiriesAndConcepts("Culture and strategy", brief);
    const all = [...extractedTasks, ...subQuestions].join("\n");
    expect(all).not.toMatch(/word count/i);
    expect(all).not.toMatch(/marks/i);
    expect(all).toMatch(/Schein/);
    expect(all).toMatch(/Recommend two interventions/);
    expect(extractedTasks.length + subQuestions.length).toBe(2);
  });

  it("keeps outlines human-scale (no per-question boilerplate multiplier)", () => {
    const tasks = Array.from({ length: 20 }, (_, i) => `${i + 1}. Evaluate dimension number ${i + 1} of the organisational change programme`).join("\n");
    const structure = generateDynamicAssignmentStructure({
      question: "Organisational change",
      assignmentType: "coursework",
      academicLevel: "undergraduate",
      targetWordCount: 2000,
      briefText: tasks,
    });
    const subs = structure.headings.reduce((n, h) => n + h.subheadings.length, 0);
    expect(structure.headings.length).toBeLessThanOrEqual(8);
    expect(subs).toBeLessThanOrEqual(10);
    expect(JSON.stringify(structure)).not.toMatch(/Conceptual Framing and Analysis of/);
  });
});

import { structureToInternalSections } from "../types";

describe("brief-grounded outline (Phase 4)", () => {
  const BRIEF = `Module Code: QNT-4020 Word Count: 2,000 words
PART 1: HARDWARE 25 MARKS
Q1a. Compare superconducting transmon and trapped-ion qubits in terms of coherence time. [5 Marks]
Q1b. Explain how gate fidelity limits near-term devices. [10 Marks]
Q1c. Evaluate error mitigation strategies for NISQ hardware. [10 Marks]
Q2. Derive the quantum Fourier transform circuit and show its role in Shor's algorithm. [15 Marks]
Q3. Discuss Grover's search algorithm and its speed-up. [20 Marks]
Q4. Explain surface code quantum error correction thresholds. [20 Marks]
Q5. Discuss post-quantum cryptography migration risks. [20 Marks]`;

  it("maps one section per main question with budgets proportional to marks summing to the target", () => {
    const structure = generateDynamicAssignmentStructure({
      question: BRIEF,
      assignmentType: "coursework",
      academicLevel: "postgraduate",
      targetWordCount: 2000,
      briefText: BRIEF,
    });
    const sections = structureToInternalSections(structure);
    expect(sections.length).toBeGreaterThanOrEqual(5);
    expect(sections.length).toBeLessThanOrEqual(8);
    expect(sections.every((s) => s.targetWordCount >= 250)).toBe(true);
    const total = sections.reduce((n, s) => n + s.targetWordCount, 0);
    expect(Math.abs(total - 2000)).toBeLessThanOrEqual(5);
    // Q1 (25 of 90 marks) gets the largest-ratio budget among its peers proportional to marks
    const q1 = sections[0].targetWordCount;
    const q2 = sections[1].targetWordCount;
    expect(q1).toBeGreaterThan(q2);
    expect(JSON.stringify(structure)).not.toMatch(/Bilateral Economic|Conceptual Framing and Analysis/);
    expect(sections[0].guidance).toContain("Compare superconducting transmon");
  });

  it("never returns more than 8 drafting sections however many subheadings exist", () => {
    const headings = Array.from({ length: 6 }, (_, h) => ({
      id: `h${h}`, number: h + 1, title: `Heading ${h + 1}`, targetWordCount: 300,
      subheadings: Array.from({ length: 4 }, (_, s) => ({
        id: `s${h}-${s}`, headingId: `h${h}`, numberStr: `${h + 1}.${s + 1}`, title: `Sub ${s}`, targetWordCount: 75, currentWordCount: 0,
      })),
    }));
    const sections = structureToInternalSections({ version: 1, isConfirmed: false, targetWordCount: 1800, totalAllocated: 1800, headings } as never);
    expect(sections).toHaveLength(6);
    expect(sections.every((s) => s.targetWordCount === 300)).toBe(true);
  });
});

describe("no repeated parent/child headings", () => {
  const BRIEF2 = `Word Count: 2,000 words
PART 1: HARDWARE 40 MARKS
Q1a. Compare superconducting transmon and trapped-ion qubits in terms of coherence time. [10 Marks]
Q1b. Explain how gate fidelity limits near-term devices. [15 Marks]
Q1c. Evaluate error mitigation strategies for NISQ hardware. [15 Marks]
Q2. Derive the quantum Fourier transform circuit and show its role in Shor's algorithm. [30 Marks]
Q3. Discuss Grover's search algorithm and its speed-up. [30 Marks]`;

  it("names sub-parts distinctly and never copies the parent title into an X.1 child", () => {
    const structure = generateDynamicAssignmentStructure({ question: BRIEF2, assignmentType: "coursework", academicLevel: "postgraduate", targetWordCount: 2000, briefText: BRIEF2 });
    const norm = (t: string) => t.replace(/^\s*\d+(\.\d+)*\.?\s*/, "").trim().toLowerCase();
    for (const h of structure.headings) {
      for (const s of h.subheadings) expect(norm(s.title)).not.toBe(norm(h.title));
    }
    const q1 = structure.headings[0];
    expect(q1.subheadings).toHaveLength(3);
    expect(q1.subheadings.map((s) => s.numberStr ?? "")).toBeDefined();
    expect(structure.headings[1].subheadings).toHaveLength(1);
    expect(q1.title.split(/\s+/).length).toBeLessThanOrEqual(10);
  });

  it("drafts a heading with small sub-parts as one readable section of 250+ words", () => {
    const structure = generateDynamicAssignmentStructure({ question: BRIEF2, assignmentType: "coursework", academicLevel: "postgraduate", targetWordCount: 2000, briefText: BRIEF2 });
    const sections = structureToInternalSections(structure);
    expect(sections.length).toBeLessThanOrEqual(8);
    expect(sections.every((s) => s.targetWordCount >= 250)).toBe(true);
    expect(sections[0].keyPoints?.length).toBe(3);
  });
});
