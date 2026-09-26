import { describe, it, expect } from "vitest";
import { runBriefScannerGraph } from "../../../../server/services/briefScannerGraph.ts";

describe("Deterministic Sequential LangGraph Line-by-Line Brief Scanner", () => {
  it("scans and extracts command verbs, explicit penalties, and excluded boundaries", async () => {
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
