import { describe, it, expect } from "vitest";
import { evaluateRule, evaluateRules } from "../evaluators";
import type { Rule } from "../types";
import { emptyDocument, type CanonicalDocument } from "../../document/model";
import { appendBlock, setMetadata } from "../../document/ops";
import { emptyGraph, addClaim, bindEvidence } from "../../claim/graph";
import type { ClaimEvidenceGraph } from "../../claim/types";

function wordCountRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "r1",
    source: { document: "test", locator: "x", quote: "x", extractedAt: "now", confidence: 1 },
    type: "quantitative",
    scope: "document",
    severity: "required",
    evaluator: { kind: "word_count", params: { max: 10 } },
    message: "word limit",
    remedy: "trim it",
    autoFixable: false,
    userModified: false,
    ...overrides,
  };
}

function structuralRule(sectionKey: string, overrides: Partial<Rule> = {}): Rule {
  return {
    id: `r-${sectionKey}`,
    source: { document: "test", locator: "x", quote: "x", extractedAt: "now", confidence: 1 },
    type: "structural",
    scope: "section",
    severity: "blocking",
    evaluator: { kind: "structural_presence", params: { sectionKey } },
    message: `${sectionKey} required`,
    remedy: `add ${sectionKey}`,
    autoFixable: false,
    userModified: false,
    ...overrides,
  };
}

function metadataRule(key: string, overrides: Partial<Rule> = {}): Rule {
  return {
    id: `r-${key}`,
    source: { document: "test", locator: "x", quote: "x", extractedAt: "now", confidence: 1 },
    type: "metadata",
    scope: "metadata",
    severity: "blocking",
    evaluator: { kind: "metadata_presence", params: { key } },
    message: `${key} required`,
    remedy: `add ${key}`,
    autoFixable: false,
    userModified: false,
    ...overrides,
  };
}

function docWithWords(n: number): CanonicalDocument {
  let d = emptyDocument("d1", "Test");
  d = appendBlock(d, "b1", "paragraph", Array.from({ length: n }, () => "word").join(" "));
  return d;
}

function readabilityRule(overrides: Partial<Rule> = {}, params: { sectionKey?: string; maxGradeLevel: number } = { maxGradeLevel: 8 }): Rule {
  return {
    id: "r-readability",
    source: { document: "test", locator: "x", quote: "x", extractedAt: "now", confidence: 1 },
    type: "stylistic",
    scope: params.sectionKey ? "section" : "document",
    severity: "required",
    evaluator: { kind: "readability", params },
    message: "reading level check",
    remedy: "simplify",
    autoFixable: false,
    userModified: false,
    ...overrides,
  };
}

function claimSupportRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: "r-claims",
    source: { document: "test", locator: "x", quote: "x", extractedAt: "now", confidence: 1 },
    type: "content",
    scope: "claims",
    severity: "blocking",
    evaluator: { kind: "claim_support", params: {} },
    message: "no unsupported claims",
    remedy: "bind evidence",
    autoFixable: false,
    userModified: false,
    ...overrides,
  };
}

describe("domain/compliance: word_count evaluator", () => {
  it("passes when under the max", () => {
    const finding = evaluateRule(wordCountRule({ evaluator: { kind: "word_count", params: { max: 10 } } }), docWithWords(5));
    expect(finding.status).toBe("pass");
  });

  it("fails when over the max, with a specific overage in the remedy", () => {
    const finding = evaluateRule(wordCountRule({ evaluator: { kind: "word_count", params: { max: 10 } } }), docWithWords(15));
    expect(finding.status).toBe("fail");
    expect(finding.remedy).toContain("5");
  });

  it("fails when under the min", () => {
    const finding = evaluateRule(wordCountRule({ evaluator: { kind: "word_count", params: { min: 20 } } }), docWithWords(5));
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("Below the minimum");
  });

  it("excludes named sections from the count", () => {
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "body", "paragraph", "one two three four five");
    doc = appendBlock(doc, "references", "paragraph", "six seven eight nine ten eleven twelve");
    const rule = wordCountRule({ evaluator: { kind: "word_count", params: { max: 5, exclude: ["references"] } } });
    const finding = evaluateRule(rule, doc);
    expect(finding.status).toBe("pass"); // 5 words in "body" only, references excluded
  });

  it("downgrades to warn when waived and NOT blocking severity", () => {
    const rule = wordCountRule({ severity: "required", waived: { reason: "supervisor approved", at: "now" } });
    const finding = evaluateRule(rule, docWithWords(15));
    expect(finding.status).toBe("warn");
  });

  it("does NOT downgrade a blocking-severity rule even if somehow marked waived", () => {
    const rule = wordCountRule({ severity: "blocking", waived: { reason: "x", at: "now" } });
    const finding = evaluateRule(rule, docWithWords(15));
    expect(finding.status).toBe("fail");
  });
});

describe("domain/compliance: structural_presence evaluator", () => {
  it("fails when the section is entirely missing", () => {
    const doc = emptyDocument("d1", "Test");
    const finding = evaluateRule(structuralRule("methods"), doc);
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("missing");
  });

  it("fails when the section exists but is empty", () => {
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "methods", "paragraph", "   ");
    const finding = evaluateRule(structuralRule("methods"), doc);
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("empty or too short");
  });

  it("passes when the section has content", () => {
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "methods", "paragraph", "Participants were recruited from three sites.");
    const finding = evaluateRule(structuralRule("methods"), doc);
    expect(finding.status).toBe("pass");
  });

  it("respects a minWords threshold beyond mere non-emptiness", () => {
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "abstract", "paragraph", "Too short.");
    const rule = structuralRule("abstract", { evaluator: { kind: "structural_presence", params: { sectionKey: "abstract", minWords: 50 } } });
    const finding = evaluateRule(rule, doc);
    expect(finding.status).toBe("fail");
  });
});

describe("domain/compliance: metadata_presence evaluator", () => {
  it("fails when the declaration is entirely missing", () => {
    const doc = emptyDocument("d1", "Test");
    const finding = evaluateRule(metadataRule("data_availability_statement"), doc);
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("missing");
  });

  it("fails when the declaration is present but blank", () => {
    const doc = setMetadata(emptyDocument("d1", "Test"), "ethics_approval", "   ");
    const finding = evaluateRule(metadataRule("ethics_approval"), doc);
    expect(finding.status).toBe("fail");
  });

  it("passes when the declaration has content", () => {
    const doc = setMetadata(emptyDocument("d1", "Test"), "ethics_approval", "IRB-2026-014");
    const finding = evaluateRule(metadataRule("ethics_approval"), doc);
    expect(finding.status).toBe("pass");
  });

  it("respects a minLength threshold beyond mere non-emptiness", () => {
    const doc = setMetadata(emptyDocument("d1", "Test"), "funder_statement", "N/A");
    const rule = metadataRule("funder_statement", {
      evaluator: { kind: "metadata_presence", params: { key: "funder_statement", minLength: 10 } },
    });
    const finding = evaluateRule(rule, doc);
    expect(finding.status).toBe("fail");
  });

  it("is unaffected by an unrelated metadata key being present", () => {
    const doc = setMetadata(emptyDocument("d1", "Test"), "other_key", "something");
    const finding = evaluateRule(metadataRule("ethics_approval"), doc);
    expect(finding.status).toBe("fail");
  });

  it("does NOT downgrade a blocking-severity rule even if somehow marked waived", () => {
    const rule = metadataRule("ethics_approval", { severity: "blocking", waived: { reason: "x", at: "now" } });
    const finding = evaluateRule(rule, emptyDocument("d1", "Test"));
    expect(finding.status).toBe("fail");
  });

  it("downgrades to warn when waived and NOT blocking severity", () => {
    const rule = metadataRule("ethics_approval", { severity: "required", waived: { reason: "supervisor approved", at: "now" } });
    const finding = evaluateRule(rule, emptyDocument("d1", "Test"));
    expect(finding.status).toBe("warn");
  });
});

describe("domain/compliance: claim_support evaluator", () => {
  it("returns not_applicable when no claim graph is supplied — never a false pass", () => {
    const finding = evaluateRule(claimSupportRule(), docWithWords(1));
    expect(finding.status).toBe("not_applicable");
  });

  it("passes vacuously against an empty claim graph", () => {
    const finding = evaluateRule(claimSupportRule(), docWithWords(1), emptyGraph());
    expect(finding.status).toBe("pass");
  });

  it("fails when a claim has zero evidence bindings", () => {
    const graph = addClaim(emptyGraph(), { id: "c1", text: "Effect X was observed." });
    const finding = evaluateRule(claimSupportRule(), docWithWords(1), graph);
    expect(finding.status).toBe("fail");
    expect(finding.message).toContain("c1");
  });

  it("passes once every claim has at least one evidence binding", () => {
    let graph: ClaimEvidenceGraph = addClaim(emptyGraph(), { id: "c1", text: "Effect X was observed." });
    graph = bindEvidence(graph, {
      id: "b1",
      claimId: "c1",
      evidence: [{ sourceId: "src-1", locator: { page: 4 }, quote: "Effect X was measured at p<0.01." }],
      strength: "strong",
      rationale: "Direct measurement.",
    });
    const finding = evaluateRule(claimSupportRule(), docWithWords(1), graph);
    expect(finding.status).toBe("pass");
  });

  it("does NOT downgrade a blocking-severity rule even if somehow marked waived", () => {
    const graph = addClaim(emptyGraph(), { id: "c1", text: "Unsupported." });
    const rule = claimSupportRule({ severity: "blocking", waived: { reason: "x", at: "now" } });
    const finding = evaluateRule(rule, docWithWords(1), graph);
    expect(finding.status).toBe("fail");
  });

  it("downgrades to warn when waived and NOT blocking severity", () => {
    const graph = addClaim(emptyGraph(), { id: "c1", text: "Unsupported." });
    const rule = claimSupportRule({ severity: "required", waived: { reason: "supervisor approved", at: "now" } });
    const finding = evaluateRule(rule, docWithWords(1), graph);
    expect(finding.status).toBe("warn");
  });
});

describe("domain/compliance: readability evaluator", () => {
  it("passes simple, short-sentence text against a lenient threshold", () => {
    const doc = emptyDocument("d1", "Test");
    const withText = appendBlock(doc, "b1", "paragraph", "The cat sat on the mat. The dog ran. It was a good day.");
    const finding = evaluateRule(readabilityRule({}, { maxGradeLevel: 12 }), withText);
    expect(finding.status).toBe("pass");
  });

  it("fails dense, long-sentence text against a strict threshold", () => {
    const doc = emptyDocument("d1", "Test");
    const withText = appendBlock(
      doc,
      "b1",
      "paragraph",
      "The multidisciplinary epistemological ramifications of postmodern deconstructionist methodology necessitate an extraordinarily comprehensive reconceptualization of institutionalized pedagogical frameworks."
    );
    const finding = evaluateRule(readabilityRule({}, { maxGradeLevel: 8 }), withText);
    expect(finding.status).toBe("fail");
    expect(finding.remedy).toBeDefined();
  });

  it("scopes to one section by sectionKey, ignoring other blocks", () => {
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "intro", "paragraph", "Short and simple text here for the intro.");
    doc = appendBlock(
      doc,
      "appendices",
      "paragraph",
      "The multidisciplinary epistemological ramifications of postmodern deconstructionist methodology necessitate comprehensive institutional reconceptualization."
    );
    const finding = evaluateRule(readabilityRule({}, { sectionKey: "appendices", maxGradeLevel: 8 }), doc);
    expect(finding.status).toBe("fail");
    expect(finding.location).toEqual({ sectionKey: "appendices" });
  });

  it("returns not_applicable for a missing scoped section rather than a false pass", () => {
    const doc = emptyDocument("d1", "Test");
    const finding = evaluateRule(readabilityRule({}, { sectionKey: "appendices", maxGradeLevel: 8 }), doc);
    expect(finding.status).toBe("not_applicable");
  });

  it("returns not_applicable for an empty whole document", () => {
    const doc = emptyDocument("d1", "Test");
    const finding = evaluateRule(readabilityRule({}, { maxGradeLevel: 8 }), doc);
    expect(finding.status).toBe("not_applicable");
  });

  it("downgrades to warn when waived and not blocking severity", () => {
    const doc = emptyDocument("d1", "Test");
    const withText = appendBlock(
      doc,
      "b1",
      "paragraph",
      "The multidisciplinary epistemological ramifications of postmodern deconstructionist methodology necessitate comprehensive institutional reconceptualization."
    );
    const rule = readabilityRule({ severity: "required", waived: { reason: "supervisor approved", at: "now" } }, { maxGradeLevel: 8 });
    const finding = evaluateRule(rule, withText);
    expect(finding.status).toBe("warn");
  });
});

describe("domain/compliance: unimplemented rule types", () => {
  it("returns not_applicable rather than a false pass for an unimplemented evaluator kind", () => {
    const rule = { ...wordCountRule(), evaluator: { kind: "bibliographic_style" as any, params: {} } };
    const finding = evaluateRule(rule as any, docWithWords(1));
    expect(finding.status).toBe("not_applicable");
  });
});

describe("domain/compliance: evaluateRules", () => {
  it("evaluates a mixed rule set in order and returns one finding per rule", () => {
    const doc = docWithWords(5);
    const findings = evaluateRules([wordCountRule(), structuralRule("intro")], doc);
    expect(findings).toHaveLength(2);
    expect(findings[0].ruleId).toBe("r1");
    expect(findings[1].ruleId).toBe("r-intro");
  });

  it("threads an optional claim graph through to claim_support rules while leaving other kinds unaffected", () => {
    const graph = addClaim(emptyGraph(), { id: "c1", text: "Unsupported." });
    const findings = evaluateRules([wordCountRule({ evaluator: { kind: "word_count", params: { max: 10 } } }), claimSupportRule()], docWithWords(5), graph);
    expect(findings[0].status).toBe("pass"); // word_count, unaffected by claimGraph
    expect(findings[1].status).toBe("fail"); // claim_support, sees the unsupported claim
  });
});
