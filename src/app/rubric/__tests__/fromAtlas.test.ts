import { describe, it, expect } from "vitest";
import { compileMetadataGateRules, compileRubricFromOutputType, compileStructuralRules, compileWordLimitRule } from "../fromAtlas";
import { buildReport } from "../rubric";
import { catalog } from "../../atlas/atlas";
import type { OutputTypeSpec } from "../../atlas/types";
import { emptyDocument } from "../../../domain/document/model";
import { setMetadata } from "../../../domain/document/ops";

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

describe("app/rubric: compileMetadataGateRules against OT-06's real ethics_approval_recorded gate", () => {
  it("compiles OT-06's ethics_approval_recorded gate into a metadata_presence rule", () => {
    const dissertation = catalog.getOrThrow("OT-06");
    const rules = compileMetadataGateRules(dissertation);
    const rule = rules.find((r) => r.id === "OT-06-metadata-ethics_approval_status");
    expect(rule).toBeDefined();
    expect(rule!.evaluator).toEqual({ kind: "metadata_presence", params: { key: "ethics_approval_status" } });
    expect(rule!.severity).toBe("blocking");
  });

  it("fails the compiled rule when the document has no ethics_approval_status metadata", () => {
    const dissertation = catalog.getOrThrow("OT-06");
    const rules = compileRubricFromOutputType(dissertation);
    const doc = emptyDocument("d1", "Capstone");
    const report = buildReport(rules, doc);
    const finding = report.findings.find((f) => f.ruleId === "OT-06-metadata-ethics_approval_status");
    expect(finding!.status).toBe("fail");
    expect(report.blockingFailures.some((f) => f.ruleId === "OT-06-metadata-ethics_approval_status")).toBe(true);
  });

  it("passes the compiled rule once ethics_approval_status metadata is set", () => {
    const dissertation = catalog.getOrThrow("OT-06");
    const rules = compileRubricFromOutputType(dissertation);
    const doc = setMetadata(emptyDocument("d1", "Capstone"), "ethics_approval_status", "Approved, reference REC-2026-0142.");
    const report = buildReport(rules, doc);
    const finding = report.findings.find((f) => f.ruleId === "OT-06-metadata-ethics_approval_status");
    expect(finding!.status).toBe("pass");
  });
});

describe("app/rubric: compileMetadataGateRules against a synthetic gate (severity and source-citation behavior)", () => {
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
