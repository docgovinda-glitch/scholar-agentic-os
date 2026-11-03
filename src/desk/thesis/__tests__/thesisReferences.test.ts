import { describe, it, expect } from "vitest";
import { renderThesis, uncitedRecords, parseThesisStyle, citeTag } from "../thesisReferences";
import { standardChapters } from "../thesisModel";
import type { ReferenceRecord } from "../../../domain/journal/references";

const rec = (id: string, family: string, year: number, title: string): ReferenceRecord => ({
  id, kind: "article", title, authors: [{ family, given: "Ada" }], year, container: "Brain", registry: "crossref", doi: `10.1/${id}`,
});
const records = { a: rec("a", "Smith", 2020, "Sleep"), b: rec("b", "Lee", 2019, "Memory"), c: rec("c", "Kim", 2018, "Unused") };

function chapters() {
  const ch = standardChapters(10_000);
  ch[0].content = `Sleep matters ${citeTag("a")}.`;
  ch[1].content = `Memory too ${citeTag("b")} ${citeTag("a")}.\n\n## References\n\nMy own notes stay.`;
  ch[2].content = `Unknown ${citeTag("zzz")}.`;
  return ch;
}

describe("thesis references", () => {
  it("renders author-date citations in every chapter with one alphabetical list", () => {
    const out = renderThesis(chapters(), records, "apa");
    expect(out.chapters[0].content).toBe("Sleep matters (Smith, 2020).");
    expect(out.chapters[1].content).toContain("Memory too (Lee, 2019; Smith, 2020).");
    // The student's own "References" section inside a chapter is never removed.
    expect(out.chapters[1].content).toContain("## References\n\nMy own notes stay.");
    expect(out.references).toHaveLength(2);
    expect(out.references[0]).toMatch(/^Lee/);
    expect(out.heading).toBe("References");
    // An unknown tag stays as written and is reported; nothing is made up.
    expect(out.chapters[2].content).toBe("Unknown [CITE:zzz].");
    expect(out.missing).toEqual(["zzz"]);
    // Undrafted chapters are untouched.
    expect(out.chapters[3].content).toBe("");
  });

  it("numbers IEEE citations across chapters in order of first citation", () => {
    const out = renderThesis(chapters(), records, "ieee");
    expect(out.chapters[0].content).toBe("Sleep matters [1].");
    expect(out.chapters[1].content).toContain("Memory too [2], [1].");
    expect(out.references[0]).toMatch(/^\[1\] /);
  });

  it("lists sources nobody cites, and leaves text without tags alone", () => {
    expect(uncitedRecords(chapters(), records).map((r) => r.id)).toEqual(["c"]);
    const plain = standardChapters(1000);
    expect(renderThesis(plain, records, "apa")).toMatchObject({ references: [], missing: [], chapters: plain });
    expect(parseThesisStyle("<x>")).toBe("apa");
    expect(parseThesisStyle("mla")).toBe("mla");
  });
});
