import { describe, it, expect } from "vitest";
import { parseProseBlocks, tableToMarkdown, splitTableRow } from "../proseBlocks";
import { inlineMarkdownRuns } from "../inlineMarkdown";

const TEXT = [
  "Central banks set a *policy rate* (Smith, 2020).",
  "#### Tools",
  "> Inflation is always and everywhere a monetary phenomenon.",
  "| Tool | Effect |\n| --- | --- |\n| Rate | Lending \\| deposits |\n| QE | Yields |",
  "- one\n- two",
  "1. first\n2. second",
].join("\n\n");

describe("parseProseBlocks", () => {
  it("reads every block kind", () => {
    const blocks = parseProseBlocks(TEXT);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "heading", "quote", "table", "bullets", "numbered"]);
    const table = blocks[3];
    expect(table.kind === "table" && table.header).toBe(true);
    expect(table.kind === "table" && table.rows).toEqual([["Tool", "Effect"], ["Rate", "Lending | deposits"], ["QE", "Yields"]]);
  });

  it("writes tables back the same way", () => {
    const rows = [["Tool", "Effect"], ["Rate", "Lending | deposits"]];
    expect(parseProseBlocks(tableToMarkdown(rows))[0]).toEqual({ kind: "table", rows, header: true });
    expect(splitTableRow("| a | b \\| c |")).toEqual(["a", "b | c"]);
  });

  it("keeps plain prose regrouping (a long single block is split)", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Sentence number ${i + 1} explains the argument in some detail.`).join(" ");
    expect(parseProseBlocks(long).length).toBeGreaterThan(1);
  });
});

describe("inlineMarkdownRuns", () => {
  it("handles underline nested with bold and italic", () => {
    expect(inlineMarkdownRuns("a <u>b **c**</u> *d*")).toEqual([
      { text: "a " },
      { text: "b ", underline: true },
      { text: "c", underline: true, bold: true },
      { text: " " },
      { text: "d", italics: true },
    ]);
  });
});

import { countProseWords } from "../proseBlocks";
describe("countProseWords", () => {
  it("counts words, not markup", () => {
    expect(countProseWords("| A | B |\n| --- | --- |\n| one | two |")).toBe(4);
    expect(countProseWords("> quoted words\n\n- list item\n\n#### Head\n\n<u>under</u> **bold**")).toBe(7);
    expect(countProseWords("plain three words")).toBe(3);
  });
});

describe("paragraph alignment", () => {
  it("reads aligned paragraphs and sub-headings and never regroups them", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Sentence ${i + 1} explains the argument in some detail here.`).join(" ");
    const blocks = parseProseBlocks(`<p align="center">#### Title</p>\n\n<p align="justify">${long}</p>\n\nLeft as usual.`);
    expect(blocks.map((b) => [b.kind, "align" in b ? b.align : undefined])).toEqual([
      ["heading", "center"],
      ["paragraph", "justify"],
      ["paragraph", undefined],
    ]);
  });

  it("does not count the alignment markup as words", () => {
    expect(countProseWords('<p align="right">two words</p>\n\n<p align="center">#### Head</p>')).toBe(3);
  });
});
