/**
 * Document Intelligence Engine - Format Identification
 * 
 * Deterministic format identification based on file signatures, MIME types, and extensions.
 */

// ============================================================================
// Format Types
// ============================================================================

/**
 * Supported document formats for identification.
 * Extensible - new formats can be added without modifying core logic.
 */
export type DocumentFormat = 
  | "pdf"
  | "docx"
  | "txt"
  | "markdown"
  | "html"
  | "rtf"
  // Future formats - placeholder for extensibility
  | "epub"
  | "odt"
  | "latex"
  | "xml"
  | "jats"
  | "ris"
  | "bibtex"
  | "unknown";

// ============================================================================
// Format Signatures
// ============================================================================

/**
 * File signature (magic bytes) for format detection.
 */
export interface FormatSignature {
  /** Format this signature identifies */
  format: DocumentFormat;
  /** Byte sequence to match (hex strings) */
  signatures: Uint8Array[];
  /** Confidence level when signature matches (0-1) */
  confidence: number;
}

// ============================================================================
// Detection Result
// ============================================================================

/**
 * Format detection result with confidence scoring.
 */
export interface FormatDetectionResult {
  format: DocumentFormat;
  confidence: number;
  method: "signature" | "mimeType" | "extension" | "fallback";
  details?: string;
}

/**
 * Structured identification result for pipeline.
 */
export interface FormatIdentificationResult {
  detections: FormatDetectionResult[];
  resolvedFormat: DocumentFormat;
  confidence: number;
}

// ============================================================================
// Format Identifier
// ============================================================================

/**
 * Magic byte signatures for known formats.
 */
const FORMAT_SIGNATURES: FormatSignature[] = [
  {
    format: "pdf",
    signatures: [new Uint8Array([0x25, 0x50, 0x44, 0x46])], // %PDF
    confidence: 0.95,
  },
  {
    format: "docx",
    signatures: [
      new Uint8Array([0x50, 0x4B, 0x03, 0x04]), // ZIP signature (DOCX is ZIP-based)
    ],
    confidence: 0.7, // Lower confidence as DOCX needs additional check
  },
  {
    format: "epub",
    signatures: [new Uint8Array([0x50, 0x4B, 0x03, 0x04])], // ZIP signature
    confidence: 0.85,
  },
];

/**
 * MIME type to format mapping.
 */
const MIME_TYPE_MAP: Record<string, { format: DocumentFormat; confidence: number }> = {
  "application/pdf": { format: "pdf", confidence: 0.9 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { format: "docx", confidence: 0.95 },
  "text/plain": { format: "txt", confidence: 0.8 },
  "text/markdown": { format: "markdown", confidence: 0.9 },
  "text/html": { format: "html", confidence: 0.9 },
  "text/rtf": { format: "rtf", confidence: 0.85 },
  "application/xml": { format: "xml", confidence: 0.7 },
  "text/xml": { format: "xml", confidence: 0.7 },
  "application/epub+zip": { format: "epub", confidence: 0.95 },
};

/**
 * Extension to format mapping.
 */
const EXTENSION_MAP: Record<string, { format: DocumentFormat; confidence: number }> = {
  "pdf": { format: "pdf", confidence: 0.7 },
  "docx": { format: "docx", confidence: 0.8 },
  "txt": { format: "txt", confidence: 0.6 },
  "md": { format: "markdown", confidence: 0.8 },
  "markdown": { format: "markdown", confidence: 0.8 },
  "html": { format: "html", confidence: 0.7 },
  "htm": { format: "html", confidence: 0.6 },
  "rtf": { format: "rtf", confidence: 0.7 },
  "epub": { format: "epub", confidence: 0.85 },
  "odt": { format: "odt", confidence: 0.7 },
  "tex": { format: "latex", confidence: 0.7 },
  "latex": { format: "latex", confidence: 0.75 },
  "xml": { format: "xml", confidence: 0.6 },
  "ris": { format: "ris", confidence: 0.8 },
  "bib": { format: "bibtex", confidence: 0.7 },
  "bibtex": { format: "bibtex", confidence: 0.75 },
};

// ============================================================================
// Format Identifier Class
// ============================================================================

/**
 * Format identifier that detects document formats using multiple methods.
 */
export class FormatIdentifier {
  private static instance: FormatIdentifier;

  private constructor() {}

  static getInstance(): FormatIdentifier {
    if (!FormatIdentifier.instance) {
      FormatIdentifier.instance = new FormatIdentifier();
    }
    return FormatIdentifier.instance;
  }

  /**
   * Identify document format using all available methods.
   */
  identify(
    data: Uint8Array,
    mimeType?: string,
    extension?: string
  ): FormatIdentificationResult {
    const detections: FormatDetectionResult[] = [];

    // 1. Check magic bytes
    const signatureResult = this.identifyBySignature(data);
    if (signatureResult.format !== "unknown") {
      detections.push(signatureResult);
    }

    // 2. Check MIME type
    if (mimeType) {
      const mimeResult = this.identifyByMimeType(mimeType);
      if (mimeResult.format !== "unknown") {
        detections.push(mimeResult);
      }
    }

    // 3. Check extension
    if (extension) {
      const extResult = this.identifyByExtension(extension);
      if (extResult.format !== "unknown") {
        detections.push(extResult);
      }
    }

    // Resolve conflicts - prefer signature > MIME > extension
    const resolved = this.resolveConflicts(detections);

    return {
      detections,
      resolvedFormat: resolved.format,
      confidence: resolved.confidence,
    };
  }

  private identifyBySignature(data: Uint8Array): FormatDetectionResult {
    for (const sig of FORMAT_SIGNATURES) {
      for (const signature of sig.signatures) {
        if (this.matchesSignature(data, signature)) {
          return {
            format: sig.format,
            confidence: sig.confidence,
            method: "signature",
            details: `Matched ${sig.format} signature`,
          };
        }
      }
    }
    return { format: "unknown", confidence: 0, method: "signature" };
  }

  private identifyByMimeType(mimeType: string): FormatDetectionResult {
    const mapping = MIME_TYPE_MAP[mimeType.toLowerCase()];
    if (mapping) {
      return {
        format: mapping.format,
        confidence: mapping.confidence,
        method: "mimeType",
        details: `MIME type ${mimeType}`,
      };
    }
    return { format: "unknown", confidence: 0, method: "mimeType" };
  }

  private identifyByExtension(extension: string): FormatDetectionResult {
    const mapping = EXTENSION_MAP[extension.toLowerCase()];
    if (mapping) {
      return {
        format: mapping.format,
        confidence: mapping.confidence,
        method: "extension",
        details: `Extension .${extension}`,
      };
    }
    return { format: "unknown", confidence: 0, method: "extension" };
  }

  private matchesSignature(data: Uint8Array, signature: Uint8Array): boolean {
    if (signature.length > data.length) return false;
    for (let i = 0; i < signature.length; i++) {
      if (data[i] !== signature[i]) return false;
    }
    return true;
  }

  /**
   * Resolve conflicting detections.
   * Priority: signature > mimeType > extension
   */
  private resolveConflicts(detections: FormatDetectionResult[]): FormatDetectionResult {
    if (detections.length === 0) {
      return { format: "unknown", confidence: 0, method: "fallback" };
    }

    // Sort by priority and confidence
    const priority: Record<string, number> = {
      signature: 3,
      mimeType: 2,
      extension: 1,
    };

    detections.sort((a, b) => {
      const priorityDiff = priority[b.method] - priority[a.method];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidence - a.confidence;
    });

    // If multiple methods agree, boost confidence
    const topFormat = detections[0].format;
    const agreeingMethods = detections.filter((d) => d.format === topFormat);
    const avgConfidence = agreeingMethods.reduce((sum, d) => sum + d.confidence, 0) / agreeingMethods.length;

    // Boost confidence if multiple methods agree
    const finalConfidence = agreeingMethods.length > 1
      ? Math.min(1, avgConfidence + 0.1 * (agreeingMethods.length - 1))
      : detections[0].confidence;

    return {
      format: detections[0].format,
      confidence: finalConfidence,
      method: detections[0].method,
      details: agreeingMethods.length > 1
        ? `Confirmed by ${agreeingMethods.length} methods`
        : detections[0].details,
    };
  }
}