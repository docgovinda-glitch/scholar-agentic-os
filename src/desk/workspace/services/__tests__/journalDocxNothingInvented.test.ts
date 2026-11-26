import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildJournalDocxDocument, getAuthorDisplayName, packDocxToBlob, type JournalExportParams } from "../journalExportService";

async function documentXml(params: JournalExportParams): Promise<string> {
  const blob = await packDocxToBlob(buildJournalDocxDocument(params));
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return zip.file("word/document.xml")!.async("string");
}
const text = (xml: string) => Array.from(xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g), (m) => m[1]).join("|");

const base: JournalExportParams = { title: "Sleep and memory", targetJournal: "", template: "apa7", authors: [], sections: [{ section: "", content: "## Methods\n\nBody." }] };

describe("Journal DOCX export prints only what the author entered", () => {
  it("has no stand-in author, affiliation, journal line, keywords or section heading", async () => {
    const out = text(await documentXml({ ...base, keywords: ["", "  "] }));
    for (const invented of ["[Author name]", "[Affiliation]", "Prepared for Submission", "Keywords", "Manuscript Content", "Corresponding author", "Abstract"]) {
      expect(out, invented).not.toContain(invented);
    }
    expect(out).toContain("Sleep and memory");
    expect(out).toContain("Methods");
    expect(out).toContain("Body.");
  });

  it("names no author without a name, and marks the flagged corresponding author", async () => {
    expect(getAuthorDisplayName({})).toBe("");
    expect(getAuthorDisplayName(undefined)).toBe("");
    const out = text(
      await documentXml({
        ...base,
        targetJournal: "Journal of Sleep",
        authors: [{ name: "Ada Lovelace", affiliation: "UCL" }, { name: "Charles Babbage", email: "cb@example.org", isCorresponding: true }, {}],
        keywords: ["sleep", " memory "],
      })
    );
    expect(out).toContain("Prepared for Submission to: Journal of Sleep");
    expect(out).toContain("Ada Lovelace|1|, |Charles Babbage|2*");
    expect(out).toContain("* Corresponding author: cb@example.org");
    expect(out).toContain("sleep; memory");
    expect(out).not.toContain("[Author name]");
  });

  it("numbers titled sections in order, skipping the abstract, and drops the internal § marker", async () => {
    const out = text(
      await documentXml({
        ...base,
        template: "elsevier",
        sections: [
          { section: "Abstract", content: "Ignored here." },
          { section: "Introduction", content: "Intro." },
          { section: "Methods", content: "### § Participants\n\nWho." },
        ],
      })
    );
    expect(out).toContain("1. Introduction");
    expect(out).toContain("2. Methods");
    expect(out).not.toContain("2. Introduction");
    expect(out).toContain("Participants");
    expect(out).not.toContain("§");
  });
});

describe("Journal DOCX heading numbers follow the journal's style", () => {
  const body = "## Introduction\n\nA.\n\n## Methods\n\nB.\n\n### § Participants\n\nC.\n\n### § Materials\n\n#### Sampling\n\nD.\n\n## Results\n\nE.\n\n## References\n\nSmith (2020).\n\n## Figures and tables\n\nFigure 1.";
  const build = (template: JournalExportParams["template"]) => documentXml({ ...base, template, sections: [{ section: "", content: body }] }).then(text);

  it("uses decimal numbering (1, 1.1, 1.1.1) for Elsevier, Springer and ACM layouts", async () => {
    for (const template of ["elsevier", "acm", undefined] as const) {
      const out = await build(template);
      expect(out, String(template)).toContain("1. Introduction");
      expect(out).toContain("2. Methods");
      expect(out).toContain("2.1. Participants");
      expect(out).toContain("2.2. Materials");
      expect(out).toContain("2.2.1. Sampling");
      expect(out).toContain("3. Results");
    }
  });

  it("uses Roman numerals, letters and numbers for IEEE", async () => {
    const out = await build("ieee");
    expect(out).toContain("I. Introduction");
    expect(out).toContain("II. Methods");
    expect(out).toContain("A. Participants");
    expect(out).toContain("B. Materials");
    expect(out).toContain("1) Sampling");
    expect(out).toContain("III. Results");
  });

  it("leaves headings unnumbered for APA 7 and Nature", async () => {
    for (const template of ["apa7", "nature"] as const) {
      const out = await build(template);
      expect(out, template).toContain("|Introduction|");
      expect(out).toContain("|Participants|");
      expect(out).not.toMatch(/\|\d+\. |\|[IVX]+\. /);
    }
  });

  it("never numbers References or the figures and tables list", async () => {
    for (const template of ["elsevier", "ieee", "apa7"] as const) {
      const out = await build(template);
      expect(out, template).toContain("|References|");
      expect(out).toContain("|Figures and tables|");
    }
  });

  it("lets the caller choose the numbering, overriding the template", async () => {
    const withNumbering = (headingNumbering: JournalExportParams["headingNumbering"]) =>
      documentXml({ ...base, template: "apa7", headingNumbering, sections: [{ section: "", content: body }] }).then(text);
    expect(await withNumbering("decimal")).toContain("2.1. Participants");
    expect(await withNumbering("ieee")).toContain("A. Participants");
    expect(await withNumbering(undefined)).toContain("|Participants|");
  });
});
