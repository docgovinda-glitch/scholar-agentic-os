/**
 * Document Intelligence Engine - DOCX Parser
 * 
 * Production-quality DOCX parser using mammoth library.
 * Extracts text, headings, and metadata.
 */

import { inflateRawSync } from "zlib";
import type { Parser, ParserMetadata, DocumentInput, ParserOperationResult, ParserResult } from "../types";

// ============================================================================
// DOCX Parser
// ============================================================================

/**
 * DOCX document parser implementation.
 * Uses mammoth for text extraction.
 */
export class DOCXParser implements Parser {
  metadata: ParserMetadata = {
    id: "docx",
    name: "DOCX Parser",
    description: "Extracts text, headings, and metadata from DOCX documents",
    version: "1.0.0",
    capabilities: {
      mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      extensions: ["docx"],
      supportsMetadata: true,
      supportsStructure: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
    },
  };

  async parse(input: DocumentInput): Promise<ParserOperationResult> {
    const { data, filename } = input;

    // Check for valid DOCX signature (ZIP-based)
    if (!this.isValidDOCX(data)) {
      return {
        ok: false,
        error: {
          type: "UNSUPPORTED_FORMAT",
          message: "File is not a valid DOCX document",
        },
      };
    }

    try {
      // Use mammoth for extraction
      const mammoth = await import("mammoth");
      
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const result = await mammoth.extractRawText({ buffer });

      const normalizedText = (result.value || "").normalize("NFC");

      // Extract paragraphs with potential heading detection
      const paragraphs = this.extractParagraphs(normalizedText);

      // Extract pages (DOCX doesn't have explicit pages, estimate from breaks)
      const pages = this.extractPages(normalizedText).map((p) => ({ ...p, text: p.text.normalize("NFC") }));

      // Extract metadata
      const metadata = await this.extractMetadata(buffer);

      const parserResult: ParserResult = {
        text: normalizedText,
        metadata,
        pages,
        warnings: result.messages?.map((m: any) => m.message) || [],
      };

      return {
        ok: true,
        data: parserResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      let errorType: "PARSE_ERROR" | "CORRUPTED" | "ENCRYPTED" = "PARSE_ERROR";
      if (errorMessage.toLowerCase().includes("encrypted") || errorMessage.toLowerCase().includes("password")) {
        errorType = "ENCRYPTED";
      } else if (errorMessage.toLowerCase().includes("corrupt") || errorMessage.toLowerCase().includes("invalid")) {
        errorType = "CORRUPTED";
      }

      return {
        ok: false,
        error: {
          type: errorType,
          message: `Failed to parse DOCX: ${errorMessage}`,
          cause: error,
        },
      };
    }
  }

  /**
   * Validate DOCX header signature (ZIP-based).
   */
  private isValidDOCX(data: Uint8Array | Buffer): boolean {
    if (data.length < 4) return false;
    
    // DOCX files are ZIP archives - check for ZIP signature
    const header = Buffer.from(data.slice(0, 4)).toString("hex");
    return header === "504b0304"; // PK..
  }

  /**
   * Extract paragraphs from text.
   * Attempts to detect headings by analyzing structure.
   */
  private extractParagraphs(text: string): Array<{ text: string; type?: string }> {
    const paragraphs: Array<{ text: string; type?: string }> = [];
    const lines = text.split(/\r?\n/);
    
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      
      // Simple heuristic: check if line looks like a heading
      // (shorter, no period at end, all caps, or followed by content)
      const isHeading = this.detectHeading(line, paragraphs);
      
      paragraphs.push({
        text: line,
        type: isHeading ? "heading" : "paragraph",
      });
    }
    
    return paragraphs;
  }

  /**
   * Simple heading detection heuristic.
   */
  private detectHeading(line: string, previousParagraphs: Array<{ text: string; type?: string }>): boolean {
    // Skip if already detected as heading
    if (line.length < 100 && !line.endsWith(".")) {
      const trimmed = line.trim();
      // Check for common heading patterns
      if (trimmed === trimmed.toUpperCase() && trimmed.length > 0) {
        return true;
      }
      // Check if followed by paragraph
      if (previousParagraphs.length > 0 && previousParagraphs[previousParagraphs.length - 1]?.type === "heading") {
        return false;
      }
    }
    return false;
  }

  /**
   * Extract pages from text.
   * DOCX doesn't have explicit pages, so we estimate based on content breaks.
   */
  private extractPages(text: string): Array<{ text: string; pageNumber: number }> {
    const pages: Array<{ text: string; pageNumber: number }> = [];
    
    // Simple page estimation: split on double newlines (paragraph breaks)
    // and group by approximate page size (characters)
    const paragraphs = text.split(/\r?\n\r?\n/);
    let currentPageText = "";
    let pageCount = 1;
    const charsPerPage = 3000; // Estimate
    
    for (const para of paragraphs) {
      if (currentPageText.length + para.length > charsPerPage && currentPageText.length > 0) {
        pages.push({ text: currentPageText.trim(), pageNumber: pageCount++ });
        currentPageText = para;
      } else {
        currentPageText += (currentPageText ? "\n\n" : "") + para;
      }
    }
    
    if (currentPageText.trim()) {
      pages.push({ text: currentPageText.trim(), pageNumber: pageCount });
    }
    
    // If no pages created, add the full text as one page
    if (pages.length === 0) {
      pages.push({ text, pageNumber: 1 });
    }
    
    return pages;
  }

  /**
   * Extract metadata from DOCX.
   * Core properties (title, author, subject, keywords, dates) live in the
   * `docProps/core.xml` entry of the DOCX ZIP container - mammoth does not
   * expose these, so they are read directly from the archive here.
   */
  private async extractMetadata(buffer: Buffer): Promise<Record<string, unknown>> {
    const coreXml = this.readZipEntryText(buffer, "docProps/core.xml");
    const core = coreXml ? this.parseCoreProperties(coreXml) : {};

    return {
      title: core.title,
      author: core.creator,
      subject: core.subject,
      keywords: core.keywords,
      creator: core.creator,
      producer: "mammoth",
      createdDate: core.created,
      modifiedDate: core.modified,
      pageCount: 1,
      _raw: core,
    };
  }

  /**
   * Parse Dublin Core / Office core properties from docProps/core.xml.
   * Uses targeted regex extraction rather than a full XML parser, consistent
   * with this engine's deterministic, dependency-free parsing approach.
   */
  private parseCoreProperties(xml: string): Record<string, string | undefined> {
    const extract = (tag: string): string | undefined => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      if (!match) return undefined;
      const value = match[1]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      return value.length > 0 ? value : undefined;
    };

    return {
      title: extract("dc:title"),
      creator: extract("dc:creator"),
      subject: extract("dc:subject"),
      keywords: extract("cp:keywords"),
      created: extract("dcterms:created"),
      modified: extract("dcterms:modified"),
    };
  }

  /**
   * Read and decompress a single named entry from a ZIP (DOCX) archive by
   * scanning local file headers directly. Handles both stored (uncompressed)
   * and deflate-compressed entries, which covers all DOCX writers in practice.
   * Returns the entry's decoded UTF-8 text, or undefined if not found/unreadable.
   */
  private readZipEntryText(buffer: Buffer, entryName: string): string | undefined {
    const LOCAL_HEADER_SIGNATURE = 0x04034b50;
    let offset = 0;

    while (offset < buffer.length - 4) {
      if (buffer.readUInt32LE(offset) !== LOCAL_HEADER_SIGNATURE) {
        offset++;
        continue;
      }

      const compressionMethod = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const filenameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const nameStart = offset + 30;
      const filename = buffer.toString("utf-8", nameStart, nameStart + filenameLength);
      const dataStart = nameStart + filenameLength + extraLength;

      if (filename === entryName) {
        const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
        try {
          if (compressionMethod === 0) {
            return compressed.toString("utf-8");
          }
          if (compressionMethod === 8) {
            return inflateRawSync(compressed).toString("utf-8");
          }
          return undefined; // Unsupported compression method
        } catch {
          return undefined;
        }
      }

      offset = dataStart + compressedSize;
    }

    return undefined;
  }
}

// ============================================================================
// Export
// ============================================================================

export const createDOCXParser = (): Parser => new DOCXParser();