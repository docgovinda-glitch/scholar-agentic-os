/**
 * Citation Formatting Engine - Plugin Architecture
 * 
 * Plugin-based design for citation formatting.
 * All formatters implement the same CitationStyle interface.
 */

import type { CanonicalReference, ReferenceKind } from "./model/reference";
import { APA7Formatter } from "./formatters/apa7";
import { MLA9Formatter } from "./formatters/mla9";
import { ChicagoFormatter } from "./formatters/chicago";
import { ChicagoNotesFormatter } from "./formatters/chicagoNotes";
import { HarvardFormatter } from "./formatters/harvard";
import { IEEEFormatter } from "./formatters/ieee";
import { VancouverFormatter } from "./formatters/vancouver";

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

// ============================================================================
// Citation Style Registry
// ============================================================================

/**
 * Registry for citation styles.
 * Supports dependency injection, version management, and default formatters.
 */
export class CitationStyleRegistry {
  private static instance: CitationStyleRegistry;
  private styles: Map<string, CitationStyle> = new Map();

  private constructor() {}

  static getInstance(): CitationStyleRegistry {
    if (!CitationStyleRegistry.instance) {
      CitationStyleRegistry.instance = new CitationStyleRegistry();
      CitationStyleRegistry.instance.registerDefaults();
    }
    return CitationStyleRegistry.instance;
  }

  /**
   * Register the core canonical academic citation formatters with primary IDs and aliases.
   */
  registerDefaults(): void {
    const apa = new APA7Formatter();
    const mla = new MLA9Formatter();
    const chicago = new ChicagoFormatter();
    const chicagoNotes = new ChicagoNotesFormatter();
    const harvard = new HarvardFormatter();
    const ieee = new IEEEFormatter();
    const vancouver = new VancouverFormatter();

    this.register(apa);
    this.styles.set("apa", apa);
    this.styles.set("apa7", apa);
    this.styles.set("apa-7", apa);

    this.register(mla);
    this.styles.set("mla", mla);
    this.styles.set("mla9", mla);
    this.styles.set("mla-9", mla);

    this.register(chicago);
    this.styles.set("chicago", chicago);
    this.styles.set("chicago-author-date", chicago);

    this.register(chicagoNotes);
    this.styles.set("chicago-notes", chicagoNotes);
    this.styles.set("chicago-notes-bibliography", chicagoNotes);

    this.register(harvard);
    this.styles.set("harvard", harvard);

    this.register(ieee);
    this.styles.set("ieee", ieee);

    this.register(vancouver);
    this.styles.set("vancouver", vancouver);
  }

  /**
   * Register a citation style.
   */
  register(style: CitationStyle): void {
    this.styles.set(style.id, style);
  }

  /**
   * Get a citation style by ID or alias.
   */
  get(id: string): CitationStyle | undefined {
    const cleanId = (id || "").toLowerCase().trim();
    return this.styles.get(cleanId) || this.styles.get(id);
  }

  /**
   * Get all registered styles.
   */
  list(): CitationStyle[] {
    return Array.from(this.styles.values());
  }

  /**
   * Get style IDs.
   */
  getAvailableIds(): string[] {
    return Array.from(this.styles.keys());
  }

  /**
   * Check if style exists.
   */
  has(id: string): boolean {
    const cleanId = (id || "").toLowerCase().trim();
    return this.styles.has(cleanId) || this.styles.has(id);
  }

  /**
   * Clear all styles (for testing).
   */
  clear(): void {
    this.styles.clear();
  }
}

// ============================================================================
// Formatter Factory
// ============================================================================

/**
 * Factory for creating citation formatters.
 */
export class CitationFormatterFactory {
  private static defaultRegistry = CitationStyleRegistry.getInstance();

  /**
   * Get formatter for a style.
   */
  static getFormatter(styleId: string): CitationStyle | undefined {
    const normalized = (styleId || "apa").toLowerCase().trim();
    return (
      CitationFormatterFactory.defaultRegistry.get(normalized) ||
      CitationFormatterFactory.defaultRegistry.get("apa") ||
      CitationFormatterFactory.defaultRegistry.get("apa-7")
    );
  }

  /**
   * Format in-text citation.
   */
  static formatInText(styleId: string, reference: CanonicalReference, options?: InTextOptions): string {
    const formatter = CitationFormatterFactory.getFormatter(styleId);
    if (!formatter) {
      return `[Citation: ${reference.title || "Unknown"}]`;
    }
    return formatter.formatInText(reference, options);
  }

  /**
   * Format bibliography entry.
   */
  static formatBibliography(styleId: string, reference: CanonicalReference): string {
    const formatter = CitationFormatterFactory.getFormatter(styleId);
    if (!formatter) {
      return reference.title || "Unknown Reference";
    }
    return formatter.formatBibliography(reference);
  }

  /**
   * Format full reference list.
   */
  static formatReferenceList(styleId: string, references: CanonicalReference[]): string {
    const formatter = CitationFormatterFactory.getFormatter(styleId);
    if (!formatter) {
      return references.map((r) => r.title || "Unknown Reference").join("\n\n");
    }
    return formatter.formatReferenceList(references);
  }
}