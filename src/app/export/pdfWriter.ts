/**
 * PDF writer — exports CanonicalDocument to PDF.
 * Uses pdfmake's server build: pdfMake.createPdf(docDefinition).getBuffer()
 * resolves a Node Buffer directly, no intermediate file or stream handling needed.
 * Spec: docs 33-EXPORT-ARCHITECTURE.md §3 stage 4 (render).
 */

import path from "node:path";
import type { Content } from "pdfmake/interfaces";
import type { Block, CanonicalDocument } from "../../desk/types";
import type { ExportMetadata } from "./types";
import { inlineMarkdownRuns } from "../../shared/inlineMarkdown";

let cachedPdfMake: unknown = null;

async function getPdfMake(): Promise<any> {
  if (cachedPdfMake) return cachedPdfMake;
  const pdfMakeModule = await import("pdfmake");
  const pdfMakeInstance = (pdfMakeModule as any).default || pdfMakeModule;
  const fontsModule = await import("pdfmake/fonts/Roboto.js");
  const fonts = (fontsModule as any).default || fontsModule;

  pdfMakeInstance.setFonts(fonts);
  const fontsDir = path.dirname(fonts.Roboto.normal);
  pdfMakeInstance.setUrlAccessPolicy(() => false);
  pdfMakeInstance.setLocalAccessPolicy((filePath: string) => path.resolve(filePath).startsWith(fontsDir));
  cachedPdfMake = pdfMakeInstance;
  return pdfMakeInstance;
}

export async function renderPdf(document: CanonicalDocument, metadata: ExportMetadata): Promise<Buffer> {
  const pdfMake = await getPdfMake();
  const content: Content[] = [
    { text: document.title, style: "title" },
    // No author on record means no byline (never a placeholder name).
    ...(metadata.author ? [{ text: `By ${metadata.author}`, style: "byline" } as Content] : []),
    ...document.blocks.map((block) => blockToContent(block)),
  ];

  const pdfDoc = pdfMake.createPdf({
    content,
    defaultStyle: { font: "Roboto", fontSize: 11 },
    styles: {
      title: { fontSize: 22, bold: true, margin: [0, 0, 0, 10] },
      byline: { fontSize: 11, italics: true, margin: [0, 0, 0, 20] },
      heading1: { fontSize: 18, bold: true, margin: [0, 16, 0, 8] },
      heading2: { fontSize: 15, bold: true, margin: [0, 12, 0, 6] },
      heading3: { fontSize: 13, bold: true, margin: [0, 10, 0, 4] },
      quote: { fontSize: 11, italics: true, margin: [24, 6, 24, 6] },
      listItem: { fontSize: 11, margin: [0, 2, 0, 2] },
      paragraph: { fontSize: 11, margin: [0, 4, 0, 4], lineHeight: 1.3 },
    },
  });

  return pdfDoc.getBuffer();
}

/** Inline *italic* / **bold** as pdfmake runs. */
function runs(text: string): Content {
  return inlineMarkdownRuns(text).map((r) => ({ text: r.text, italics: r.italics, bold: r.bold })) as Content;
}

function blockToContent(block: Block): Content {
  const text = block.text || " ";

  switch (block.kind) {
    case "heading1":
      return { text, style: "heading1" };
    case "heading2":
      return { text, style: "heading2" };
    case "heading3":
      return { text, style: "heading3" };
    case "quote":
      return { text: runs(text), style: "quote" } as Content;
    case "table": {
      const rows = block.rows?.length ? block.rows : [[text]];
      const width = Math.max(...rows.map((r) => r.length), 1);
      return {
        table: {
          headerRows: 1,
          widths: Array.from({ length: width }, () => "*"),
          body: rows.map((r, ri) => Array.from({ length: width }, (_, ci) => ({ text: runs(r[ci] ?? ""), bold: ri === 0 }))),
        },
        layout: "lightHorizontalLines",
        margin: [0, 4, 0, 8],
      } as Content;
    }
    case "list-item":
      return { ul: [{ text: runs(text) } as Content], style: "listItem" };
    default:
      return { text: runs(text), style: "paragraph" } as Content;
  }
}
