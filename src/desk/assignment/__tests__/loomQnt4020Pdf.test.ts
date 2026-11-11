/**
 * Regression for the Loom walkthrough of the QNT-4020 PDF brief (2,000 words,
 * 90 marks, "a." sub-parts with their own marks). PDF extraction gives two
 * layouts: marks brackets split over lines ("Title [" / "15 Marks]") or the
 * title, marks and prompt run onto one line. Both must parse the same way.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildBriefSummary,
  groupBriefQuestions,
  parseBriefQuestions,
  parseMarkingCriteria,
  parsePrescribedBibliography,
  statedTotalMarks,
} from "../../../utils/briefQuestions";
import { deriveDocumentTitle } from "../../../shared/presentationBrief";
import { deriveHeuristicTitle } from "../../projectNaming";
import { generateDynamicAssignmentStructure } from "../services/outlineService";
import { structureToInternalSections } from "../types";
import { structureFromAi } from "../../../domain/assignment/aiAssignmentOutline";
import { briefGroundedStances, briefGroundedThesis } from "../../../domain/assignment/briefThesis";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "../../../utils/__tests__/fixtures", name), "utf8");
const LAYOUTS = { "split brackets": fixture("qnt4020-pdf-brief.txt"), "inline title + prompt": fixture("qnt4020-pdf-brief-inline.txt") };
const MARKS = [15, 10, 12, 13, 20, 10, 10];
const TITLES = [
  "Comparative Analysis of Qubit Physical Realisations",
  "Emerging Neutral Atom & Photonic Paradigms",
  "Complexity Classes and Bounded-Error Quantum Polynomial-Time",
  "Quantum Speedup Mechanisms: Shor vs. Grover",
  "Surface Codes, Syndrome Measurement & Thresholds",
  "Quantum Key Distribution (QKD) vs. Post-Quantum Cryptography",
  "Cross-Branch Applied Case Study",
];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

for (const [layout, BRIEF] of Object.entries(LAYOUTS)) {
  describe(`QNT-4020 PDF brief (${layout})`, () => {
    it("parses 7 questions with clean titles, their marks and sub-parts inside them", () => {
      const groups = groupBriefQuestions(parseBriefQuestions(BRIEF));
      expect(groups.map((g) => g.title)).toEqual(TITLES);
      expect(groups.map((g) => g.marks)).toEqual(MARKS);
      expect(groups.map((g) => g.parts.length)).toEqual([1, 0, 0, 1, 1, 0, 0]);
      for (const r of parseBriefQuestions(BRIEF)) expect(r.text).not.toMatch(/\[\s*$|Marks\]/);
    });

    it("summarises 7 questions and 90 marks (sub-part marks are not added again), with readable casing", () => {
      const summary = buildBriefSummary({ briefText: BRIEF, assignmentType: "case study", level: "postgraduate", citationStyle: "harvard", targetWords: 2000 });
      expect(summary).toContain("answer 7 questions");
      expect(summary).toContain("90 marks in total");
      expect(summary).not.toMatch(/10 questions|108 marks/);
      expect(summary).toContain("quantum error correction (QEC)");
      expect(summary).toContain("Harvard referencing");
      expect(summary).not.toMatch(/bibliography|arute|HARVARD/);
      expect(statedTotalMarks(BRIEF)).toBe(90);
    });

    it("reads the rubric table, never question rows or grade-band headers", () => {
      const rows = parseMarkingCriteria(BRIEF);
      expect(rows.map((r) => r.criterion)).toEqual([
        "Technical & Conceptual Rigour",
        "Critical Synthesis & Evaluation",
        "Methodological Application",
        "Harvard Referencing & Style",
      ]);
      expect(rows.map((r) => r.weightPercent)).toEqual([30, 30, 20, 20]);
      for (const r of rows) expect(r.criterion).not.toMatch(/Question|Criteria & Weight|First Class|\[/);
    });

    it("parses the full prescribed bibliography, Arute et al. included", () => {
      const bib = parsePrescribedBibliography(BRIEF);
      expect(bib).toHaveLength(8);
      const arute = bib.find((b) => b.label.startsWith("Arute"))!;
      expect(arute.title).toBe("Quantum supremacy using a programmable superconducting processor");
      expect(arute.label).toBe("Arute et al. (2019)");
      expect(arute.venue).toBe("Nature");
    });

    it("titles the project from the brief, never the department banner or the word count line", () => {
      expect(deriveDocumentTitle(BRIEF)).toBe("Core Branches of Quantum Computing");
      expect(deriveHeuristicTitle(BRIEF)).toBe("Core Branches of Quantum Computing");
    });

    it("builds one section per question with clean headings and marks-proportional budgets summing to 2,000", () => {
      const st = generateDynamicAssignmentStructure({ question: BRIEF, assignmentType: "coursework", academicLevel: "postgraduate", targetWordCount: 2000, briefText: BRIEF });
      const secs = structureToInternalSections(st);
      expect(secs.map((s) => s.title)).toEqual(TITLES.map((t, i) => `${i + 1}.0 ${t}`));
      const words = secs.map((s) => s.targetWordCount);
      expect(sum(words)).toBe(2000);
      words.forEach((w, i) => expect(Math.abs(w - (MARKS[i] / 90) * 2000)).toBeLessThanOrEqual(10));
    });

    it("re-shapes an AI outline grouped by Part into one section per question (no Part headings, no duplicates)", () => {
      const ai = JSON.stringify({
        sections: [
          { title: "Quantum Hardware Architectures and Physical Modalities", subsections: [{ title: "Qubit realisations", words: 300 }] },
          { title: "Quantum Algorithms and Computational Complexity", subsections: [{ title: "BQP and speedups", words: 500 }] },
          { title: "Quantum Error Correction (QEC) and Fault Tolerance", subsections: [{ title: "Surface codes", words: 450 }] },
          { title: "Quantum Cryptography, Simulation, and Synthesis", subsections: [{ title: "QKD and VQE", words: 400 }] },
        ],
      });
      const secs = structureToInternalSections(structureFromAi(ai, 2000, { briefText: BRIEF })!);
      expect(secs.map((s) => s.title)).toEqual(TITLES.map((t, i) => `${i + 1}.0 ${t}`));
      expect(sum(secs.map((s) => s.targetWordCount))).toBe(2000);
    });

    it("grounds the working thesis in the brief's title and questions, never in one sub-part", () => {
      const thesis = briefGroundedThesis(BRIEF);
      expect(thesis).toContain("7 questions on Core Branches of Quantum Computing");
      expect(thesis).not.toMatch(/T1|coherence times|\(e\b/);
      const st = generateDynamicAssignmentStructure({ question: BRIEF, assignmentType: "coursework", academicLevel: "postgraduate", targetWordCount: 2000, briefText: BRIEF });
      expect(st.thesisStatement).toBe(thesis);
      expect(briefGroundedStances(BRIEF).map((s) => s.title)).toEqual(["Balanced Judgement", "Evidence Under Test", "Context Decides"]);
    });
  });
}
