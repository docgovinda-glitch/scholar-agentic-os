import type { CanonicalReference } from "./model/reference";

// ============================================================================
// Citation Style Interface
// ============================================================================

/**
 * Citation style interface that all formatters must implement.
 */
export interface CitationStyle {
  /** Unique style identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Style version (e.g., "7" for APA 7) */
  version: string;

  /**
   * Format an in-text citation.
   */
  formatInText(reference: CanonicalReference, options?: InTextOptions): string;

  /**
   * Format a bibliography entry.
   */
  formatBibliography(reference: CanonicalReference): string;

  /**
   * Format a full reference list.
   */
  formatReferenceList(references: CanonicalReference[]): string;

  /**
   * Notes-style citation support (Chicago 17 Notes-Bibliography, and any
   * future footnote/endnote style).
   */
  formatNote?(reference: CanonicalReference, options?: NoteOptions): string;
  /** The shortened form used for the second and later citations of the same source (CMOS 17 §14.34). */
  formatShortNote?(reference: CanonicalReference, options?: NoteOptions): string;
}

/**
 * In-text citation options.
 */
export interface InTextOptions {
  /** Position in author-date styles */
  position?: number;
  /** Page locator */
  locator?: string;
  /** Suppress author (et al.) */
  etAl?: boolean;
  /** Include URL/DOI */
  includeUrl?: boolean;
}

/** Options for a notes-style (footnote/endnote) citation. */
export interface NoteOptions {
  /** The specific page/section this citation instance points to — distinct from a bibliography entry's full page range. */
  locator?: string;
}
