import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderDocx, renderRefereeResponseLetterDocx } from "../docxWriter";
import type { CanonicalDocument } from "../../../desk/types";

const doc: CanonicalDocument = {
  id: "doc-1",
  title: "Sleep and memory",
  blocks: [
    { id: "b1", kind: "heading1", text: "Introduction" },
    { id: "b2", kind: "paragraph", text: "Sleep supports memory consolidation in adults." },
  ],
};

async function text(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("Word export adds nothing the author didn't write", () => {
  it("with no authors, declarations or references, it prints none of them", async () => {
    const out = await text(await renderDocx(doc, { title: doc.title, author: "" }, { template: "apa7" }));
    expect(out).toContain("Sleep supports memory consolidation");
    for (const invented of [
      "Lead Researcher",
      "Department of Academic Research",
      "author@university.edu",
      "0000-0002-1825-0097",
      "Declarations",
      "competing",
      "grant",
      "upon reasonable request",
      "Scholar Agentic OS",
      "Vaswani",
      "Rostova",
      "References",
    ]) {
      expect(out, invented).not.toContain(invented);
    }
  });

  it("prints the declarations and references it is given, and only those", async () => {
    const out = await text(
      await renderDocx(
        doc,
        { title: doc.title, author: "Ada Lovelace" },
        {
          template: "apa7",
          ethicalDeclarations: { competingInterests: "AL consults for Acme Ltd." },
          references: [{ id: "r1", authors: ["Smith, J."], year: "2020", title: "Sleep", journal: "Brain" }],
        }
      )
    );
    expect(out).toContain("Ada Lovelace");
    expect(out).toContain("Competing Interests:");
    expect(out).toContain("AL consults for Acme Ltd.");
    expect(out).not.toContain("Funding:");
    expect(out).not.toContain("AI-Assisted Tool Disclosure");
    expect(out).toContain("Smith, J. (2020). Sleep. Brain.");
    expect(out).not.toContain("0000-0002-1825-0097");
  });

  it("the referee letter is signed by the authors, not a stand-in name", async () => {
    const out = await text(await renderRefereeResponseLetterDocx({ title: "Sleep", author: "" }, { rebuttalMatrix: [] }));
    expect(out).not.toContain("Lead Investigator");
    expect(out).toContain("The authors");
  });
});
