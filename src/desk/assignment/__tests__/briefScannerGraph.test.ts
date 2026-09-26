import { describe, it, expect } from "vitest";
import {
  indexDocumentLines,
  auditDocumentLineByLine,
  runBriefScannerGraph,
  DocumentRequirementSchema,
} from "../../../../server/services/briefScannerGraph.ts";

describe("Deterministic Sequential LangGraph Line-by-Line Brief Scanner", () => {
  it("indexes document lines with standard line numbering tags", () => {
    const raw = `
      First line
      Second line

      Third line
    `;
    const indexed = indexDocumentLines(raw);
    expect(indexed).toEqual([
      "[L001] First line",
      "[L002] Second line",
      "[L003] Third line",
    ]);
  });

  it("audits document line-by-line using LangGraph state graph and emits DocumentRequirement ledger", async () => {
    const rawText = `
Assessment Question: Critically evaluate the impact of generative AI on academic integrity.
Target word count is 2000 words.
Referencing style: APA 7th edition.
Penalty: Late submissions will incur a 5% per day penalty.
Do not use unverified Wikipedia sources.
First class (70%+): Outstanding theoretical synthesis and critical evaluation.
    `;

    const ledger = await auditDocumentLineByLine(rawText);
    expect(ledger.length).toBeGreaterThan(0);

    // Validate that each item conforms to DocumentRequirementSchema
    for (const item of ledger) {
      const parsed = DocumentRequirementSchema.safeParse(item);
      expect(parsed.success).toBe(true);
      expect(item.lineRange).toMatch(/^\[L\d{3}\]$/);
    }

    // Check detected categories
    const categories = ledger.map((item) => item.category);
    expect(categories).toContain("prompt");
    expect(categories).toContain("formatting");
    expect(categories).toContain("penalty");
    expect(categories).toContain("constraint");
    expect(categories).toContain("rubric_band");

    // Check penalty verbatim
    const penaltyItem = ledger.find((item) => item.category === "penalty");
    expect(penaltyItem?.verbatimText).toContain("5% per day penalty");
  });

  it("scans and extracts command verbs, explicit penalties, and excluded boundaries via runBriefScannerGraph", async () => {
    const briefText = `
Module: International Security and Governance
Assessment Question: Critically evaluate the efficacy of autonomous deterrence systems.
Formatting & Submission Rules:
Target word count is 2500 words.
Mandatory referencing style: APA 7th edition.
Penalty Warning: Submissions received after the deadline will incur an automatic 5% per day penalty.
Academic Scope:
Students must examine empirical case studies from 2010 onwards.
Excluded Topics: Do not write about 20th century nuclear deterrence; papers focusing on historical Cold War treaties will not be credited.
Grading Criteria:
First Class (70%+): Outstanding theoretical synthesis, sophisticated evaluation of counterarguments, and original insight.
Upper Second (60-69%): Consistent critical argument with sound empirical substantiation.
`;

    const analysis = await runBriefScannerGraph({
      briefText,
      question: "Critically evaluate the efficacy of autonomous deterrence systems.",
      assignmentType: "essay",
      academicLevel: "undergraduate",
      targetWordCount: 2500,
      citationStyle: "apa7",
    });

    // 1. Verify Command Verbs
    expect(analysis.commandVerbs.length).toBeGreaterThan(0);
    const verbNames = analysis.commandVerbs.map((v) => v.verb.toLowerCase());
    expect(verbNames).toContain("critically evaluate");

    // 2. Verify Penalty Clause Detection (Zero lost penalties)
    const penaltyInsight = analysis.markingCriteriaInsights.find(
      (m) => m.toLowerCase().includes("penalty") || m.includes("🚨")
    );
    expect(penaltyInsight).toBeDefined();
    expect(penaltyInsight).toContain("5% per day penalty");

    // 3. Verify Excluded Scope Boundaries (Zero lost constraints)
    const excludedFound = analysis.scopeBoundaries.excluded.some(
      (exc) => exc.toLowerCase().includes("cold war") || exc.toLowerCase().includes("do not write about")
    );
    expect(excludedFound).toBe(true);

    // 4. Verify Word Budget and Summary
    expect(analysis.wordCountImplications).toContain("2500");
    expect(analysis.citationGuidance).toContain("APA7");
  });

  it("handles empty or concise prompts gracefully without error", async () => {
    const analysis = await runBriefScannerGraph({
      briefText: "",
      question: "Analyse the impact of fiscal policy on inflation.",
      assignmentType: "analytical_essay",
      academicLevel: "postgraduate",
      targetWordCount: 1500,
      citationStyle: "harvard",
    });

    expect(analysis).toBeDefined();
    expect(analysis.commandVerbs.length).toBeGreaterThan(0);
    expect(analysis.scopeBoundaries.included.length).toBeGreaterThan(0);
    expect(analysis.expectedResponseType).toBeDefined();
  });
});
