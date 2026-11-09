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
