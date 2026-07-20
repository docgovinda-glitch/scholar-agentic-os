/**
 * Citation Formatting Engine - Plugin Architecture
 * 
 * Plugin-based design for citation formatting.
 * All formatters implement the same CitationStyle interface.
 */

import type { CanonicalReference, ReferenceKind } from "./model/reference";

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

// ============================================================================
// Citation Style Registry
// ============================================================================

/**
 * Registry for citation styles.
 * Supports dependency injection and version management.
 */
export class CitationStyleRegistry {
  private static instance: CitationStyleRegistry;
  private styles: Map<string, CitationStyle> = new Map();

  private constructor() {}

  static getInstance(): CitationStyleRegistry {
    if (!CitationStyleRegistry.instance) {
      CitationStyleRegistry.instance = new CitationStyleRegistry();
    }
    return CitationStyleRegistry.instance;
  }

  /**
   * Register a citation style.
   */
  register(style: CitationStyle): void {
    this.styles.set(style.id, style);
  }

  /**
   * Get a citation style by ID.
   */
  get(id: string): CitationStyle | undefined {
    return this.styles.get(id);
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
    return this.styles.has(id);
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
    return CitationFormatterFactory.defaultRegistry.get(styleId);
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
}