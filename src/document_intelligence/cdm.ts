/**
 * Document Intelligence Engine - Canonical Document Model (CDM)
 * 
 * The single, authoritative document representation for the entire platform.
 * Every component consumes and produces CDM instead of format-specific models.
 */

// ============================================================================
// Document Identity
// ============================================================================

/**
 * Document identity and provenance information.
 */
export interface DocumentIdentity {
  /** Unique document identifier */
  id: string;
  /** SHA-256 fingerprint of source document */
  fingerprint: string;
  /** Originating source (file path, URL, or identifier) */
  source: string;
  /** Detected format (pdf, docx, txt, markdown, etc.) */
  format: string;
  /** MIME type from detection or metadata */
  mimeType?: string;
  /** Parser version used for extraction */
  parserVersion: string;
}

// ============================================================================
// Metadata
// ============================================================================

/**
 * Author/affiliation information.
 */
export interface AuthorInfo {
  name: string;
  affiliation?: string;
  orcid?: string;
  email?: string;
}

/**
 * Publication metadata.
 */
export interface PublicationInfo {
  title?: string;
  subtitle?: string;
  authors: AuthorInfo[];
  publisher?: string;
  journal?: string;
  doi?: string;
  isbn?: string;
  issn?: string;
}

/**
 * Date information.
 */
export interface DocumentDates {
  creationDate?: Date;
  modificationDate?: Date;
  publicationDate?: Date;
}

/**
 * Full document metadata.
 */
export interface DocumentMetadata {
  title?: string;
  subtitle?: string;
  authors: AuthorInfo[];
  affiliations: string[];
  abstract?: string;
  keywords: string[];
  language?: string;
  publisher?: string;
  journal?: string;
  doi?: string;
  isbn?: string;
  issn?: string;
  orcids: string[];
  dates: DocumentDates;
}

// ============================================================================
// Document Structure
// ============================================================================

/**
 * Heading level information.
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Document heading.
 */
export interface DocumentHeading {
  level: HeadingLevel;
  text: string;
  position: number;
  anchor?: string;
}

/**
 * List item types.
 */
export type ListType = "ordered" | "unordered" | "definition";

/**
 * Document list.
 */
export interface DocumentList {
  type: ListType;
  items: string[];
  position: number;
}

/**
 * Paragraph with optional styling.
 */
export interface DocumentParagraph {
  text: string;
  position: number;
  style?: string;
}

/**
 * Document section.
 */
export interface DocumentSection {
  title?: string;
  headingLevel?: HeadingLevel;
  paragraphs: DocumentParagraph[];
  headings: DocumentHeading[];
  lists: DocumentList[];
  position: number;
  pageStart?: number;
  pageEnd?: number;
}

/**
 * Page content.
 */
export interface DocumentPage {
  pageNumber: number;
  text: string;
  paragraphs: DocumentParagraph[];
}

/**
 * Table placeholder.
 */
export interface TablePlaceholder {
  position: number;
  rows: number;
  columns: number;
}

/**
 * Figure placeholder.
 */
export interface FigurePlaceholder {
  position: number;
  caption?: string;
  type: "figure" | "equation";
}

/**
 * Caption.
 */
export interface DocumentCaption {
  text: string;
  position: number;
  targetType: "figure" | "table" | "equation";
}

/**
 * Footnote/endnote.
 */
export interface DocumentNote {
  text: string;
  position: number;
  type: "footnote" | "endnote";
}

/**
 * Document structure containing all hierarchical elements.
 */
export interface DocumentStructure {
  sections: DocumentSection[];
  headings: DocumentHeading[];
  paragraphs: DocumentParagraph[];
  pages: DocumentPage[];
  lists: DocumentList[];
  tables: TablePlaceholder[];
  figures: FigurePlaceholder[];
  equations: FigurePlaceholder[];
  captions: DocumentCaption[];
  appendices: DocumentSection[];
  footnotes: DocumentNote[];
  endnotes: DocumentNote[];
}

// ============================================================================
// Academic Objects (Placeholders)
// ============================================================================

/**
 * In-text citation placeholder.
 */
export interface CitationPlaceholder {
  text: string;
  position: number;
}

/**
 * Bibliography placeholder.
 */
export interface BibliographyPlaceholder {
  entries: CitationPlaceholder[];
}

/**
 * References placeholder.
 */
export interface ReferencesPlaceholder {
  entries: CitationPlaceholder[];
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Document statistics.
 */
export interface DocumentStatistics {
  pageCount: number;
  wordCount: number;
  characterCount: number;
  paragraphCount: number;
  sectionCount: number;
  headingCount: number;
  listCount: number;
  estimatedReadingTimeMinutes: number;
}

// ============================================================================
// Diagnostics
// ============================================================================

/**
 * Parsing diagnostics.
 */
export interface ParsingDiagnostics {
  parserUsed: string;
  warnings: string[];
  validationResults?: {
    status: "valid" | "invalid" | "warning";
    errors: string[];
  };
  confidence: number; // 0-1
  processingTimeMs: number;
}

// ============================================================================
// Canonical Document Model
// ============================================================================

/**
 * The Canonical Document Model (CDM).
 * 
 * This is the single, authoritative representation of a document.
 * All components consume and produce CDM instead of format-specific models.
 */
export interface CanonicalDocumentModel {
  /** Document identity and provenance */
  identity: DocumentIdentity;
  /** Document metadata */
  metadata: DocumentMetadata;
  /** Document structure */
  structure: DocumentStructure;
  /** Academic objects (citations, bibliography, references) */
  academicObjects: {
    citations: CitationPlaceholder[];
    bibliography: BibliographyPlaceholder;
    references: ReferencesPlaceholder;
  };
  /** Document statistics */
  statistics: DocumentStatistics;
  /** Parsing diagnostics */
  diagnostics: ParsingDiagnostics;
}