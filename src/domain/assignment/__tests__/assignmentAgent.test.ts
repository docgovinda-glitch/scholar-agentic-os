import { describe, it, expect } from "vitest";
import {
  quotedIn,
  parseExtraction,
  parseUnderstanding,
  parseSourceAnalysis,
  parseReview,
  extractUserPrompt,
  understandUserPrompt,
  type Extraction,
} from "../assignmentAgent";

const BRIEF =
  "MSc Marketing. Assessment 1 (60%): Write a 2,500-word report evaluating how a UK retailer of your choice uses social media to build customer engagement. Use at least 8 academic sources and Harvard referencing. Marking criteria: critical analysis 40%, use of theory 25%.";

describe("quotes", () => {
  it("matches exact words regardless of case, curly quotes and spacing, and rejects invented or tiny quotes", () => {
    expect(quotedIn("uses social  media to build customer engagement", BRIEF)).toBe(true);
    expect(quotedIn("Use at least 8 academic sources", BRIEF)).toBe(true);
    expect(quotedIn("Use at least 10 academic sources", BRIEF)).toBe(false);
    expect(quotedIn("Harvard", BRIEF)).toBe(false);
  });
});

describe("Extract", () => {
  it("keeps only requirements, questions and criteria quoted from the brief", () => {
    const ai = JSON.stringify({
      task: "A 2,500-word report on a UK retailer's social media engagement.",
      questions: [{ text: "How does the retailer use social media?", quote: "evaluating how a UK retailer of your choice uses social media" }],
      requirements: [
        { text: "At least 8 academic sources", quote: "Use at least 8 academic sources", kind: "referencing" },
        { text: "Include an executive summary", quote: "Include an executive summary of 200 words", kind: "format" },
      ],
      constraints: { wordCount: 2500, citationStyle: "Harvard" },
      criteria: [{ criterion: "Critical analysis", weight: 40, quote: "critical analysis 40%" }],
      missing: [{ question: "Which retailer?", why: "The brief leaves it to you." }],
    });
    const e = parseExtraction("```json\n" + ai + "\n```", { brief: BRIEF })!;
    expect(e.requirements.map((r) => r.text)).toEqual(["At least 8 academic sources"]);
    expect(e.questions).toHaveLength(1);
    expect(e.criteria[0]).toMatchObject({ criterion: "Critical analysis", weight: 40 });
    expect(e.constraints.wordCount).toBe(2500);
    expect(e.missing[0].question).toBe("Which retailer?");
    expect(parseExtraction("I cannot do that.", { brief: BRIEF })).toBeUndefined();
  });

  it("reads quotes from added materials and the student's clarifications too", () => {
    const ai = JSON.stringify({ task: "t", requirements: [{ text: "Use the PESTLE model", quote: "Students should apply the PESTLE model" }], materials: [{ name: "week3.pdf", summary: "Slides on PESTLE." }, { name: "ghost.pdf", summary: "x" }] });
    const e = parseExtraction(ai, { brief: BRIEF, materials: [{ name: "week3.pdf", text: "Week 3. Students should apply the PESTLE model to a real company." }] })!;
    expect(e.requirements).toHaveLength(1);
    expect(e.materials.map((m) => m.name)).toEqual(["week3.pdf"]);
    expect(extractUserPrompt({ brief: BRIEF, materials: [{ name: "week3.pdf", text: "PESTLE" }], clarifications: "Tesco" })).toMatch(/Material "week3.pdf"[\s\S]*clarifications:\nTesco/);
  });
});

describe("Understand", () => {
  it("parses the plan and cleans the search queries", () => {
    const u = parseUnderstanding(JSON.stringify({ discipline: "Marketing", produce: "A report", approach: "Case analysis", searchQueries: ["social media engagement retail", "social media engagement retail", "x"], knowledgeGaps: ["Engagement metrics"] }))!;
    expect(u.searchQueries).toEqual(["social media engagement retail"]);
    expect(parseUnderstanding("{}")).toBeUndefined();
    const ex: Extraction = { task: "A report", questions: [], requirements: [{ text: "8 sources", quote: "q", kind: "referencing" }], objectives: [], constraints: {}, criteria: [], materials: [], missing: [] };
    expect(understandUserPrompt(ex, BRIEF, { words: 2500 })).toMatch(/Requirements:\n- 8 sources \[referencing\][\s\S]*No marking criteria[\s\S]*Length: 2500 words/);
  });
});

describe("Sources", () => {
  const sources = [
    { id: "s1", title: "Social media engagement in retail", abstract: "We find that interactive posts increase customer engagement more than promotional posts across UK retailers.", year: "2023" },
    { id: "s2", title: "Untitled", abstract: "" },
  ];
  it("keeps analyses for known sources, evidence quoted from the abstract, and real section ids", () => {
    const ai = JSON.stringify({
      sources: [
        { id: "s1", relevance: "high", credibility: "Peer-reviewed journal", mainPoint: "Interactive posts engage more.", evidence: [{ claim: "Interactive beats promotional", quote: "interactive posts increase customer engagement more than promotional posts" }, { claim: "Made up", quote: "engagement doubled in 2024 for all retailers" }], sections: ["ai-2-1", "nope"] },
        { id: "ghost", relevance: "high", mainPoint: "x" },
        { id: "s2", relevance: "low", evidence: [{ claim: "c", quote: "something not in an empty abstract" }] },
      ],
    });
    const out = parseSourceAnalysis(ai, sources, ["ai-1-1", "ai-2-1"])!;
    expect(out.map((o) => o.id)).toEqual(["s1", "s2"]);
    expect(out[0].evidence).toHaveLength(1);
    expect(out[0].sections).toEqual(["ai-2-1"]);
    expect(out[1].evidence).toEqual([]);
  });
});

describe("Review", () => {
  const draft = "Tesco uses Instagram to share recipes. Engagement rose by 40% in 2023. Their is a clear strategy behind the posts (Smith, 2021).";
  it("checks every quote against the draft and downgrades 'met' without evidence", () => {
    const ai = JSON.stringify({
      summary: "A short draft.",
      requirements: [
        { index: 1, status: "met", quote: "Tesco uses Instagram to share recipes" },
        { index: 2, status: "met", quote: "Tesco analyses eight sources" },
        { index: 9, status: "met" },
      ],
      unsupportedClaims: [{ quote: "Engagement rose by 40% in 2023", why: "No citation." }, { quote: "Sales tripled", why: "x" }],
      argument: [{ comment: "Thin evidence.", quote: "not in the draft at all here" }],
      language: [{ quote: "Their is a clear strategy", suggestion: "There is a clear strategy" }],
    });
    const r = parseReview(ai, { draft, requirements: [{ text: "Evaluate social media use" }, { text: "Use 8 sources" }], criteria: [] })!;
    expect(r.requirements.map((x) => [x.index, x.status])).toEqual([[1, "met"], [2, "partly"]]);
    expect(r.unsupportedClaims.map((c) => c.quote)).toEqual(["Engagement rose by 40% in 2023"]);
    expect(r.argument[0].quote).toBeUndefined();
    expect(r.language).toHaveLength(1);
  });
});
