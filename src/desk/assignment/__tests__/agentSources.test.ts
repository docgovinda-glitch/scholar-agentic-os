import { describe, it, expect } from "vitest";
import { mergeDiscovered, forAnalysis, applyAnalyses, approveRelevant, bindToSections } from "../services/agentSources";
import type { AssignmentStructure, DiscoveredSource, AssignmentDraftingSection } from "../types";

const src = (id: string, title: string, extra: Partial<DiscoveredSource> = {}) =>
  ({ id, title, authors: ["A"], year: "2023", type: "journal", mainFinding: "", suggestedUse: "", citation: "", status: "unreviewed", ...extra }) as DiscoveredSource;

describe("agent sources", () => {
  it("adds new search results after the student's own, without duplicates by DOI or title", () => {
    const mine = [src("u1", "My upload", { isUserUploaded: true }), src("s1", "Social media in retail", { doi: "10.1/x" })];
    const found = [src("f1", "Social Media in Retail!"), src("f2", "Other", { doi: "10.1/X" }), src("f3", "New study")];
    expect(mergeDiscovered(mine, found).map((s) => s.id)).toEqual(["u1", "s1", "f3"]);
  });

  it("sends the AI bibliographic details and abstracts only, skipping removed sources", () => {
    const out = forAnalysis([src("a", "A", { abstract: "Abs.", journal: "J" }), src("b", "B", { status: "removed" })]);
    expect(out).toEqual([{ id: "a", title: "A", authors: ["A"], year: "2023", venue: "J", abstract: "Abs.", peerReviewed: null, citationCount: undefined }]);
  });

  it("attaches the AI's reading, approves useful sources and links them to sections without touching drafts", () => {
    const analyses = [
      { id: "a", relevance: "high" as const, credibility: "Peer-reviewed", mainPoint: "Interactive posts engage.", evidence: [{ claim: "c", quote: "interactive posts increase engagement" }], sections: ["s-2"] },
      { id: "b", relevance: "low" as const, credibility: "", mainPoint: "", evidence: [], sections: ["s-2"] },
    ];
    const applied = applyAnalyses([src("a", "A"), src("b", "B")], analyses, { "s-2": "2.1 Engagement" });
    expect(applied[0]).toMatchObject({ aiRelevance: "high", mainFinding: "Interactive posts engage.", suggestedUse: "Supports 2.1 Engagement" });
    expect(applied[0].extractedEvidences?.[0]).toMatchObject({ excerpt: "interactive posts increase engagement", sourceLocation: "Abstract" });
    expect(approveRelevant(["x"], analyses)).toEqual(["x", "a"]);

    const structure = { version: 1, isConfirmed: false, targetWordCount: 1000, totalAllocated: 1000, headings: [{ id: "h", number: 1, title: "H", targetWordCount: 1000, subheadings: [{ id: "s-2", headingId: "h", numberStr: "1.1", title: "Engagement", targetWordCount: 1000 }] }] } as AssignmentStructure;
    const sections = [{ id: "s-2", title: "1.1 Engagement", targetWordCount: 1000, draftContent: "My text.", boundSourceIds: ["u1"] }] as AssignmentDraftingSection[];
    const bound = bindToSections(structure, sections, analyses);
    expect(bound.structure.headings[0].subheadings[0].boundSourceIds).toEqual(["a"]);
    expect(bound.sections[0]).toMatchObject({ boundSourceIds: ["u1", "a"], draftContent: "My text." });
  });
});
