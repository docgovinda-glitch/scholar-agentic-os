import { describe, it, expect } from "vitest";
import { canonicalizeAssignmentUpdate, normalizeAssignmentAnswers } from "../answerKeys";

describe("one stored name per Coursework setting", () => {
  it("moves old aliases onto the canonical key and drops them", () => {
    const out = normalizeAssignmentAnswers({
      instructions: "Discuss QE.",
      assignment_question: "Discuss QE.",
      targetWordCount: "1500",
      word_count: 1500,
      citationStyle: "harvard",
      assignment_title: "QE essay",
      structure: "{}",
      unrelated: 1,
    });
    expect(out).toEqual({ assignment_brief: "Discuss QE.", word_limit: "1500", citation_style: "harvard", title: "QE essay", assignment_structure: "{}", unrelated: 1 });
  });

  it("keeps the canonical value when both exist, and skips the intake placeholder", () => {
    expect(normalizeAssignmentAnswers({ word_limit: 2000, targetWordCount: 900 }).word_limit).toBe(2000);
    expect(normalizeAssignmentAnswers({ assignment_brief: "provisional", instructions: "Real brief" }).assignment_brief).toBe("Real brief");
    expect(normalizeAssignmentAnswers({ assignment_brief: "provisional" }).assignment_brief).toBe("provisional");
  });

  it("an update naming an alias lands on the canonical key (canonical spelling wins inside one update)", () => {
    expect(canonicalizeAssignmentUpdate({ targetWordCount: 2500, academicLevel: "masters", other: true })).toEqual({ word_limit: 2500, academic_level: "masters", other: true });
    expect(canonicalizeAssignmentUpdate({ word_limit: 1000, word_count: 3000 })).toEqual({ word_limit: 1000 });
  });
});
