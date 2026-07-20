/**
 * Document Intelligence Engine - CDM Adapter
 * 
 * Converts ParserResult to CanonicalDocumentModel.
 * All parsers use this adapter to ensure consistent output.
 */

import type { ParserResult, ParserMetadata, DocumentInput } from "../parser/types";
import type { CanonicalDocumentModel, DocumentIdentity, DocumentMetadata, DocumentStructure, DocumentStatistics, ParsingDiagnostics } from "../cdm";

// ============================================================================
// CDM Builder
// ============================================================================

let documentIdCounter = 0;

/**
 * Create document identity.
 */
export function createDocumentIdentity(
  data: Uint8Array | Buffer,
  parserMetadata: ParserMetadata,
  input: DocumentInput
): DocumentIdentity {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const crypto = require("crypto");
  const fingerprint = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    id: `doc_${++documentIdCounter}_${Date.now().toString(36)}`,
    fingerprint,
    source: input.filename || "unknown",
    format: parserMetadata.id,
    mimeType: input.mimeType,
    parserVersion: parserMetadata.version,
  };
}

/**
 * Convert text to statistics.
 */
export function calculateStatistics(text: string, pages: Array<{ text: string; pageNumber: number }> | undefined): DocumentStatistics {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  return {
    pageCount: pages?.length ?? 1,
    wordCount: words.length,
    characterCount: text.length,
    paragraphCount: paragraphs.length,
    sectionCount: 0, // Will be populated by structure
    headingCount: 0, // Will be populated by structure
    listCount: 0, // Will be populated by structure
    estimatedReadingTimeMinutes: Math.ceil(words.length / 200), // Average reading speed
  };
}

/**
 * Create default metadata.
 */
export function createDefaultMetadata(): DocumentMetadata {
  return {
    authors: [],
    affiliations: [],
    keywords: [],
    orcids: [],
    dates: {},
  };
}

/**
 * Create default structure.
 */
export function createDefaultStructure(text: string, pages: Array<{ text: string; pageNumber: number }> | undefined): DocumentStructure {
  const paragraphs = text.split(/\n\n+/).map((p, i) => ({
    text: p.trim(),
    position: i,
  }));

  return {
    sections: [],
    headings: [],
    paragraphs,
    pages: (pages ?? [{ text, pageNumber: 1 }]).map((p) => ({
      ...p,
      paragraphs: p.text.split(/\n\n+/).map((para, i) => ({ text: para, position: i })),
    })),
    lists: [],
    tables: [],
    figures: [],
    equations: [],
    captions: [],
    appendices: [],
    footnotes: [],
    endnotes: [],
  };
}

// ============================================================================
// CDM Adapter
// ============================================================================

/**
 * Adapter to convert any ParserResult to CanonicalDocumentModel.
 */
export class CDMAdapter {
  /**
   * Convert ParserResult to CanonicalDocumentModel.
   */
  static toCDM(
    parserResult: ParserResult,
    data: Uint8Array | Buffer,
    parserMetadata: ParserMetadata,
    input: DocumentInput,
    startTime: number = Date.now()
  ): CanonicalDocumentModel {
    const identity = createDocumentIdentity(data, parserMetadata, input);

    // Extract metadata from parser result if available
    const rawMetadata = parserResult.metadata ?? {};
    const metadata: DocumentMetadata = {
      title: rawMetadata.title as string | undefined,
      subtitle: rawMetadata.subject as string | undefined,
      authors: rawMetadata.author ? [{ name: rawMetadata.author as string }] : [],
      affiliations: [],
      abstract: rawMetadata.subject as string | undefined,
      keywords: rawMetadata.keywords ? String(rawMetadata.keywords).split(/[,;]\s*/) : [],
      language: undefined,
      publisher: rawMetadata.producer as string | undefined,
      journal: undefined,
      doi: undefined,
      isbn: undefined,
      issn: undefined,
      orcids: [],
      dates: {
        creationDate: rawMetadata.creationDate ? new Date(rawMetadata.creationDate as string) : undefined,
        modificationDate: rawMetadata.modDate ? new Date(rawMetadata.modDate as string) : undefined,
      },
    };

    const structure = createDefaultStructure(parserResult.text, parserResult.pages);
    const statistics = calculateStatistics(parserResult.text, parserResult.pages);

    return {
      identity,
      metadata,
      structure,
      academicObjects: {
        citations: [],
        bibliography: { entries: [] },
        references: { entries: [] },
      },
      statistics,
      diagnostics: {
        parserUsed: parserMetadata.id,
        warnings: parserResult.warnings ?? [],
        confidence: 0.95,
        processingTimeMs: Date.now() - startTime,
      },
    };
  }
}