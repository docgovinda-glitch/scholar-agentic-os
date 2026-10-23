/**
 * Document Intelligence Engine - TXT Parser
 * 
 * Production-quality plain text parser.
 * Handles encoding detection and normalization.
 */

import type { Parser, ParserMetadata, DocumentInput, ParserOperationResult, ParserResult } from "../types";

// ============================================================================
// Encoding Detection
// ============================================================================

/**
 * Detected text encoding.
 */
export type TextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "ascii" | "unknown";

// ============================================================================
// TXT Parser
// ============================================================================

/**
 * Plain text document parser implementation.
 * Handles encoding detection and line ending normalization.
 */
export class TXTParser implements Parser {
  metadata: ParserMetadata = {
    id: "txt",
    name: "TXT Parser",
    description: "Extracts and normalizes text from plain text documents",
    version: "1.0.0",
    capabilities: {
      mimeTypes: ["text/plain"],
      extensions: ["txt"],
      supportsMetadata: true,
      supportsStructure: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
    },
  };

  async parse(input: DocumentInput): Promise<ParserOperationResult> {
    const { data } = input;

    try {
      // Detect encoding
      const encoding = this.detectEncoding(data);

      // Decode text
      const text = this.decodeText(data, encoding);

      // Normalize line endings and normalize Unicode NFC
      const normalizedText = this.normalizeLineEndings(text).normalize("NFC");

      // Extract structure
      const paragraphs = this.extractParagraphs(normalizedText);
      const pages = this.estimatePages(normalizedText);

      // Extract metadata
      const metadata = this.extractMetadata(normalizedText, encoding);

      const parserResult: ParserResult = {
        text: normalizedText,
        metadata,
        pages,
        warnings: encoding === "unknown" ? ["Could not detect text encoding"] : [],
      };

      return {
        ok: true,
        data: parserResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        ok: false,
        error: {
          type: "PARSE_ERROR",
          message: `Failed to parse text file: ${errorMessage}`,
          cause: error,
        },
      };
    }
  }

  /**
   * Detect text encoding from byte data.
   */
  private detectEncoding(data: Uint8Array | Buffer): TextEncoding {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);

    // Check for UTF-8 BOM
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return "utf-8";
    }

    // Check for UTF-16 LE BOM
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return "utf-16le";
    }

    // Check for UTF-16 BE BOM
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return "utf-16be";
    }

    // Check for ASCII (all bytes < 128) \u2014 ASCII is a strict subset of UTF-8,
    // so this must be checked before the general UTF-8 validity check below.
    let isAscii = true;
    for (let i = 0; i < Math.min(bytes.length, 1024); i++) {
      if (bytes[i] > 127) {
        isAscii = false;
        break;
      }
    }
    if (isAscii) {
      return "ascii";
    }

    // Try UTF-8 decode
    try {
      const text = bytes.toString("utf-8");
      // Check if it's valid UTF-8 by looking for replacement characters
      if (!text.includes("\uFFFD")) {
        return "utf-8";
      }
    } catch {
      // Not valid UTF-8
    }

    return "unknown";
  }

  /**
   * Decode text based on detected or specified encoding.
   */
  private decodeText(data: Uint8Array | Buffer, encoding: TextEncoding): string {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    // Strip UTF-8 BOM (EF BB BF) before decoding so it doesn't appear in the output text.
    const hasUtf8Bom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
    const content = hasUtf8Bom ? buffer.subarray(3) : buffer;

    switch (encoding) {
      case "utf-8":
        return content.toString("utf-8");
      case "utf-16le":
        return buffer.toString("utf-16le");
      case "utf-16be":
        // Node's Buffer.toString does not support "utf-16be"; swap byte order
        // to obtain a valid utf-16le buffer and decode that instead.
        return buffer.swap16().toString("utf-16le");
      case "ascii":
        return buffer.toString("ascii");
      default:
        // Try UTF-8 first, then fall back to latin1
        try {
          return buffer.toString("utf-8");
        } catch {
          return buffer.toString("latin1");
        }
    }
  }

  /**
   * Normalize line endings to \n.
   */
  private normalizeLineEndings(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  /**
   * Extract paragraphs from text.
   */
  private extractParagraphs(text: string): Array<{ text: string }> {
    return text
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0)
      .map((p) => ({ text: p }));
  }

  /**
   * Estimate pages based on content length.
   */
  private estimatePages(text: string): Array<{ text: string; pageNumber: number }> {
    const charsPerPage = 3000;
    const pages: Array<{ text: string; pageNumber: number }> = [];

    const paragraphs = text.split(/\n\n+/);
    let currentPageText = "";
    let pageCount = 1;

    for (const para of paragraphs) {
      if ((currentPageText.length + para.length) > charsPerPage && currentPageText.length > 0) {
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
    if (pages.length === 0 && text) {
      pages.push({ text, pageNumber: 1 });
    }

    return pages;
  }

  /**
   * Extract basic metadata.
   */
  private extractMetadata(text: string, encoding: TextEncoding): Record<string, unknown> {
    const lines = text.split(/\n/).filter((l) => l.trim().length > 0);
    const words = text.split(/\s+/).filter((w) => w.length > 0);

    return {
      encoding,
      lineCount: lines.length,
      wordCount: words.length,
      characterCount: text.length,
      byteSize: text.length,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export const createTXTParser = (): Parser => new TXTParser();