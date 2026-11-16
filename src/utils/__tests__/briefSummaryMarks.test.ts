import { describe, it, expect } from "vitest";
import { buildBriefSummary, statedTotalMarks } from "../briefQuestions";

describe("brief summary: marks and subject", () => {
  it("a word count is never read as a mark total", () => {
    expect(statedTotalMarks("Answer all questions. Total 1000 words.")).toBeUndefined();
    expect(statedTotalMarks("Total: 100 marks")).toBe(100);
    expect(statedTotalMarks("Total marks: 80")).toBe(80);
    expect(statedTotalMarks("(60 marks in total)")).toBe(60);
  });

  it("totals the questions' own marks and never pastes a cut-off question as the subject", () => {
    const brief = [
      "ECON 210 Monetary Economics — Coursework Brief",
      "Answer all questions. Total 1000 words.",
      "Question 1: Explain how a central bank sets its policy interest rate and how the rate passes through to lending. [40 marks]",
      "Question 2: Evaluate the effect of quantitative easing on inflation since 2008, using at least two empirical studies. [60 marks]",
    ].join("\n");
    const summary = buildBriefSummary({ briefText: brief, assignmentType: "essay", level: "undergraduate", targetWords: 1000, citationStyle: "apa7" });
    expect(summary).toContain("100 marks in total");
    expect(summary).not.toContain("1000 marks");
    expect(summary).not.toMatch(/covering Explain/);
    expect(summary).toMatch(/answer 2 questions\./);
  });
});
