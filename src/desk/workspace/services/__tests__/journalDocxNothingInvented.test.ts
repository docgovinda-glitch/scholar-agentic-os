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
