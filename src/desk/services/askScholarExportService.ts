/**
 * AskScholar Post-Response Export & Clipboard Service (Section 8).
 *
 * Implements:
 * 1. Rich HTML + Plain-Text Copy (including the formatted Reference List).
 * 2. Real `.docx` Word Export with Word headings, italics, tables, and hanging indents in the Reference List.
 * 3. Cited-Only BibTeX (`.bib`) and RIS (`.ris`) export for Zotero, Mendeley, EndNote, and LaTeX.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import type { WebsiteAssistantMessage } from "../dashboard/types";
import {
  replaceBracketTokensWithDeterministicCitations,
  formatAskScholarBibliography,
  getReferenceListHeading,
  exportCSLToBibTeX,
  exportCSLToRIS,
  citationItemToCSL,
  type CSLItem,
} from "../scholarCitationEngine";

/**
 * Extracts only the cited CSLItems from a message (1-to-1 with Reference List).
 */
export function getCitedCSLItemsFromMessage(
  msg: WebsiteAssistantMessage,
  styleId: string = "apa"
): CSLItem[] {
  const bibEntries = formatAskScholarBibliography(msg.citations || [], styleId);
  return bibEntries
    .map((e, i) => e.csl || citationItemToCSL(e.rawCitation, i))
    .filter((c): c is CSLItem => c !== null);
}

/**
 * Builds both plain-text and rich HTML representations of a response + its Reference List.
 */
export function buildFormattedResponseWithReferences(
  msg: WebsiteAssistantMessage,
  styleId: string = "apa"
): { plainText: string; htmlText: string } {
  const style = styleId || msg.citationStyle || "apa";
  const bodyProse = replaceBracketTokensWithDeterministicCitations(
    msg.text || "",
    msg.citations || [],
    style
  );
  const bibEntries = formatAskScholarBibliography(msg.citations || [], style);
  const heading = getReferenceListHeading(style);

  // Build plain text
  let plainText = bodyProse.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  if (bibEntries.length > 0) {
    plainText += `\n\n${heading}\n\n`;
    plainText += bibEntries.map((e) => e.formattedText).join("\n\n");
  }

  // Build rich HTML
  const htmlLines: string[] = [];
  for (const rawLine of bodyProse.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const hMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    const inlineHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");

    if (hMatch) {
      const level = Math.min(4, Math.max(2, hMatch[1].length));
      htmlLines.push(`<h${level}>${inlineHtml(hMatch[2])}</h${level}>`);
    } else if (/^(?:•|-|\*)\s+/.test(trimmed)) {
      htmlLines.push(`<p>• ${inlineHtml(trimmed.replace(/^(?:•|-|\*)\s+/, ""))}</p>`);
    } else {
      htmlLines.push(`<p>${inlineHtml(trimmed)}</p>`);
    }
  }

  if (bibEntries.length > 0) {
    htmlLines.push(`<h2>${heading}</h2>`);
    for (const entry of bibEntries) {
      const entryHtml =
        entry.htmlText ||
        entry.formattedText
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      htmlLines.push(
        `<p style="margin-left: 2em; text-indent: -2em;">${entryHtml}</p>`
      );
    }
  }

  return {
    plainText: plainText.trim(),
    htmlText: `<article>${htmlLines.join("\n")}</article>`,
  };
}

/**
 * Copies the formatted response (rich HTML with plain-text fallback) including the Reference List.
 */
export async function copyFormattedResponseToClipboard(
  msg: WebsiteAssistantMessage,
  styleId: string = "apa"
): Promise<{ plainText: string; htmlText: string }> {
  const { plainText, htmlText } = buildFormattedResponseWithReferences(msg, styleId);

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard.write === "function") {
        const item = new ClipboardItem({
          "text/plain": new Blob([plainText], { type: "text/plain" }),
          "text/html": new Blob([htmlText], { type: "text/html" }),
        });
        await navigator.clipboard.write([item]);
        return { plainText, htmlText };
      }
    } catch {
      // Fallback to writeText below
    }
    if (typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(plainText);
    }
  }

  return { plainText, htmlText };
}

/**
 * Parses inline markdown (*italics* and **bold**) into docx TextRun objects.
 */
function parseInlineTextRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const rx = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = rx.exec(text)) !== null) {
    if (m.index > lastIdx) {
      runs.push(new TextRun({ text: text.slice(lastIdx, m.index) }));
    }
    if (m[1] !== undefined) {
      runs.push(new TextRun({ text: m[1], bold: true }));
    } else if (m[2] !== undefined) {
      runs.push(new TextRun({ text: m[2], italics: true }));
    }
    lastIdx = rx.lastIndex;
  }
  if (lastIdx < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIdx) }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

/**
 * Generates a real `.docx` Word document with Word headings, italics, preserved tables,
 * and hanging indents in the Reference List (Section 8).
 */
export async function generateWordDocxBlob(
  msg: WebsiteAssistantMessage,
  styleId: string = "apa"
): Promise<Blob> {
  const style = styleId || msg.citationStyle || "apa";
  const bodyProse = replaceBracketTokensWithDeterministicCitations(
    msg.text || "",
    msg.citations || [],
    style
  );
  const bibEntries = formatAskScholarBibliography(msg.citations || [], style);
  const refHeading = getReferenceListHeading(style);

  const children: Array<Paragraph | Table> = [];
  const lines = bodyProse.split("\n");
  let tableHeader: string[] | null = null;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (!tableHeader) return;
    const allRows = [tableHeader, ...tableRows];
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: allRows.map(
          (rowCells, rIdx) =>
            new TableRow({
              children: rowCells.map(
                (cellText) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children:
                          rIdx === 0
                            ? [new TextRun({ text: cellText.replace(/\*\*/g, ""), bold: true })]
                            : parseInlineTextRuns(cellText),
                      }),
                    ],
                  })
              ),
            })
        ),
      })
    );
    tableHeader = null;
    tableRows = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      const isSep = cells.length > 0 && cells.every((c) => /^[:\-]+$/.test(c.replace(/\s/g, "")));
      if (!isSep) {
        if (!tableHeader) tableHeader = cells;
        else tableRows.push(cells);
      }
      continue;
    } else if (tableHeader) {
      flushTable();
    }

    if (!trimmed) continue;

    const hMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const headingLevel =
        level === 1
          ? HeadingLevel.HEADING_1
          : level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      children.push(
        new Paragraph({
          heading: headingLevel,
          spacing: { before: 240, after: 120 },
          children: parseInlineTextRuns(hMatch[2]),
        })
      );
      continue;
    }

    if (/^(?:•|-|\*)\s+/.test(trimmed)) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 100 },
          children: parseInlineTextRuns(trimmed.replace(/^(?:•|-|\*)\s+/, "")),
        })
      );
      continue;
    }

    children.push(
      new Paragraph({
        spacing: { after: 160, line: 360 },
        children: parseInlineTextRuns(trimmed),
      })
    );
  }

  if (tableHeader) {
    flushTable();
  }

  // Reference List Section with Hanging Indents (0.5 inch = 720 twips)
  if (bibEntries.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 160 },
        children: [new TextRun({ text: refHeading, bold: true })],
      })
    );

    for (const entry of bibEntries) {
      const md = entry.markdownText || entry.formattedText;
      children.push(
        new Paragraph({
          indent: { left: 720, hanging: 720 },
          spacing: { after: 140, line: 360 },
          children: parseInlineTextRuns(md),
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/**
 * Generates and downloads a real `.docx` file for the response.
 */
export async function exportResponseToWordDocx(
  msg: WebsiteAssistantMessage,
  styleId: string = "apa"
): Promise<Blob> {
  const blob = await generateWordDocxBlob(msg, styleId);
  if (typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ask-scholar-response-${msg.id || Date.now()}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return blob;
}

/**
 * Exports cited sources from a message as valid BibTeX (.bib).
 */
export function exportCitedMessageToBibTeX(
  msg: WebsiteAssistantMessage,
  styleId: string = "apa"
): string {
  const items = getCitedCSLItemsFromMessage(msg, styleId);
  return exportCSLToBibTeX(items);
}

/**
 * Exports cited sources from a message as valid RIS (.ris).
 */
export function exportCitedMessageToRIS(
  msg: WebsiteAssistantMessage,
  styleId: string = "apa"
): string {
  const items = getCitedCSLItemsFromMessage(msg, styleId);
  return exportCSLToRIS(items);
}

/**
 * Downloads a text file (.bib or .ris) in the browser and copies its content to clipboard.
 */
export async function downloadAndCopyReferenceFile(
  content: string,
  filename: string,
  mimeType: string = "text/plain;charset=utf-8"
): Promise<void> {
  if (!content) return;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      // ignore clipboard error in non-secure contexts
    }
  }
  if (typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

