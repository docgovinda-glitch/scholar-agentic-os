/**
 * Academic Document Export Service
 * One-click formatted .docx and PDF export adhering to standard university formatting:
 * - Margins & Typography: 1-inch (2.54 cm) margins, Times New Roman, 1.5 line spacing
 * - University Title Page: Assignment title, prompt excerpt, candidate/student details, target vs. final word count, academic level, submission date
 * - Running Headers & Footers: Running head with title and right-aligned page numbers
 * - Structured Body: Sequential rendering of Introduction, thematic body subsections, and Conclusion
 * - Formatted Bibliography: Auto-generated reference list formatted to citationStyle (Harvard, APA 7, IEEE, MHRA) with hanging indent
 */

import { selectCitedSources, inlineMarkdownRuns, inlineMarkdownToHtml, proseToHtml, type StyledRun } from "./exportText";
import { parseProseBlocks } from "../../../shared/proseBlocks";
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
import type {
  AssignmentBriefState,
  AssignmentDraftingSection,
  DiscoveredSource,
} from "../types";
import {
  formatReference,
  generateReferenceList,
  generateReferenceListBlock,
  getReferenceListHeading,
} from "./referenceListGenerator";
import { isTutorialOrShortQABrief } from "../../../utils/briefExtractor";
import { splitProseIntoParagraphs } from "../../../shared/proseParagraphs";
import { authedFetch } from "../../api";

const ACADEMIC_LEVEL_NAMES: Record<string, string> = {
  high_school: "High school",
  undergraduate: "Undergraduate",
  postgraduate: "Postgraduate",
  doctoral: "Doctoral",
};

/** The brief's academic level in words, or "—" when the brief doesn't say. */
export function academicLevelName(level: string | undefined): string {
  return (level && ACADEMIC_LEVEL_NAMES[level]) || "—";
}

export interface AssignmentExportParams {
  title: string;
  studentName?: string;
  studentId?: string;
  institution?: string;
  courseName?: string;
  brief: AssignmentBriefState;
  sections: AssignmentDraftingSection[];
  sources: DiscoveredSource[];
  actualWordCount?: number;
}

/**
 * Formats a single source into an academic bibliography entry based on citation style.
 * Now delegates to the comprehensive referenceListGenerator.
 */
export function formatBibliographyEntry(source: DiscoveredSource, style: string, index?: number): string {
  return formatReference(source, style, index ?? 0);
}

/**
 * Builds the complete list of formatted bibliography references.
 * Now delegates to the comprehensive referenceListGenerator.
 */
export function buildFormattedBibliography(sources: DiscoveredSource[], style: string): string[] {
  return generateReferenceList(sources, style);
}

/** A styled run as a .docx TextRun (underline needs docx's own option shape). */
function docxRun(r: StyledRun, size = 24): TextRun {
  return new TextRun({
    text: r.text,
    bold: r.bold,
    italics: r.italics,
    underline: r.underline ? {} : undefined,
    font: "Times New Roman",
    size,
  });
}

/**
 * One section's stored text as .docx blocks: paragraphs, sub-headings, block
 * quotes (indented), bulleted/numbered lists and real tables.
 */
export function proseToDocxBlocks(text: string, line: number, after: number): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const b of parseProseBlocks(text)) {
    if (b.kind === "paragraph") {
      out.push(new Paragraph({ spacing: { line, after }, children: inlineMarkdownRuns(b.text).map((r) => docxRun(r)) }));
    } else if (b.kind === "heading") {
      out.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: inlineMarkdownRuns(b.text).map((r) => docxRun({ ...r, bold: true })) }));
    } else if (b.kind === "quote") {
      for (const q of b.text.split("\n")) {
        out.push(new Paragraph({ indent: { left: 720, right: 720 }, spacing: { line, after }, children: inlineMarkdownRuns(q).map((r) => docxRun(r)) }));
      }
    } else if (b.kind === "bullets" || b.kind === "numbered") {
      b.items.forEach((item, i) => {
        const marker = b.kind === "bullets" ? "\u2022\t" : `${i + 1}.\t`;
        out.push(
          new Paragraph({
            indent: { left: 720, hanging: 360 },
            spacing: { line, after: 60 },
            children: [docxRun({ text: marker }), ...inlineMarkdownRuns(item).map((r) => docxRun(r))],
          })
        );
      });
    } else if (b.kind === "table") {
      const width = Math.max(...b.rows.map((r) => r.length), 1);
      out.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: b.rows.map(
            (row, ri) =>
              new TableRow({
                tableHeader: b.header && ri === 0,
                children: Array.from(
                  { length: width },
                  (_, ci) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: inlineMarkdownRuns(row[ci] ?? "").map((r) => docxRun({ ...r, bold: r.bold || (b.header && ri === 0) }, 22)),
                        }),
                      ],
                    })
                ),
              })
          ),
        })
      );
      out.push(new Paragraph({ spacing: { after } }));
    }
  }
  return out;
}

/**
 * Packs a docx Document into a Blob reliably in both browser and Node/Vitest environments.
 */
export async function packDocxToBlob(doc: Document): Promise<Blob> {
  if (typeof Packer.toBlob === "function") {
    try {
      return await Packer.toBlob(doc);
    } catch {
      // Fallback to toBuffer if toBlob fails in simulated DOM
    }
  }
  const buffer = await Packer.toBuffer(doc);
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/**
 * Triggers a download of a Blob file in the browser
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
 * Generates an academic DOCX document compliant with university submission standards.
 */
export async function generateAssignmentDocx(params: AssignmentExportParams): Promise<Blob> {
  const { brief, sections, sources, actualWordCount } = params;
  // Everything interpolated into the print window is escaped (titles and cover
  // details can come from an uploaded brief).
  const title = escapeHtmlText(params.title);
  // Cover details are the student's own; a missing one is shown as missing, never invented.
  const studentName = escapeHtmlText(params.studentName || "—");
  const studentId = escapeHtmlText(params.studentId || "—");
  const institution = escapeHtmlText(params.institution || "");
  const courseName = escapeHtmlText(params.courseName || params.brief.courseDetails?.courseName || "");

  const computedWordCount = actualWordCount ??
    sections.reduce((acc, s) => {
      const words = (s.draftContent || "").trim().split(/\s+/).filter(Boolean).length;
      return acc + words;
    }, 0);

  const formattedDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const citationStyleLabel = (brief.citationStyle || "harvard").toUpperCase();
  const academicLevelLabel = academicLevelName(brief.academicLevel);

  // Standard 1-inch margins (1440 twips / dxa)
  const academicMargins = {
    top: 1440,
    bottom: 1440,
    left: 1440,
    right: 1440,
  };

  const isTutorialOrShortQA =
    computedWordCount <= 600 ||
    (brief.targetWordCount !== undefined && brief.targetWordCount <= 600) ||
    isTutorialOrShortQABrief(brief.rawPrompt || brief.instructions || params.title, computedWordCount);

  if (isTutorialOrShortQA) {
    const qnaChildren: Array<Paragraph | Table> = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 400 },
        children: [
          new TextRun({
            text: title,
            font: "Times New Roman",
            size: 32, // 16pt
            bold: true,
          }),
        ],
      }),
    ];

    sections.forEach((sec, idx) => {
      qnaChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: idx === 0 ? 100 : 300, after: 120 },
          children: [
            new TextRun({
              text: sec.title,
              font: "Times New Roman",
              size: 26, // 13pt
              bold: true,
            }),
          ],
        })
      );

      qnaChildren.push(...proseToDocxBlocks(sec.draftContent || "", 320, 140));
    });

    const doc = new Document({
      sections: [
        {
          properties: {
            page: { margin: academicMargins },
          },
          children: qnaChildren,
        },
      ],
    });

    return await Packer.toBlob(doc);
  }

  // Section 1: University Title Page
  const titlePageChildren: (Paragraph | Table)[] = [
    // Spacing before title
    new Paragraph({
      text: "",
      spacing: { before: 1200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: institution.toUpperCase(),
          font: "Times New Roman",
          size: 24, // 12pt
          color: "666666",
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: courseName,
          font: "Times New Roman",
          size: 28, // 14pt
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400, before: 600 },
      children: [
        new TextRun({
          text: title,
          font: "Times New Roman",
          size: 44, // 22pt
          bold: true,
        }),
      ],
    }),
    // The raw assignment prompt is never printed in the submission.
    // Spacing before metadata table
    new Paragraph({
      text: "",
      spacing: { before: 800 },
    }),
    // Metadata Table
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: "Candidate / Student:", font: "Times New Roman", size: 22, bold: true })] })],
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: studentName, font: "Times New Roman", size: 22 })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: "Candidate ID:", font: "Times New Roman", size: 22, bold: true })] })],
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: studentId, font: "Times New Roman", size: 22 })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: "Academic Level:", font: "Times New Roman", size: 22, bold: true })] })],
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: academicLevelLabel, font: "Times New Roman", size: 22 })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: "Word Count:", font: "Times New Roman", size: 22, bold: true })] })],
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: `${computedWordCount.toLocaleString()} words (Target: ${brief.targetWordCount.toLocaleString()} words)`, font: "Times New Roman", size: 22 })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: "Referencing Convention:", font: "Times New Roman", size: 22, bold: true })] })],
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: citationStyleLabel, font: "Times New Roman", size: 22 })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: "Date of Submission:", font: "Times New Roman", size: 22, bold: true })] })],
            }),
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              children: [new Paragraph({ children: [new TextRun({ text: formattedDate, font: "Times New Roman", size: 22 })] })],
            }),
          ],
        }),
      ],
    }),
  ];

  // Section 2: Body Paragraphs & Bibliography
  const bodyChildren: (Paragraph | Table)[] = [];

  // Short running title for header
  const runningHeaderTitle = title.length > 45 ? `${title.slice(0, 42)}...` : title;

  // Render each section sequentially
  sections.forEach((sec, idx) => {
    // Section Heading
    bodyChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: idx === 0 ? 0 : 360, after: 180 },
        children: [
          new TextRun({
            text: sec.title,
            font: "Times New Roman",
            size: 28, // 14pt
            bold: true,
          }),
        ],
      })
    );

    const sectionBlocks = proseToDocxBlocks(sec.draftContent || "", 360, 160);


    if (sectionBlocks.length === 0) {
      bodyChildren.push(
        new Paragraph({
          spacing: { line: 360, after: 140 },
          children: [
            new TextRun({
              text: "[Not drafted yet]",
              font: "Times New Roman",
              size: 24, // 12pt
              italics: true,
              color: "777777",
            }),
          ],
        })
      );
    } else {
      bodyChildren.push(...sectionBlocks);
    }
  });

  // Bibliography / Reference List
  // Only sources cited in the body plus the brief's prescribed references, once each.
  const bodyText = sections.map((sec) => sec.draftContent || "").join("\n\n");
  const bibliographyEntries = buildFormattedBibliography(selectCitedSources(sources, bodyText), brief.citationStyle || "harvard");

  bodyChildren.push(
    new Paragraph({
      children: [new PageBreak()],
    })
  );

  bodyChildren.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 240 },
      children: [
        new TextRun({
          text: getReferenceListHeading(brief.citationStyle || "harvard"),
          font: "Times New Roman",
          size: 28, // 14pt
          bold: true,
        }),
      ],
    })
  );

  if (bibliographyEntries.length === 0) {
    bodyChildren.push(
      new Paragraph({
        spacing: { line: 360, after: 120 },
        children: [
          new TextRun({
            text: "No references cited.",
            font: "Times New Roman",
            size: 24,
            italics: true,
          }),
        ],
      })
    );
  } else {
    bibliographyEntries.forEach((refText) => {
      bodyChildren.push(
        new Paragraph({
          // Hanging indent standard for academic bibliographies (720 dxa = 0.5 in)
          indent: { left: 720, hanging: 720 },
          spacing: { line: 360, after: 140 },
          children: inlineMarkdownRuns(refText).map((r) => docxRun(r)),
        })
      );
    });
  }

  // Construct complete docx Document
  const doc = new Document({
    sections: [
      // 1. Title Page Section (No running header/footer)
      {
        properties: {
          page: {
            margin: academicMargins,
          },
        },
        children: titlePageChildren,
      },
      // 2. Body & Bibliography Section (with Running Header & Page Numbers)
      {
        properties: {
          page: {
            margin: academicMargins,
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 200 },
                children: [
                  new TextRun({
                    text: `${runningHeaderTitle}  |  Page `,
                    font: "Times New Roman",
                    size: 18, // 9pt
                    color: "666666",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: "Times New Roman",
                    size: 18,
                    color: "666666",
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
                spacing: { before: 200 },
                children: [
                  new TextRun({
                    text: `Academic Submission  ·  ${citationStyleLabel} Referencing`,
                    font: "Times New Roman",
                    size: 16, // 8pt
                    color: "888888",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            children: [new PageBreak()],
          }),
          ...bodyChildren,
        ],
      },
    ],
  });

  return await packDocxToBlob(doc);
}

/**
 * Generates and triggers download of the university-formatted .docx file.
 */
export async function exportAssignmentToDocx(params: AssignmentExportParams): Promise<void> {
  const blob = await generateAssignmentDocx(params);
  const cleanTitle = (params.title || "Academic_Assignment")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
  const filename = `${cleanTitle}_Submission.docx`;
  downloadBlob(blob, filename);
}

/**
 * Triggers academic PDF export using a styled printable academic layout window.
 */
const escapeHtmlText = (t: unknown) =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Downloads the submission as a real .pdf, rendered on the server by the shared
 * export pipeline. Throws on failure so the caller can offer the print view.
 */
export async function downloadAssignmentPdf(projectId: string, params: AssignmentExportParams): Promise<void> {
  const res = await authedFetch(`/api/projects/${encodeURIComponent(projectId)}/assignment/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      studentName: params.studentName || undefined,
      studentId: params.studentId || undefined,
      institution: params.institution || undefined,
      courseName: params.courseName || params.brief.courseDetails?.courseName || undefined,
      citationStyle: params.brief.citationStyle || "harvard",
      targetWordCount: params.brief.targetWordCount || undefined,
      sections: params.sections.map((s) => ({ title: s.title, draftContent: s.draftContent || "" })),
      sources: params.sources,
    }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(detail?.error || `PDF export failed (${res.status}).`);
  }
  const blob = await res.blob();
  const cleanTitle = params.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Assignment";
  downloadBlob(blob, `${cleanTitle}_Submission.pdf`);
}

/** Printable HTML view (fallback when the PDF service is unreachable). */
export function exportAssignmentToPdf(params: AssignmentExportParams): void {
  if (typeof window === "undefined" || !window.document) return;

  const { brief, sections, sources, actualWordCount } = params;
  // Everything interpolated into the print window is escaped (titles and cover
  // details can come from an uploaded brief).
  const title = escapeHtmlText(params.title);
  // Cover details are the student's own; a missing one is shown as missing, never invented.
  const studentName = escapeHtmlText(params.studentName || "—");
  const studentId = escapeHtmlText(params.studentId || "—");
  const institution = escapeHtmlText(params.institution || "");
  const courseName = escapeHtmlText(params.courseName || params.brief.courseDetails?.courseName || "");

  const computedWordCount = actualWordCount ??
    sections.reduce((acc, s) => {
      const words = (s.draftContent || "").trim().split(/\s+/).filter(Boolean).length;
      return acc + words;
    }, 0);

  const formattedDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const citationStyleLabel = (brief.citationStyle || "harvard").toUpperCase();
  const bibliographyEntries = buildFormattedBibliography(
    selectCitedSources(sources, sections.map((sec) => sec.draftContent || "").join("\n\n")),
    brief.citationStyle || "harvard"
  );

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // If popups are blocked, fall back to window.print directly
    window.print();
    return;
  }

  const isTutorialOrShortQA =
    computedWordCount <= 600 ||
    (brief.targetWordCount !== undefined && brief.targetWordCount <= 600) ||
    isTutorialOrShortQABrief(brief.rawPrompt || brief.instructions || params.title, computedWordCount);

  const sectionsHtml = sections
    .map((s) => {
      const paras = proseToHtml(s.draftContent || "");
      return `<section class="academic-section"><h2>${escapeHtmlText(s.title)}</h2>${paras || "<p><em>[Not drafted yet]</em></p>"}</section>`;
    })
    .join("\n");

  if (isTutorialOrShortQA) {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 2.54cm; }
    @media print { .no-print { display: none !important; } }
    body {
      font-family: "Times New Roman", Times, Georgia, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #111;
      margin: 0 auto;
      max-width: 800px;
      padding: 2.54cm;
      background: #fff;
    }
    h1 { font-size: 20pt; font-weight: bold; margin-bottom: 2rem; text-align: center; }
    h2 { font-size: 14pt; font-weight: bold; margin-top: 1.5rem; margin-bottom: 0.8rem; }
    p { margin: 0 0 1.2rem; text-align: justify; }
    blockquote { margin: 0 2.5em 1.2rem; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 1.2rem; font-size: 11pt; } th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; vertical-align: top; }
    .print-btn-bar { position: fixed; top: 16px; right: 16px; background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 8px 12px; }
    .print-btn { background: #111; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <h1>${title}</h1>
  <main>
    ${sectionsHtml}
  </main>
  <script>
    window.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => { window.print(); }, 500);
    });
  </script>
</body>
</html>
    `.trim();

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    return;
  }

  const bibliographyHtml = bibliographyEntries.length > 0
    ? bibliographyEntries.map((ref) => `<p class="bib-entry">${inlineMarkdownToHtml(ref)}</p>`).join("\n")
    : "<p><em>No references cited.</em></p>";

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title} — Academic Submission</title>
  <style>
    @page {
      size: A4;
      margin: 2.54cm;
    }
    @media print {
      .no-print { display: none !important; }
      .page-break { page-break-after: always; }
      body { font-size: 12pt; }
    }
    body {
      font-family: "Times New Roman", Times, Georgia, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #111;
      margin: 0 auto;
      max-width: 800px;
      padding: 2.54cm;
      background: #fff;
    }
    .cover-page {
      min-height: 80vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      text-align: center;
      border-bottom: 1px solid #ddd;
      padding-bottom: 2rem;
      margin-bottom: 3rem;
      page-break-after: always;
    }
    .inst-name { font-size: 14pt; font-weight: bold; letter-spacing: 0.1em; color: #555; text-transform: uppercase; margin-bottom: 0.5rem; }
    .course-name { font-size: 13pt; font-style: italic; color: #444; margin-bottom: 2.5rem; }
    .paper-title { font-size: 24pt; font-weight: bold; margin-bottom: 1.5rem; line-height: 1.25; }
    .prompt-box { font-size: 10.5pt; font-style: italic; color: #555; max-width: 600px; margin: 0 auto 2.5rem; padding: 10px; border-left: 3px solid #ccc; text-align: left; }
    .meta-table { margin: 2rem auto 0; text-align: left; border-collapse: collapse; font-size: 11pt; }
    .meta-table td { padding: 6px 16px; }
    .meta-table td.label { font-weight: bold; color: #333; }
    h2 { font-size: 15pt; font-weight: bold; margin-top: 2rem; margin-bottom: 1rem; border-bottom: 1px solid #eee; padding-bottom: 4px; }
    p { margin: 0 0 1.2rem; text-align: justify; text-justify: inter-word; text-indent: 1.5em; }
    blockquote { margin: 0 2.5em 1.2rem; } blockquote p, li p, td p { text-indent: 0; }
    table { border-collapse: collapse; width: 100%; margin: 0 0 1.2rem; font-size: 11pt; } th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; vertical-align: top; }
    p.no-indent { text-indent: 0; }
    .bib-section { page-break-before: always; margin-top: 3rem; }
    .bib-entry { text-indent: -2.5em; padding-left: 2.5em; margin-bottom: 0.8rem; text-align: left; font-size: 11pt; }
    .print-btn-bar { position: fixed; top: 16px; right: 16px; background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 8px 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .print-btn { background: #111; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
  </style>
</head>
<body>
  <div class="print-btn-bar no-print">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="cover-page">
    <div class="inst-name">${institution}</div>
    <div class="course-name">${courseName}</div>
    <div class="paper-title">${title}</div>

    <table class="meta-table">
      <tr><td class="label">Candidate:</td><td>${studentName}</td></tr>
      <tr><td class="label">Candidate ID:</td><td>${studentId}</td></tr>
      <tr><td class="label">Academic Level:</td><td>${academicLevelName(brief.academicLevel)}</td></tr>
      <tr><td class="label">Word Count:</td><td>${computedWordCount.toLocaleString()} words (Target: ${brief.targetWordCount.toLocaleString()})</td></tr>
      <tr><td class="label">Citation Style:</td><td>${citationStyleLabel}</td></tr>
      <tr><td class="label">Submission Date:</td><td>${formattedDate}</td></tr>
    </table>
  </div>

  <main>
    ${sectionsHtml}
  </main>

  <div class="bib-section">
    <h2>${getReferenceListHeading(brief.citationStyle || "harvard")}</h2>
    ${bibliographyHtml}
  </div>

  <script>
    window.addEventListener("DOMContentLoaded", () => {
      // Auto-trigger print dialog after render
      setTimeout(() => {
        window.print();
      }, 500);
    });
  </script>
</body>
</html>
  `.trim();

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Copies the complete document in clean markdown to clipboard.
 */
export async function copyAssignmentMarkdown(
  sections: AssignmentDraftingSection[],
  sources: DiscoveredSource[],
  brief: AssignmentBriefState,
  title: string
): Promise<boolean> {
  const referenceBlock = generateReferenceListBlock(
    selectCitedSources(sources, sections.map((sec) => sec.draftContent || "").join("\n\n")),
    brief.citationStyle || "harvard"
  );

  const fullMarkdown = [
    `# ${title}`,
    "",
    `> **Target Word Count:** ${brief.targetWordCount} words | **Citation Style:** ${(brief.citationStyle || "harvard").toUpperCase()}`,
    "",
    ...sections.map((s) => `## ${s.title}\n\n${(s.draftContent || "").trim()}`),
    "",
    referenceBlock,
  ].join("\n");

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fullMarkdown);
      return true;
    }
  } catch {
    // Fallback if clipboard API is constrained
  }
  return false;
}
