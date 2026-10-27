/**
 * ODT writer — exports CanonicalDocument to OpenDocument Text, so the
 * manuscript opens natively in LibreOffice/OpenOffice and in university
 * systems that accept ODF but not .docx.
 * Spec: docs 33-EXPORT-ARCHITECTURE.md §3 stage 4 (render).
 *
 * Ported from documentExportService.ts's exportToOdt, which established the
 * zip shape this depends on: an .odt is a zip with two load-bearing rules,
 * the usual cause of "corrupt document" when hand-rolling one:
 *   1. `mimetype` must be the FIRST entry and STORED (uncompressed).
 *   2. META-INF/manifest.xml must declare every other part.
 */

import type { Block, CanonicalDocument } from "../../desk/types";
import type { ExportMetadata } from "./types";

/** XML text escaping. Unescaped ampersands in a title are enough to break the file. */
function odfEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function odfParagraphs(text: string, styleName: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `<text:p text:style-name="${styleName}">${odfEscape(line)}</text:p>`)
    .join("");
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
<office:styles>
<style:style style:name="Standard" style:family="paragraph"><style:text-properties style:font-name="Times New Roman" fo:font-size="12pt"/><style:paragraph-properties fo:line-height="200%"/></style:style>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="8.5in" fo:page-height="11in" fo:margin-top="1in" fo:margin-bottom="1in" fo:margin-left="1in" fo:margin-right="1in"/></style:page-layout>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>
</office:document-styles>`;
}

function blockToOdf(block: Block): string {
  const text = block.text || "";

  switch (block.kind) {
    case "heading1":
      return `<text:h text:style-name="Heading1P" text:outline-level="1">${odfEscape(text)}</text:h>`;
    case "heading2":
      return `<text:h text:style-name="Heading2P" text:outline-level="2">${odfEscape(text)}</text:h>`;
    case "heading3":
      return `<text:h text:style-name="Heading3P" text:outline-level="3">${odfEscape(text)}</text:h>`;
    case "quote":
      return odfParagraphs(text, "QuoteP");
    case "list-item":
      return `<text:list text:style-name="ListP"><text:list-item><text:p text:style-name="BodyP">${odfEscape(text)}</text:p></text:list-item></text:list>`;
    default:
      return odfParagraphs(text, "BodyP");
  }
}

function contentXml(document: CanonicalDocument, metadata: ExportMetadata): string {
  const body: string[] = [];

  body.push(`<text:p text:style-name="TitleP">${odfEscape(document.title)}</text:p>`);
  body.push(`<text:p text:style-name="CenterP">By ${odfEscape(metadata.author || "Author")}</text:p>`);

  for (const block of document.blocks) {
    body.push(blockToOdf(block));
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">
<office:automatic-styles>
<style:style style:name="BodyP" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="12pt"/><style:paragraph-properties fo:line-height="200%"/></style:style>
<style:style style:name="QuoteP" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="12pt" fo:font-style="italic"/><style:paragraph-properties fo:line-height="200%" fo:margin-left="0.5in" fo:margin-right="0.5in"/></style:style>
<style:style style:name="ListP" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="12pt"/><style:paragraph-properties fo:line-height="200%"/></style:style>
<style:style style:name="CenterP" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="12pt"/><style:paragraph-properties fo:text-align="center" fo:line-height="200%"/></style:style>
<style:style style:name="TitleP" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="18pt" fo:font-weight="bold"/><style:paragraph-properties fo:text-align="center" fo:line-height="200%"/></style:style>
<style:style style:name="Heading1P" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/><style:paragraph-properties fo:line-height="200%"/></style:style>
<style:style style:name="Heading2P" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="14pt" fo:font-weight="bold"/><style:paragraph-properties fo:line-height="200%"/></style:style>
<style:style style:name="Heading3P" style:family="paragraph" style:parent-style-name="Standard"><style:text-properties fo:font-size="12pt" fo:font-weight="bold"/><style:paragraph-properties fo:line-height="200%"/></style:style>
</office:automatic-styles>
<office:body><office:text>${body.join("")}</office:text></office:body>
</office:document-content>`;
}

export async function renderOdt(document: CanonicalDocument, metadata: ExportMetadata): Promise<Buffer> {
  const JSZipModule = await import("jszip");
  const JSZip = (JSZipModule.default || JSZipModule) as typeof import("jszip");
  const zip = new JSZip();

  // Order and compression matter: `mimetype` first, and stored rather than
  // deflated, or readers reject the package.
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" });
  zip.file("content.xml", contentXml(document, metadata));
  zip.file("styles.xml", stylesXml());
  zip.file(
    "META-INF/manifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`
  );

  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/vnd.oasis.opendocument.text" });
}
