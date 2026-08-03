import { describe, it, expect } from "vitest";
import { catalog } from "../../atlas/atlas";
import { evaluateAgainstOutputType, buildReport, waiveRule, RuleNotWaivableError, compileRubricFromOutputType } from "../rubric";
import { emptyDocument } from "../../../domain/document/model";
import { appendBlock } from "../../../domain/document/ops";

function wordsOf(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

describe("app/rubric: end-to-end evaluation against an Atlas output type", () => {
  it("a complete, in-budget document is ready for G6", () => {
    const assignment = catalog.getOrThrow("OT-01");
    let doc = emptyDocument("d1", "Test Assignment");
    doc = appendBlock(doc, "title_page", "paragraph", "My Assignment");
    doc = appendBlock(doc, "introduction", "paragraph", wordsOf(150));
    doc = appendBlock(doc, "body", "paragraph", wordsOf(900));
    doc = appendBlock(doc, "conclusion", "paragraph", wordsOf(140));
    doc = appendBlock(doc, "references", "paragraph", "Some Author (2021). A paper.");

    const report = evaluateAgainstOutputType(assignment, doc);
    expect(report.blockingFailures).toEqual([]);
    expect(report.readyForG6).toBe(true);
  });

  it("a document missing a required section is NOT ready for G6, and the failure names the section", () => {
    const assignment = catalog.getOrThrow("OT-01");
    let doc = emptyDocument("d1", "Test Assignment");
    doc = appendBlock(doc, "introduction", "paragraph", wordsOf(100));
    doc = appendBlock(doc, "body", "paragraph", wordsOf(900));
    // conclusion and references and title_page are missing

    const report = evaluateAgainstOutputType(assignment, doc);
    expect(report.readyForG6).toBe(false);
    expect(report.blockingFailures.length).toBeGreaterThan(0);
    expect(report.blockingFailures.some((f) => f.message.includes("conclusion") || f.message.includes("references"))).toBe(true);
  });

  it("a document that is far over the word limit fails the required word-count rule but does not block on it alone if sections are all present (severity is 'required', not 'blocking')", () => {
    const assignment = catalog.getOrThrow("OT-01");
    let doc = emptyDocument("d1", "Test Assignment");
    doc = appendBlock(doc, "title_page", "paragraph", "Title");
    doc = appendBlock(doc, "introduction", "paragraph", wordsOf(150));
    doc = appendBlock(doc, "body", "paragraph", wordsOf(5000)); // way over
    doc = appendBlock(doc, "conclusion", "paragraph", wordsOf(140));
    doc = appendBlock(doc, "references", "paragraph", "Ref.");

    const report = evaluateAgainstOutputType(assignment, doc);
    expect(report.requiredFailures.length).toBeGreaterThan(0);
    expect(report.readyForG6).toBe(false); // required failures also block readiness
  });
});

describe("app/rubric: waivers", () => {
  it("waiving a required rule removes it from requiredFailures and readiness reflects that", () => {
    const assignment = catalog.getOrThrow("OT-01");
    let doc = emptyDocument("d1", "Test Assignment");
    doc = appendBlock(doc, "title_page", "paragraph", "Title");
    doc = appendBlock(doc, "introduction", "paragraph", wordsOf(150));
    doc = appendBlock(doc, "body", "paragraph", wordsOf(5000));
    doc = appendBlock(doc, "conclusion", "paragraph", wordsOf(140));
    doc = appendBlock(doc, "references", "paragraph", "Ref.");

    let rules = compileRubricFromOutputType(assignment);
    const wordLimitRuleId = `${assignment.id}-word-limit`;
    rules = waiveRule(rules, wordLimitRuleId, "Tutor granted an extension on length for this submission.");

    const report = buildReport(rules, doc);
    expect(report.requiredFailures.find((f) => f.ruleId === wordLimitRuleId)).toBeUndefined();
    expect(report.readyForG6).toBe(true);
  });

  it("refuses to waive a blocking rule", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const rules = compileRubricFromOutputType(assignment);
    const structuralRuleId = `${assignment.id}-section-references`;
    expect(() => waiveRule(rules, structuralRuleId, "I don't feel like adding references")).toThrow(
      RuleNotWaivableError
    );
  });

  it("requires a non-empty reason to waive", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const rules = compileRubricFromOutputType(assignment);
    const wordLimitRuleId = `${assignment.id}-word-limit`;
    expect(() => waiveRule(rules, wordLimitRuleId, "")).toThrow(/reason is required/);
  });

  it("throws for an unknown rule id", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const rules = compileRubricFromOutputType(assignment);
    expect(() => waiveRule(rules, "no-such-rule", "because")).toThrow(/No rule/);
  });
});

describe("app/rubric: re-targeting (re-evaluating the same document against a different output type)", () => {
  it("the same document produces different findings against a different type's rules, without touching the document", () => {
    let doc = emptyDocument("d1", "Test");
    doc = appendBlock(doc, "hypothesis", "paragraph", "unused");
    doc = appendBlock(doc, "methods", "paragraph", wordsOf(300));

    const assignment = catalog.getOrThrow("OT-01");
    const labReport = catalog.getOrThrow("OT-18");

    const reportAsAssignment = evaluateAgainstOutputType(assignment, doc);
    const reportAsLabReport = evaluateAgainstOutputType(labReport, doc);

    expect(reportAsAssignment.blockingFailures.length).not.toBe(reportAsLabReport.blockingFailures.length);
  });
});
