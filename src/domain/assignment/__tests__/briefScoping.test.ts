import { describe, it, expect } from "vitest";
import { scopeBrief, scopingQuestions, structureLens } from "../briefScoping";

describe("reading an assignment brief", () => {
  it("takes only what the brief states, with the words it rests on", () => {
    const s = scopeBrief(
      "MSc Marketing. Write a 2,500-word business report on a company's supply chain strategy. Use Harvard referencing. Marking criteria: analysis 40%."
    );
    expect(s).toMatchObject({ discipline: "business", assignmentType: "report", level: "postgraduate", wordCount: 2500, citationStyle: "harvard", hasRubric: true });
    expect(s.evidence.wordCount).toMatch(/2,500-word|2,500 word/i);
    expect(s.evidence.level).toBe("MSc");
  });

  it("recognises different subjects and tasks", () => {
    expect(scopeBrief("Critically evaluate the historical significance of the Renaissance for European literature.")).toMatchObject({ discipline: "humanities", assignmentType: "critical_essay" });
    expect(scopeBrief("Lab report: test the hypothesis that temperature affects enzyme activity; describe your experiment and the statistical model.").discipline).toBe("stem");
    expect(scopeBrief("Using a care plan for a patient with diabetes, discuss evidence-based nursing practice.").discipline).toBe("health");
    expect(scopeBrief("Advise the defendant on their liability in tort and the relevant case law.").discipline).toBe("law");
  });

  it("asks at most two questions, only about what is missing, each with a default", () => {
    const vague = scopeBrief("Discuss the topic we covered this week.");
    const qs = scopingQuestions(vague);
    expect(qs.map((q) => q.id)).toEqual(["discipline"]);
    expect(qs[0].assume.label).toBe("Social sciences");
    const bare = scopeBrief("Climate adaptation in mountain communities.");
    expect(scopingQuestions(bare).map((q) => q.id)).toEqual(["discipline", "assignmentType"].filter((id) => (id === "discipline" ? !bare.discipline : true)));
    expect(scopingQuestions(bare).length).toBeLessThanOrEqual(2);
    // Answered questions are not asked again.
    expect(scopingQuestions(scopeBrief(""), { discipline: "law", assignmentType: "essay" })).toEqual([]);
    expect(scopeBrief("")).toEqual({ hasRubric: false, evidence: {} });
  });

  it("gives the AI a subject-shaped structure instead of one template", () => {
    expect(structureLens("stem", "report")).toMatch(/hypothesis, method or design, results or analysis/);
    expect(structureLens("business", "case_study")).toMatch(/recommendations/);
    expect(structureLens("humanities", "essay")).toMatch(/themes or lines of argument/);
    expect(structureLens(undefined, undefined)).toBe("");
  });
});
