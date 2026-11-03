import { describe, it, expect } from "vitest";
import { abstractNumbersMissingFromBody, abstractOf, checkNumbering, checkSpelling, flaggedPhrases, numberLabel } from "../manuscriptChecks";

describe("checkSpelling", () => {
  it("reports a word spelt both ways", () => {
    const s = checkSpelling("We analysed behaviour. Later we analyzed it again and analysed more.");
    expect(s.mixedWords).toEqual([{ us: "analyzed", uk: "analysed", usCount: 1, ukCount: 2 }]);
  });

  it("notices US and UK forms mixed across words, but leaves -ize alone", () => {
    const s = checkSpelling("The tumor colour was standardized and organized.");
    expect(s.mixedWords).toEqual([]);
    expect(s.usWords).toEqual(["tumor"]);
    expect(s.ukWords).toEqual(["colour"]);
    expect(checkSpelling("We organized and standardised the data.").ukWords).toEqual([]);
  });
});

describe("abstract numbers", () => {
  const md = [
    "### § Abstract",
    "",
    "Among 1,204 patients (54.3% women), mortality fell by 12% (HR 0.81) between 2019 and 2021.",
    "",
    "### § Results",
    "",
    "We enrolled 1204 patients; 54.3% were women. The hazard ratio was .81.",
  ].join("\n");

  it("finds the abstract by its heading", () => {
    expect(abstractOf(md)).toMatch(/^Among 1,204/);
    expect(abstractOf("No headings here")).toBe("");
  });

  it("lists numbers the abstract states and the body doesn't (years and small integers ignored)", () => {
    expect(abstractNumbersMissingFromBody(md)).toEqual(["12%"]);
  });
});

describe("checkNumbering", () => {
  it("finds gaps and figures first mentioned out of order", () => {
    const out = checkNumbering("See Figure 1 and Fig. 3. Then Figure 2. Table 1 and Table 2.");
    expect(out).toEqual([
      { kind: "Figure", order: [1, 3, 2], missing: [], outOfOrder: [2] },
      { kind: "Table", order: [1, 2], missing: [], outOfOrder: [] },
    ]);
    expect(checkNumbering("Figure 1 then Figure 4.")[0].missing).toEqual([2, 3]);
    expect(checkNumbering("No figures.")).toEqual([]);
  });

  it("checks chapter numbering (Figure 3.2) within each chapter, as theses number them", () => {
    const out = checkNumbering("Figure 2.1 shows it. Then Figure 2.2. In chapter 3, Figure 3.2 comes before Figure 3.1, and Table 3.3 alone.");
    const fig2 = out.find((f) => f.kind === "Figure" && f.chapter === 2)!;
    expect(fig2).toMatchObject({ order: [1, 2], missing: [], outOfOrder: [] });
    const fig3 = out.find((f) => f.kind === "Figure" && f.chapter === 3)!;
    expect(fig3.outOfOrder).toEqual([1]);
    expect(numberLabel(fig3, 1)).toBe("Figure 3.1");
    const tab3 = out.find((f) => f.kind === "Table" && f.chapter === 3)!;
    expect(tab3.missing).toEqual([1, 2]);
    // No plain-numbered finding is invented from "Figure 3.2" being read as "Figure 3".
    expect(out.some((f) => f.chapter === undefined)).toBe(false);
    expect(numberLabel({ kind: "Table" }, 2)).toBe("Table 2");
  });
});

describe("flaggedPhrases", () => {
  it("counts phrases reviewers associate with AI text", () => {
    expect(flaggedPhrases("We delve into it. It is important to note that we delve again.")).toEqual([
      { phrase: "delve", count: 2 },
      { phrase: "it is important to note", count: 1 },
    ]);
  });
});
