/**
 * Thesis as LaTeX: the standard report class (chapters, table of contents,
 * natbib), built from the student's own text and the reference records they
 * added. Uses the journal's escaping, Markdown conversion and BibTeX. Pure.
 */
import { bibKey, bodyLatex, escapeLatex, inlineLatex, toBibtex } from "../../domain/journal/latex";
import { citedIds, isNumeric } from "../../domain/journal/citationStyles";
import type { ThesisProjectData } from "./thesisModel";

export interface ThesisLatex {
  tex: string;
  /** Empty when no chapter cites a recorded source. */
  bib: string;
  /** Tags with no record; printed as "[id]". */
  missing: string[];
  readme: string;
}

export function buildThesisLatex(data: ThesisProjectData): ThesisLatex {
  const style = data.citationStyle ?? "apa";
  const numeric = isNumeric(style);
  const records = data.references ?? {};
  const ids = citedIds(data.chapters.map((c) => c.content ?? "").join("\n"));
  const cited = ids.filter((id) => records[id]);
  const known = new Set(cited.map(bibKey));
  const missing = ids.filter((id) => !records[id]);
  const cite = (keys: string[]) => {
    const ok = keys.filter((k) => known.has(k));
    const bad = keys.filter((k) => !known.has(k)).map((k) => `[${escapeLatex(k)}]`);
    return [ok.length ? `${numeric ? "\\cite" : "\\citep"}{${ok.join(",")}}` : "", ...bad].filter(Boolean).join(" ");
  };
  const t = (s: string) => inlineLatex(s, cite);

  const meta = [data.degreeLevel, data.fieldOfStudy].filter((x) => x && x.trim()).map(t);
  const rqs = data.researchQuestions.filter((q) => q.trim());
  const chapters = data.chapters.map((c) => {
    const body = c.content?.trim() ? bodyLatex(c.content, cite) : "\\textit{[Not drafted yet]}";
    // References an AI draft listed for this chapter: kept as the student accepted them.
    const own = c.bibliography?.trim()
      ? `\\section*{References cited in this chapter}\n\n${c.bibliography
          .replace(/^#+\s*References\s*\n/i, "")
          .split(/\n\s*\n/)
          .map((b) => t(b.trim().replace(/\n/g, " ")))
          .filter(Boolean)
          .join("\n\n")}`
      : "";
    return [`\\chapter{${t(c.title)}}`, body, own].filter(Boolean).join("\n\n");
  });

  const tex = [
    "\\documentclass[12pt,a4paper,oneside]{report}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage{amsmath,amssymb}",
    "\\usepackage{graphicx}",
    "\\usepackage[margin=2.5cm]{geometry}",
    "\\usepackage{setspace}",
    "\\onehalfspacing",
    `\\usepackage[${numeric ? "numbers,square" : "authoryear,round"}]{natbib}`,
    "\\usepackage{hyperref}",
    "\\begin{document}",
    [
      "\\begin{titlepage}",
      "\\centering",
      "\\vspace*{3cm}",
      `{\\LARGE\\bfseries ${t(data.title)}\\par}`,
      ...(meta.length ? ["\\vspace{1.5cm}", `{\\large ${meta.join(" \\\\[0.5em] ")}\\par}`] : []),
      "\\end{titlepage}",
    ].join("\n"),
    "\\tableofcontents",
    rqs.length
      ? [
          "\\chapter*{Research questions}",
          "\\addcontentsline{toc}{chapter}{Research questions}",
          "\\begin{enumerate}",
          ...rqs.map((q) => `  \\item ${t(q.trim())}`),
          "\\end{enumerate}",
        ].join("\n")
      : "",
    ...chapters,
    cited.length
      ? `\\renewcommand{\\bibname}{${style === "mla" ? "Works Cited" : "References"}}\n\\bibliographystyle{${numeric ? "unsrtnat" : "plainnat"}}\n\\bibliography{references}`
      : "",
    "\\end{document}",
  ]
    .filter(Boolean)
    .join("\n\n");

  const readme = [
    "LaTeX source of the thesis.",
    "",
    "Files: main.tex (the thesis, standard report class) and references.bib (the sources cited in the chapters).",
    "Build: pdflatex main, bibtex main, pdflatex main, pdflatex main. Every package used is in a standard TeX Live install and on Overleaf.",
    `Citations: natbib ${numeric ? "numbered (unsrtnat)" : "author-year (plainnat)"}. Universities often supply their own thesis class or reference style; check your graduate school's formatting rules (spacing, margins, front matter, declaration pages) and swap them in.`,
    "",
  ].join("\n");

  return { tex: `${tex}\n`, bib: cited.length ? `${toBibtex(cited.map((id) => records[id]))}\n` : "", missing, readme };
}
