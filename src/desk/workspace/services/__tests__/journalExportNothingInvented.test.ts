import { describe, it, expect } from "vitest";
import { generateJournalLatex } from "../journalExportService";

describe("LaTeX export adds nothing the author didn't write", () => {
  it("has no stand-in author, abstract, declarations or bibliography", () => {
    const { tex, bib } = generateJournalLatex({
      title: "Sleep and memory",
      targetJournal: "Journal of Sleep",
      template: "ieee",
      authors: [],
      sections: [{ section: "Introduction", content: "Sleep supports memory." }],
    });
    expect(tex).toContain("Sleep supports memory.");
    expect(bib).toBe("");
    for (const invented of ["Author Name", "University", "Autonomous academic reasoning", "Declarations", "No specific grant", "Available on request", "\\bibliography{"]) {
      expect(tex, invented).not.toContain(invented);
    }
  });

  it("keeps the author's own abstract and declarations", () => {
    const { tex } = generateJournalLatex({
      title: "Sleep",
      targetJournal: "J",
      authors: [{ name: "Ada Lovelace", affiliation: "UCL" }],
      abstract: "We tested recall.",
      sections: [],
      declarations: { funding: "Wellcome grant 123." },
    });
    expect(tex).toContain("\\author{Ada Lovelace\\thanks{UCL}}");
    expect(tex).toContain("\\begin{abstract}\nWe tested recall.\n\\end{abstract}");
    expect(tex).toContain("\\textbf{Funding:} Wellcome grant 123.");
    expect(tex).not.toContain("Conflict of Interest");
  });
});
