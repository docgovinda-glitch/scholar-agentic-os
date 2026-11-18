import { describe, it, expect } from "vitest";
import { countManuscriptWords, journalTargetWords, manuscriptAnswerPatch, readManuscriptMarkdown } from "../manuscriptText";
import { assembleManuscript, manuscriptUnits, totalWords } from "../manuscriptModel";
import { citedReferences, studioEvidence } from "../studioEvidence";

describe("readManuscriptMarkdown", () => {
  it("prefers the canonical key over every older copy", () => {
    expect(readManuscriptMarkdown({ manuscript_markdown: "new", assembled_draft: "old", manuscript_draft: '[{"section":"A","content":"older"}]' })).toBe("new");
  });

  it("falls back to the older names, reading a per-section draft as markdown", () => {
    expect(readManuscriptMarkdown({ full_text_markdown: "full" })).toBe("full");
    expect(readManuscriptMarkdown({ manuscript_draft: JSON.stringify([{ section: "Intro", content: "Text." }, { section_name: "Empty", content: "" }]) })).toBe("## Intro\n\nText.");
    expect(readManuscriptMarkdown({ assembled_draft: "[]" })).toBe("");
    expect(readManuscriptMarkdown(undefined)).toBe("");
  });
});

describe("manuscriptAnswerPatch", () => {
  it("writes the canonical key and blanks only the older copies that hold something", () => {
    expect(manuscriptAnswerPatch("md", { assembled_draft: "stale", full_text_markdown: "" })).toEqual({ manuscript_markdown: "md", assembled_draft: "" });
    expect(manuscriptAnswerPatch("md")).toEqual({ manuscript_markdown: "md" });
  });
});

describe("journalTargetWords", () => {
  it("reads the blueprint, then target_word_count, then 6,000", () => {
    expect(journalTargetWords({ word_budget_blueprint: JSON.stringify({ targetTotalWords: 4500 }), target_word_count: "8000" })).toBe(4500);
    expect(journalTargetWords({ target_word_count: "8000" })).toBe(8000);
    expect(journalTargetWords({ target_word_count: "x" })).toBe(6000);
  });
});

describe("countManuscriptWords", () => {
  it("does not count citation tokens, markup or the assembler's headings", () => {
    expect(countManuscriptWords("We found **two** effects [CITE:src_1].")).toBe(4);
    expect(countManuscriptWords("See [FIG:f1].")).toBe(3);
    expect(countManuscriptWords("## Methods\n\n### § Design\n\nOne two.")).toBe(2);
    expect(countManuscriptWords("| a | b |\n| --- | --- |\n| c | d |")).toBe(4);
  });

  it("gives the same total for the assembled manuscript and the sum of its sections", () => {
    const units = manuscriptUnits(null, 6000);
    const t = { texts: { [units[1].id]: "Intro text here [CITE:a].", [units[2].id]: "Methods text." }, unsorted: "" };
    expect(countManuscriptWords(assembleManuscript(units, t))).toBe(totalWords(t));
  });
});

describe("citedReferences", () => {
  const evidence = studioEvidence({
    approved_vault_sources: JSON.stringify([{ id: "s1", title: "Decoding", authors: ["Smith, J."], year: 2024, doi: "10.1/x" }]),
  });

  it("formats entries in the project's citation style and lists unknown ids", () => {
    const apa = citedReferences("A [CITE:s1] and [CITE:ghost].", evidence);
    expect(apa.entries[0].reference).toMatch(/^Smith, J\. \(2024\)\. \*Decoding\*\./);
    expect(apa.unknownTokens).toEqual(["[CITE:ghost]"]);
    const ieee = citedReferences("A [CITE:s1].", evidence, { citationStyle: "IEEE" });
    expect(ieee.entries[0].reference).not.toBe(apa.entries[0].reference);
  });
});
