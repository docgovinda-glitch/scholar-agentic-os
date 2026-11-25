import { describe, it, expect } from "vitest";
import { extractFrameworkFields, frameworkForDiscipline, frameworkIdForQuery, NOT_REPORTED_FIELD } from "../evidenceFramework";
import { extractEvidenceFromPaper } from "../../../services/evidence/evidenceExtractionService";

describe("evidenceFramework", () => {
  it("never uses PICO for non-clinical disciplines", () => {
    expect(frameworkForDiscipline("social_sciences").stageLabel).not.toMatch(/PICO/);
    expect(frameworkForDiscipline("law").id).toBe("humanities_law");
    expect(frameworkForDiscipline("stem").id).toBe("engineering");
    expect(frameworkForDiscipline("health").stageLabel).toMatch(/PICO/);
    expect(frameworkForDiscipline("auto").id).toBe("social");
  });
  it("fills social columns from the abstract only and otherwise says not reported", () => {
    const f = extractFrameworkFields(
      "social",
      "Drawing on constructivist theory, this study compares Japan and Germany through a comparative case study. However, it cannot generalise beyond two cases.",
      "Identity shapes alliance choices."
    );
    expect(f.method).toMatch(/case stud/i);
    expect(f.argument).toBe("Identity shapes alliance choices.");
    expect(f.limitations).toMatch(/cannot/);
    const empty = extractFrameworkFields("social", "Short title only.");
    expect(empty.lens).toBe(NOT_REPORTED_FIELD);
  });
  it("attaches framework fields to an extracted paper", () => {
    const item = extractEvidenceFromPaper({ title: "Regional order", abstract: "This article argues that regional orders are made, not given. It uses discourse analysis." }, 0, "social");
    expect(item.frameworkFields?.method).toMatch(/discourse analysis/i);
    expect(item.effectSize).toBeUndefined();
  });
  it("picks a frame from the question", () => {
    expect(frameworkIdForQuery("Compare Wendt and Mearsheimer on security in Asia")).not.toBe("clinical");
  });
});
