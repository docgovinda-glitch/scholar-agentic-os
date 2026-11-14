import { describe, it, expect } from "vitest";
import { buildAssignmentOutlinePrompt } from "../scholarBrain";

describe("scholarBrain.assignmentOutline prompt", () => {
  const prompt = buildAssignmentOutlinePrompt({
    question: "Evaluate quantitative easing",
    assignmentType: "report",
    academicLevel: "postgraduate",
    targetWordCount: 2500,
    thesis: "",
    inquiryType: "policy_diagnostic",
    centralProblem: "Answer the brief on QE",
    inquiriesSummary: '  Inquiry 1: "How does QE work?"',
    isCourseworkWorkspace: true,
    subjectLens: "",
    customAllocationPrompt: "Divide the 2500 target words.",
  });

  it("carries the brief's own data", () => {
    expect(prompt).toContain('Question: "Evaluate quantitative easing"');
    expect(prompt).toContain("Inquiry 1");
    expect(prompt).toContain("Target Word Count: 2500 words");
    expect(prompt).toContain('Central Thesis: "Answer the brief on QE"');
    expect(prompt).toContain("COURSEWORK WORKSPACE");
  });

  it("never asks the model to cite a pre-selected literature pool", () => {
    expect(prompt).not.toMatch(/literature pool|Core Scholarly Debates/);
    expect(prompt).toMatch(/sources are attached later/);
  });
});
