import { describe, it, expect } from "vitest";
import { importBibTex } from "../bibtexImporter";
import { importRis } from "../risImporter";

describe("importBibTex", () => {
  it("parses a well-formed journal article entry", () => {
    const source = `@article{smith2020ai,
  author = {Smith, John and Doe, Jane},
  title = {{The Rise of {AI} in Research}},
  journal = {Journal of Computing},
  year = {2020},
  volume = {12},
  number = {3},
  pages = {100--110},
  doi = {10.1234/abcd}
}`;

    const result = importBibTex(source);

    expect(result.warnings).toEqual([]);
    expect(result.references).toHaveLength(1);
    const ref = result.references[0];
    expect(ref.kind).toBe("JournalArticle");
    expect(ref.title).toBe("The Rise of AI in Research");
    expect(ref.authors).toEqual([
      { firstName: "John", lastName: "Smith", order: 0 },
      { firstName: "Jane", lastName: "Doe", order: 1 },
    ]);
    expect(ref.journal).toBe("Journal of Computing");
    expect(ref.volume).toBe("12");
    expect(ref.issue).toBe("3");
    expect(ref.pages).toBe("100--110");
    expect(ref.doi).toBe("10.1234/abcd");
    expect(ref.year).toBe("2020");
  });

  it("maps BibTeX entry types to the correct ReferenceKind", () => {
    const source = `@phdthesis{doe2019, author = {Doe, Jane}, title = {A Thesis}, school = {State University}, year = {2019}}`;
    const result = importBibTex(source);
    expect(result.references[0].kind).toBe("Dissertation");
  });

  it("skips malformed entries with a warning instead of failing the whole import", () => {
    const source = `@article{bad{, title = {Unterminated`;
    const result = importBibTex(source);
    expect(result.references).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("reports a warning when no entries are found", () => {
    const result = importBibTex("not a bibtex file at all");
    expect(result.references).toEqual([]);
    expect(result.warnings).toContain("No BibTeX entries found in source");
  });

  it("parses multiple entries in one source", () => {
    const source = `
@article{a1, author = {Smith, John}, title = {Paper One}, journal = {J1}, year = {2021}}
@book{a2, author = {Doe, Jane}, title = {Book Two}, publisher = {Pub}, year = {2022}}
`;
    const result = importBibTex(source);
    expect(result.references).toHaveLength(2);
    expect(result.references[0].title).toBe("Paper One");
    expect(result.references[1].kind).toBe("Book");
  });
});

describe("importRis", () => {
  it("parses a well-formed journal article record", () => {
    const source = [
      "TY  - JOUR",
      "AU  - Smith, John",
      "AU  - Doe, Jane",
      "TI  - The Rise of AI in Research",
      "JO  - Journal of Computing",
      "PY  - 2020",
      "VL  - 12",
      "IS  - 3",
      "SP  - 100",
      "EP  - 110",
      "DO  - 10.1234/abcd",
      "ER  - ",
    ].join("\n");

    const result = importRis(source);

    expect(result.warnings).toEqual([]);
    expect(result.references).toHaveLength(1);
    const ref = result.references[0];
    expect(ref.kind).toBe("JournalArticle");
    expect(ref.title).toBe("The Rise of AI in Research");
    expect(ref.authors).toEqual([
      { firstName: "John", lastName: "Smith", order: 0 },
      { firstName: "Jane", lastName: "Doe", order: 1 },
    ]);
    expect(ref.journal).toBe("Journal of Computing");
    expect(ref.pages).toBe("100-110");
    expect(ref.doi).toBe("10.1234/abcd");
    expect(ref.year).toBe("2020");
  });

  it("maps RIS type codes to the correct ReferenceKind", () => {
    const source = "TY  - RPRT\nTI  - A Report\nPY  - 2021\nER  - ";
    const result = importRis(source);
    expect(result.references[0].kind).toBe("TechnicalReport");
  });

  it("handles multiple records in one source", () => {
    const source = [
      "TY  - JOUR",
      "TI  - First",
      "PY  - 2019",
      "ER  - ",
      "TY  - BOOK",
      "TI  - Second",
      "PY  - 2020",
      "ER  - ",
    ].join("\n");
    const result = importRis(source);
    expect(result.references).toHaveLength(2);
    expect(result.references[0].title).toBe("First");
    expect(result.references[1].kind).toBe("Book");
  });

  it("handles a record missing a trailing ER tag", () => {
    const source = "TY  - JOUR\nTI  - No Closing Tag\nPY  - 2022";
    const result = importRis(source);
    expect(result.references).toHaveLength(1);
    expect(result.references[0].title).toBe("No Closing Tag");
  });

  it("reports a warning when no records are found", () => {
    const result = importRis("not an RIS file");
    expect(result.references).toEqual([]);
    expect(result.warnings).toContain("No RIS records found in source");
  });
});
