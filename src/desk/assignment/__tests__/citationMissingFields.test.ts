import { describe, it, expect } from "vitest";
import {
  discoveredSourceToCanonical,
  formatSourceBibliography,
  formatSourceInTextCitation,
} from "../services/citationFormatService";
import { generateBibtex } from "../../../app/export/academicPdfCompiler";

// PRODUCT_AUDIT P0-7: missing citation metadata is shown as missing, never invented.
const bare = { id: "s1", title: "A study with sparse metadata" };

describe("citations with missing author, year or venue", () => {
  it("canonical reference keeps the gaps instead of inventing values", () => {
    const ref = discoveredSourceToCanonical(bare);
    expect(ref.year).toBe("n.d.");
    expect(ref.source).toBe("");
    expect(ref.authors.map((a) => a.lastName)).toEqual(["[Author unknown]"]);
  });

  it("formatted citations never contain the old placeholders", () => {
    const outputs = [
      formatSourceBibliography(bare, "apa7"),
      formatSourceBibliography(bare, "harvard"),
      formatSourceInTextCitation(bare, "apa7"),
    ].join("\n");
    expect(outputs).not.toMatch(/2024|Author, A\.|Academic Publication|Scholar\b/);
    expect(outputs).toMatch(/n\.d\./);
  });

  it("BibTeX omits a missing journal and writes n.d. for a missing year", () => {
    const bib = generateBibtex([{ id: "k1", title: "T", authors: ["Doe, J."] }]);
    expect(bib).toContain("year = {n.d.}");
    expect(bib).not.toMatch(/journal =|Journal of Academic Research|2024/);
  });
});
