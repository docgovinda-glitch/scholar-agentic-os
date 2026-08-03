import { describe, it, expect } from "vitest";
import { compileMetadataGateRules, compileRubricFromOutputType, compileStructuralRules, compileWordLimitRule } from "../fromAtlas";
import { catalog } from "../../atlas/atlas";
import type { OutputTypeSpec } from "../../atlas/types";

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

describe("app/rubric: compileMetadataGateRules", () => {
  // No current catalog entry sets metadataKey (see fromAtlas.ts's module
  // comment for why) — this exercises the mechanism against a synthetic
  // spec so it's proven correct ahead of the first real use.
  function withMetadataGate(overrides: Partial<OutputTypeSpec["qualityGates"][number]> = {}): OutputTypeSpec {
    const base = catalog.getOrThrow("OT-16"); // has no metadataKey gates itself
    return {
      ...base,
      qualityGates: [
        { id: "ethics_ref_present", description: "Ethics approval reference number provided", severity: "blocking", metadataKey: "ethics_approval_reference", ...overrides },
        ...base.qualityGates,
      ],
    };
  }

  it("compiles no rules for gates that don't set metadataKey", () => {
    const grant = catalog.getOrThrow("OT-16");
    expect(compileMetadataGateRules(grant)).toHaveLength(0);
  });

  it("compiles one metadata_presence rule per gate that sets metadataKey", () => {
    const spec = withMetadataGate();
    const rules = compileMetadataGateRules(spec);
    expect(rules).toHaveLength(1);
    expect(rules[0].evaluator).toEqual({ kind: "metadata_presence", params: { key: "ethics_approval_reference" } });
  });

  it("carries the gate's own severity onto the compiled rule", () => {
    const spec = withMetadataGate({ severity: "required" });
    const rules = compileMetadataGateRules(spec);
    expect(rules[0].severity).toBe("required");
  });

  it("cites the Atlas source with full confidence, same as the other compilers", () => {
    const spec = withMetadataGate();
    const rules = compileMetadataGateRules(spec);
    expect(rules[0].source.confidence).toBe(1.0);
    expect(rules[0].source.document).toContain(spec.id);
  });

  it("compileRubricFromOutputType includes metadata gate rules alongside word-limit and structural rules", () => {
    const spec = withMetadataGate();
    const rules = compileRubricFromOutputType(spec);
    expect(rules.some((r) => r.evaluator.kind === "metadata_presence")).toBe(true);
  });
});
