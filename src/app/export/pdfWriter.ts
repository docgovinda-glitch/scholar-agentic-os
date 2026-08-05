/**
 * PDF writer — exports CanonicalDocument to PDF.
 * Uses pdfmake's server build: pdfMake.createPdf(docDefinition).getBuffer()
 * resolves a Node Buffer directly, no intermediate file or stream handling needed.
 * Spec: docs 33-EXPORT-ARCHITECTURE.md §3 stage 4 (render).
 */

import path from "node:path";
import pdfMake from "pdfmake";
import fonts from "pdfmake/fonts/Roboto.js";
import type { Content } from "pdfmake/interfaces";
import type { Block, CanonicalDocument } from "../../desk/types";
import type { ExportMetadata } from "./types";

pdfMake.setFonts(fonts);
// Content is our own rendered document text, not user-supplied URLs or local
// paths — deny network access entirely, and local access to everything
// except the bundled font files pdfmake itself needs to read to render text.
const fontsDir = path.dirname(fonts.Roboto.normal);
pdfMake.setUrlAccessPolicy(() => false);
pdfMake.setLocalAccessPolicy((filePath: string) => path.resolve(filePath).startsWith(fontsDir));

export async function renderPdf(document: CanonicalDocument, metadata: ExportMetadata): Promise<Buffer> {
  const content: Content[] = [
    { text: document.title, style: "title" },
    { text: `By ${metadata.author || "Author"}`, style: "byline" },
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
      paragraph: { fontSize: 11, margin: [0, 4, 0, 4] },
    },
  });

  return pdfDoc.getBuffer();
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
      return { text, style: "quote" };
    case "list-item":
      return { ul: [text], style: "listItem" };
    default:
      return { text, style: "paragraph" };
  }
}
