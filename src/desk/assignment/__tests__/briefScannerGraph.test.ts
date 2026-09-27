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
    expect(analysis.wordCountImplications).toMatch(/2,?500/);
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

  it("verifies category-to-shape mapping for prompt, constraint, rubric_band, penalty, and formatting", async () => {
    const brief = `
[Prompt Section]
Assessment Question: Critically analyze and compare renewable energy transition policies in the UK and Germany.

[Scope and Constraints]
Requirement: You must include empirical case data from 2018 to 2024.
Scope Warning: Do not discuss nuclear power developments or historical coal subsidies.

[Grading Rubric]
First Class (70%+): Outstanding theoretical depth, systematic comparative methodology, and original synthesis.
Late Penalty: 5% per day deduction for unauthorized overdue submissions.

[Formatting]
Word limit: 3000 words.
Citation: Follow Harvard referencing style rigorously.
    `;

    const analysis = await runBriefScannerGraph({
      briefText: brief,
      question: "Critically analyze and compare renewable energy transition policies in the UK and Germany.",
      assignmentType: "comparative_essay",
      academicLevel: "postgraduate",
      targetWordCount: 3000,
      citationStyle: "harvard",
    });

    // 1. Command verbs mapped from prompt category
    const verbs = analysis.commandVerbs.map((c) => c.verb.toLowerCase());
    expect(verbs.some((v) => v.includes("analyze") || v.includes("compare"))).toBe(true);

    // 2. Constraints mapped to included vs excluded
    expect(analysis.scopeBoundaries.included.some((inc) => inc.toLowerCase().includes("empirical case data") || inc.toLowerCase().includes("must"))).toBe(true);
    expect(analysis.scopeBoundaries.excluded.some((exc) => exc.toLowerCase().includes("nuclear power") || exc.toLowerCase().includes("do not discuss"))).toBe(true);

    // 3. Rubric & Penalty mapped to markingCriteriaInsights
    expect(analysis.markingCriteriaInsights.some((m) => m.toLowerCase().includes("first class") || m.includes("70%"))).toBe(true);
    expect(analysis.markingCriteriaInsights.some((m) => m.toLowerCase().includes("penalty") || m.includes("5% per day"))).toBe(true);

    // 4. Formatting mapped to word count implications and citation guidance
    expect(analysis.wordCountImplications).toContain("3,000");
    expect(analysis.citationGuidance).toContain("HARVARD");
  });

  it("calculates custom section word allocations when sections is passed to runBriefScannerGraph", async () => {
    const brief = `
Assessment Question: Critically evaluate the implications of artificial intelligence in jurisprudence.
Word count: 2000 words.
Citation: APA 7th edition.
    `;

    const customSections = {
      isCustomized: true,
      intro: { targetWords: 300, guidelines: "Focus on AI definitions" },
      body: { targetWords: 1300, guidelines: "Case analysis" },
      conclusion: { targetWords: 400, guidelines: "Future reforms" },
    };

    const analysis = await runBriefScannerGraph({
      briefText: brief,
      question: "Critically evaluate the implications of artificial intelligence in jurisprudence.",
      assignmentType: "essay",
      academicLevel: "undergraduate",
      targetWordCount: 2000,
      citationStyle: "apa7",
      sections: customSections,
    });

    expect(analysis.wordCountImplications).toContain("Intro: ~300w");
    expect(analysis.wordCountImplications).toContain("Body: ~1300w");
    expect(analysis.wordCountImplications).toContain("Conclusion: ~400w");
    expect(analysis.wordCountImplications).toContain("Section allocations customized by student");
  });
});
