/**
 * Document Intelligence Engine - Parser Integration
 * 
 * Integrates all parsers with the ParserRegistry for automatic format-aware parsing.
 */

import { ParserRegistry } from "./parserRegistry";
import { FormatIdentifier } from "../pipeline/stages/formatIdentifier";
import { DocumentValidator } from "../pipeline/stages/documentValidator";
import { PDFParser } from "./parsers/pdfParser";
import { DOCXParser } from "./parsers/docxParser";
import { TXTParser } from "./parsers/txtParser";
import { MarkdownParser } from "./parsers/markdownParser";
import type { DocumentInput, ParserOperationResult } from "./types";
import type { DocumentFormat } from "../pipeline/stages/formatIdentifier";

// ============================================================================
// Parser Integration
// ============================================================================

/**
 * Integrated document processing pipeline.
 * Handles format detection, validation, and automatic parser selection.
 */
export class DocumentPipeline {
  private static instance: DocumentPipeline;
  private registry: ParserRegistry;
  private formatIdentifier: FormatIdentifier;
  private validator: DocumentValidator;
  private parsersRegistered = false;

  private constructor() {
    this.registry = ParserRegistry.getInstance();
    this.formatIdentifier = FormatIdentifier.getInstance();
    this.validator = DocumentValidator.getInstance();
  }

  static getInstance(): DocumentPipeline {
    if (!DocumentPipeline.instance) {
      DocumentPipeline.instance = new DocumentPipeline();
    }
    return DocumentPipeline.instance;
  }

  /**
   * Register all built-in parsers.
   */
  registerParsers(): void {
    if (this.parsersRegistered) return;

    this.registry.register(new PDFParser());
    this.registry.register(new DOCXParser());
    this.registry.register(new TXTParser());
    this.registry.register(new MarkdownParser());

    this.parsersRegistered = true;
  }

  /**
   * Process a document through the complete pipeline.
   */
  async processDocument(
    input: DocumentInput,
    options?: {
      skipValidation?: boolean;
      formatHint?: DocumentFormat;
    }
  ): Promise<ParserOperationResult> {
    const buffer = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data);

    // 1. Validate document exists
    if (!buffer || buffer.length === 0) {
      return {
        ok: false,
        error: {
          type: "UNSUPPORTED_FORMAT",
          message: "Empty document provided",
        },
      };
    }

    // 2. Detect format
    let format: DocumentFormat;
    if (options?.formatHint) {
      format = options.formatHint;
    } else {
      const extension = input.filename?.includes(".")
        ? input.filename.slice(input.filename.lastIndexOf(".") + 1)
        : undefined;
      const detection = this.formatIdentifier.identify(buffer, input.mimeType, extension);
      format = detection.resolvedFormat;
    }

    // 3. Validate document
    if (!options?.skipValidation) {
      const validation = await this.validator.validate(buffer, format, input.filename, input.mimeType);
      if (validation.status === "invalid") {
        return {
          ok: false,
          error: {
            type: "CORRUPTED",
            message: validation.errors.join("; "),
          },
        };
      }
    }

    // 4. Find and use parser
    const parser = this.registry.get(format);
    if (!parser) {
      return {
        ok: false,
        error: {
          type: "UNSUPPORTED_FORMAT",
          message: `No parser available for format: ${format}`,
        },
      };
    }

    // 5. Parse document
    return parser.parse(input);
  }

  /**
   * Get available formats.
   */
  getAvailableFormats(): string[] {
    return this.registry.getAvailableIds();
  }

  /**
   * Check if format is supported.
   */
  isFormatSupported(format: string): boolean {
    return this.registry.has(format);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

let defaultPipeline: DocumentPipeline | null = null;

/**
 * Get or create the default document pipeline.
 */
export function getDocumentPipeline(): DocumentPipeline {
  if (!defaultPipeline) {
    defaultPipeline = DocumentPipeline.getInstance();
    defaultPipeline.registerParsers();
  }
  return defaultPipeline;
}

/**
 * Process a document using the default pipeline.
 */
export async function processDocument(
  input: DocumentInput,
  options?: {
    skipValidation?: boolean;
    formatHint?: DocumentFormat;
  }
): Promise<ParserOperationResult> {
  return getDocumentPipeline().processDocument(input, options);
}