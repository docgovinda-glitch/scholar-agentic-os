/**
 * Document Intelligence Engine - Parser Types
 * 
 * Defines interfaces for document parser registry and parser implementations.
 * Supports registration, discovery, and versioning of parsers.
 */

// ============================================================================
// Parser Capabilities
// ============================================================================

/**
 * Capabilities a parser can advertise.
 * Used for capability-based discovery.
 */
export interface ParserCapabilities {
  /** Supported MIME types */
  mimeTypes?: string[];
  /** Supported file extensions (without leading dot) */
  extensions?: string[];
  /** Whether parser supports encrypted documents */
  supportsEncryption?: boolean;
  /** Whether parser supports metadata extraction */
  supportsMetadata?: boolean;
  /** Whether parser supports structure extraction */
  supportsStructure?: boolean;
  /** Maximum file size in bytes */
  maxFileSize?: number;
}

// ============================================================================
// Parser Metadata
// ============================================================================

/**
 * Metadata for a document parser.
 */
export interface ParserMetadata {
  /** Unique parser identifier (e.g., 'pdf', 'docx', 'txt') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of parser capabilities */
  description: string;
  /** Parser version (semantic versioning recommended) */
  version: string;
  /** Parser capabilities */
  capabilities: ParserCapabilities;
  /** Author/maintainer */
  author?: string;
}

// ============================================================================
// Parser Definition
// ============================================================================

/**
 * Raw document input - binary content with optional metadata.
 */
export interface DocumentInput {
  /** Raw binary content */
  data: Buffer | Uint8Array;
  /** Original filename */
  filename?: string;
  /** MIME type hint */
  mimeType?: string;
}

/**
 * Parser result - normalized document content.
 */
export interface ParserResult {
  /** Extracted text content */
  text: string;
  /** Extracted metadata (if supported) */
  metadata?: Record<string, unknown>;
  /** Page-level content (if supported) */
  pages?: Array<{ text: string; pageNumber: number }>;
  /** Any warnings during parsing */
  warnings?: string[];
}

/**
 * Error result from parser.
 */
export interface ParserError {
  /** Error type */
  type: "PARSE_ERROR" | "UNSUPPORTED_FORMAT" | "ENCRYPTED" | "CORRUPTED" | "SIZE_LIMIT";
  /** Error message */
  message: string;
  /** Optional cause */
  cause?: unknown;
}

/**
 * Result type for parser operations.
 */
export type ParserOperationResult = 
  | { ok: true; data: ParserResult }
  | { ok: false; error: ParserError };

/**
 * Document parser interface.
 * All parsers must implement this interface for registration.
 */
export interface Parser {
  /** Parser metadata */
  metadata: ParserMetadata;
  
  /**
   * Parse document content.
   * Returns parsed text and optionally metadata/pages.
   */
  parse(input: DocumentInput): Promise<ParserOperationResult> | ParserOperationResult;
}

// ============================================================================
// Parser Registry Types
// ============================================================================

/**
 * Parser entry stored in registry.
 */
export interface ParserEntry {
  parser: Parser;
  registeredAt: string;
  enabled: boolean;
}

/**
 * Options for parser registration.
 */
export interface ParserRegisterOptions {
  /** Force override existing parser with same ID */
  force?: boolean;
}

/**
 * Query options for parser discovery.
 */
export interface ParserQuery {
  /** Filter by MIME type */
  mimeType?: string;
  /** Filter by file extension */
  extension?: string;
  /** Filter by capability */
  capability?: keyof ParserCapabilities;
  /** Filter by minimum version */
  minVersion?: string;
}