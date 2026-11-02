import { describe, it, expect } from "vitest";
import { docToText, normalizeSectionText, textToDoc } from "../studio/sectionDoc";

const roundTrip = (s: string) => docToText(textToDoc(s));

describe("section text ⇄ editor document", () => {
  const cases: Record<string, string> = {
    plain: "We measured latency on three boards.",
    twoParagraphs: "First paragraph.\n\nSecond paragraph with more words.",
    lineBreaks: "Line one\nline two in the same paragraph.",
    marks: "A **bold claim** and an *italic aside*, then plain.",
    citations: "Decoders fall behind [CITE:src_1]; ours did not [CITE:user_data_101].",
    citationInBold: "**Key result [CITE:src_2] holds.**",
    bullets: "- first point\n- second point [CITE:a1]",
    ordered: "1. collect\n2. measure\n3. fit",
    heading: "#### Sample and setting\n\nWe recruited 40 people.",
    mixedListLike: "- not a list\nbecause this line is plain",
    table: "| Board | Latency |\n| --- | --- |\n| A | 1 us |",
    stars: "Use a*b*c and 2 * 3 = 6.",
    unicode: "Pāṇini’s grammar — śāstra.",
  };
  for (const [name, text] of Object.entries(cases)) {
    it(`keeps ${name} exactly`, () => {
      expect(roundTrip(text)).toBe(normalizeSectionText(text));
    });
  }

  it("only collapses extra blank lines and outer whitespace", () => {
    expect(roundTrip("\n\nA.\n\n\n\nB.\n\n")).toBe("A.\n\nB.");
  });

  it("turns citation markers into citation nodes", () => {
    const doc = textToDoc("See [CITE:src_9].");
    expect(doc.content?.[0].content?.find((n) => n.type === "citation")?.attrs).toEqual({ id: "src_9" });
  });

  it("an empty section is one empty paragraph and saves as empty text", () => {
    expect(textToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(docToText(textToDoc(""))).toBe("");
  });
});
