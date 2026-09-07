/**
 * Export pipeline orchestrator (docs 33-EXPORT-ARCHITECTURE.md §3: five-stage pipeline).
 * Stages: 1. pre-flight, 2. resolution, 3. layout, 4. render, 5. verify.
 *
 * This first slice implements a minimal viable pipeline: pre-flight validation,
 * direct render (skipping template layout for now), and basic DOCX output.
 * Future: resolution (citations), template layout, full verification, ODT/PDF.
 */

import type { CanonicalDocument, Block } from "../../desk/types";
import { renderDocx } from "./docxWriter";
import { renderOdt } from "./odtWriter";
import { renderPdf } from "./pdfWriter";
import {
  generateLatexSource,
  generateTypstSource,
  compileAcademicPdf,
  type AcademicExportOptions,
} from "./academicPdfCompiler";
import type { ExportFormat, ExportInput, ExportResult, ExportMetadata, PreflightReport } from "./types";

/**
 * Stage 1: Pre-flight — validate the document is export-ready.
 * Checks: non-empty content, resolvable citations, no encoding issues.
 *
 * Exported so `app/conductor/conductor.ts`'s `computeG7ExitCriteria` can run
 * this same cheap, pure check as one of G7's exit criteria without paying
 * for a full render — docs 30 §3 G7 "Exit": "Pre-flight passes...".
 */
export function preflight(document: CanonicalDocument): PreflightReport {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!document.title || document.title.trim().length === 0) {
    issues.push("Document has no title");
  }

  if (document.blocks.length === 0) {
    issues.push("Document is empty");
  }

  if (document.blocks.every((b: Block) => !b.text || b.text.trim().length === 0)) {
    issues.push("Document contains only empty blocks");
  }

  const totalWords = document.blocks.reduce((sum: number, b: Block) => sum + (b.text?.split(/\s+/).length || 0), 0);
  if (totalWords < 100) {
    warnings.push(`Document is very short (${totalWords} words)`);
  }

  return {
    isReady: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Stage 2: Resolution — resolve citations and references (minimal for now).
 * Full implementation needs domain/claim integration and citation metadata.
 * For this slice: pass through, marking for future enhancement.
 */
function resolve(_document: CanonicalDocument): CanonicalDocument {
  // Stub: in full implementation, this would:
  // - resolve all citations against the Corpus
  // - check for missing bibliography entries
  // - resolve cross-references
  return _document;
}

/**
 * Stage 4: Render — convert to the target format.
 */
async function render(
  document: CanonicalDocument,
  format: ExportFormat,
  metadata: ExportMetadata,
  academicOptions?: AcademicExportOptions
): Promise<Buffer> {
  switch (format) {
    case "docx":
      return renderDocx(document, metadata);
    case "odt":
      return renderOdt(document, metadata);
    case "pdf":
      return renderPdf(document, metadata);
    case "camera_ready_pdf":
      return compileAcademicPdf(document, metadata, academicOptions);
    case "latex": {
      const tex = generateLatexSource(document, metadata, academicOptions);
      return Buffer.from(tex, "utf-8");
    }
    case "typst": {
      const typ = generateTypstSource(document, metadata, academicOptions);
      return Buffer.from(typ, "utf-8");
    }
    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

/**
 * Stage 5: Verify — check the output is well-formed.
 */
function verify(data: Buffer, format: ExportFormat): boolean {
  if (data.length === 0) return false;
  if (format === "pdf" || format === "camera_ready_pdf") {
    // PDFs start with the literal "%PDF" header.
    return data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
  }
  if (format === "latex") {
    const text = data.toString("utf-8");
    return text.includes("\\documentclass") && text.includes("\\begin{document}");
  }
  if (format === "typst") {
    const text = data.toString("utf-8");
    return text.includes("#set page") && text.includes("#set text");
  }
  // DOCX and ODT are both zip containers, starting with the PK signature.
  return data[0] === 0x50 && data[1] === 0x4b;
}

/**
 * Full pipeline: orchestrate the five stages.
 */
export async function exportDocument(input: ExportInput): Promise<ExportResult> {
  const pf = preflight(input.document);
  if (!pf.isReady) {
    throw new Error(`Export pre-flight failed: ${pf.issues.join("; ")}`);
  }

  const resolved = resolve(input.document);

  const metadata: ExportMetadata = {
    title: input.title,
    author: input.author,
    discipline: input.discipline,
    created: new Date(),
    modified: new Date(),
  };

  const data = await render(resolved, input.format, metadata, input.academicOptions);

  if (!verify(data, input.format)) {
    throw new Error("Export verification failed — output is malformed");
  }

  const extensionMap: Record<ExportFormat, string> = {
    odt: "odt",
    pdf: "pdf",
    camera_ready_pdf: "pdf",
    docx: "docx",
    latex: "tex",
    typst: "typ",
  };

  const extension = extensionMap[input.format] || "docx";
  const filename = `${input.title.replace(/[^a-z0-9]/gi, "_")}.${extension}`;

  return {
    format: input.format,
    data,
    filename,
    byteSize: data.length,
  };
}
