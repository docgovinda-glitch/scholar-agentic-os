import { describe, it, expect } from "vitest";
import { IntegrityReviewerSkill } from "../integrityReviewerSkill";
import type { SkillContext } from "../types";

function context(): SkillContext {
  return {
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    config: {},
    emit: () => {},
    hasPermission: () => true,
  };
}

const COMPLETE_TEXT = `
=== SECTION: Abstract ===
This study examines remote work and team cohesion (Smith, 2023).

=== SECTION: Introduction ===
Remote work has changed organizational life. Prior work (Jones et al., 2021) shows mixed results.

=== SECTION: Methods ===
We surveyed 40 organizations using a mixed-methods design.

=== SECTION: Results ===
Cohesion declined by 12% over three years [1].

=== SECTION: Discussion ===
These findings extend prior work (Lee, 2020).

=== SECTION: Limitations ===
Our sample may not generalize to all industries.

=== SECTION: Declarations ===
Conflicts of Interest: The authors declare no competing interests.
Data Availability Statement: Data are available upon reasonable request.
Ethical Approval: This study received Institutional Review Board approval and informed consent was obtained from all participants.
`;

describe("IntegrityReviewerSkill — manuscriptText pattern checks (real behavior, not always-pass)", () => {
  it("detects leftover placeholder/scaffold markers as a high-severity integrity issue", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = "=== SECTION: Framework ===\n[Use the AI Drafting Agent to generate your conceptual/theoretical framework.]";

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const issue = result.data.detectedIssues.find((i) => i.id === "ip-placeholder-1");
    expect(issue).toMatchObject({ severity: "high", category: "integrity" });
  });

  it("does not flag placeholder text when none is present", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ manuscriptText: COMPLETE_TEXT }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-placeholder-1")).toBeUndefined();
  });

  // Agent-UI adapter Step 2b live verification surfaced this: LiteratureReviewSkill's
  // real identifyGaps() (literatureReviewSkill.ts) never sets ResearchGap.evidenceSupport
  // (it's optional, per literatureReview.ts's type) — reviewLiteratureReview here
  // assumed it was always an array and crashed with "Cannot read properties of
  // undefined (reading 'length')" the first time a real end-to-end pipeline run
  // reached this skill with real literatureReview data, not a hand-built test fixture.
  it("does not crash when a researchGap's evidenceSupport is undefined (real literatureReviewSkill shape)", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute(
      {
        literatureReview: {
          executiveSummary: "",
          keyFindings: [],
          themes: [],
          evidenceMap: { methodologyDistribution: {} as any, yearDistribution: {}, journalDistribution: {} },
          researchGaps: [{ id: "gap-1", description: "A gap", relatedThemes: [], suggestedSearchTerms: [] }],
          conflictingFindings: [],
          recommendedPapers: [],
          recommendedJournals: [],
          recommendedSearchTerms: [],
          confidence: 0.5,
          assumptions: [],
          diagnostics: { localStudies: 0, webStudies: 0, duplicatesRemoved: 0, avgEvidenceQuality: "medium" },
        },
      },
      context()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-lit-gap-0")).toMatchObject({ severity: "medium" });
  });

  it("flags a missing ethics/IRB/informed-consent disclosure as an informational issue", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = "=== SECTION: Methods ===\nWe surveyed participants about their experiences.";

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const issue = result.data.detectedIssues.find((i) => i.id === "ip-ethics-disclosure-1");
    expect(issue).toMatchObject({ severity: "informational", category: "ethics" });
  });

  it("does not flag missing ethics disclosure when IRB/informed-consent language is present", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ manuscriptText: COMPLETE_TEXT }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-ethics-disclosure-1")).toBeUndefined();
  });

  it("flags a missing data-availability statement as an informational issue", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = "=== SECTION: Methods ===\nWe collected survey data from 200 respondents.";

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-data-availability-1")).toMatchObject({ severity: "informational" });
  });

  it("does not flag missing data availability when present", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ manuscriptText: COMPLETE_TEXT }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-data-availability-1")).toBeUndefined();
  });

  it("flags a missing conflict-of-interest/funding disclosure as an informational issue", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = "=== SECTION: Methods ===\nWe collected survey data from 200 respondents.";

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-coi-1")).toMatchObject({ severity: "informational" });
  });

  it("does not flag missing COI/funding disclosure when present", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ manuscriptText: COMPLETE_TEXT }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-coi-1")).toBeUndefined();
  });

  it("flags a substantial manuscript (>500 words) with zero in-text citation patterns", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = "This is a sentence with no citations at all. ".repeat(120); // >500 words, no (Author, Year)/[N]/et al.

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const issue = result.data.detectedIssues.find((i) => i.id === "ip-no-citations-1");
    expect(issue).toMatchObject({ severity: "medium", category: "citation" });
  });

  it("does not flag citation absence for a short manuscript (<=500 words) even with no citations", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = "A short manuscript with no citations.";

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-no-citations-1")).toBeUndefined();
  });

  it("does not flag citation absence when (Author, Year) patterns are present", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = ("This is a sentence citing prior work (Smith, 2023). ").repeat(60);

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-no-citations-1")).toBeUndefined();
  });

  it("does not flag citation absence when [N]-style patterns are present", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = ("This is a sentence citing prior work [1]. ").repeat(60);

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-no-citations-1")).toBeUndefined();
  });

  it("does not flag citation absence when 'et al.' is present", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = ("This is a sentence citing prior work, Smith et al. found similar results. ").repeat(60);

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues.find((i) => i.id === "ip-no-citations-1")).toBeUndefined();
  });

  it("runs no manuscriptText-based checks at all when manuscriptText is absent (pipeline-report-only path unaffected)", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({}, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.detectedIssues).toEqual([]);
  });
});

describe("IntegrityReviewerSkill — evaluateReportingCompliance (real heading-presence scan, not a hardcoded stub)", () => {
  it("marks all 9 structural checklist items compliant for a complete manuscript", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ manuscriptText: COMPLETE_TEXT }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const consort = result.data.reportingCompliance.find((r) => r.guideline === "CONSORT")!;
    expect(consort.completionPercentage).toBe(100);
    expect(consort.missingItems).toEqual([]);
  });

  it("varies compliantItems/missingItems/completionPercentage based on what's actually present in manuscriptText", async () => {
    const skill = new IntegrityReviewerSkill();
    const text = "=== SECTION: Abstract ===\nA short abstract.\n=== SECTION: Introduction ===\nAn introduction.";

    const result = await skill.execute({ manuscriptText: text }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const consort = result.data.reportingCompliance.find((r) => r.guideline === "CONSORT")!;
    expect(consort.compliantItems).toContain("Abstract");
    expect(consort.compliantItems).toContain("Introduction");
    expect(consort.missingItems).toContain("Limitations");
    expect(consort.completionPercentage).toBeGreaterThan(0);
    expect(consort.completionPercentage).toBeLessThan(100);
  });

  it("applies the same structural scan across CONSORT/STROBE/PRISMA (a disclosed generic scan, not fabricated per-guideline differentiation)", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ manuscriptText: COMPLETE_TEXT }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [consort, strobe, prisma] = result.data.reportingCompliance;
    expect(consort.completionPercentage).toBe(strobe.completionPercentage);
    expect(strobe.completionPercentage).toBe(prisma.completionPercentage);
  });

  it("returns 0% completion when there is no manuscriptText at all", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({}, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reportingCompliance[0].completionPercentage).toBe(0);
  });
});

describe("IntegrityReviewerSkill — structuralCompleteness replaces publicationReadiness", () => {
  it("report has a structuralCompleteness number, not a publicationReadiness boolean", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ manuscriptText: COMPLETE_TEXT }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.data.structuralCompleteness).toBe("number");
    expect((result.data as any).publicationReadiness).toBeUndefined();
    expect(result.data.structuralCompleteness).toBe(100);
  });

  it("executiveSummary discloses this is a structural/completeness scan, not semantic peer-review judgment", async () => {
    const skill = new IntegrityReviewerSkill();

    const result = await skill.execute({ manuscriptText: COMPLETE_TEXT }, context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.executiveSummary.toLowerCase()).toContain("structural");
    expect(result.data.executiveSummary.toLowerCase()).toMatch(/not.*semantic peer-review|does not perform semantic/);
  });
});
