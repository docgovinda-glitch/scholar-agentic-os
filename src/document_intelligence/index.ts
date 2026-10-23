/**
 * Document Intelligence Engine
 *
 * Unified entry point for multi-format document ingestion, structure extraction,
 * and text parsing across the Scholar Core platform.
 *
 * Guarantees:
 * 1. Strict ephemeral in-memory buffer handling (zero residual disk writes, Zero Document Storage policy).
 * 2. Lossless Unicode Canonical Composition (NFC) preservation for IAST diacritics (ā, ī, ū, ṛ, ś, ṣ, ṇ) and symbols.
 * 3. Unified parser registry with automatic capability-based discovery (PDF, DOCX, PPTX, Spreadsheet, Markdown, TXT).
 */

import { ParserRegistry } from "./parser/parserRegistry";
import { PDFParser } from "./parser/parsers/pdfParser";
import { DOCXParser } from "./parser/parsers/docxParser";
import { MarkdownParser } from "./parser/parsers/markdownParser";
import { TXTParser } from "./parser/parsers/txtParser";
import { PPTXParser } from "./parser/parsers/pptxParser";
import { SpreadsheetParser } from "./parser/parsers/spreadsheetParser";
import type {
  Parser,
  ParserMetadata,
  ParserCapabilities,
  DocumentInput,
  ParserResult,
  ParserError,
  ParserOperationResult,
  ParserQuery,
  ParserRegisterOptions,
} from "./parser/types";

// Re-export public types
export type {
  Parser,
  ParserMetadata,
  ParserCapabilities,
  DocumentInput,
  ParserResult,
  ParserError,
  ParserOperationResult,
  ParserQuery,
  ParserRegisterOptions,
};

export { ParserRegistry } from "./parser/parserRegistry";
export { PDFParser } from "./parser/parsers/pdfParser";
export { DOCXParser } from "./parser/parsers/docxParser";
export { MarkdownParser } from "./parser/parsers/markdownParser";
export { TXTParser } from "./parser/parsers/txtParser";
export { PPTXParser } from "./parser/parsers/pptxParser";
export { SpreadsheetParser } from "./parser/parsers/spreadsheetParser";
export { detectHeadings } from "./parser/headingDetection";

/**
 * Singleton parser registry with all standard parsers pre-registered.
 */
export const parserRegistry = ParserRegistry.getInstance();

/**
 * Registers all core document parsers into the provided registry (or the default singleton).
 */
export function registerDefaultParsers(registry: ParserRegistry = parserRegistry): void {
  if (!registry.has("pdf")) registry.register(new PDFParser());
  if (!registry.has("docx")) registry.register(new DOCXParser());
  if (!registry.has("markdown")) registry.register(new MarkdownParser());
  if (!registry.has("txt")) registry.register(new TXTParser());
  if (!registry.has("pptx")) registry.register(new PPTXParser());
  if (!registry.has("spreadsheet")) registry.register(new SpreadsheetParser());
}

// Auto-register built-in parsers into default instance
registerDefaultParsers(parserRegistry);

/**
 * Losslessly normalizes Unicode string to NFC form, protecting IAST and mathematical symbols.
 */
export function normalizeUnicodeNFC(text: string): string {
  if (!text) return "";
  return text.normalize("NFC");
}

/**
 * Parses a raw document buffer in-memory via the unified parser registry.
 * Guarantees zero residual disk writes and lossless NFC Unicode preservation.
 */
export async function parseDocument(
  input: DocumentInput,
  parserId?: string
): Promise<ParserOperationResult> {
  // Ensure default parsers are populated
  registerDefaultParsers(parserRegistry);

  const result = await parserRegistry.parse(input, parserId);
  if (!result.ok) {
    // If format unsupported and input looks like UTF-8 text, provide safe fallback
    if (result.error.type === "UNSUPPORTED_FORMAT" && input.data) {
      const raw = Buffer.isBuffer(input.data) ? input.data.toString("utf-8") : Buffer.from(input.data).toString("utf-8");
      // Basic check for readable text
      if (/[\x20-\x7E\t\r\n]{4,}/.test(raw)) {
        const text = normalizeUnicodeNFC(raw.replace(/\r\n/g, "\n").trim());
        return {
          ok: true,
          data: {
            text,
            metadata: { fallback: true, size: input.data.length },
            warnings: ["Parsed via fallback raw text reader"],
          },
        };
      }
    }
    return result;
  }

  // Guarantee NFC normalization across all returned text
  const normalizedResult: ParserResult = {
    ...result.data,
    text: normalizeUnicodeNFC(result.data.text),
    pages: result.data.pages?.map((p) => ({
      ...p,
      text: normalizeUnicodeNFC(p.text),
    })),
  };

  return {
    ok: true,
    data: normalizedResult,
  };
}

/**
 * Cleans raw HTML extracted from URLs into clean scholarly readable text.
 */
export function cleanHtmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/&[^;]+;/g, " ").trim() : "Web Article";

  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");

  cleaned = cleaned
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  return {
    title: normalizeUnicodeNFC(title),
    text: normalizeUnicodeNFC(cleaned),
  };
}
