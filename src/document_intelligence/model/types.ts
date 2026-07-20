/**
 * Document Intelligence Engine - Canonical Document Model (CDM)
 * 
 * Canonical representation for deterministic document parsing and knowledge extraction.
 * 
 * IMPORTANT:
 * - Cycle 1 defines the model and interfaces only.
 * - Parsers/extractors will be implemented in later cycles.
 */

import type { ISODateString } from "../../core/domain";

export type CanonicalEntityId = string;

export interface DocumentMetadata {
  // File & document identity
  documentId: CanonicalEntityId;
  fingerprint: string;

  // Source information
  source: {
    filename?: string;
    path?: string;
    mimeType?: string;
    uploadId?: string;
  };

  // Normalized language/encoding info (placeholders in Cycle 1)
  language?: {
    detected?: string;
    confidence?: number;
  };
  encoding?: {
    normalized?: string;
  };

  // Academic metadata (extraction in later cycles)
  title?: string;
  authors?: string[];
  affiliations?: string[];
  abstract?: string;
  keywords?: string[];

  // High-level flags
  isEncrypted?: boolean;
  isCorrupted?: boolean;

  // Processing info
  createdAt: ISODateString;
  updatedAt: ISODateString;

  // Extensible metadata bag for future modules
  [key: string]: unknown;
}

export interface Attachment {
  id: CanonicalEntityId;
  type: "raw_text" | "extracted_tables" | "extracted_figures" | "other";
  filename?: string;
  contentType?: string;
  // For Cycle 1, we only define structure; actual storage happens in later phases.
  storageKey?: string;
  metadata?: Record<string, unknown>;
}

export interface Document {
  id: CanonicalEntityId;

  // Structural containers
  pages: Page[];

  // Document-level structure
  sections: Section[];

  // Content containers
  paragraphs: Paragraph[];

  // Visual/Tabular entities
  tables: Table[];
  figures: Figure[];

  // References & scholarly apparatus
  references: Reference[];

  // Optional supporting artifacts
  attachments?: Attachment[];

  // Deterministic searchable text + chunk metadata (index prep; contents in Cycle 1 will be placeholders)
  searchable: {
    fullText: string;
    chunks: Chunk[];
  };

  // Engine metadata
  metadata: DocumentMetadata;

  // Pipeline diagnostics (useful for partial parsing)
  diagnostics?: {
    warnings?: string[];
    stages?: Array<{
      stageId: string;
      ok: boolean;
      warnings?: string[];
      errors?: string[];
    }>;
  };
}

export interface Page {
  id: CanonicalEntityId;
  index: number; // 1-based or 0-based is consistent within engine; we keep 1-based to avoid ambiguity
  documentId: CanonicalEntityId;

  // Deterministic mapping: which sections/paragraphs belong to page
  sectionIds: CanonicalEntityId[];
  paragraphIds: CanonicalEntityId[];

  // Searchable content for page (placeholder in Cycle 1)
  extractedText: string;

  // Coordinates could be added later for advanced rendering; Cycle 1 keeps it deterministic by design.
  metadata?: Record<string, unknown>;
}

export type ElementRole =
  | "title"
  | "heading"
  | "paragraph"
  | "abstract"
  | "keyword_block"
  | "introduction"
  | "methods"
  | "results"
  | "discussion"
  | "conclusion"
  | "acknowledgements"
  | "funding"
  | "conflict_of_interest"
  | "supplementary"
  | "reference"
  | "footnote"
  | "appendix"
  | "other";

export interface Section {
  id: CanonicalEntityId;
  documentId: CanonicalEntityId;

  // Hierarchy
  parentSectionId?: CanonicalEntityId;
  childSectionIds: CanonicalEntityId[];

  // Heading info
  heading: {
    text: string;
    level?: number; // 1..n if known
    role?: ElementRole;
  };

  // Membership
  pageIds: CanonicalEntityId[];
  paragraphIds: CanonicalEntityId[];

  // Deterministic order
  order: number;

  // Normalized role tags for academic structure extraction
  roles: ElementRole[];

  metadata?: Record<string, unknown>;
}

export interface Paragraph {
  id: CanonicalEntityId;
  documentId: CanonicalEntityId;

  pageId?: CanonicalEntityId;
  sectionId?: CanonicalEntityId;

  order: number;
  role?: ElementRole;

  text: string;

  // Fine-grained segmentation placeholders for later cycles
  // e.g., equation spans, citation spans, etc.
  metadata?: Record<string, unknown>;
}

export interface Table {
  id: CanonicalEntityId;
  documentId: CanonicalEntityId;

  pageId?: CanonicalEntityId;
  caption?: {
    id: CanonicalEntityId;
    text: string;
  };

  // Deterministic table representation placeholder
  // In Cycle 6B-Cycle 6 we will refine to rows/cols with type detection.
  rows: Array<Array<string | null>>;

  metadata?: Record<string, unknown>;
}

export interface Figure {
  id: CanonicalEntityId;
  documentId: CanonicalEntityId;

  pageId?: CanonicalEntityId;
  caption?: {
    id: CanonicalEntityId;
    text: string;
  };

  // In Cycle 1 we keep figure content as placeholder.
  // Later cycles can integrate OCR hooks or extracted image blobs.
  metadata?: Record<string, unknown>;
}

export interface Reference {
  id: CanonicalEntityId;
  documentId: CanonicalEntityId;

  pageId?: CanonicalEntityId;
  sectionId?: CanonicalEntityId;

  // Reference text (normalized later)
  rawText: string;

  // Deterministic role tags: main references, footnotes, bibliography items, etc.
  role?: "references" | "footnote_reference" | "other";

  // Placeholder fields for citation engine integration
  citation?: {
    title?: string;
    authors?: string[];
    year?: string;
    doi?: string;
    url?: string;
  };

  metadata?: Record<string, unknown>;
}

export interface Chunk {
  id: CanonicalEntityId;
  documentId: CanonicalEntityId;

  // Stable boundary definition for future indexing/search preparation
  sectionId?: CanonicalEntityId;

  // Deterministic span markers: paragraph indices/order ranges
  paragraphOrderStart?: number;
  paragraphOrderEnd?: number;

  // Index-ready content
  text: string;

  // Optional metadata
  metadata?: Record<string, unknown>;
}

export interface DocumentIntelligencePartialModel {
  // Allow incremental building across pipeline stages.
  documentId: CanonicalEntityId;

  metadata?: Partial<DocumentMetadata>;
  pages?: Page[];
  sections?: Section[];
  paragraphs?: Paragraph[];
  tables?: Table[];
  figures?: Figure[];
  references?: Reference[];
  searchable?: Partial<Document["searchable"]>;
  diagnostics?: Document["diagnostics"];
}
