import { describe, it, expect } from "vitest";
import { evaluateRule, evaluateRules } from "../evaluators";
import type { Rule } from "../types";
import { emptyDocument, type CanonicalDocument } from "../../document/model";
import { appendBlock } from "../../document/ops";

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

function docWithWords(n: number): CanonicalDocument {
  let d = emptyDocument("d1", "Test");
  d = appendBlock(d, "b1", "paragraph", Array.from({ length: n }, () => "word").join(" "));
  return d;
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
});
