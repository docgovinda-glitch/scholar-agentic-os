/**
 * In-text names for the author-date styles (shared `inTextSurnames`), and
 * papers in a named collection (APA 7, Harvard Cite Them Right).
 */
import { describe, it, expect } from "vitest";
import { CitationFormatterFactory } from "../../formattingEngine";
import type { CanonicalReference } from "../../model/reference";

const ref = (surnames: string[], extra: Partial<CanonicalReference> = {}): CanonicalReference => ({
  kind: "JournalArticle",
  title: "Loyalty and price",
  authors: surnames.map((lastName, order) => ({ firstName: "A", lastName, order })),
  source: "Marketing Science",
  journal: "Marketing Science",
  year: "2020",
  publicationDate: "2020",
  ...extra,
});

describe("in-text names name every co-author the style lists", () => {
  it("Harvard lists up to three authors, then et al.", () => {
    expect(CitationFormatterFactory.formatInText("harvard", ref(["Smith", "Jones"]))).toBe("(Smith and Jones 2020)");
    expect(CitationFormatterFactory.formatInText("harvard", ref(["Smith", "Jones", "Brown"]))).toBe("(Smith, Jones and Brown 2020)");
    expect(CitationFormatterFactory.formatInText("harvard", ref(["Smith", "Jones", "Brown", "Lee"]))).toBe("(Smith et al. 2020)");
  });
  it("Chicago author-date lists up to three with a serial comma", () => {
    expect(CitationFormatterFactory.formatInText("chicago", ref(["Smith", "Jones", "Brown"]))).toBe("(Smith, Jones, and Brown 2020)");
    expect(CitationFormatterFactory.formatInText("chicago", ref(["Smith", "Jones", "Brown", "Lee"]))).toBe("(Smith et al. 2020)");
  });
  it("MLA 9 lists two, then et al.", () => {
    expect(CitationFormatterFactory.formatInText("mla9", ref(["Smith", "Jones"]))).toBe("(Smith and Jones)");
    expect(CitationFormatterFactory.formatInText("mla9", ref(["Smith", "Jones", "Brown"]))).toBe("(Smith et al.)");
  });
});

describe("a paper in a named collection", () => {
  const paper = ref(["He", "Zhang"], { kind: "ConferencePaper", title: "Deep residual learning", source: "Proceedings of CVPR", journal: undefined, pages: "770-778" });
  it("APA 7: In *Proceedings* (pp. x–y)", () => {
    expect(CitationFormatterFactory.formatBibliography("apa7", paper)).toBe("He, A., & Zhang, A. (2020). Deep residual learning. In *Proceedings of CVPR* (pp. 770–778).");
  });
  it("Harvard: the title quoted, the collection italic, the pages kept", () => {
    expect(CitationFormatterFactory.formatBibliography("harvard", paper)).toBe("He, A. and Zhang, A. (2020) 'Deep residual learning', *Proceedings of CVPR*, pp. 770–778.");
  });
  it("APA 7 italicises the title of a work that stands alone (a web page)", () => {
    expect(CitationFormatterFactory.formatBibliography("apa7", ref(["Smith"], { kind: "Website", title: "Retail sales", source: "ONS", journal: undefined, url: "https://www.ons.gov.uk/retail" }))).toBe(
      "Smith, A. (2020). *Retail sales*. ONS. https://www.ons.gov.uk/retail"
    );
  });
});
