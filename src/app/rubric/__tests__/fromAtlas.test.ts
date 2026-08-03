import { describe, it, expect } from "vitest";
import { compileRubricFromOutputType, compileStructuralRules, compileWordLimitRule } from "../fromAtlas";
import { catalog } from "../../atlas/atlas";

describe("app/rubric: compiling rules from Atlas", () => {
  it("compiles a word-limit rule matching the type's budget", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const rule = compileWordLimitRule(thesis);
    expect(rule.evaluator.kind).toBe("word_count");
    if (rule.evaluator.kind === "word_count") {
      expect(rule.evaluator.params.min).toBe(15000);
      expect(rule.evaluator.params.max).toBe(25000);
    }
  });

  it("the word-limit rule excludes sections marked countsTowardWordcount: false", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const rule = compileWordLimitRule(thesis);
    if (rule.evaluator.kind === "word_count") {
      expect(rule.evaluator.params.exclude).toContain("title_page");
      expect(rule.evaluator.params.exclude).toContain("declaration");
      expect(rule.evaluator.params.exclude).toContain("references");
      expect(rule.evaluator.params.exclude).not.toContain("introduction");
    }
  });

  it("compiles one blocking structural rule per required section", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const rules = compileStructuralRules(thesis);
    expect(rules.every((r) => r.severity === "blocking")).toBe(true);
    expect(rules.some((r) => r.evaluator.kind === "structural_presence" && r.evaluator.params.sectionKey === "methodology")).toBe(true);
  });

  it("does not compile a structural rule for an optional section", () => {
    const labReport = catalog.getOrThrow("OT-18"); // abstract is required: false
    const rules = compileStructuralRules(labReport);
    const abstractRule = rules.find(
      (r) => r.evaluator.kind === "structural_presence" && r.evaluator.params.sectionKey === "abstract"
    );
    expect(abstractRule).toBeUndefined();
  });

  it("every compiled rule cites its Atlas source with full confidence (deterministic extraction)", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const rules = compileRubricFromOutputType(assignment);
    for (const rule of rules) {
      expect(rule.source.confidence).toBe(1.0);
      expect(rule.source.document).toContain("OT-01");
    }
  });

  it("compileRubricFromOutputType returns the word-limit rule plus one per required section", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const rules = compileRubricFromOutputType(assignment);
    const requiredSectionCount = assignment.structure.sections.filter((s) => s.required).length;
    expect(rules).toHaveLength(1 + requiredSectionCount);
  });
});
