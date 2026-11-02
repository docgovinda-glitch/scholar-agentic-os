/**
 * The manuscript as a LaTeX project for a publisher's own class: Elsevier
 * (elsarticle), IEEE (IEEEtran), Springer Nature (sn-jnl), or plain article.
 * Text is escaped, the light Markdown the Studio writes becomes LaTeX, and
 * [CITE:id] becomes \cite{key} against a .bib built from the reference
 * records. Only what the author entered is printed. Pure; no I/O.
 */
import type { ReferenceRecord } from "./references";
import { citedIds, isNumeric, withoutReferenceSection, type StyleKey } from "./citationStyles";

export type LatexTemplate = "elsarticle" | "ieeetran" | "sn-jnl" | "article";

export const LATEX_TEMPLATES: Array<{ id: LatexTemplate; label: string; publisher: string; classUrl: string }> = [
  { id: "elsarticle", label: "Elsevier (elsarticle)", publisher: "Elsevier", classUrl: "https://ctan.org/pkg/elsarticle" },
  { id: "ieeetran", label: "IEEE Transactions (IEEEtran)", publisher: "IEEE", classUrl: "https://ctan.org/pkg/ieeetran" },
  { id: "sn-jnl", label: "Springer Nature (sn-jnl)", publisher: "Springer Nature", classUrl: "https://www.springernature.com/gp/authors/campaigns/latex-author-support" },
  { id: "article", label: "Generic article", publisher: "", classUrl: "" },
];

/** A guess from the journal's name or publisher; the author can change it. */
export function suggestTemplate(journalOrPublisher: string): LatexTemplate {
  const s = journalOrPublisher.toLowerCase();
  if (/\bieee\b/.test(s)) return "ieeetran";
  if (/elsevier|cell press|the lancet|sciencedirect/.test(s)) return "elsarticle";
  if (/springer|nature|biomed central|\bbmc\b|palgrave/.test(s)) return "sn-jnl";
  return "article";
}

// ── Text ─────────────────────────────────────────────────────────────────

/** Escapes LaTeX's special characters in plain text. */
export function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, "\u0000")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\u0000/g, "\\textbackslash{}")
    .replace(/</g, "\\textless{}")
    .replace(/>/g, "\\textgreater{}");
}

/** A citation key that BibTeX accepts. */
export const bibKey = (id: string) => id.replace(/[^A-Za-z0-9_:-]/g, "_");

/** Inline Markdown (bold, italic, citations) to LaTeX, escaping everything else. */
export function inlineLatex(src: string, cite: (keys: string[]) => string): string {
  const out: string[] = [];
  const re = /((?:\[CITE:[A-Za-z0-9_.:-]+\][ \t]*[;,]?[ \t]*)*\[CITE:[A-Za-z0-9_.:-]+\])|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    out.push(escapeLatex(src.slice(last, m.index)));
    if (m[1]) out.push(cite([...m[1].matchAll(/\[CITE:([A-Za-z0-9_.:-]+)\]/g)].map((x) => bibKey(x[1]))));
    else if (m[2]) out.push(`\\textbf{${inlineLatex(m[2], cite)}}`);
    else if (m[3]) out.push(`\\emph{${inlineLatex(m[3], cite)}}`);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(escapeLatex(src.slice(last)));
  return out.join("").replace(/ (\\cite[pt]?\{)/g, "~$1");
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/**
 * Block Markdown to LaTeX. Headings: "### § Title" or "## Title" → \section,
 * "####" → \subsection. Lists, pipe tables and paragraphs are converted;
 * everything else is escaped text.
 */
export function bodyLatex(markdown: string, cite: (keys: string[]) => string): string {
  const blocks = markdown.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out: string[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const h = lines.length === 1 ? lines[0].match(/^(#{1,6})\s+(?:§\s*)?(.+)$/) : null;
    if (h) {
      const level = h[1].length;
      const title = inlineLatex(h[2].replace(/^\d+(\.\d+)*\.?\s+/, ""), cite);
      out.push(level >= 4 ? `\\subsection{${title}}` : `\\section{${title}}`);
    } else if (lines.every((l) => /^[-*] /.test(l))) {
      out.push(["\\begin{itemize}", ...lines.map((l) => `  \\item ${inlineLatex(l.slice(2), cite)}`), "\\end{itemize}"].join("\n"));
    } else if (lines.every((l) => /^\d+\. /.test(l))) {
      out.push(["\\begin{enumerate}", ...lines.map((l) => `  \\item ${inlineLatex(l.replace(/^\d+\. /, ""), cite)}`), "\\end{enumerate}"].join("\n"));
    } else if (lines.length >= 2 && lines.every(isTableRow) && isRule(lines[1])) {
      const head = cells(lines[0]);
      const rows = lines.slice(2).map(cells);
      out.push(
        [
          "\\begin{table}[htbp]",
          "\\centering",
          `\\begin{tabular}{${"l".repeat(head.length)}}`,
          "\\hline",
          `${head.map((c) => inlineLatex(c, cite)).join(" & ")} \\\\`,
          "\\hline",
          ...rows.map((r) => `${r.map((c) => inlineLatex(c, cite)).join(" & ")} \\\\`),
          "\\hline",
          "\\end{tabular}",
          "\\end{table}",
        ].join("\n")
      );
    } else {
      out.push(lines.map((l) => inlineLatex(l, cite)).join("\n"));
    }
  }
  return out.join("\n\n");
}

// ── BibTeX ───────────────────────────────────────────────────────────────

const bibValue = (s: string) => s.replace(/[{}]/g, "").replace(/([#$%&_])/g, "\\$1");

export function toBibtex(records: ReferenceRecord[]): string {
  return records
    .map((r) => {
      const type = r.kind === "article" ? "article" : r.kind === "book" ? "book" : r.kind === "chapter" ? "incollection" : "misc";
      const fields: Array<[string, string | undefined]> = [
        ["author", r.authors.length ? r.authors.map((a) => (a.given ? `${bibValue(a.family)}, ${bibValue(a.given)}` : `{${bibValue(a.family)}}`)).join(" and ") : undefined],
        // Double braces keep the title's capitalisation as written.
        ["title", r.title ? `{${bibValue(r.title)}}` : undefined],
        [type === "article" ? "journal" : type === "incollection" ? "booktitle" : "howpublished", r.container ? bibValue(r.container) : undefined],
        ["year", r.year ? String(r.year) : undefined],
        ["volume", r.volume],
        ["number", r.issue],
        ["pages", r.pages?.replace(/\s*[-–]+\s*/g, "--")],
        ["publisher", r.publisher ? bibValue(r.publisher) : undefined],
        ["doi", r.doi],
        ["url", !r.doi ? r.url : undefined],
        ["note", r.kind === "dataset" ? "Dataset" : undefined],
      ];
      const body = fields.filter(([, v]) => v).map(([k, v]) => `  ${k} = {${v}}`).join(",\n");
      return `@${type}{${bibKey(r.id)},\n${body}\n}`;
    })
    .join("\n\n");
}

// ── Whole document ───────────────────────────────────────────────────────

export interface LatexAuthor {
  name: string;
  affiliation?: string;
  email?: string;
  orcid?: string;
}

export interface LatexInput {
  template: LatexTemplate;
  style: StyleKey;
  title: string;
  journal?: string;
  authors: LatexAuthor[];
  abstract?: string;
  keywords?: string[];
  /** Manuscript Markdown without its abstract. */
  body: string;
  declarations: Array<{ label: string; text: string }>;
  records: Record<string, ReferenceRecord>;
}

export interface LatexProject {
  tex: string;
  bib: string;
  /** Cited ids with no record; they stay as text "[id]". */
  missing: string[];
}

const splitName = (n: string) => {
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] } : { given: "", family: n.trim() };
};

export function buildLatex(input: LatexInput): LatexProject {
  const numeric = isNumeric(input.style);
  const ids = citedIds(input.body);
  const missing = ids.filter((id) => !input.records[id]);
  const known = new Set(ids.filter((id) => input.records[id]).map(bibKey));
  // Author-year classes load natbib, where \cite is textual; parenthetical needs \citep.
  const citeCmd = !numeric && (input.template === "elsarticle" || input.template === "sn-jnl") ? "\\citep" : "\\cite";
  const cite = (keys: string[]) => {
    const ok = keys.filter((k) => known.has(k));
    const bad = keys.filter((k) => !known.has(k)).map((k) => `[${escapeLatex(k)}]`);
    return [ok.length ? `${citeCmd}{${ok.join(",")}}` : "", ...bad].filter(Boolean).join(" ");
  };

  const body = bodyLatex(input.body, cite);
  const t = (s: string) => inlineLatex(s, cite);
  const title = t(input.title || "Untitled manuscript");
  const abstract = input.abstract?.trim() ? t(input.abstract.trim()) : "";
  const keywords = (input.keywords ?? []).map((k) => k.trim()).filter(Boolean).map(t);
  const authors = input.authors.filter((a) => a.name.trim());
  const back = input.declarations.length
    ? input.declarations.map((d) => (input.template === "sn-jnl" ? `\\bmhead{${t(d.label)}}\n${t(d.text)}` : `\\section*{${t(d.label)}}\n${t(d.text)}`)).join("\n\n")
    : "";
  const bibRecords = ids.filter((id) => input.records[id]).map((id) => input.records[id]);
  const hasBib = bibRecords.length > 0;

  let tex: string;
  switch (input.template) {
    case "elsarticle": {
      const authorTex = authors
        .map((a, i) => [`\\author${a.affiliation ? `[${i + 1}]` : ""}{${t(a.name)}}`, a.email ? `\\ead{${escapeLatex(a.email)}}` : ""].filter(Boolean).join("\n"))
        .join("\n");
      const affTex = authors.map((a, i) => (a.affiliation ? `\\affiliation[${i + 1}]{organization={${t(a.affiliation)}}}` : "")).filter(Boolean).join("\n");
      tex = [
        `\\documentclass[preprint,12pt${numeric ? "" : ",authoryear"}]{elsarticle}`,
        `\\usepackage{amsmath,amssymb}`,
        `\\usepackage{graphicx}`,
        input.journal ? `\\journal{${t(input.journal)}}` : "",
        `\\begin{document}`,
        `\\begin{frontmatter}`,
        `\\title{${title}}`,
        authorTex,
        affTex,
        abstract ? `\\begin{abstract}\n${abstract}\n\\end{abstract}` : "",
        keywords.length ? `\\begin{keyword}\n${keywords.join(" \\sep ")}\n\\end{keyword}` : "",
        `\\end{frontmatter}`,
        body,
        back,
        hasBib ? `\\bibliographystyle{${numeric ? "elsarticle-num" : "elsarticle-harv"}}\n\\bibliography{references}` : "",
        `\\end{document}`,
      ].filter(Boolean).join("\n\n");
      break;
    }
    case "ieeetran": {
      const names = authors.map((a) => t(a.name)).join(", ");
      const thanks = authors
        .filter((a) => a.affiliation || a.email)
        .map((a) => `${t(a.name)}${a.affiliation ? ` is with ${t(a.affiliation)}` : ""}${a.email ? ` (e-mail: ${escapeLatex(a.email)})` : ""}.`)
        .join(" ");
      tex = [
        `\\documentclass[journal]{IEEEtran}`,
        `\\usepackage{amsmath,amssymb}`,
        `\\usepackage{graphicx}`,
        `\\usepackage{cite}`,
        `\\begin{document}`,
        `\\title{${title}}`,
        names ? `\\author{${names}${thanks ? `\\thanks{${thanks}}` : ""}}` : "",
        `\\maketitle`,
        abstract ? `\\begin{abstract}\n${abstract}\n\\end{abstract}` : "",
        keywords.length ? `\\begin{IEEEkeywords}\n${keywords.join(", ")}\n\\end{IEEEkeywords}` : "",
        body,
        back,
        hasBib ? `\\bibliographystyle{IEEEtran}\n\\bibliography{references}` : "",
        `\\end{document}`,
      ].filter(Boolean).join("\n\n");
      break;
    }
    case "sn-jnl": {
      // The reference style is a class option in the Springer Nature template.
      const option = {
        vancouver: "sn-vancouver-num",
        ieee: "sn-mathphys-num",
        apa: "sn-apa",
        chicago: "sn-chicago",
        harvard: "sn-mathphys-ay",
        mla: "sn-mathphys-ay",
      }[input.style];
      const authorTex = authors
        .map((a, i) => {
          const n = splitName(a.name);
          const star = i === 0 && a.email ? "*" : "";
          return [`\\author${star}[${i + 1}]{${n.given ? `\\fnm{${t(n.given)}} ` : ""}\\sur{${t(n.family)}}}`, a.email ? `\\email{${escapeLatex(a.email)}}` : ""].filter(Boolean).join("");
        })
        .join("\n");
      const affTex = authors.map((a, i) => (a.affiliation ? `\\affil${i === 0 && a.email ? "*" : ""}[${i + 1}]{\\orgname{${t(a.affiliation)}}}` : "")).filter(Boolean).join("\n");
      tex = [
        `\\documentclass[pdflatex,${option}]{sn-jnl}`,
        `\\usepackage{amsmath,amssymb}`,
        `\\usepackage{graphicx}`,
        `\\begin{document}`,
        `\\title{${title}}`,
        authorTex,
        affTex,
        abstract ? `\\abstract{${abstract}}` : "",
        keywords.length ? `\\keywords{${keywords.join(", ")}}` : "",
        `\\maketitle`,
        body,
        back ? `\\backmatter\n\n${back}` : "",
        hasBib ? `\\bibliography{references}` : "",
        `\\end{document}`,
      ].filter(Boolean).join("\n\n");
      break;
    }
    default: {
      tex = [
        `\\documentclass[11pt,a4paper]{article}`,
        `\\usepackage[utf8]{inputenc}`,
        `\\usepackage[T1]{fontenc}`,
        `\\usepackage{amsmath,amssymb}`,
        `\\usepackage{graphicx}`,
        `\\usepackage[${numeric ? "numbers" : "authoryear"},round]{natbib}`,
        `\\usepackage{hyperref}`,
        `\\title{${title}}`,
        authors.length ? `\\author{${authors.map((a) => `${t(a.name)}${a.affiliation ? `\\\\ ${t(a.affiliation)}` : ""}`).join(" \\and ")}}` : `\\author{}`,
        `\\date{}`,
        `\\begin{document}`,
        `\\maketitle`,
        abstract ? `\\begin{abstract}\n${abstract}\n\\end{abstract}` : "",
        keywords.length ? `\\noindent\\textbf{Keywords:} ${keywords.join(", ")}` : "",
        body.replace(/\\cite\{/g, numeric ? "\\cite{" : "\\citep{"),
        back,
        hasBib ? `\\bibliographystyle{${numeric ? "unsrtnat" : "plainnat"}}\n\\bibliography{references}` : "",
        `\\end{document}`,
      ].filter(Boolean).join("\n\n");
    }
  }
  return { tex: `${tex}\n`, bib: hasBib ? `${toBibtex(bibRecords)}\n` : "", missing };
}

/**
 * The manuscript split for structured formats: the abstract goes to the front
 * matter, and a hand-made References section is dropped when citations will
 * produce the list instead.
 */
export function exportParts(markdown: string): { abstract: string; body: string } {
  const m = markdown.match(/(^|\n)(#{1,6}\s*(?:§\s*)?Abstract\s*\n)([\s\S]*?)(?=\n#{1,6}\s|$)/i);
  const abstract = m ? m[3].trim() : "";
  let body = m ? markdown.replace(m[0], m[1]) : markdown;
  if (citedIds(body).length > 0) body = withoutReferenceSection(body);
  return { abstract, body: body.trim() };
}

/** Where the publisher's class comes from, for the package README. */
export function packageReadme(template: LatexTemplate, journal: string): string {
  const t = LATEX_TEMPLATES.find((x) => x.id === template)!;
  return [
    `LaTeX source${journal ? ` prepared for ${journal}` : ""}.`,
    "",
    "Files: main.tex (the manuscript) and references.bib (the cited references).",
    t.classUrl
      ? `Class: ${t.label}. It is not included; get it from ${t.classUrl} (it is already on Overleaf and in full TeX Live installs).`
      : "Class: the standard LaTeX article class with natbib.",
    "Build: pdflatex main, bibtex main, pdflatex main, pdflatex main.",
    "Check the journal's own author instructions for anything this package does not set (line numbers, figures, cover page).",
    "",
  ].join("\n");
}
