import { describe, it, expect } from "vitest";
import {
  abstractFromInvertedIndex,
  groundGaps,
  missingForLock,
  parseQuestions,
  rankVenues,
  reviewFormatFromGuidelines,
  scopeRationale,
  spellingFromGuidelines,
  stripJats,
  decodeEntities,
  templateForArticleType,
  type ScoutPaper,
} from "../blueprintFunnel";

const papers: ScoutPaper[] = [
  {
    key: "p1", title: "Governing clinical AI in rural hospitals", year: 2024, authors: ["A. Rai"], source: "openalex",
    abstract: "We interviewed managers in urban hospitals. Rural settings were not examined and remain poorly understood.",
  },
  {
    key: "p2", title: "Audit trails for diagnostic algorithms", year: 2023, authors: [], source: "crossref",
    abstract: "Audit requirements are proposed but their effect on clinician trust has not been tested.",
  },
];

describe("gaps are grounded in the papers found", () => {
  it("keeps evidence whose quote is in the cited paper, ignoring case and curly quotes", () => {
    const ai = JSON.stringify({
      gaps: [
        { type: "contextual", statement: "Rural hospitals are unstudied.", whyItMatters: "Most AI pilots are urban.", evidence: [{ paper: "p1", quote: "“Rural settings were NOT examined”" }] },
        { type: "Empirical", statement: "Effect of audits on trust is untested.", evidence: [{ paper: "P2", quote: "effect on clinician trust has not been tested" }] },
      ],
    });
    const { gaps, dropped } = groundGaps("```json\n" + ai + "\n```", papers);
    expect(dropped).toBe(0);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]).toMatchObject({ id: "gap-1", type: "contextual", evidence: [{ paperKey: "p1" }] });
    expect(gaps[1].type).toBe("empirical");
  });

  it("drops a gap whose quote is not in the paper, or that cites a paper not in the list", () => {
    const ai = JSON.stringify({
      gaps: [
        { statement: "Invented quote.", evidence: [{ paper: "p1", quote: "a randomised trial of 4,000 patients showed" }] },
        { statement: "Invented paper.", evidence: [{ paper: "p9", quote: "Rural settings were not examined" }] },
        { statement: "No evidence at all.", evidence: [] },
      ],
    });
    expect(groundGaps(ai, papers)).toEqual({ gaps: [], dropped: 3 });
    expect(groundGaps("not json", papers)).toEqual({ gaps: [], dropped: 0 });
  });
});

describe("questions and titles", () => {
  it("keeps clean proposals and refuses ones that state results", () => {
    const out = parseQuestions(
      JSON.stringify({
        questions: ["How do rural hospital managers govern clinical AI tools", "Does AI cut errors by 40%?", "short?"],
        titles: ["Governing Clinical AI Beyond the City", "AI improves outcomes in n = 300 patients"],
      })
    );
    expect(out.questions).toEqual(["How do rural hospital managers govern clinical AI tools?"]);
    expect(out.titles).toEqual(["Governing Clinical AI Beyond the City"]);
  });
});

describe("journal matching", () => {
  it("ranks venues by matching recent works and words the rationale from the count", () => {
    const v = rankVenues(
      [
        { title: "A", venue: "BMJ Health & Care Informatics", publisher: "BMJ", issn: "2632-1009" },
        { title: "B", venue: "BMJ Health & Care Informatics" },
        { title: "C", venue: "Health Policy" },
        { title: "D" },
        { title: "E", venue: "Proceedings of the AAAI/ACM Conference on AI, Ethics, and Society" },
      ],
      "crossref"
    );
    expect(v.map((x) => [x.name, x.matchingWorks])).toEqual([
      ["BMJ Health & Care Informatics", 2],
      ["Health Policy", 1],
    ]);
    expect(v[0]).toMatchObject({ publisher: "BMJ", issn: "2632-1009", searchedWorks: 5, sampleTitles: ["A", "B"] });
    expect(scopeRationale(v[0], 2021)).toBe("Published 2 of the 5 most relevant articles on this topic since 2021, e.g. “A”.");
  });
});

describe("helpers", () => {
  it("rebuilds abstracts and reads only what guidelines state", () => {
    expect(abstractFromInvertedIndex({ AI: [0], helps: [1], doctors: [2] })).toBe("AI helps doctors");
    expect(abstractFromInvertedIndex(null)).toBe("");
    expect(stripJats("<jats:p>Hello <jats:i>world</jats:i></jats:p>")).toBe("Hello world");
    expect(decodeEntities("AI &amp; SOCIETY &#8211; &lt;x&gt;")).toBe("AI & SOCIETY – <x>");
    expect(spellingFromGuidelines("Manuscripts must use British English spelling.")).toMatch(/British/);
    expect(spellingFromGuidelines("Use US English.")).toBe("US English");
    expect(spellingFromGuidelines("Either British or American spelling is fine; use British English or US English consistently.")).toBeUndefined();
    expect(reviewFormatFromGuidelines("This journal operates a double-blind peer review process.")).toBe("Double-anonymised peer review");
    expect(reviewFormatFromGuidelines("Submissions are reviewed.")).toBeUndefined();
    expect(templateForArticleType("review")).toBe("SystematicReview");
    expect(templateForArticleType(undefined)).toBe("IMRaD");
  });

  it("lists what blocks the lock", () => {
    expect(missingForLock({ journal: "", problem: "x", questions: [" "], title: "", hasBudget: true })).toEqual([
      "at least one research question",
      "a working title",
      "a target journal",
    ]);
    expect(missingForLock({ journal: "J", problem: "x", questions: ["q?"], title: "T", hasBudget: true })).toEqual([]);
  });
});
