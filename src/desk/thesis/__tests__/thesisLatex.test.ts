import { describe, it, expect } from "vitest";
import { buildThesisLatex } from "../thesisLatex";
import { standardChapters, updateChapter, type ThesisProjectData } from "../thesisModel";

export function sampleThesis(over: Partial<ThesisProjectData> = {}): ThesisProjectData {
  let chapters = standardChapters(20_000);
  chapters = updateChapter(chapters, 0, { content: "## Background\n\nTriage cut waits by 30% [CITE:r1] and costs [CITE:r1] [CITE:r2].\n\n- first point\n- second point" });
  chapters = updateChapter(chapters, 1, { content: "Prior work on *queues* is thin [CITE:nope].", bibliography: "Okafor, A. (2021) Triage & waits." });
  return {
    id: "t", projectId: "t", title: "Wait Times & Triage: A Study", degreeLevel: "Master's Thesis", fieldOfStudy: "Health Services",
    targetWordCount: 20000, currentWordCount: 0, researchQuestions: ["What drives the wait?"], theoreticalFramework: "", methodologicalDesign: "",
    supervisorNotes: "", literatureMatrix: { foundations: "", debates: "", gap: "" }, chapters, citationStyle: "apa",
    references: {
      r1: { id: "r1", kind: "article", title: "Triage and waits", authors: [{ family: "Okafor", given: "Ada" }], year: 2021, container: "BMJ Open", volume: "11", pages: "1-9", registry: "crossref", doi: "10.1136/x" },
      r2: { id: "r2", kind: "book", title: "Queues", authors: [{ family: "Lee", given: "Bo" }], year: 2019, publisher: "Wiley", registry: "crossref" },
      r3: { id: "r3", kind: "article", title: "Never cited", authors: [{ family: "Kim" }], year: 2018, registry: "author" },
    },
    ...over,
  };
}

describe("thesis LaTeX", () => {
  it("builds a report with chapters, escaped text, natbib citations and only the cited sources", () => {
    const out = buildThesisLatex(sampleThesis());
    expect(out.tex).toContain("\\documentclass[12pt,a4paper,oneside]{report}");
    expect(out.tex).toContain("{\\LARGE\\bfseries Wait Times \\& Triage: A Study\\par}");
    expect(out.tex).toContain("\\chapter{Introduction}");
    expect(out.tex).toContain("\\section{Background}");
    expect(out.tex).toContain("by 30\\%~\\citep{r1} and costs~\\citep{r1,r2}");
    expect(out.tex).toContain("\\emph{queues}");
    expect(out.tex).toContain("[nope]");
    expect(out.missing).toEqual(["nope"]);
    expect(out.tex).toContain("Okafor, A. (2021) Triage \\& waits.");
    expect(out.tex).toContain("\\textit{[Not drafted yet]}");
    expect(out.tex).toContain("\\bibliographystyle{plainnat}");
    expect(out.tex).toContain("\\renewcommand{\\bibname}{References}");
    expect(out.bib).toContain("@article{r1,");
    expect(out.bib).toContain("@book{r2,");
    expect(out.bib).not.toContain("r3");
  });

  it("numeric styles use numbered natbib; with no citations there is no bibliography", () => {
    expect(buildThesisLatex(sampleThesis({ citationStyle: "ieee" })).tex).toContain("\\usepackage[numbers,square]{natbib}");
    expect(buildThesisLatex(sampleThesis({ citationStyle: "ieee" })).tex).toContain("\\cite{r1}");
    const plain = buildThesisLatex(sampleThesis({ chapters: standardChapters(1000), researchQuestions: [] }));
    expect(plain.tex).not.toContain("\\bibliography");
    expect(plain.tex).not.toContain("Research questions");
    expect(plain.bib).toBe("");
  });

});
