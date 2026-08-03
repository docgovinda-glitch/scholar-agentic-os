import { describe, it, expect } from "vitest";
import { compileClaimSupportGateRules, compileMetadataGateRules, compilePositionInTextGateRules, compileReadabilityGateRules, compileRubricFromOutputType, compileStructuralRules, compileWordLimitRule } from "../fromAtlas";
import { buildReport } from "../rubric";
import { catalog } from "../../atlas/atlas";
import type { OutputTypeSpec } from "../../atlas/types";
import { emptyDocument } from "../../../domain/document/model";
import { setMetadata } from "../../../domain/document/ops";
import { emptyGraph, addClaim, bindEvidence } from "../../../domain/claim/graph";
import type { ClaimEvidenceGraph } from "../../../domain/claim/types";

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

describe("app/rubric: compileClaimSupportGateRules against real usesClaimGraph gates", () => {
  it("compiles a claim_support rule for each of OT-04, OT-08, OT-20, and OT-22's usesClaimGraph gates", () => {
    expect(compileClaimSupportGateRules(catalog.getOrThrow("OT-04"))[0].id).toBe("OT-04-claims-claims_traceable_to_source");
    expect(compileClaimSupportGateRules(catalog.getOrThrow("OT-08"))[0].id).toBe("OT-08-claims-contribution_claims_supported");
    expect(compileClaimSupportGateRules(catalog.getOrThrow("OT-20"))[0].id).toBe("OT-20-claims-every_claim_sourced");
    expect(compileClaimSupportGateRules(catalog.getOrThrow("OT-22"))[0].id).toBe("OT-22-claims-claims_traceable");
  });

  it("carries the gate's own severity onto the compiled rule", () => {
    const rule = compileClaimSupportGateRules(catalog.getOrThrow("OT-08"))[0];
    expect(rule.severity).toBe("blocking");
  });

  it("compiles no rules for a gate that doesn't set usesClaimGraph", () => {
    const assignment = catalog.getOrThrow("OT-01"); // has no usesClaimGraph gates
    expect(compileClaimSupportGateRules(assignment)).toHaveLength(0);
  });

  it("an empty claim graph passes vacuously — a project that hasn't used claims yet isn't penalised", () => {
    const dissertation = catalog.getOrThrow("OT-08");
    const rules = compileRubricFromOutputType(dissertation);
    const doc = emptyDocument("d1", "Thesis");
    const report = buildReport(rules, doc, emptyGraph());
    const finding = report.findings.find((f) => f.ruleId === "OT-08-claims-contribution_claims_supported");
    expect(finding!.status).toBe("pass");
  });

  it("fails once an unsupported claim exists in the graph", () => {
    const dissertation = catalog.getOrThrow("OT-08");
    const rules = compileRubricFromOutputType(dissertation);
    const doc = emptyDocument("d1", "Thesis");
    const graph = addClaim(emptyGraph(), { id: "c1", text: "This is the first empirical account of X." });
    const report = buildReport(rules, doc, graph);
    const finding = report.findings.find((f) => f.ruleId === "OT-08-claims-contribution_claims_supported");
    expect(finding!.status).toBe("fail");
    expect(report.blockingFailures.some((f) => f.ruleId === "OT-08-claims-contribution_claims_supported")).toBe(true);
  });

  it("passes once the claim is bound to evidence", () => {
    const dissertation = catalog.getOrThrow("OT-08");
    const rules = compileRubricFromOutputType(dissertation);
    const doc = emptyDocument("d1", "Thesis");
    let graph: ClaimEvidenceGraph = addClaim(emptyGraph(), { id: "c1", text: "This is the first empirical account of X." });
    graph = bindEvidence(graph, {
      id: "b1",
      claimId: "c1",
      evidence: [{ sourceId: "src-1", locator: { page: 12 }, quote: "No prior empirical account of X exists." }],
      strength: "strong",
      rationale: "Systematic literature search found no prior account.",
    });
    const report = buildReport(rules, doc, graph);
    const finding = report.findings.find((f) => f.ruleId === "OT-08-claims-contribution_claims_supported");
    expect(finding!.status).toBe("pass");
  });

  it("without a claim graph at all, the rule is not_applicable, never a silent pass", () => {
    const dissertation = catalog.getOrThrow("OT-08");
    const rules = compileRubricFromOutputType(dissertation);
    const doc = emptyDocument("d1", "Thesis");
    const report = buildReport(rules, doc);
    const finding = report.findings.find((f) => f.ruleId === "OT-08-claims-contribution_claims_supported");
    expect(finding!.status).toBe("not_applicable");
  });
});

describe("app/rubric: compileReadabilityGateRules against OT-17's real readabilityGate gate", () => {
  it("compiles a readability rule for OT-17's information_sheet_readability gate", () => {
    const rules = compileReadabilityGateRules(catalog.getOrThrow("OT-17"));
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("OT-17-readability-information_sheet_readability");
    expect(rules[0].evaluator).toEqual({ kind: "readability", params: { maxGradeLevel: 8, sectionKey: "appendices" } });
  });

  it("carries the gate's own severity onto the compiled rule", () => {
    const rule = compileReadabilityGateRules(catalog.getOrThrow("OT-17"))[0];
    expect(rule.severity).toBe("required");
  });

  it("scopes to section when readabilityGate.sectionKey is set", () => {
    const rule = compileReadabilityGateRules(catalog.getOrThrow("OT-17"))[0];
    expect(rule.scope).toBe("section");
  });

  it("compiles no rules for a gate that doesn't set readabilityGate", () => {
    const assignment = catalog.getOrThrow("OT-01"); // has no readabilityGate gates
    expect(compileReadabilityGateRules(assignment)).toHaveLength(0);
  });

  it("is included in compileRubricFromOutputType's full compilation for OT-17", () => {
    const rules = compileRubricFromOutputType(catalog.getOrThrow("OT-17"));
    expect(rules.some((r) => r.id === "OT-17-readability-information_sheet_readability")).toBe(true);
  });

  it("compiles both of OT-20's readability gates — grade level unscoped, jargon density unscoped", () => {
    const rules = compileReadabilityGateRules(catalog.getOrThrow("OT-20"));
    expect(rules).toHaveLength(2);

    const gradeLevel = rules.find((r) => r.id === "OT-20-readability-reading_level_appropriate")!;
    expect(gradeLevel.evaluator).toEqual({ kind: "readability", params: { maxGradeLevel: 10, sectionKey: undefined } });
    expect(gradeLevel.scope).toBe("document");

    const jargon = rules.find((r) => r.id === "OT-20-readability-jargon_density_below_threshold")!;
    expect(jargon.evaluator).toEqual({ kind: "readability", params: { maxJargonDensity: 0.15, sectionKey: undefined } });
  });
});

describe("app/rubric: compilePositionInTextGateRules against OT-20's real positionInTextGate gate", () => {
  it("compiles a position_in_text rule for OT-20's recommendation_in_first_200_words gate", () => {
    const rules = compilePositionInTextGateRules(catalog.getOrThrow("OT-20"));
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe("OT-20-position-recommendation_in_first_200_words");
    expect(rules[0].evaluator.kind).toBe("position_in_text");
  });

  it("carries the gate's own severity onto the compiled rule", () => {
    const rule = compilePositionInTextGateRules(catalog.getOrThrow("OT-20"))[0];
    expect(rule.severity).toBe("blocking");
  });

  it("compiles no rules for a gate that doesn't set positionInTextGate", () => {
    const assignment = catalog.getOrThrow("OT-01");
    expect(compilePositionInTextGateRules(assignment)).toHaveLength(0);
  });

  it("is included in compileRubricFromOutputType's full compilation for OT-20", () => {
    const rules = compileRubricFromOutputType(catalog.getOrThrow("OT-20"));
    expect(rules.some((r) => r.id === "OT-20-position-recommendation_in_first_200_words")).toBe(true);
    expect(rules.filter((r) => r.evaluator.kind === "readability")).toHaveLength(2);
  });
});
