import { describe, it, expect } from "vitest";
import { detectReferenceFormat, parsePastedReference, parseReferences } from "../referenceImport";

const BIBTEX = `@article{smith2020ai,
  author = {Smith, John and Doe, Jane},
  title = {The Rise of {AI} in Research},
  journal = {Journal of Computing},
  year = {2020},
  volume = {12},
  pages = {100--110},
  doi = {10.1234/abcd}
}`;

const RIS = `TY  - JOUR
AU  - Smith, John
TI  - The Rise of AI in Research
JO  - Journal of Computing
PY  - 2020
ER  -`;

describe("detecting the format", () => {
  it("recognizes BibTeX by its leading @", () => {
    expect(detectReferenceFormat(BIBTEX)).toBe("bibtex");
  });

  it("recognizes RIS by its TY tag", () => {
    expect(detectReferenceFormat(RIS)).toBe("ris");
  });

  it("recognizes neither for unrelated text", () => {
    expect(detectReferenceFormat("just some notes, not an export")).toBeNull();
  });
});

describe("parsing into Vault items", () => {
  it("turns a BibTeX entry into a title, a readable synopsis, and a full citation", () => {
    const { items, warnings } = parseReferences(BIBTEX);
    expect(warnings).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("The Rise of AI in Research");
    expect(items[0].content).toContain("John Smith");
    expect(items[0].content).toContain("2020");
    // The citation is a real formatted bibliography entry, not a repeat of
    // the synopsis — the reason to import a reference is to have one.
    expect(items[0].citation).not.toBe(items[0].content);
    expect(items[0].citation.length).toBeGreaterThan(0);
  });

  it("turns a RIS entry into the same shape", () => {
    const { items, warnings } = parseReferences(RIS);
    expect(warnings).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("The Rise of AI in Research");
  });

  it("reports an unrecognized format rather than guessing", () => {
    const { items, warnings } = parseReferences("not a citation export");
    expect(items).toEqual([]);
    expect(warnings[0]).toMatch(/could not recognize/i);
  });

  it("carries forward per-entry warnings from a partially malformed source", () => {
    const source = `${BIBTEX}\n@article{bad{, title = {Unterminated`;
    const { items, warnings } = parseReferences(source);
    expect(items).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("names an author-less entry honestly rather than inventing one", () => {
    const noAuthor = `@misc{x, title = {Untitled Finding}, year = {2021}}`;
    const { items } = parseReferences(noAuthor);
    expect(items[0].content).toContain("Unknown author");
  });
});

describe("one pasted reference for the Add Source form", () => {
  it("reads a BibTeX entry with nested braces and several authors", () => {
    const ref = parsePastedReference(BIBTEX);
    expect(ref).toMatchObject({ format: "bibtex", title: "The Rise of AI in Research", year: "2020", journal: "Journal of Computing", doi: "10.1234/abcd" });
    expect(ref?.authors).toEqual(["John Smith", "Jane Doe"]);
  });

  it("reads a RIS record, also when a single-line field flattened it", () => {
    expect(parsePastedReference(RIS)).toMatchObject({ format: "ris", title: "The Rise of AI in Research", authors: ["John Smith"], year: "2020" });
    expect(parsePastedReference(RIS.replace(/\n/g, " "))).toMatchObject({ format: "ris", title: "The Rise of AI in Research", authors: ["John Smith"], year: "2020" });
  });

  it("returns null for text that is not a reference record", () => {
    expect(parsePastedReference("https://example.org/paper")).toBeNull();
    expect(parsePastedReference("@article{broken")).toBeNull();
  });
});
