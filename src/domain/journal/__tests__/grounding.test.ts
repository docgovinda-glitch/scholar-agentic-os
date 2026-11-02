import { describe, it, expect } from "vitest";
import { groundProposal } from "../grounding";

const guidelines = `Journal of Quantum Systems — Guide for authors.
Research Articles should not exceed 6,000 words, excluding references.
Manuscripts are organised as Introduction, Methods, Results and Discussion.
References follow the IEEE numbered style. All submissions must include a Data Availability statement
and a declaration of competing interests.`;

describe("groundProposal", () => {
  it("keeps values the guidelines state, matching numbers written with separators", () => {
    const p = groundProposal(
      {
        journalName: "Journal of Quantum Systems",
        articleType: "Research Articles",
        wordLimit: { max: 6000 },
        citationStyle: "IEEE",
        structureOverride: ["Introduction", "Methods", "Results", "Discussion"],
        requiredDeclarations: ["Data availability statement", "Competing interests declaration"],
        unresolvedFields: [],
      },
      guidelines,
    );
    expect(p).toMatchObject({
      journalName: "Journal of Quantum Systems",
      wordLimit: { max: 6000 },
      citationStyle: "IEEE",
      structureOverride: ["Introduction", "Methods", "Results", "Discussion"],
      requiredDeclarations: ["Data availability statement", "Competing interests declaration"],
      unresolvedFields: [],
    });
  });

  it("drops typical-but-unstated values and lists them as unresolved", () => {
    const p = groundProposal(
      {
        journalName: "Nature",
        wordLimit: { min: 3000, max: 6000 },
        citationStyle: "APA 7",
        structureOverride: ["Abstract", "Conclusion"],
        requiredDeclarations: ["Ethics approval", "Data availability"],
        unresolvedFields: ["articleType"],
      },
      guidelines,
    );
    expect(p.journalName).toBeUndefined();
    expect(p.citationStyle).toBeUndefined();
    expect(p.wordLimit).toEqual({ max: 6000 });
    expect(p.structureOverride).toBeUndefined();
    expect(p.requiredDeclarations).toEqual(["Data availability"]);
    expect(p.unresolvedFields.sort()).toEqual(["articleType", "citationStyle", "journalName", "requiredDeclarations", "structureOverride", "wordLimit"]);
  });

  it("does not take 600 for 6,000", () => {
    expect(groundProposal({ wordLimit: { max: 600 }, requiredDeclarations: [], unresolvedFields: [] }, guidelines).wordLimit).toBeUndefined();
  });
});
