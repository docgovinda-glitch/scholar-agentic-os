import { describe, it, expect } from "vitest";
import { getDocumentTemplate, DOCUMENT_TEMPLATES } from "../documentTemplates";

describe("getDocumentTemplate", () => {
  it("returns a distinct, non-journal template for each non-journal format", () => {
    const journal = getDocumentTemplate("journal-article");
    const termPaper = getDocumentTemplate("term-paper");
    const proposal = getDocumentTemplate("research-proposal");
    const report = getDocumentTemplate("report");
    const newspaper = getDocumentTemplate("newspaper-article");
    const bookChapter = getDocumentTemplate("book-chapter");

    expect(termPaper.sectionStructure).not.toEqual(journal.sectionStructure);
    expect(proposal.sectionStructure).not.toEqual(journal.sectionStructure);
    expect(report.sectionStructure).not.toEqual(journal.sectionStructure);
    expect(newspaper.sectionStructure).not.toEqual(journal.sectionStructure);
    expect(bookChapter.sectionStructure).not.toEqual(journal.sectionStructure);
  });

  it("research-proposal template has no Results/Discussion section, consistent with the Stage 6 decision that proposals skip primary data", () => {
    const proposal = getDocumentTemplate("research-proposal");
    expect(proposal.sectionStructure.some((s) => s.toLowerCase().includes("results"))).toBe(false);
    expect(proposal.sectionStructure).toContain("Timeline");
  });

  it("term-paper template has no abstract, matching outputFormats.ts's own framing (synthesis/argument-driven, not empirical)", () => {
    const termPaper = getDocumentTemplate("term-paper");
    expect(termPaper.hasAbstract).toBe(false);
    expect(termPaper.sectionStructure.some((s) => s.toLowerCase().includes("abstract"))).toBe(false);
  });

  it("report template uses Executive Summary instead of an abstract, and a single-spaced sans-serif layout", () => {
    const report = getDocumentTemplate("report");
    expect(report.sectionStructure).toContain("Executive Summary");
    expect(report.hasAbstract).toBe(false);
    expect(report.layout.lineSpacing).toBe("single");
    expect(report.layout.docxFontFamily).toBe("Arial");
  });

  it("newspaper-article template has no references section and an inverted-pyramid structure", () => {
    const newspaper = getDocumentTemplate("newspaper-article");
    expect(newspaper.hasReferences).toBe(false);
    expect(newspaper.sectionStructure).toEqual(["Headline", "Lede", "Body (Inverted Pyramid)"]);
  });

  it("falls back to the journal-article template for an unset outputFormat", () => {
    const empty = getDocumentTemplate("");
    expect(empty).toEqual(DOCUMENT_TEMPLATES["journal-article"]);
  });

  it("academic formats (journal, research paper, term paper, book chapter, research proposal) all use double-spaced Times New Roman", () => {
    for (const format of ["journal-article", "research-paper", "term-paper", "book-chapter", "research-proposal"] as const) {
      const template = getDocumentTemplate(format);
      expect(template.layout.lineSpacing).toBe("double");
      expect(template.layout.docxFontFamily).toBe("Times New Roman");
    }
  });
});
