import { describe, it, expect } from "vitest";
import {
  cleanDoi,
  integrityFromCrossref,
  parseName,
  parseReferenceRecords,
  recordFromCrossref,
  recordFromDataCite,
  sourceIdForDoi,
} from "../references";

const NOW = "2026-11-02T00:00:00.000Z";

describe("cleanDoi", () => {
  it("accepts the forms people paste and rejects what isn't a DOI", () => {
    expect(cleanDoi("10.1038/s41586-020-2649-2")).toBe("10.1038/s41586-020-2649-2");
    expect(cleanDoi("https://doi.org/10.1038/s41586-020-2649-2.")).toBe("10.1038/s41586-020-2649-2");
    expect(cleanDoi("doi: 10.1000/xyz123")).toBe("10.1000/xyz123");
    expect(cleanDoi("dx.doi.org/10.1000/abc")).toBe("10.1000/abc");
    expect(cleanDoi("not a doi")).toBeNull();
    expect(cleanDoi("10.12/too-short-prefix")).toBeNull();
    expect(cleanDoi("")).toBeNull();
  });

  it("gives a DOI a source id that fits inside [CITE:id]", () => {
    expect(sourceIdForDoi("10.1038/S41586-020-2649-2")).toBe("doi_10_1038_s41586_020_2649_2");
  });
});

describe("parseName", () => {
  it("reads 'Family, Given', 'Given Family' and a single name", () => {
    expect(parseName("Smith, Jane A.")).toEqual({ family: "Smith", given: "Jane A." });
    expect(parseName("Jane Smith")).toEqual({ family: "Smith", given: "Jane" });
    expect(parseName("Aristotle")).toEqual({ family: "Aristotle" });
    expect(parseName("Fowler et al.")).toEqual({ family: "Fowler" });
    expect(parseName("  ")).toBeNull();
  });
});

describe("recordFromCrossref", () => {
  it("maps the registered fields and adds nothing that isn't there", () => {
    const rec = recordFromCrossref(
      {
        type: "journal-article",
        title: ["Array programming with <i>NumPy</i>"],
        author: [{ given: "Charles R.", family: "Harris" }, { family: "Millman" }, { name: "NumPy Developers" }],
        "container-title": ["Nature"],
        volume: "585",
        issue: "7825",
        page: "357-362",
        "published-print": { "date-parts": [[2020, 9]] },
        publisher: "Springer",
      },
      "src_1",
      "10.1038/s41586-020-2649-2"
    );
    expect(rec).toMatchObject({
      id: "src_1",
      kind: "article",
      title: "Array programming with NumPy",
      authors: [{ family: "Harris", given: "Charles R." }, { family: "Millman" }, { family: "NumPy Developers" }],
      year: 2020,
      container: "Nature",
      volume: "585",
      issue: "7825",
      pages: "357-362",
      doi: "10.1038/s41586-020-2649-2",
      registry: "crossref",
    });
    const bare = recordFromCrossref({ type: "posted-content" }, "x", "10.1000/x");
    expect(bare.kind).toBe("other");
    expect(bare.title).toBe("");
    expect(bare.year).toBeUndefined();
    expect(bare.authors).toEqual([]);
  });
});

describe("integrityFromCrossref", () => {
  it("finds a retraction registered against the work (updated-by)", () => {
    const i = integrityFromCrossref({ "updated-by": [{ type: "retraction", DOI: "10.1000/notice" }] }, NOW);
    expect(i).toEqual({ status: "retracted", notice: "https://doi.org/10.1000/notice", checkedAt: NOW });
  });

  it("treats a retraction notice itself, concerns and corrections separately", () => {
    expect(integrityFromCrossref({ type: "retraction", URL: "https://doi.org/10.1/n" }, NOW).status).toBe("retracted");
    expect(integrityFromCrossref({ "updated-by": [{ type: "expression_of_concern" }] }, NOW).status).toBe("concern");
    expect(integrityFromCrossref({ "update-to": [{ type: "correction" }] }, NOW).status).toBe("corrected");
    expect(integrityFromCrossref({ "updated-by": [{ type: "correction" }, { type: "retraction" }] }, NOW).status).toBe("retracted");
    expect(integrityFromCrossref({ type: "journal-article" }, NOW)).toEqual({ status: "clean", checkedAt: NOW });
  });
});

describe("recordFromDataCite", () => {
  it("maps creators, title, year and type", () => {
    const rec = recordFromDataCite(
      {
        creators: [{ givenName: "Ada", familyName: "Lovelace" }, { name: "Babbage, Charles" }],
        titles: [{ title: "Engine notes" }],
        publicationYear: 2023,
        publisher: "Zenodo",
        types: { resourceTypeGeneral: "Dataset" },
      },
      "d1",
      "10.5281/zenodo.1"
    );
    expect(rec).toMatchObject({
      kind: "dataset",
      title: "Engine notes",
      authors: [{ family: "Lovelace", given: "Ada" }, { family: "Babbage", given: "Charles" }],
      year: 2023,
      publisher: "Zenodo",
      registry: "datacite",
    });
  });
});

describe("parseReferenceRecords", () => {
  it("keeps valid saved records and drops malformed ones", () => {
    const good = { id: "a", kind: "article", title: "T", authors: [], registry: "crossref" };
    const out = parseReferenceRecords(JSON.stringify({ a: good, b: { id: "b" } }));
    expect(Object.keys(out)).toEqual(["a"]);
    expect(parseReferenceRecords("not json")).toEqual({});
    expect(parseReferenceRecords(undefined)).toEqual({});
  });
});
