/**
 * IEEE Citation Formatter
 * 
 * Formats citations and references according to IEEE style.
 */

import type { CitationStyle, InTextOptions } from "../formattingEngine";
import type { CanonicalReference } from "../model/reference";

// ============================================================================
// IEEE Formatter
// ============================================================================

/**
 * IEEE formatter.
 */
export class IEEEFormatter implements CitationStyle {
  id = "ieee";
  name = "IEEE";
  version = "latest";

  formatInText(reference: CanonicalReference, options?: InTextOptions): string {
    const position = options?.position ?? 1;
    return `[${position}]`;
  }

  formatBibliography(reference: CanonicalReference): string {
    const parts: string[] = [];

    // Authors
    const authorPart = this.formatAuthors(reference.authors);
    parts.push(authorPart);

    // Title in quotes
    parts.push(`"${reference.title}"`);

    // Source information
    if (reference.kind === "JournalArticle") {
      if (reference.journal) parts.push(reference.journal);
      if (reference.volume) parts.push(`vol. ${reference.volume}`);
      if (reference.pages) parts.push(`pp. ${reference.pages}`);
      if (reference.year) parts.push(`${reference.year}`);
    } else if (reference.kind === "ConferencePaper") {
      if (reference.source) parts.push(reference.source);
      if (reference.year) parts.push(`${reference.year}`);
    } else if (reference.kind === "Book") {
      const publisher = reference.publisher || reference.source;
      parts.push(publisher);
      if (reference.year) parts.push(`${reference.year}`);
    }

    // DOI
    if (reference.doi) {
      const normalizedDoi = reference.doi.startsWith("http") ? reference.doi : `https://doi.org/${reference.doi}`;
      parts.push(normalizedDoi);
    }

    // Period
    parts[parts.length - 1] = parts[parts.length - 1] + ".";

    return parts.join(", ");
  }

  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref, i) => this.formatBibliography({ ...ref, _position: i + 1 })).join("\n");
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private formatAuthors(authors: Array<{ firstName: string; lastName: string }> | undefined): string {
    if (!authors || authors.length === 0) return "";

    if (authors.length === 1) {
      return `${authors[0].firstName} ${authors[0].lastName}`;
    }

    return `${authors[0].firstName} ${authors[0].lastName} et al.`;
  }
}