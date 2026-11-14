import { describe, it, expect } from "vitest";
import { docToText, normalizeSectionText, textToDoc } from "../sectionDoc";

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

describe("rich blocks (Coursework editor)", () => {
  const text = [
    "Plain <u>underlined</u> and <u>**both**</u> text.",
    "> A quoted line\n> and its second line",
    "| A | B |\n| --- | --- |\n| 1 | *two* |",
  ].join("\n\n");

  it("round-trips underline, block quotes and tables exactly", () => {
    const doc = textToDoc(text, { richBlocks: true });
    expect(doc.content?.map((b) => b.type)).toEqual(["paragraph", "blockquote", "table"]);
    expect(docToText(doc)).toBe(normalizeSectionText(text));
  });

  it("leaves quotes and tables as text when rich blocks are off (Journal)", () => {
    const doc = textToDoc(text);
    expect(doc.content?.map((b) => b.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(docToText(doc)).toBe(normalizeSectionText(text));
  });
});

it("reads underline and bold in either nesting order", () => {
  const p = textToDoc("**<u>x</u>**", { richBlocks: true }).content?.[0];
  expect(p?.content?.[0].marks?.map((m) => m.type).sort()).toEqual(["bold", "underline"]);
});

describe("paragraph alignment (Coursework editor)", () => {
  const text = '<p align="center">Centred **bold** line.</p>\n\nLeft paragraph.\n\n<p align="right">#### Signed off</p>\n\n<p align="justify">Justified text.</p>';

  it("round-trips alignment on paragraphs and sub-headings exactly", () => {
    const doc = textToDoc(text, { richBlocks: true });
    expect(doc.content?.map((b) => [b.type, b.attrs?.textAlign ?? null])).toEqual([
      ["paragraph", "center"],
      ["paragraph", null],
      ["heading", "right"],
      ["paragraph", "justify"],
    ]);
    expect(docToText(doc)).toBe(text);
  });

  it("writes nothing for left alignment", () => {
    expect(docToText({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "x" }] }] })).toBe("x");
  });

  it("keeps the markup as plain text when rich blocks are off (Journal)", () => {
    expect(docToText(textToDoc(text))).toBe(text);
  });
});
