/**
 * DOCX writer — exports CanonicalDocument to Word format.
 * Uses the `docx` library for reliable, standard-compliant output.
 * Spec: docs 33-EXPORT-ARCHITECTURE.md §3 stage 4 (render).
 */

import type { Block, CanonicalDocument } from "../../desk/types";
import type { ExportMetadata } from "./types";

export async function renderDocx(document: CanonicalDocument, metadata: ExportMetadata): Promise<Buffer> {
  const { Document, Packer, Paragraph, HeadingLevel } = await import("docx");
  const sections = document.blocks.map((block) => blockToParagraph(block, Paragraph, HeadingLevel));

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: document.title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200, before: 0 },
          }),
          new Paragraph({
            text: `By ${metadata.author || "Author"}`,
            spacing: { after: 400 },
          }),
          ...sections,
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function blockToParagraph(
  block: Block,
  Paragraph: typeof import("docx").Paragraph,
  HeadingLevel: typeof import("docx").HeadingLevel
): import("docx").Paragraph {
  const text = block.text || "";

  switch (block.kind) {
    case "heading1":
      return new Paragraph({
        text,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 120 },
      });
    case "heading2":
      return new Paragraph({
        text,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 120, after: 60 },
      });
    case "heading3":
      return new Paragraph({
        text,
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 120, after: 60 },
      });
    case "quote":
      return new Paragraph({
        text,
        indent: { left: 720, right: 720 },
        spacing: { before: 120, after: 120 },
        style: "Quote",
      });
    case "list-item":
      return new Paragraph({
        text,
        bullet: { level: 0 },
        spacing: { line: 240 },
      });
    default:
      return new Paragraph({
        text: text || " ",
        spacing: { line: 240, after: 100 },
      });
  }
}
