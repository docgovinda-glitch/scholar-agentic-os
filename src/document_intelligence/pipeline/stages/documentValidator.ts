/**
 * Document Intelligence Engine - Document Validator
 * 
 * Validates document integrity, size limits, and encryption status.
 */

import type { DocumentFormat } from "./formatIdentifier";

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation status.
 */
export type ValidationStatus = "valid" | "invalid" | "warning";

/**
 * Validation result for a document.
 */
export interface ValidationResult {
  status: ValidationStatus;
  errors: string[];
  warnings: string[];
  fingerprint: string; // SHA-256 hash
  metadata: ValidationMetadata;
}

/**
 * Metadata about the validation.
 */
export interface ValidationMetadata {
  fileSize: number;
  detectedFormat: DocumentFormat;
  mimeType?: string;
  filename?: string;
  sizeLimit: number;
  isEncrypted: boolean;
  consistencyCheck: boolean;
}

/**
 * Validation options.
 */
export interface DocumentValidatorOptions {
  maxSizeBytes?: number;
  allowedFormats?: DocumentFormat[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: DocumentValidatorOptions = {
  maxSizeBytes: 100 * 1024 * 1024, // 100MB default
  allowedFormats: ["pdf", "docx", "txt", "markdown", "html", "rtf", "epub", "odt", "latex", "xml", "ris", "bibtex"],
};

// ============================================================================
// Encryption Detection Signatures
// ============================================================================

const ENCRYPTION_SIGNATURES: Record<DocumentFormat, Uint8Array[]> = {
  pdf: [], // Will check %PDF header and look for Encrypt
  docx: [], // Office encryption check (binary)
  txt: [],
  markdown: [],
  html: [],
  rtf: [],
  epub: [],
  odt: [],
  latex: [],
  xml: [],
  jats: [],
  ris: [],
  bibtex: [],
  unknown: [],
};

// ============================================================================
// Document Validator
// ============================================================================

/**
 * Deterministic document validator.
 * Validates format, size, encryption, and consistency.
 */
export class DocumentValidator {
  private static instance: DocumentValidator;

  private constructor(
    private options: DocumentValidatorOptions = DEFAULT_OPTIONS
  ) {}

  static getInstance(options?: DocumentValidatorOptions): DocumentValidator {
    if (!DocumentValidator.instance) {
      DocumentValidator.instance = new DocumentValidator(options);
    }
    return DocumentValidator.instance;
  }

  /**
   * Validate a document.
   */
  async validate(
    data: Uint8Array,
    detectedFormat: DocumentFormat,
    filename?: string,
    mimeType?: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fileSize = data.length;
    const sizeLimit = this.options.maxSizeBytes ?? DEFAULT_OPTIONS.maxSizeBytes!;

    // Check file existence (data must have content)
    if (!data || data.length === 0) {
      errors.push("Document is empty or missing");
    }

    // Check file size
    if (fileSize > sizeLimit) {
      errors.push(`File size ${fileSize} bytes exceeds limit ${sizeLimit} bytes`);
    }

    // Check supported format
    if (detectedFormat === "unknown") {
      errors.push("Unknown or unsupported document format");
    } else if (this.options.allowedFormats && !this.options.allowedFormats.includes(detectedFormat)) {
      errors.push(`Format ${detectedFormat} is not in allowed formats list`);
    }

    // Check encryption
    const isEncrypted = this.detectEncryption(data, detectedFormat);
    if (isEncrypted) {
      errors.push(`Document appears to be password-protected or encrypted`);
    }

    // Check MIME type consistency
    const consistencyCheck = this.checkMimeConsistency(mimeType, detectedFormat);
    if (!consistencyCheck && mimeType) {
      warnings.push(`MIME type ${mimeType} does not match detected format ${detectedFormat}`);
    }

    // Check for basic corruption (file header exists and has minimum size)
    if (fileSize > 0 && !this.checkCorruption(data, detectedFormat)) {
      warnings.push("Document may be corrupted or truncated");
    }

    // Generate fingerprint
    const fingerprint = await this.generateFingerprint(data);

    const status: ValidationStatus = errors.length > 0 ? "invalid" : (warnings.length > 0 ? "warning" : "valid");

    return {
      status,
      errors,
      warnings,
      fingerprint,
      metadata: {
        fileSize,
        detectedFormat,
        mimeType,
        filename,
        sizeLimit,
        isEncrypted,
        consistencyCheck,
      },
    };
  }

  /**
   * Check if document appears encrypted.
   * Note: This is basic detection; actual encrypted files may need format-specific checks.
   */
  private detectEncryption(data: Uint8Array, format: DocumentFormat): boolean {
    // PDF Check: Look for Encrypt in trailer
    if (format === "pdf") {
      const view = new Uint8Array(data.slice(0, Math.min(1024, data.length)));
      const text = new TextDecoder().decode(view);
      // Basic check for encryption indicators in PDF
      if (text.includes("/Encrypt") || text.includes("/Encrypted")) {
        return true;
      }
    }

    // Office formats (DOCX, ODT) - check for encryption flags
    // These are ZIP-based formats; encryption detection requires deeper inspection
    if (format === "docx" || format === "odt") {
      // For now, assume documents with ZIP signature but no typical content markers
      // could be encrypted (simplified check)
      const zipSignature = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
      if (this.matchesSignature(data, zipSignature)) {
        // Could add more sophisticated check for actual encryption
        return false;
      }
    }

    return false;
  }

  /**
   * Check MIME type consistency with detected format.
   */
  private checkMimeConsistency(mimeType: string | undefined, format: DocumentFormat): boolean {
    if (!mimeType) return true;

    const formatMimeMap: Record<DocumentFormat, string[]> = {
      pdf: ["application/pdf"],
      docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      txt: ["text/plain"],
      markdown: ["text/markdown", "text/x-markdown"],
      html: ["text/html"],
      rtf: ["text/rtf", "application/rtf"],
      epub: ["application/epub+zip"],
      odt: ["application/vnd.oasis.opendocument.text"],
      latex: ["text/x-latex", "application/x-latex"],
      xml: ["application/xml", "text/xml"],
      jats: ["application/xml", "text/xml"],
      ris: ["application/x-research-info-systems", "text/plain"],
      bibtex: ["application/x-bibtex", "text/plain"],
      unknown: [],
    };

    const validMimes = formatMimeMap[format] || [];
    return validMimes.some((m) => m.toLowerCase() === mimeType.toLowerCase());
  }

  /**
   * Basic corruption check.
   */
  private checkCorruption(data: Uint8Array, format: DocumentFormat): boolean {
    if (format === "pdf") {
      // PDF must start with %PDF
      const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
      return this.matchesSignature(data, pdfHeader);
    }

    if (format === "docx" || format === "epub") {
      // ZIP-based formats
      const zipHeader = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
      return this.matchesSignature(data, zipHeader);
    }

    // For text formats, check if data is valid text
    if (["txt", "markdown", "html", "rtf", "latex", "xml", "ris", "bibtex"].includes(format)) {
      try {
        const text = new TextDecoder().decode(data);
        // Basic check: if more than 90% printable ASCII, consider it valid text
        const printable = text.replace(/[\x20-\x7E\n\r\t]/g, "").length;
        return printable / text.length < 0.1;
      } catch {
        return false;
      }
    }

    return true; // Unknown format - skip check
  }

  /**
   * Generate SHA-256 fingerprint of document.
   */
  private async generateFingerprint(data: Uint8Array): Promise<string> {
    // Use Web Crypto API if available (browser), otherwise Node.js crypto
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Fallback for Node.js - use simple hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data[i]) | 0;
    }
    return hash.toString(16);
  }

  private matchesSignature(data: Uint8Array, signature: Uint8Array): boolean {
    if (signature.length > data.length) return false;
    for (let i = 0; i < signature.length; i++) {
      if (data[i] !== signature[i]) return false;
    }
    return true;
  }
}