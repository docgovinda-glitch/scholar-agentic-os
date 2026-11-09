import { describe, it, expect } from "vitest";
import {
  parseBriefQuestions,
  parseBriefParts,
  parseMarkingCriteria,
  buildBriefSummary,
  extractPrescribedReferences,
} from "../briefQuestions";
import { allocateWordsByMarks, extractWordCountFromText } from "../briefExtractor";

const BRIEF = `DEPARTMENT OF COMPUTER SCIENCE & QUANTUM INFORMATION SYSTEMS
Advanced Assessment in Quantum Computing
Module Code: QNT-4020 Word Count: 2,000 words
Referencing: Harvard
PART 1: QUANTUM HARDWARE ARCHITECTURES 25 MARKS
Q1a. Compare superconducting transmon and trapped-ion qubits in terms of coherence time. [5 Marks]
Q1b. Explain how gate fidelity limits near-term devices. [10 Marks]
Q1c. Evaluate error mitigation strategies for NISQ hardware. [10 Marks]
PART 2: QUANTUM ALGORITHMS 35 MARKS
Q2. Derive the quantum Fourier transform circuit and show its role in Shor's algorithm. [15 Marks]
Q3. Discuss Grover's search algorithm and its speed-up. [20 Marks]
Recommended reading: Preskill (2018), Arute et al. (2019), Nielsen & Chuang (2010), (Shor, 1994).`;

describe("brief parsing grounded in the file", () => {
  it("reads the real word count, not the module code", () => {
    expect(extractWordCountFromText(BRIEF)).toBe(2000);
  });

  it("parses real questions with exact marks and no fake Q1 from word counts or part titles", () => {
    const qs = parseBriefQuestions(BRIEF);
    expect(qs.map((q) => q.label)).toEqual(["Q1a", "Q1b", "Q1c", "Q2", "Q3"]);
    expect(qs.map((q) => q.marks)).toEqual([5, 10, 10, 15, 20]);
    expect(qs.some((q) => /word count|marks/i.test(q.text))).toBe(false);
    expect(qs[0].part).toMatch(/QUANTUM HARDWARE/);
  });

  it("allocates words in proportion to marks", () => {
    const qs = parseBriefQuestions(BRIEF);
    const alloc = allocateWordsByMarks(qs.map((q) => ({ id: q.id, title: q.text, marks: q.marks })), 2000);
    const q3 = alloc.questions[4];
    expect(q3.targetWords).toBe(Math.round((20 / 60) * 2000));
    expect(alloc.questions.reduce((s, q) => s + q.targetWords, 0)).toBe(2000);
  });

  it("builds criteria from the brief's own mark distribution", () => {
    const rows = parseMarkingCriteria(BRIEF);
    expect(rows.map((r) => r.marks)).toEqual([25, 35]);
    expect(rows[0].criterion).toMatch(/QUANTUM HARDWARE/);
    expect(parseBriefParts(BRIEF)).toHaveLength(2);
  });

  it("writes a short summary that never contains the pasted brief", () => {
    const summary = buildBriefSummary({ briefText: BRIEF, assignmentType: "coursework", level: "postgraduate", citationStyle: "harvard", targetWords: 2000 });
    expect(summary.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3);
    expect(summary).toMatch(/2,000 words/);
    expect(summary).toMatch(/HARVARD/);
    expect(summary).not.toMatch(/DEPARTMENT OF COMPUTER SCIENCE/);
    expect(summary.length).toBeLessThan(500);
  });

  it("finds references prescribed in the brief", () => {
    const labels = extractPrescribedReferences(BRIEF).map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(["Preskill (2018)", "Arute et al. (2019)", "Nielsen & Chuang (2010)", "Shor (1994)"]));
  });
});

import { buildSourceSearchQueries } from "../briefSourceQueries";

describe("source search queries from a brief", () => {
  it("produces clean keyword phrases, never the department banner or module code", () => {
    const qs = buildSourceSearchQueries(BRIEF);
    expect(qs.length).toBeGreaterThanOrEqual(3);
    expect(qs.length).toBeLessThanOrEqual(5);
    for (const q of qs) {
      expect(q).not.toMatch(/DEPARTMENT|QNT|4020|marks|word count/i);
      expect(q.split(" ").length).toBeLessThanOrEqual(6);
    }
    expect(qs[0].toLowerCase()).toContain("superconducting");
    expect(qs[0].toLowerCase()).toContain("trapped-ion");
  });

  it("falls back to the topic sentence when the brief has no numbered questions", () => {
    const qs = buildSourceSearchQueries("UNIVERSITY OF EXAMPLE SCHOOL OF BUSINESS\nCritically evaluate how remote work affects employee productivity in technology firms.");
    expect(qs[0].toLowerCase()).toContain("remote work");
    expect(qs[0]).not.toMatch(/UNIVERSITY/);
  });
});

describe("grading criteria percentages", () => {
  const FULL = `Total: 100 marks
PART 1: QUANTUM HARDWARE 25 MARKS
Q1a. Compare superconducting transmon and trapped-ion qubits. [15 Marks]
Q1b. Explain how gate fidelity limits devices. [10 Marks]
PART 2: ALGORITHMS 25 MARKS
Q2. Derive the quantum Fourier transform circuit. [25 Marks]
PART 3: ERROR CORRECTION 20 MARKS
Q3. Evaluate surface code thresholds. [20 Marks]
PART 4: CRYPTOGRAPHY 30 MARKS
Q4. Discuss post-quantum migration. [30 Marks]`;

  it("never double-counts Parts and their questions: 25 of 100 marks is 25%", () => {
    const rows = parseMarkingCriteria(FULL);
    expect(rows.map((r) => [r.marks, r.weightPercent])).toEqual([[25, 25], [25, 25], [20, 20], [30, 30]]);
  });

  it("uses only the Part totals as the denominator even without a stated total", () => {
    const rows = parseMarkingCriteria(FULL.replace("Total: 100 marks\n", ""));
    expect(rows[0].weightPercent).toBe(25);
  });

  it("describes how to earn marks in plain English, not with sentences copied from the brief", () => {
    const rows = parseMarkingCriteria(FULL);
    for (const r of rows) {
      expect(r.expectation.length).toBeLessThan(140);
      expect(r.expectation).not.toMatch(/superconducting|transmon|qubit/i);
    }
    expect(rows[0].expectation).toMatch(/compare them point by point/);
  });
});
