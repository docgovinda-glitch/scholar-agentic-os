import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { renderDocx } from "../docxWriter";
import { WORD_LAYOUTS, layoutFrom, lineTwips, suggestWordLayout } from "../../../domain/journal/wordLayouts";
import type { CanonicalDocument } from "../../../desk/types";

const doc: CanonicalDocument = {
  id: "d",
  title: "Sleep and memory",
  blocks: [
    { id: "h", kind: "heading1", text: "Introduction" },
    { id: "p", kind: "paragraph", text: "Sleep supports memory consolidation in adults." },
  ],
};

async function xml(layout?: (typeof WORD_LAYOUTS)[keyof typeof WORD_LAYOUTS]): Promise<string> {
  const buf = await renderDocx(doc, { title: doc.title, author: "Ada Lovelace" }, { template: "apa7", wordLayout: layout });
  return (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
}

/** The paragraph run that carries the body sentence. */
const bodyRun = (x: string) => x.slice(x.lastIndexOf("<w:r>", x.indexOf("Sleep supports memory")), x.indexOf("Sleep supports memory"));
const bodyPara = (x: string) => x.slice(x.lastIndexOf("<w:p>", x.indexOf("Sleep supports memory")), x.indexOf("Sleep supports memory"));

describe("Word layouts", () => {
  it("review copy: 12 pt Times, double-spaced, continuous line numbers, one column", async () => {
    const x = await xml(WORD_LAYOUTS.review);
    expect(bodyRun(x)).toContain('<w:sz w:val="24"/>');
    expect(bodyRun(x)).toContain('w:ascii="Times New Roman"');
    expect(bodyPara(x)).toContain('w:line="480"');
    expect(x).toMatch(/<w:lnNumType [^>]*w:countBy="1"[^>]*w:restart="continuous"/);
    expect(x).not.toContain('w:num="2"');
  });

  it("two columns: 10 pt Times, single-spaced; title page single-column, body in two", async () => {
    const x = await xml(WORD_LAYOUTS.two_column);
    expect(bodyRun(x)).toContain('<w:sz w:val="20"/>');
    expect(bodyPara(x)).toContain('w:line="240"');
    const sections = x.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)!;
    expect(sections).toHaveLength(2);
    expect(sections[0]).not.toContain('w:num="2"');
    expect(sections[1]).toMatch(/<w:cols [^>]*w:num="2"/);
    expect(sections[1]).toContain('<w:type w:val="continuous"/>');
    // The body sentence comes after the first section break.
    expect(x.indexOf("Sleep supports memory")).toBeGreaterThan(x.indexOf(sections[0]));
    expect(x).not.toContain("lnNumType");
  });

  it("line numbers can be turned off, and without a layout the file is as before", async () => {
    expect(await xml({ ...WORD_LAYOUTS.review, lineNumbers: false })).not.toContain("lnNumType");
    const plain = await xml(undefined);
    expect(plain).not.toContain("lnNumType");
    expect(plain.match(/<w:sectPr/g)).toHaveLength(1);
  });

  it("reads the layout from a request safely and suggests one from the LaTeX class", () => {
    expect(layoutFrom("two_column", true)).toEqual({ ...WORD_LAYOUTS.two_column, lineNumbers: true });
    expect(layoutFrom("review")).toEqual(WORD_LAYOUTS.review);
    expect(layoutFrom("<script>")).toBeUndefined();
    expect(layoutFrom(undefined)).toBeUndefined();
    expect(suggestWordLayout("ieeetran")).toBe("two_column");
    expect(suggestWordLayout("elsarticle")).toBe("review");
    expect(lineTwips(2)).toBe(480);
  });
});
