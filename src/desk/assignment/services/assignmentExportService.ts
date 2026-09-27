/**
 * Academic Document Export Service
 * One-click formatted .docx and PDF export adhering to standard university formatting:
 * - Margins & Typography: 1-inch (2.54 cm) margins, Times New Roman, 1.5 line spacing
 * - University Title Page: Assignment title, prompt excerpt, candidate/student details, target vs. final word count, academic level, submission date
 * - Running Headers & Footers: Running head with title and right-aligned page numbers
 * - Structured Body: Sequential rendering of Introduction, thematic body subsections, and Conclusion
 * - Formatted Bibliography: Auto-generated reference list formatted to citationStyle (Harvard, APA 7, IEEE, MHRA) with hanging indent
 */

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
 */
export function formatBibliographyEntry(source: DiscoveredSource, style: string, index?: number): string {
  if (source.citation && source.citation.trim().length > 10) {
    return source.citation.trim();
  }

  const authors = Array.isArray(source.authors) && source.authors.length > 0
    ? source.authors.join(", ")
    : "Anonymous";
  const year = source.year ? String(source.year).trim() : "n.d.";
  const title = source.title ? source.title.trim() : "Untitled Work";
  const venue = source.journal || "Academic Repository";
  const doi = source.doi ? `https://doi.org/${source.doi.replace(/^https?:\/\/doi\.org\//, "")}` : source.url || "";

  const normStyle = (style || "harvard").toLowerCase().replace(/[^a-z0-9]/g, "");

  if (normStyle.includes("apa") || normStyle.includes("apa7")) {
    return `${authors} (${year}). ${title}. ${venue}.${doi ? ` ${doi}` : ""}`;
  } else if (normStyle.includes("ieee")) {
    const num = index !== undefined ? `[${index + 1}] ` : "";
    return `${num}${authors}, "${title}," ${venue}, ${year}.${doi ? ` ${doi}` : ""}`;
  } else if (normStyle.includes("mhra")) {
    return `${authors}, '${title}', ${venue} (${year})${doi ? `, <${doi}>` : ""}.`;
  } else {
    // Default Harvard format
    return `${authors} (${year}) '${title}', ${venue}.${doi ? ` Available at: ${doi}` : ""}`;
  }
}

/**
 * Builds the complete list of formatted bibliography references
 */
export function buildFormattedBibliography(sources: DiscoveredSource[], style: string): string[] {
  const normStyle = (style || "harvard").toLowerCase();
  const isNumbered = normStyle.includes("ieee") || normStyle.includes("vancouver");

  const keptSources = sources.filter((s) => s.status !== "removed");
  const pool = keptSources.length > 0 ? keptSources : sources;

  const formatted = pool.map((s, idx) => formatBibliographyEntry(s, style, idx));

  if (!isNumbered) {
    // Alphabetical sort by author surname
    formatted.sort((a, b) => a.localeCompare(b));
  }

  return formatted;
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
  setTimeout(() => {
    window.document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Generates an academic DOCX document compliant with university submission standards.
 */
export async function generateAssignmentDocx(params: AssignmentExportParams): Promise<Blob> {
  const {
    title,
    studentName = "Candidate",
    studentId = "SCH-2026-X01",
    institution = "University Faculty of Arts & Sciences",
    courseName = params.brief.courseDetails?.courseName || "Academic Studies",
    brief,
    sections,
    sources,
    actualWordCount,
  } = params;

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
  const academicLevelLabel = brief.academicLevel === "postgraduate"
    ? "Postgraduate (Level 7 / Master's)"
    : "Undergraduate (Level 6 / Bachelor's)";

  // Standard 1-inch margins (1440 twips / dxa)
  const academicMargins = {
    top: 1440,
    bottom: 1440,
    left: 1440,
    right: 1440,
  };

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
    // Prompt Excerpt Box if available
    ...(brief.rawPrompt || brief.instructions ? [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 800, before: 200 },
        children: [
          new TextRun({
            text: `Assignment Prompt: "${brief.rawPrompt || brief.instructions}"`,
            font: "Times New Roman",
            size: 20, // 10pt
            italics: true,
            color: "555555",
          }),
        ],
      }),
    ] : []),
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

    // Split content into clean paragraphs
    const paragraphs = (sec.draftContent || "")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    if (paragraphs.length === 0) {
      bodyChildren.push(
        new Paragraph({
          spacing: { line: 360, after: 140 },
          children: [
            new TextRun({
              text: "[Section drafted in accordance with assignment brief.]",
              font: "Times New Roman",
              size: 24, // 12pt
              italics: true,
              color: "777777",
            }),
          ],
        })
      );
    } else {
      paragraphs.forEach((pText) => {
        // Strip markdown header symbols if present
        const cleanP = pText.replace(/^#+\s*/, "");
        bodyChildren.push(
          new Paragraph({
            spacing: { line: 360, after: 160 }, // 1.5 line spacing (360 dxa)
            children: [
              new TextRun({
                text: cleanP,
                font: "Times New Roman",
                size: 24, // 12pt standard
              }),
            ],
          })
        );
      });
    }
  });

  // Bibliography / Reference List
  const bibliographyEntries = buildFormattedBibliography(sources, brief.citationStyle || "harvard");

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
          text: "References",
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
          children: [
            new TextRun({
              text: refText,
              font: "Times New Roman",
              size: 24, // 12pt
            }),
          ],
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
export function exportAssignmentToPdf(params: AssignmentExportParams): void {
  if (typeof window === "undefined" || !window.document) return;

  const {
    title,
    studentName = "Candidate",
    studentId = "SCH-2026-X01",
    institution = "University Faculty of Arts & Sciences",
    courseName = params.brief.courseDetails?.courseName || "Academic Studies",
    brief,
    sections,
    sources,
    actualWordCount,
  } = params;

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
  const bibliographyEntries = buildFormattedBibliography(sources, brief.citationStyle || "harvard");

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // If popups are blocked, fall back to window.print directly
    window.print();
    return;
  }

  const sectionsHtml = sections
    .map((s) => {
      const paras = (s.draftContent || "")
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p>${p.replace(/^#+\s*/, "")}</p>`)
        .join("");
      return `<section class="academic-section"><h2>${s.title}</h2>${paras || "<p><em>[Section complete]</em></p>"}</section>`;
    })
    .join("\n");

  const bibliographyHtml = bibliographyEntries.length > 0
    ? bibliographyEntries.map((ref) => `<p class="bib-entry">${ref}</p>`).join("\n")
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
    ${brief.rawPrompt || brief.instructions ? `<div class="prompt-box"><strong>Prompt:</strong> ${brief.rawPrompt || brief.instructions}</div>` : ""}

    <table class="meta-table">
      <tr><td class="label">Candidate:</td><td>${studentName}</td></tr>
      <tr><td class="label">Candidate ID:</td><td>${studentId}</td></tr>
      <tr><td class="label">Academic Level:</td><td>${brief.academicLevel === "postgraduate" ? "Postgraduate (Level 7)" : "Undergraduate (Level 6)"}</td></tr>
      <tr><td class="label">Word Count:</td><td>${computedWordCount.toLocaleString()} words (Target: ${brief.targetWordCount.toLocaleString()})</td></tr>
      <tr><td class="label">Citation Style:</td><td>${citationStyleLabel}</td></tr>
      <tr><td class="label">Submission Date:</td><td>${formattedDate}</td></tr>
    </table>
  </div>

  <main>
    ${sectionsHtml}
  </main>

  <div class="bib-section">
    <h2>References</h2>
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
  const bibliography = buildFormattedBibliography(sources, brief.citationStyle || "harvard");

  const fullMarkdown = [
    `# ${title}`,
    "",
    `> **Target Word Count:** ${brief.targetWordCount} words | **Citation Style:** ${(brief.citationStyle || "harvard").toUpperCase()}`,
    "",
    ...sections.map((s) => `## ${s.title}\n\n${(s.draftContent || "").trim()}`),
    "",
    "## References",
    "",
    ...bibliography.map((b) => `- ${b}`),
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
