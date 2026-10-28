/**
 * Document Intelligence Engine - PDF Parser
 * 
 * Production-quality PDF parser using pdf-parse library.
 * Extracts text, pages, and metadata.
 */

import type { Parser, ParserMetadata, DocumentInput, ParserOperationResult, ParserResult } from "../types";

// ============================================================================
// PDF Parser
// ============================================================================

/**
 * PDF document parser implementation.
 * Uses pdf-parse for text extraction.
 */
export class PDFParser implements Parser {
  metadata: ParserMetadata = {
    id: "pdf",
    name: "PDF Parser",
    description: "Extracts text, pages, and metadata from PDF documents",
    version: "1.0.0",
    capabilities: {
      mimeTypes: ["application/pdf"],
      extensions: ["pdf"],
      supportsMetadata: true,
      supportsStructure: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
    },
  };

  async parse(input: DocumentInput): Promise<ParserOperationResult> {
    const { data, filename } = input;

    // Check for encrypted documents
    if (this.isEncrypted(data)) {
      return {
        ok: false,
        error: {
          type: "ENCRYPTED",
          message: "PDF document is password-protected or encrypted",
        },
      };
    }

    // Check for valid PDF header
    if (!this.isValidPDF(data)) {
      return {
        ok: false,
        error: {
          type: "UNSUPPORTED_FORMAT",
          message: "File is not a valid PDF document",
        },
      };
    }

    try {
      // Use pdf-parse for extraction dynamically without bundling Node-only pdfjs-dist into the browser client
      const pdfParsePkg = "pdf-parse";
      const pdfParseModule = await import(/* @vite-ignore */ pdfParsePkg);
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      let extractedText = "";
      let pages: Array<{ text: string; pageNumber: number }> = [];
      let metadata: Record<string, unknown> = {};

      if (typeof (pdfParseModule as any).PDFParse === "function") {
        const parser = new (pdfParseModule as any).PDFParse({ data: buffer });
        const result = await parser.getText();
        extractedText = result?.text || "";
        try {
          const infoResult = await parser.getInfo();
          metadata = this.extractMetadata(result, infoResult);
        } catch {
          metadata = {};
        }
        pages = this.extractPages(result);
      } else {
        const fn = (pdfParseModule as any).default || pdfParseModule;
        if (typeof fn === "function") {
          const res = await fn(buffer);
          extractedText = res?.text || "";
          metadata = {
            pageCount: res?.numpages,
            info: res?.info,
          };
          if (res?.numpages) {
            pages = [{ text: extractedText, pageNumber: 1 }];
          }
        }
      }

      extractedText = extractedText.normalize("NFC");
      pages = pages.map((p) => ({ ...p, text: p.text.normalize("NFC") }));

      const parserResult: ParserResult = {
        text: extractedText,
        metadata,
        pages,
        warnings: [],
      };

      // Check for potential issues
      if (!extractedText || extractedText.trim().length === 0) {
        parserResult.warnings?.push("No text content extracted - document may be image-only");
      }

      return {
        ok: true,
        data: parserResult,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Determine error type
      let errorType: "PARSE_ERROR" | "CORRUPTED" | "SIZE_LIMIT" | "ENCRYPTED" = "PARSE_ERROR";
      if (errorMessage.toLowerCase().includes("encrypted") || errorMessage.toLowerCase().includes("password")) {
        errorType = "ENCRYPTED";
      } else if (errorMessage.toLowerCase().includes("corrupt") || errorMessage.toLowerCase().includes("invalid")) {
        errorType = "CORRUPTED";
      }

      return {
        ok: false,
        error: {
          type: errorType,
          message: `Failed to parse PDF: ${errorMessage}`,
          cause: error,
        },
      };
    }
  }

  /**
   * Check if PDF is encrypted/password-protected.
   */
  private isEncrypted(data: Uint8Array | Buffer): boolean {
    const view = Buffer.isBuffer(data) 
      ? data.subarray(0, Math.min(2048, data.length))
      : data.slice(0, Math.min(2048, data.length));
    
    const header = Buffer.from(view).toString("utf8", 0, Math.min(2048, data.length));
    
    // Check for encryption indicators in PDF header/trailer
    return header.includes("/Encrypt") || header.includes("/Encrypted") || header.includes("/Password");
  }

  /**
   * Validate PDF header signature.
   */
  private isValidPDF(data: Uint8Array | Buffer): boolean {
    if (data.length < 5) return false;
    
    const header = Buffer.from(data.slice(0, 5)).toString("ascii");
    return header.startsWith("%PDF-");
  }

  /**
   * Extract pages from pdf-parse result.
   */
  private extractPages(result: any): Array<{ text: string; pageNumber: number }> {
    const pages: Array<{ text: string; pageNumber: number }> = [];
    
    // pdf-parse v2 returns per-page text in result.pages (array of { num, text })
    if (Array.isArray(result.pages) && result.pages.length > 0) {
      for (const page of result.pages) {
        pages.push({
          text: page.text || "",
          pageNumber: page.num || pages.length + 1,
        });
      }
      return pages;
    }

    // Fallback to splitting the full text by form feed characters
    const fullText = result.text || "";
    const pageCount = fullText.includes("\f")
      ? fullText.split("\f").length
      : 1;

    if (pageCount > 1) {
      const textPages = fullText.split("\f");
      for (let i = 0; i < textPages.length; i++) {
        pages.push({
          text: textPages[i] || "",
          pageNumber: i + 1,
        });
      }
    } else {
      pages.push({
        text: fullText,
        pageNumber: 1,
      });
    }
    
    return pages;
  }

  /**
   * Extract metadata from pdf-parse result.
   */
  private extractMetadata(result: any, infoResult: any): Record<string, unknown> {
    const info = infoResult?.info || {};
    const pageCount = infoResult?.total || result.pages?.length || 1;
    
    return {
      title: info.Title || undefined,
      author: info.Author || undefined,
      subject: info.Subject || undefined,
      keywords: info.Keywords || undefined,
      creator: info.Creator || undefined,
      producer: info.Producer || undefined,
      creationDate: info.CreationDate || undefined,
      modDate: info.ModDate || undefined,
      pageCount,
      // Store raw info for reference
      _raw: info,
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export const createPDFParser = (): Parser => new PDFParser();