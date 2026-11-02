import { describe, it, expect } from "vitest";
import { bodyLatex, buildLatex, escapeLatex, exportParts, inlineLatex, suggestTemplate, toBibtex, type LatexTemplate } from "../latex";
import type { ReferenceRecord } from "../references";

const numpy: ReferenceRecord = {
  id: "doi_10_1038_numpy",
  kind: "article",
  title: "Array programming with NumPy",
  authors: [{ family: "Harris", given: "Charles R." }, { family: "van der Walt", given: "Stéfan J." }],
  year: 2020,
  container: "Nature",
  volume: "585",
  issue: "7825",
  pages: "357-362",
  doi: "10.1038/s41586-020-2649-2",
  registry: "crossref",
};
const cite = (keys: string[]) => `\\cite{${keys.join(",")}}`;

describe("escaping and inline text", () => {
  it("escapes every LaTeX special character", () => {
    expect(escapeLatex("50% & $5 #1 a_b {x} ~ ^ \\ <b>")).toBe(
      "50\\% \\& \\$5 \\#1 a\\_b \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{} \\textless{}b\\textgreater{}"
    );
  });

  it("turns bold, italic and grouped citations into LaTeX", () => {
    expect(inlineLatex("**Bold** and *it* [CITE:a] [CITE:b]; then [CITE:c].", cite)).toBe("\\textbf{Bold} and \\emph{it}~\\cite{a,b}; then~\\cite{c}.");
  });
});

describe("bodyLatex", () => {
  it("converts headings, lists and pipe tables", () => {
    const tex = bodyLatex("### § 1. Introduction\n\nText.\n\n#### Aims\n\n- one\n- two\n\n1. a\n2. b\n\n| A | B_c |\n| :-- | :-- |\n| 1 | 2 |", cite);
    expect(tex).toContain("\\section{Introduction}");
    expect(tex).toContain("\\subsection{Aims}");
    expect(tex).toContain("\\begin{itemize}\n  \\item one\n  \\item two\n\\end{itemize}");
    expect(tex).toContain("\\begin{enumerate}");
    expect(tex).toContain("\\begin{tabular}{ll}");
    expect(tex).toContain("A & B\\_c \\\\");
  });
});

describe("toBibtex", () => {
  it("writes the record's own fields and nothing else", () => {
    expect(toBibtex([numpy])).toBe(
      [
        "@article{doi_10_1038_numpy,",
        "  author = {Harris, Charles R. and van der Walt, Stéfan J.},",
        "  title = {{Array programming with NumPy}},",
        "  journal = {Nature},",
        "  year = {2020},",
        "  volume = {585},",
        "  number = {7825},",
        "  pages = {357--362},",
        "  doi = {10.1038/s41586-020-2649-2}",
        "}",
      ].join("\n")
    );
    expect(toBibtex([{ id: "x", kind: "other", title: "Notes", authors: [], registry: "author" }])).toBe("@misc{x,\n  title = {{Notes}}\n}");
  });
});

describe("buildLatex", () => {
  const base = {
    style: "apa" as const,
    title: "Sleep & memory",
    journal: "Journal of Tests",
    authors: [{ name: "Ada Lovelace", affiliation: "UCL", email: "ada@ucl.ac.uk" }],
    abstract: "We tested recall.",
    keywords: ["sleep", "memory"],
    body: "### § Introduction\n\nArrays [CITE:doi_10_1038_numpy]. Unknown [CITE:ghost].",
    declarations: [{ label: "Funding", text: "Wellcome grant 123." }],
    records: { doi_10_1038_numpy: numpy },
  };

  it.each<[LatexTemplate, string[]]>([
    ["elsarticle", ["\\documentclass[preprint,12pt,authoryear]{elsarticle}", "\\journal{Journal of Tests}", "\\begin{keyword}\nsleep \\sep memory\n\\end{keyword}", "~\\citep{doi_10_1038_numpy}", "\\bibliographystyle{elsarticle-harv}"]],
    ["ieeetran", ["\\documentclass[journal]{IEEEtran}", "\\begin{IEEEkeywords}", "~\\cite{doi_10_1038_numpy}", "\\bibliographystyle{IEEEtran}", "Ada Lovelace is with UCL (e-mail: ada@ucl.ac.uk)."]],
    ["sn-jnl", ["\\documentclass[pdflatex,sn-apa]{sn-jnl}", "\\author*[1]{\\fnm{Ada} \\sur{Lovelace}}\\email{ada@ucl.ac.uk}", "\\affil*[1]{\\orgname{UCL}}", "\\abstract{We tested recall.}", "\\backmatter", "\\bmhead{Funding}", "~\\citep{doi_10_1038_numpy}"]],
    ["article", ["\\documentclass[11pt,a4paper]{article}", "\\usepackage[authoryear,round]{natbib}", "~\\citep{doi_10_1038_numpy}", "\\bibliographystyle{plainnat}"]],
  ])("%s: uses the publisher's own commands", (template, expected) => {
    const out = buildLatex({ ...base, template });
    for (const e of expected) expect(out.tex).toContain(e);
    expect(out.tex).toContain("\\title{Sleep \\& memory}");
    expect(out.tex).toContain("[ghost]");
    expect(out.missing).toEqual(["ghost"]);
    expect(out.bib).toContain("@article{doi_10_1038_numpy,");
  });

  it("numeric styles use numeric classes", () => {
    expect(buildLatex({ ...base, template: "elsarticle", style: "ieee" }).tex).toContain("\\bibliographystyle{elsarticle-num}");
    expect(buildLatex({ ...base, template: "sn-jnl", style: "vancouver" }).tex).toContain("sn-vancouver-num");
  });

  it("prints nothing the author didn't give: no authors, abstract, declarations or bibliography", () => {
    const out = buildLatex({ ...base, template: "elsarticle", authors: [], abstract: "", keywords: [], declarations: [], body: "### § Introduction\n\nNo citations.", records: {} });
    expect(out.tex).not.toMatch(/\\author|\\begin\{abstract\}|\\begin\{keyword\}|Funding|\\bibliography/);
    expect(out.bib).toBe("");
  });
});

describe("exportParts and suggestTemplate", () => {
  it("moves the abstract to the front and drops a hand-made list when citations will build one", () => {
    const md = "### § Abstract\n\nShort.\n\n### § Introduction\n\nText [CITE:a].\n\n## References\n\nOld list.";
    expect(exportParts(md)).toEqual({ abstract: "Short.", body: "### § Introduction\n\nText [CITE:a]." });
    expect(exportParts("### § Intro\n\nNo cites.\n\n## References\n\nKept.").body).toContain("Kept.");
  });

  it("suggests the class from the journal or publisher", () => {
    expect(suggestTemplate("IEEE Transactions on Software Engineering")).toBe("ieeetran");
    expect(suggestTemplate("The Lancet")).toBe("elsarticle");
    expect(suggestTemplate("Nature Communications")).toBe("sn-jnl");
    expect(suggestTemplate("PLOS ONE")).toBe("article");
  });
});
