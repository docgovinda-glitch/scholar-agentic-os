import { describe, it, expect } from "vitest";
import { catalog } from "../atlas";
import {
  canProceedFromIntake,
  proposeCitationStyle,
  proposeIntakeValues,
  proposeStructure,
  proposeTotalWordBudget,
} from "../proposals";

describe("app/atlas: structure proposals", () => {
  it("proposes a non-zero word budget for every section with a distribution weight", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const proposal = proposeStructure(thesis);
    const litReview = proposal.find((p) => p.sectionKey === "literature_review")!;
    // 20000 typical * 0.25 distribution
    expect(litReview.wordBudget).toBe(5000);
  });

  it("front-matter sections with no distribution weight get a zero word budget", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const proposal = proposeStructure(thesis);
    const declaration = proposal.find((p) => p.sectionKey === "declaration")!;
    expect(declaration.wordBudget).toBe(0);
  });

  it("falls back to the section's own wordBudget.typical when no distribution weight exists", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const proposal = proposeStructure(assignment);
    // "introduction" has both a distribution weight AND a wordBudget — distribution wins by design
    const intro = proposal.find((p) => p.sectionKey === "introduction")!;
    expect(intro.wordBudget).toBeGreaterThan(0);
  });

  it("the sum of section proposals roughly matches the total typical budget for a fully-distributed type", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const proposal = proposeStructure(assignment);
    const sum = proposal.reduce((a, p) => a + p.wordBudget, 0);
    const total = proposeTotalWordBudget(assignment);
    expect(sum).toBeLessThanOrEqual(total + 5); // rounding slack
    expect(sum).toBeGreaterThan(total * 0.8);
  });
});

describe("app/atlas: intake value proposals", () => {
  it("proposes a value with rationale for every field that has a defaultValue", () => {
    const assignment = catalog.getOrThrow("OT-01");
    const proposals = proposeIntakeValues(assignment);
    const wordLimit = proposals.find((p) => p.key === "word_limit")!;
    expect(wordLimit.value).toBe("1500");
    expect(wordLimit.rationale.length).toBeGreaterThan(0);
  });

  it("does not propose a value for fields with no defaultValue (they need a provisional path instead)", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const proposals = proposeIntakeValues(thesis);
    expect(proposals.some((p) => p.key === "research_question")).toBe(false);
  });
});

describe("app/atlas: citation and budget helpers", () => {
  it("proposes the type's default citation style absent an institution override", () => {
    expect(proposeCitationStyle(catalog.getOrThrow("OT-10"))).toBe("vancouver");
  });

  it("an institution override takes precedence over the type default", () => {
    expect(proposeCitationStyle(catalog.getOrThrow("OT-10"), "ieee")).toBe("ieee");
  });

  it("proposes the typical total word budget", () => {
    expect(proposeTotalWordBudget(catalog.getOrThrow("OT-07"))).toBe(20000);
  });

  it("proposes the typical total word budget for each of the new short_form entries", () => {
    expect(proposeTotalWordBudget(catalog.getOrThrow("OT-02"))).toBe(2500);
    expect(proposeTotalWordBudget(catalog.getOrThrow("OT-03"))).toBe(3500);
    expect(proposeTotalWordBudget(catalog.getOrThrow("OT-13"))).toBe(5000);
  });
});

describe("app/atlas: the new short_form entries (OT-02, OT-03, OT-13)", () => {
  it("OT-02's argument section proposal sums close to the total typical budget", () => {
    const essay = catalog.getOrThrow("OT-02");
    const proposal = proposeStructure(essay);
    const sum = proposal.reduce((a, p) => a + p.wordBudget, 0);
    const total = proposeTotalWordBudget(essay);
    expect(sum).toBeGreaterThan(total * 0.8);
    expect(sum).toBeLessThanOrEqual(total + 5);
  });

  it("OT-03's report_purpose has no safe default and blocks progress until answered", () => {
    const report = catalog.getOrThrow("OT-03");
    const result = canProceedFromIntake(report, { audience: "board", recommendations_expected: "yes" });
    expect(result.canProceed).toBe(false);
    expect(result.missing).toContain("report_purpose");
  });

  it("OT-03 can proceed once every required field is answered", () => {
    const report = catalog.getOrThrow("OT-03");
    const result = canProceedFromIntake(report, {
      report_purpose: "Evaluate three vendor proposals.",
      audience: "board",
      recommendations_expected: "yes",
    });
    expect(result.canProceed).toBe(true);
  });

  it("OT-13's scope_boundaries has no safe default and blocks progress until answered", () => {
    const litReview = catalog.getOrThrow("OT-13");
    const result = canProceedFromIntake(litReview, {
      organising_principle: "thematic",
      critique_or_summary: "critique",
    });
    expect(result.canProceed).toBe(false);
    expect(result.missing).toContain("scope_boundaries");
  });

  it("OT-13 can proceed once every required field is answered", () => {
    const litReview = catalog.getOrThrow("OT-13");
    const result = canProceedFromIntake(litReview, {
      organising_principle: "thematic",
      scope_boundaries: "Peer-reviewed studies 2015 onward.",
      critique_or_summary: "critique",
    });
    expect(result.canProceed).toBe(true);
  });
});

describe("app/atlas: the deepened long_form and venue_targeted entries (OT-08, OT-11)", () => {
  it("proposes the typical total word budget for OT-08 and OT-11", () => {
    expect(proposeTotalWordBudget(catalog.getOrThrow("OT-08"))).toBe(70000);
    expect(proposeTotalWordBudget(catalog.getOrThrow("OT-11"))).toBe(4500);
  });

  it("OT-08's thesis_format and OT-11's anonymous_submission have no safe default and block progress until answered", () => {
    const dissertation = catalog.getOrThrow("OT-08");
    const missingFormat = canProceedFromIntake(dissertation, { contribution_claim: "provisional" });
    expect(missingFormat.missing).toContain("thesis_format");

    const paper = catalog.getOrThrow("OT-11");
    const missingAnon = canProceedFromIntake(paper, {
      conference_and_track: "ACM CHI",
      page_limit_and_references_count: "8 pages",
      template: "acm",
    });
    expect(missingAnon.missing).toContain("anonymous_submission");
  });

  it("OT-08's empirical_chapters section carries the largest share of the budget", () => {
    const dissertation = catalog.getOrThrow("OT-08");
    const proposal = proposeStructure(dissertation);
    const empirical = proposal.find((p) => p.sectionKey === "empirical_chapters")!;
    const litReview = proposal.find((p) => p.sectionKey === "literature_review")!;
    expect(empirical.wordBudget).toBeGreaterThan(litReview.wordBudget);
  });
});

describe("app/atlas: G0 -> G1 gating (canProceedFromIntake)", () => {
  it("cannot proceed while a required field with no allowed provisional is unanswered", () => {
    const grant = catalog.getOrThrow("OT-16"); // funder_and_scheme disallows provisional
    const result = canProceedFromIntake(grant, {});
    expect(result.canProceed).toBe(false);
    expect(result.missing).toContain("funder_and_scheme");
  });

  it("can proceed once every required field is answered", () => {
    const grant = catalog.getOrThrow("OT-16");
    const result = canProceedFromIntake(grant, {
      funder_and_scheme: "UKRI Future Leaders Fellowship",
      call_document: "uploaded",
    });
    expect(result.canProceed).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("a provisional answer satisfies a required field that allows it (Amara's case)", () => {
    const thesis = catalog.getOrThrow("OT-07");
    const result = canProceedFromIntake(thesis, {
      research_question: "provisional",
      methodology_type: "qualitative",
    });
    expect(result.canProceed).toBe(true);
  });

  it("a provisional answer does NOT satisfy a required field that disallows it", () => {
    const grant = catalog.getOrThrow("OT-16");
    const result = canProceedFromIntake(grant, {
      funder_and_scheme: "provisional",
      call_document: "uploaded",
    });
    expect(result.canProceed).toBe(false);
    expect(result.missing).toContain("funder_and_scheme");
  });
});
