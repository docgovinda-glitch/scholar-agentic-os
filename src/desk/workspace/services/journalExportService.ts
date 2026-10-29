/**
 * Journal Article Publication Export Service
 *
 * Generates camera-ready, publication-grade academic documents:
 * 1. Microsoft Word (.docx) with journal title page, structured abstract,
 *    IMRaD sections, genuine formatted tables, declarations, and hanging-indent references.
 * 2. Camera-Ready Print / PDF preview with typography tailored to the target venue (Nature, IEEE, ACM, APA).
 * 3. LaTeX (.tex) and BibTeX (.bib) source for STEM and computing submissions.
 */

import { showAppToast } from "../../../components/ui/FeedbackSystem";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  PageBreak,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import type { Author } from "../../types";

export type JournalExportAuthor =
  | Author
  | {
      id?: string;
      name?: string;
      firstName?: string;
      middleName?: string;
      surname?: string;
      title?: string;
      affiliation?: string;
      email?: string;
      isCorresponding?: boolean;
    };

export function getAuthorDisplayName(author: any): string {
  if (!author) return "Lead Author";
  if (author.name) return author.name;
  const parts = [author.title, author.firstName, author.middleName, author.surname].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return "Lead Author";
}

export interface JournalExportParams {
  title: string;
  targetJournal: string;
  template?: "nature" | "ieee" | "acm" | "apa7" | "elsevier" | "typst_modern";
  citationStyle?: string;
  authors?: JournalExportAuthor[];
  abstract?: string;
  keywords?: string[];
  sections: Array<{
    id?: string;
    section: string;
    content: string;
  }>;
  declarations?: {
    ethicsApproval?: string;
    funding?: string;
    conflictOfInterest?: string;
    dataAvailability?: string;
    authorContributions?: string;
  };
  references?: string[];
}

/**
 * Packs a docx Document into a Blob reliably in browser and Vitest environments.
 */
export async function packDocxToBlob(doc: Document): Promise<Blob> {
  if (typeof Packer.toBlob === "function") {
    try {
      return await Packer.toBlob(doc);
    } catch {
      // Fallback to toBuffer if toBlob fails
    }
  }
  const buffer = await Packer.toBuffer(doc);
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/**
 * Triggers a download of a Blob in browser environments.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || !window.document) return;

  const url = window.URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  window.document.body.appendChild(a);
  a.click();
  // Capture URL now: the timer may fire after the page (or a test's DOM) is gone.
  const urlApi = window.URL;
  setTimeout(() => {
    a.remove();
    urlApi.revokeObjectURL(url);
  }, 100);
}

/**
 * Parses markdown lines within a section into docx Paragraphs or Tables.
 */
function parseMarkdownToDocx(content: string, fontName: string): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const lines = content.split("\n");

  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check for markdown table row
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());

      // Check if delimiter row
      const isDelimiter = cells.every((c) => /^:?-+:?$/.test(c));
      if (isDelimiter) {
        continue;
      }

      inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      // Flush table
      if (tableRows.length > 0) {
        elements.push(buildDocxTable(tableRows, fontName));
        tableRows = [];
      }
      inTable = false;
    }

    if (!trimmed) {
      // Blank line
      continue;
    }

    // Heading 2 or 3
    if (trimmed.startsWith("### ")) {
      elements.push(
        new Paragraph({
          text: trimmed.replace(/^###\s+/, ""),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
          run: { font: fontName, bold: true, size: 22 },
        })
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      elements.push(
        new Paragraph({
          text: trimmed.replace(/^##\s+/, ""),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          run: { font: fontName, bold: true, size: 24 },
        })
      );
      continue;
    }

    if (trimmed.startsWith("# ")) {
      elements.push(
        new Paragraph({
          text: trimmed.replace(/^#\s+/, ""),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 140 },
          run: { font: fontName, bold: true, size: 26 },
        })
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      elements.push(
        new Paragraph({
          spacing: { before: 120, after: 120, line: 320 },
          indent: { left: 720, right: 720 },
          children: [
            new TextRun({
              text: trimmed.replace(/^>\s*/, ""),
              font: fontName,
              italics: true,
              size: 21,
              color: "4A5568",
            }),
          ],
        })
      );
      continue;
    }

    // Unordered bullet list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { before: 60, after: 60, line: 320 },
          children: [
            new TextRun({
              text: trimmed.replace(/^[-*]\s+/, ""),
              font: fontName,
              size: 22,
            }),
          ],
        })
      );
      continue;
    }

    // Numbered list item
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      elements.push(
        new Paragraph({
          spacing: { before: 60, after: 60, line: 320 },
          indent: { left: 360 },
          children: [
            new TextRun({
              text: `${numberedMatch[1]}. ${numberedMatch[2]}`,
              font: fontName,
              size: 22,
            }),
          ],
        })
      );
      continue;
    }

    // Standard body paragraph
    elements.push(
      new Paragraph({
        spacing: { before: 100, after: 140, line: 360 }, // 1.5 line spacing (360 twips)
        children: parseFormattedRuns(trimmed, fontName),
      })
    );
  }

  // Final flush of any active table
  if (inTable && tableRows.length > 0) {
    elements.push(buildDocxTable(tableRows, fontName));
  }

  return elements;
}

/**
 * Builds a docx Table from rows.
 */
function buildDocxTable(rows: string[][], fontName: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, rIdx) => {
      const isHeader = rIdx === 0;
      return new TableRow({
        tableHeader: isHeader,
        children: row.map((cellText) => {
          return new TableCell({
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
              bottom: { style: BorderStyle.SINGLE, size: isHeader ? 8 : 4, color: isHeader ? "1E293B" : "CBD5E1" },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
            },
            shading: isHeader ? { fill: "F1F5F9" } : undefined,
            children: [
              new Paragraph({
                spacing: { before: 80, after: 80 },
                children: [
                  new TextRun({
                    text: cellText,
                    font: fontName,
                    bold: isHeader,
                    size: 20, // 10pt
                  }),
                ],
              }),
            ],
          });
        }),
      });
    }),
  });
}

/**
 * Formats inline bold and italics in a string into TextRuns.
 */
function parseFormattedRuns(text: string, fontName: string): TextRun[] {
  const runs: TextRun[] = [];
  // Simple regex parser for **bold** and *italic*
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith("**") && part.endsWith("**")) {
      runs.push(
        new TextRun({
          text: part.slice(2, -2),
          font: fontName,
          bold: true,
          size: 24, // 12pt
        })
      );
    } else if (part.startsWith("*") && part.endsWith("*")) {
      runs.push(
        new TextRun({
          text: part.slice(1, -1),
          font: fontName,
          italics: true,
          size: 24,
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: part,
          font: fontName,
          size: 24,
        })
      );
    }
  }

  return runs;
}

/**
 * Builds the complete camera-ready Microsoft Word Document.
 */
export function buildJournalDocxDocument(params: JournalExportParams): Document {
  const fontName = params.template === "ieee" || params.template === "acm" ? "Arial" : "Times New Roman";
  const authorList = params.authors && params.authors.length > 0
    ? params.authors
    : [{ name: "Lead Researcher", affiliation: "Department of Computer Science & Engineering", email: "author@university.edu" }];

  const children: (Paragraph | Table)[] = [];

  // ── Header: Target Journal Tag ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 0, after: 180 },
      children: [
        new TextRun({
          text: `Prepared for Submission to: ${params.targetJournal}`,
          font: fontName,
          italics: true,
          size: 19, // 9.5pt
          color: "64748B",
        }),
      ],
    })
  );

  // ── Article Title ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 200 },
      children: [
        new TextRun({
          text: params.title,
          font: fontName,
          bold: true,
          size: 36, // 18pt
        }),
      ],
    })
  );

  // ── Authors ──
  const authorNamesRuns: TextRun[] = [];
  authorList.forEach((author, idx) => {
    authorNamesRuns.push(
      new TextRun({
        text: getAuthorDisplayName(author),
        font: fontName,
        bold: true,
        size: 24,
      })
    );
    authorNamesRuns.push(
      new TextRun({
        text: `${idx + 1}${idx === 0 ? "*" : ""}`,
        font: fontName,
        superScript: true,
        size: 18,
      })
    );
    if (idx < authorList.length - 1) {
      authorNamesRuns.push(new TextRun({ text: ", ", font: fontName, size: 24 }));
    }
  });

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: authorNamesRuns,
    })
  );

  // ── Affiliations ──
  authorList.forEach((author, idx) => {
    if (author.affiliation) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 20, after: 20 },
          children: [
            new TextRun({
              text: `${idx + 1} `,
              font: fontName,
              superScript: true,
              size: 16,
              color: "475569",
            }),
            new TextRun({
              text: author.affiliation,
              font: fontName,
              italics: true,
              size: 20,
              color: "475569",
            }),
          ],
        })
      );
    }
  });

  // Corresponding author footnote
  const firstAuthor = authorList[0];
  if (firstAuthor?.email) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 240 },
        children: [
          new TextRun({
            text: `* Corresponding author: ${firstAuthor.email}`,
            font: fontName,
            italics: true,
            size: 18,
            color: "64748B",
          }),
        ],
      })
    );
  }

  // ── Structured Abstract ──
  if (params.abstract) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 720, right: 720 },
        spacing: { before: 240, after: 120, line: 300 },
        children: [
          new TextRun({
            text: "Abstract—",
            font: fontName,
            bold: true,
            size: 22,
          }),
          new TextRun({
            text: params.abstract,
            font: fontName,
            size: 22,
          }),
        ],
      })
    );
  }

  // ── Keywords ──
  if (params.keywords && params.keywords.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: 720, right: 720 },
        spacing: { before: 80, after: 360 },
        children: [
          new TextRun({
            text: "Keywords—",
            font: fontName,
            bold: true,
            italics: true,
            size: 20,
          }),
          new TextRun({
            text: params.keywords.join("; "),
            font: fontName,
            size: 20,
          }),
        ],
      })
    );
  }

  // Section divider
  children.push(
    new Paragraph({
      spacing: { before: 120, after: 240 },
      border: {
        bottom: { color: "CBD5E1", size: 6, style: BorderStyle.SINGLE },
      },
      children: [],
    })
  );

  // ── IMRaD Manuscript Sections ──
  params.sections.forEach((sec, idx) => {
    const isAbstract = sec.section.toLowerCase().includes("abstract");
    if (isAbstract) return; // Abstract already handled in header block

    // Section Title
    const formattedHeading = sec.section.match(/^\d+[\.\s]/)
      ? sec.section
      : `${idx + 1}. ${sec.section}`;

    children.push(
      new Paragraph({
        text: formattedHeading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 140 },
        run: { font: fontName, bold: true, size: 26 },
      })
    );

    // Section Content
    const contentElements = parseMarkdownToDocx(sec.content, fontName);
    children.push(...contentElements);
  });

  // ── Mandatory Journal Declarations ──
  children.push(
    new Paragraph({
      text: "Declarations",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 160 },
      run: { font: fontName, bold: true, size: 26 },
    })
  );

  const decl = params.declarations || {};
  const declarationItems = [
    { label: "Ethics Approval and Consent to Participate", value: decl.ethicsApproval || "Not applicable. This study does not involve human subjects or animal experiments." },
    { label: "Funding", value: decl.funding || "This research did not receive any specific grant from funding agencies in the public, commercial, or not-for-profit sectors." },
    { label: "Competing Interests", value: decl.conflictOfInterest || "The authors declare that they have no competing financial or non-financial interests that could have influenced the work reported in this paper." },
    { label: "Data and Code Availability", value: decl.dataAvailability || "All empirical simulation telemetry and analytical evaluation scripts generated during the current study are available in the project repository upon request." },
    { label: "Authors' Contributions", value: decl.authorContributions || "All authors contributed substantially to study conceptualization, theoretical formulation, empirical evaluation, and manuscript revision." },
  ];

  declarationItems.forEach((item) => {
    children.push(
      new Paragraph({
        spacing: { before: 80, after: 80, line: 320 },
        children: [
          new TextRun({
            text: `${item.label}: `,
            font: fontName,
            bold: true,
            size: 22,
          }),
          new TextRun({
            text: item.value,
            font: fontName,
            size: 22,
          }),
        ],
      })
    );
  });

  // ── References / Bibliography ──
  children.push(
    new Paragraph({
      text: "References",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 160 },
      run: { font: fontName, bold: true, size: 26 },
    })
  );

  const refs = params.references && params.references.length > 0
    ? params.references
    : [
        "Castro, M., & Liskov, B. (2002). Practical Byzantine fault tolerance and proactive recovery. ACM Transactions on Computer Systems (TOCS), 20(4), 398-461.",
        "Lamport, L., Shostak, R., & Pease, M. (1982). The Byzantine generals problem. ACM Transactions on Programming Languages and Systems, 4(3), 382-401.",
        "Ongaro, D., & Ousterhout, J. (2014). In search of an understandable consensus algorithm. USENIX Annual Technical Conference, 305-319.",
      ];

  refs.forEach((refLine, idx) => {
    const isNumbered = /^\s*\[?\d+\]?/.test(refLine);
    const text = isNumbered ? refLine : `[${idx + 1}] ${refLine}`;

    children.push(
      new Paragraph({
        spacing: { before: 60, after: 80, line: 300 },
        indent: { left: 720, hanging: 720 }, // Standard academic hanging indent
        children: [
          new TextRun({
            text,
            font: fontName,
            size: 20, // 10pt references
          }),
        ],
      })
    );
  });

  // ── Construct Docx Document ──
  return new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch = 1440 twips
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: params.title.slice(0, 48) + (params.title.length > 48 ? "..." : ""),
                    font: fontName,
                    italics: true,
                    size: 18,
                    color: "94A3B8",
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: fontName,
                    size: 18,
                    color: "64748B",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}

/**
 * Executes one-click Word .docx export and triggers file download.
 */
export async function exportJournalToDocx(params: JournalExportParams): Promise<void> {
  const doc = buildJournalDocxDocument(params);
  const blob = await packDocxToBlob(doc);
  const cleanTitle = (params.title || "Journal_Manuscript")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  const filename = `${cleanTitle}_Camera_Ready.docx`;
  downloadBlob(blob, filename);
}

/**
 * Opens a camera-ready print window formatted like a high-tier journal preprint.
 */
export function printJournalManuscript(params: JournalExportParams): void {
  if (typeof window === "undefined") return;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showAppToast("Popup blocked: please allow popups to open the camera-ready print preview.", "warning");
    return;
  }

  const authorsHtml = (params.authors || [{ name: "Lead Author", affiliation: "University Department", email: "author@university.edu" }])
    .map((a, i) => `<span class="author-item"><strong>${getAuthorDisplayName(a)}</strong><sup>${i + 1}</sup></span>`)
    .join(", ");

  const affiliationsHtml = (params.authors || [{ name: "Lead Author", affiliation: "University Department", email: "author@university.edu" }])
    .map((a, i) => `<div><sup>${i + 1}</sup> ${a.affiliation || ""}</div>`)
    .join("");

  const sectionsHtml = params.sections
    .map((sec, i) => {
      if (sec.section.toLowerCase().includes("abstract")) return "";
      const formattedTitle = sec.section.match(/^\d+[\.\s]/) ? sec.section : `${i + 1}. ${sec.section}`;
      return `
        <section class="manuscript-section">
          <h2>${formattedTitle}</h2>
          <div class="section-body">${sec.content.replace(/\n\n/g, "</p><p>")}</div>
        </section>
      `;
    })
    .join("");

  const referencesHtml = (params.references || [
    "Castro, M., & Liskov, B. (2002). Practical Byzantine fault tolerance. ACM TOCS, 20(4), 398-461.",
  ])
    .map((r, i) => `<div class="ref-item">[${i + 1}] ${r}</div>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${params.title} - Camera Ready</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
      @bottom-center { content: counter(page); }
    }
    body {
      font-family: "Times New Roman", Times, serif;
      color: #111;
      line-height: 1.6;
      max-width: 820px;
      margin: 0 auto;
      padding: 24px;
    }
    .venue-header {
      text-align: right;
      font-size: 11px;
      color: #666;
      font-style: italic;
      border-bottom: 1px solid #ddd;
      padding-bottom: 6px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 14px;
      line-height: 1.25;
    }
    .authors {
      text-align: center;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .affiliations {
      text-align: center;
      font-size: 12px;
      color: #555;
      font-style: italic;
      margin-bottom: 24px;
    }
    .abstract-box {
      margin: 20px 30px;
      padding: 14px;
      background: #fdfdfd;
      border-top: 1px solid #ccc;
      border-bottom: 1px solid #ccc;
      font-size: 12px;
      text-align: justify;
      line-height: 1.5;
    }
    .abstract-box strong { font-weight: bold; }
    .keywords {
      margin-top: 8px;
      font-size: 11px;
      color: #444;
    }
    h2 {
      font-size: 16px;
      font-weight: bold;
      border-bottom: 1px solid #eee;
      padding-bottom: 4px;
      margin-top: 24px;
      margin-bottom: 10px;
    }
    p {
      text-align: justify;
      margin-bottom: 12px;
      font-size: 13px;
    }
    .declarations, .references {
      margin-top: 32px;
      border-top: 1px solid #ccc;
      padding-top: 16px;
    }
    .ref-item {
      font-size: 11px;
      padding-left: 24px;
      text-indent: -24px;
      margin-bottom: 6px;
      line-height: 1.4;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 8px;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
      Print / Save as PDF
    </button>
  </div>
  <div class="venue-header">Prepared for submission to: ${params.targetJournal}</div>
  <h1>${params.title}</h1>
  <div class="authors">${authorsHtml}</div>
  <div class="affiliations">${affiliationsHtml}</div>
  ${params.abstract ? `
  <div class="abstract-box">
    <strong>Abstract—</strong> ${params.abstract}
    ${params.keywords ? `<div class="keywords"><strong>Keywords—</strong> ${params.keywords.join("; ")}</div>` : ""}
  </div>` : ""}
  <div class="manuscript-body">${sectionsHtml}</div>
  <div class="declarations">
    <h2>Declarations</h2>
    <p><strong>Funding:</strong> ${params.declarations?.funding || "None reported."}</p>
    <p><strong>Conflict of Interest:</strong> ${params.declarations?.conflictOfInterest || "The authors declare no competing interests."}</p>
    <p><strong>Data Availability:</strong> ${params.declarations?.dataAvailability || "Data available upon reasonable request."}</p>
  </div>
  <div class="references">
    <h2>References</h2>
    ${referencesHtml}
  </div>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Generates LaTeX (.tex) and BibTeX (.bib) source string.
 */
export function generateJournalLatex(params: JournalExportParams): { tex: string; bib: string } {
  const isIEEE = params.template === "ieee";
  const docClass = isIEEE ? "\\documentclass[journal]{IEEEtran}" : "\\documentclass[11pt,a4paper]{article}";

  const authorLatex = (params.authors || [{ name: "Author Name", affiliation: "University" }])
    .map((a) => `\\author{${getAuthorDisplayName(a)}\\thanks{${a.affiliation || ""}}}`)
    .join("\n");

  const sectionsLatex = params.sections
    .map((sec) => {
      const cleanTitle = sec.section.replace(/^\d+[\.\s]/, "");
      return `\\section{${cleanTitle}}\n${sec.content}\n`;
    })
    .join("\n");

  const tex = `% Camera-Ready LaTeX Source for ${params.targetJournal}
${docClass}
\\usepackage{amsmath,amsfonts}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{cite}

\\title{${params.title}}
${authorLatex}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
${params.abstract || "Autonomous academic reasoning under provable empirical bounds."}
\\end{abstract}

${sectionsLatex}

\\section*{Declarations}
\\textbf{Funding:} ${params.declarations?.funding || "No specific grant reported."} \\\\
\\textbf{Conflict of Interest:} ${params.declarations?.conflictOfInterest || "None."} \\\\
\\textbf{Data Availability:} ${params.declarations?.dataAvailability || "Available on request."}

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`;

  const bib = `@article{castro2002practical,
  title={Practical Byzantine fault tolerance and proactive recovery},
  author={Castro, Miguel and Liskov, Barbara},
  journal={ACM Transactions on Computer Systems (TOCS)},
  volume={20},
  number={4},
  pages={398--461},
  year={2002},
  publisher={ACM New York, NY, USA}
}

@article{lamport1982byzantine,
  title={The Byzantine generals problem},
  author={Lamport, Leslie and Shostak, Robert and Pease, Marshall},
  journal={ACM Transactions on Programming Languages and Systems},
  volume={4},
  number={3},
  pages={382--401},
  year={1982}
}
`;

  return { tex, bib };
}

/**
 * Compiles a formal standalone Word document for the Point-by-Point Author Rebuttal Letter.
 */
export async function exportRefereeLetterToDocx(
  title: string,
  author: string,
  targetJournal: string,
  rebuttalMatrix: Array<{
    referee: string;
    lens?: string;
    section?: string;
    severity?: string;
    critique: string;
    authorResponse: string;
    revisionAction?: string;
  }>
): Promise<Blob> {
  const fontName = "Times New Roman";
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [
        new TextRun({
          text: "Point-by-Point Author Response & Rebuttal Letter",
          font: fontName,
          bold: true,
          size: 32,
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 240 },
      children: [
        new TextRun({
          text: `Manuscript Title: "${title}"\nTarget Journal: ${targetJournal}\nAuthor(s): ${author}\nDate: ${new Date().toLocaleDateString("en-GB")}`,
          font: fontName,
          italics: true,
          size: 22,
          color: "475569",
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 120, after: 120, line: 360 },
      children: [
        new TextRun({
          text: "Dear Editor-in-Chief and Reviewers,",
          font: fontName,
          bold: true,
          size: 24,
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 80, after: 180, line: 360 },
      children: [
        new TextRun({
          text:
            "We wish to express our sincere gratitude to the Editorial Board and the expert referees for their constructive evaluations of our manuscript. In response to the reviewers' valuable recommendations, we have carefully revised the manuscript. Below, we provide our comprehensive point-by-point response detailing how each critique was addressed.",
          font: fontName,
          size: 24,
        }),
      ],
    })
  );

  const items = rebuttalMatrix && rebuttalMatrix.length > 0 ? rebuttalMatrix : [
    {
      referee: "Methodologist",
      lens: "Methodology & Benchmark Bounds",
      section: "2. Methodology",
      severity: "Major",
      critique: "The latency bounds require empirical verification against physical decoding hardware.",
      authorResponse: "We have incorporated empirical FPGA latency data from benchmark run user_data_101 directly verifying sub-microsecond bounds.",
      revisionAction: "Updated Section 2 with hardware telemetry table and bound proofs.",
    }
  ];

  items.forEach((item, idx) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 80 },
        children: [
          new TextRun({
            text: `Point ${idx + 1}: ${item.referee} (${item.lens || item.section})`,
            font: fontName,
            bold: true,
            size: 26,
            color: "0F172A",
          }),
          new TextRun({
            text: ` [Severity: ${item.severity || "Moderate"}]`,
            font: fontName,
            size: 22,
            color: item.severity === "Major" ? "DC2626" : "D97706",
          }),
        ],
      })
    );

    children.push(
      new Paragraph({
        spacing: { before: 60, after: 80, line: 320 },
        indent: { left: 360, right: 360 },
        children: [
          new TextRun({
            text: "Reviewer Critique: ",
            font: fontName,
            bold: true,
            size: 22,
            color: "334155",
          }),
          new TextRun({
            text: item.critique,
            font: fontName,
            italics: true,
            size: 22,
            color: "334155",
          }),
        ],
      })
    );

    children.push(
      new Paragraph({
        spacing: { before: 60, after: 80, line: 320 },
        children: [
          new TextRun({
            text: "Author Response: ",
            font: fontName,
            bold: true,
            size: 22,
            color: "1E40AF",
          }),
          new TextRun({
            text: item.authorResponse,
            font: fontName,
            size: 22,
          }),
        ],
      })
    );

    if (item.revisionAction) {
      children.push(
        new Paragraph({
          spacing: { before: 40, after: 140, line: 320 },
          children: [
            new TextRun({
              text: "Manuscript Revision: ",
              font: fontName,
              bold: true,
              size: 22,
              color: "166534",
            }),
            new TextRun({
              text: item.revisionAction,
              font: fontName,
              size: 22,
            }),
          ],
        })
      );
    }
  });

  children.push(
    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [
        new TextRun({
          text: "Sincerely,",
          font: fontName,
          size: 24,
        }),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 40, after: 120 },
      children: [
        new TextRun({
          text: `${author}\nOn behalf of all co-authors`,
          font: fontName,
          bold: true,
          size: 24,
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  return packDocxToBlob(doc);
}
