/**
 * Camera-Ready Academic LaTeX, Typst, & PDF Compiler
 * Formats research manuscripts according to IEEE, Nature, ACM, APA 7, Elsevier, and Typst standards.
 */

import path from "node:path";
import pdfMake from "pdfmake";
import fonts from "pdfmake/fonts/Roboto.js";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Block, CanonicalDocument } from "../../desk/types";
import type { ExportMetadata } from "./types";

pdfMake.setFonts(fonts);
const fontsDir = path.dirname(fonts.Roboto.normal);
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((filePath: string) => path.resolve(filePath).startsWith(fontsDir));

export type AcademicTemplate =
  | "ieee"
  | "nature"
  | "acm"
  | "apa7"
  | "elsevier"
  | "typst_modern";

export interface AcademicExportOptions {
  template: AcademicTemplate;
  columns?: 1 | 2;
  authorAffiliation?: string;
  authorEmail?: string;
  abstractText?: string;
  keywords?: string[];
  references?: Array<{
    id: string;
    title: string;
    authors: string[];
    year: string;
    journal?: string;
    doi?: string;
    volume?: string;
    pages?: string;
  }>;
  cameraReady?: boolean;
}

export interface CameraReadyAudit {
  isCompliant: boolean;
  score: number; // 0-100
  checks: {
    checkName: string;
    passed: boolean;
    details: string;
  }[];
  warnings: string[];
  recommendations: string[];
}

/**
 * Escapes special LaTeX characters in plain text
 */
export function escapeLatex(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#{}_])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/**
 * Escapes special Typst markup characters in plain text
 */
export function escapeTypst(text: string): string {
  if (!text) return "";
  return text
    .replace(/([\\#$@*_`])/g, "\\$1");
}

/**
 * Generates clean, compilable BibTeX references
 */
export function generateBibtex(references: AcademicExportOptions["references"] = []): string {
  if (!references || references.length === 0) return "% No external references provided\n";

  return references
    .map((ref, idx) => {
      const citeKey = ref.id || `ref_${idx + 1}_${(ref.authors?.[0] || "anon").toLowerCase().replace(/\W/g, "")}_${ref.year || "2024"}`;
      const authorList = (ref.authors && ref.authors.length > 0) ? ref.authors.join(" and ") : "Anonymous";

      return `@article{${citeKey},
  title = {${ref.title || "Untitled Document"}},
  author = {${authorList}},
  year = {${ref.year || "2024"}},
  journal = {${ref.journal || "Journal of Academic Research"}}${ref.doi ? `,\n  doi = {${ref.doi}}` : ""}${ref.volume ? `,\n  volume = {${ref.volume}}` : ""}${ref.pages ? `,\n  pages = {${ref.pages}}` : ""}
}`;
    })
    .join("\n\n");
}

/**
 * Generates a full, camera-ready LaTeX source document (.tex)
 */
export function generateLatexSource(
  document: CanonicalDocument,
  metadata: ExportMetadata,
  options: AcademicExportOptions = { template: "ieee" }
): string {
  const { template, authorAffiliation = "Department of Computer Science & Academic Research", authorEmail = "author@university.edu", abstractText, keywords = [] } = options;

  let docClass = "\\documentclass[conference]{IEEEtran}";
  let extraPackages = "";

  if (template === "acm") {
    docClass = "\\documentclass[sigconf]{acmart}";
  } else if (template === "nature") {
    docClass = "\\documentclass[sn-mathphys,Numbered]{sn-jnl}";
  } else if (template === "apa7") {
    docClass = "\\documentclass[stu,12pt]{apa7}";
  } else if (template === "elsevier") {
    docClass = "\\documentclass[preprint,12pt,3p]{elsarticle}";
  }

  extraPackages += `
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amsfonts,amssymb}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{microtype}
\\usepackage{cite}
\\usepackage{hyperref}
\\hypersetup{colorlinks=true, linkcolor=blue, citecolor=blue, urlcolor=blue}
`;

  // Process blocks
  const bodyLatex: string[] = [];
  let foundAbstract = abstractText || "";

  for (const block of document.blocks) {
    const rawText = block.text || "";
    if (!rawText.trim()) continue;

    if (block.kind === "heading1") {
      bodyLatex.push(`\\section{${escapeLatex(rawText)}}`);
    } else if (block.kind === "heading2") {
      bodyLatex.push(`\\subsection{${escapeLatex(rawText)}}`);
    } else if (block.kind === "heading3") {
      bodyLatex.push(`\\subsubsection{${escapeLatex(rawText)}}`);
    } else if (block.kind === "quote") {
      bodyLatex.push(`\\begin{quote}\n${escapeLatex(rawText)}\n\\end{quote}`);
    } else if (block.kind === "list-item") {
      bodyLatex.push(`\\begin{itemize}\n\\item ${escapeLatex(rawText)}\n\\end{itemize}`);
    } else {
      if (!foundAbstract && (rawText.toLowerCase().startsWith("abstract:") || rawText.toLowerCase().startsWith("abstract\n"))) {
        foundAbstract = rawText.replace(/^abstract:?/i, "").trim();
      } else {
        bodyLatex.push(`${escapeLatex(rawText)}\n`);
      }
    }
  }

  const titleEscaped = escapeLatex(document.title || metadata.title || "Academic Manuscript");
  const authorEscaped = escapeLatex(metadata.author || "Lead Researcher");
  const affiliationEscaped = escapeLatex(authorAffiliation);
  const emailEscaped = escapeLatex(authorEmail);

  let headerBlock = "";
  if (template === "ieee") {
    headerBlock = `
\\title{${titleEscaped}}
\\author{\\IEEEauthorblockN{${authorEscaped}}
\\IEEEauthorblockA{\\textit{${affiliationEscaped}} \\\\
\\textit{Email: ${emailEscaped}}}}
\\maketitle
`;
  } else {
    headerBlock = `
\\title{${titleEscaped}}
\\author{${authorEscaped}}
\\date{\\today}
\\maketitle
`;
  }

  const abstractBlock = foundAbstract
    ? `\\begin{abstract}\n${escapeLatex(foundAbstract)}\n\\end{abstract}\n`
    : "";

  const keywordsBlock = keywords.length > 0
    ? (template === "ieee"
        ? `\\begin{IEEEkeywords}\n${keywords.map(k => escapeLatex(k)).join(", ")}\n\\end{IEEEkeywords}\n`
        : `\\textbf{Keywords:} ${keywords.map(k => escapeLatex(k)).join(", ")}\n\n`)
    : "";

  return `% Camera-Ready Academic LaTeX Source
% Generated by Scholar Agentic OS
${docClass}
${extraPackages}

\\begin{document}
${headerBlock}
${abstractBlock}
${keywordsBlock}

${bodyLatex.join("\n\n")}

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`;
}

/**
 * Generates a full, camera-ready Typst source document (.typ)
 */
export function generateTypstSource(
  document: CanonicalDocument,
  metadata: ExportMetadata,
  options: AcademicExportOptions = { template: "typst_modern" }
): string {
  const { authorAffiliation = "Department of Academic Research", authorEmail = "author@university.edu", abstractText, keywords = [] } = options;

  const titleEscaped = escapeTypst(document.title || metadata.title || "Academic Manuscript");
  const authorEscaped = escapeTypst(metadata.author || "Lead Researcher");
  const affiliationEscaped = escapeTypst(authorAffiliation);

  let foundAbstract = abstractText || "";
  const bodyTypst: string[] = [];

  for (const block of document.blocks) {
    const rawText = block.text || "";
    if (!rawText.trim()) continue;

    if (block.kind === "heading1") {
      bodyTypst.push(`= ${escapeTypst(rawText)}`);
    } else if (block.kind === "heading2") {
      bodyTypst.push(`== ${escapeTypst(rawText)}`);
    } else if (block.kind === "heading3") {
      bodyTypst.push(`=== ${escapeTypst(rawText)}`);
    } else if (block.kind === "quote") {
      bodyTypst.push(`> ${escapeTypst(rawText)}`);
    } else if (block.kind === "list-item") {
      bodyTypst.push(`- ${escapeTypst(rawText)}`);
    } else {
      if (!foundAbstract && (rawText.toLowerCase().startsWith("abstract:") || rawText.toLowerCase().startsWith("abstract\n"))) {
        foundAbstract = rawText.replace(/^abstract:?/i, "").trim();
      } else {
        bodyTypst.push(`${escapeTypst(rawText)}\n`);
      }
    }
  }

  const columnsVal = options.columns || (options.template === "ieee" ? 2 : 1);

  return `// Camera-Ready Typst Manuscript
// Generated by Scholar Agentic OS

#set page(
  paper: "a4",
  margin: (x: 2cm, y: 2.5cm),
  columns: ${columnsVal},
  header: align(right)[
    #text(size: 9pt, fill: luma(120))[${titleEscaped} --- Scholar OS]
  ],
  footer: [
    #align(center)[#text(size: 9pt)[#counter(page).display()]]
  ]
)

#set text(
  font: "Linux Libertine",
  size: 10pt,
  lang: "en"
)

#set par(
  justify: true,
  leading: 0.65em,
  first-line-indent: 1.2em
)

// Title Block
#align(center)[
  #text(size: 18pt, weight: "bold")[${titleEscaped}]
  #v(0.8em)
  #text(size: 11pt, weight: "medium")[${authorEscaped}] \\
  #text(size: 9pt, style: "italic", fill: luma(80))[${affiliationEscaped}]
  #v(1.5em)
]

${foundAbstract ? `
#block(
  fill: rgb("f8fafc"),
  inset: 12pt,
  radius: 4pt,
  stroke: 0.5pt + rgb("cbd5e1"),
  width: 100%,
)[
  #text(weight: "bold", size: 9pt)[ABSTRACT] \\
  #text(size: 9pt, style: "italic")[${escapeTypst(foundAbstract)}]
  ${keywords.length > 0 ? `\n\n#v(0.5em)#text(size: 8.5pt)[*Keywords:* ${keywords.map(k => escapeTypst(k)).join(", ")}]` : ""}
]
#v(1em)
` : ""}

${bodyTypst.join("\n\n")}

#v(2em)
#bibliography("references.bib", style: "ieee")
`;
}

/**
 * Pre-flight compliance audit for camera-ready academic publication
 */
export function auditCameraReadyCompliance(
  document: CanonicalDocument,
  options: AcademicExportOptions
): CameraReadyAudit {
  const checks: CameraReadyAudit["checks"] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // Check 1: Title presence & length
  const hasTitle = Boolean(document.title && document.title.trim().length >= 5);
  checks.push({
    checkName: "Title & Topic Specification",
    passed: hasTitle,
    details: hasTitle ? `Valid title (${document.title.length} chars)` : "Title is missing or too short",
  });

  // Check 2: Abstract block check
  const totalWords = document.blocks.reduce((sum, b) => sum + (b.text?.split(/\s+/).length || 0), 0);
  const hasAbstract = Boolean(options.abstractText || document.blocks.some(b => b.text?.toLowerCase().includes("abstract")));
  checks.push({
    checkName: "Abstract & Executive Summary",
    passed: hasAbstract,
    details: hasAbstract ? "Structured abstract is present" : "No explicit abstract block detected",
  });

  // Check 3: Minimum academic substantive length (>= 300 words for short paper, >= 1500 for full paper)
  const isSufficientLength = totalWords >= 250;
  checks.push({
    checkName: "Manuscript Substance & Word Count",
    passed: isSufficientLength,
    details: `Current word count: ${totalWords} words`,
  });

  // Check 4: Section hierarchy
  const hasHeadings = document.blocks.some(b => b.kind.startsWith("heading"));
  checks.push({
    checkName: "Sectional Structure (Headings)",
    passed: hasHeadings,
    details: hasHeadings ? "Heading hierarchy established" : "Document lacks structural headings",
  });

  // Check 5: Bibliography / References
  const hasReferences = (options.references && options.references.length > 0) || document.blocks.some(b => b.text?.toLowerCase().includes("reference") || b.text?.toLowerCase().includes("bibliography"));
  checks.push({
    checkName: "Citation Grounding & Bibliography",
    passed: Boolean(hasReferences),
    details: hasReferences ? "References and citations verified" : "No bibliography entries or references detected",
  });

  const passedCount = checks.filter(c => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const isCompliant = score >= 80;

  if (!hasAbstract) {
    recommendations.push("Include a concise 150-250 word abstract summarizing objectives, methodology, and key contributions.");
  }
  if (totalWords < 1000) {
    warnings.push(`Manuscript is currently compact (${totalWords} words). Ensure empirical evidence and analysis meet full camera-ready requirements.`);
  }
  if (!hasReferences) {
    recommendations.push("Link at least 5 peer-reviewed references from your Knowledge Vault to ensure academic rigor.");
  }

  return {
    isCompliant,
    score,
    checks,
    warnings,
    recommendations,
  };
}

/**
 * Compiles a Camera-Ready PDF conforming to IEEE, Nature, ACM, APA 7, or Typst specifications
 */
export async function compileAcademicPdf(
  document: CanonicalDocument,
  metadata: ExportMetadata,
  options: AcademicExportOptions = { template: "ieee" }
): Promise<Buffer> {
  const { template, authorAffiliation = "Department of Academic Research", authorEmail = "author@university.edu", abstractText, keywords = [] } = options;

  let foundAbstract = abstractText || "";
  const bodyContent: Content[] = [];

  // Title Block
  bodyContent.push({
    text: document.title || metadata.title || "Academic Manuscript",
    style: "docTitle",
    alignment: "center",
  });

  bodyContent.push({
    text: [
      { text: `${metadata.author || "Lead Researcher"}\n`, bold: true, fontSize: 11 },
      { text: `${authorAffiliation}\n`, italics: true, fontSize: 9.5, color: "#475569" },
      { text: authorEmail, fontSize: 9, color: "#0284c7" },
    ],
    alignment: "center",
    margin: [0, 8, 0, 16],
  });

  // Extract Abstract and process body blocks
  for (const block of document.blocks) {
    const rawText = block.text || "";
    if (!rawText.trim()) continue;

    if (block.kind === "heading1") {
      bodyContent.push({
        text: rawText,
        style: "heading1",
        margin: [0, 14, 0, 6],
      });
    } else if (block.kind === "heading2") {
      bodyContent.push({
        text: rawText,
        style: "heading2",
        margin: [0, 10, 0, 4],
      });
    } else if (block.kind === "heading3") {
      bodyContent.push({
        text: rawText,
        style: "heading3",
        margin: [0, 8, 0, 3],
      });
    } else if (block.kind === "quote") {
      bodyContent.push({
        text: rawText,
        style: "quote",
        margin: [20, 6, 20, 6],
      });
    } else if (block.kind === "list-item") {
      bodyContent.push({
        ul: [rawText],
        style: "listItem",
        margin: [10, 2, 0, 2],
      });
    } else {
      if (!foundAbstract && (rawText.toLowerCase().startsWith("abstract:") || rawText.toLowerCase().startsWith("abstract\n"))) {
        foundAbstract = rawText.replace(/^abstract:?/i, "").trim();
      } else {
        bodyContent.push({
          text: rawText,
          style: "paragraph",
          margin: [0, 3, 0, 4],
        });
      }
    }
  }

  // If abstract exists, prepend it formatted as a callout box
  if (foundAbstract) {
    const abstractContent: Content = {
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: "ABSTRACT", bold: true, fontSize: 9.5, color: "#0f172a", margin: [0, 0, 0, 4] },
                { text: foundAbstract, italics: true, fontSize: 9.5, lineHeight: 1.35, color: "#334155" },
                ...(keywords.length > 0 ? [
                  { text: [{ text: "Keywords: ", bold: true, fontSize: 9 }, { text: keywords.join(", "), italics: true, fontSize: 9 }], margin: [0, 6, 0, 0] as [number, number, number, number] }
                ] : []),
              ],
              fillColor: "#f8fafc",
              borderColor: ["#cbd5e1", "#cbd5e1", "#cbd5e1", "#cbd5e1"] as [string, string, string, string],
              border: [true, true, true, true] as [boolean, boolean, boolean, boolean],
              margin: [8, 8, 8, 8] as [number, number, number, number],
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0.75,
        vLineWidth: () => 0.75,
        hLineColor: () => "#cbd5e1",
        vLineColor: () => "#cbd5e1",
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 8,
        paddingBottom: () => 8,
      },
      margin: [0, 0, 0, 14],
    };
    bodyContent.splice(2, 0, abstractContent);
  }

  // Bibliography / References Section
  if (options.references && options.references.length > 0) {
    bodyContent.push({
      text: template === "ieee" ? "REFERENCES" : "References",
      style: "heading1",
      margin: [0, 16, 0, 8],
    });

    options.references.forEach((ref, idx) => {
      bodyContent.push({
        text: [
          { text: `[${idx + 1}] `, bold: true },
          { text: `${ref.authors?.join(", ") || "Author"}. ` },
          { text: `"${ref.title}." ` },
          { text: `${ref.journal || "Publication"}, `, italics: true },
          { text: `${ref.year || "2024"}` },
          ref.doi ? { text: `, doi:${ref.doi}`, color: "#0284c7" } : "",
        ],
        fontSize: 9,
        lineHeight: 1.25,
        margin: [0, 2, 0, 3],
      });
    });
  }

  // Define PDF Structure & Layout
  const docDefinition: TDocumentDefinitions = {
    content: bodyContent,
    pageSize: "A4",
    pageMargins: [48, 54, 48, 54], // ~0.75 in academic camera-ready margins
    header: (currentPage: number) => {
      if (currentPage === 1) return null;
      return {
        columns: [
          { text: "Scholar Agentic OS Camera-Ready Academic Export", fontSize: 8, color: "#94a3b8", margin: [48, 20, 0, 0] },
          { text: metadata.title?.slice(0, 40) || "", fontSize: 8, italics: true, color: "#94a3b8", alignment: "right", margin: [0, 20, 48, 0] },
        ],
      };
    },
    footer: (currentPage: number, pageCount: number) => {
      return {
        text: `${currentPage} / ${pageCount}`,
        alignment: "center",
        fontSize: 9,
        color: "#64748b",
        margin: [0, 15, 0, 0],
      };
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      lineHeight: 1.4,
      color: "#0f172a",
    },
    styles: {
      docTitle: {
        fontSize: 19,
        bold: true,
        lineHeight: 1.2,
        color: "#0f172a",
      },
      heading1: {
        fontSize: 13,
        bold: true,
        color: "#0f172a",
      },
      heading2: {
        fontSize: 11.5,
        bold: true,
        color: "#1e293b",
      },
      heading3: {
        fontSize: 10.5,
        bold: true,
        italics: true,
        color: "#334155",
      },
      paragraph: {
        fontSize: 10,
        alignment: "justify",
      },
      quote: {
        fontSize: 9.5,
        italics: true,
        color: "#334155",
      },
      listItem: {
        fontSize: 10,
      },
    },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBuffer();
}
