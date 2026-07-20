/**
 * APA 7 Citation Formatter
 * 
 * Formats citations and references according to APA 7th edition style.
 */

import type { CitationStyle, InTextOptions } from "../formattingEngine";
import type { CanonicalReference, ReferenceAuthor } from "../model/reference";

// ============================================================================
// APA 7 Formatter
// ============================================================================

/**
 * APA 7th edition formatter.
 */
export class APA7Formatter implements CitationStyle {
  id = "apa-7";
  name = "APA 7th Edition";
  version = "7";

  formatInText(reference: CanonicalReference, options?: InTextOptions): string {
    const author = this.formatAuthors(reference.authors, options?.etAl);

    if (options?.position !== undefined && options.locator) {
      return `${author}, ${options.position}`;
    }

    if (reference.publicationDate) {
      const year = reference.publicationDate.substring(0, 4);
      return `(${author}, ${year})`;
    }

    return `( ${author} )`;
  }

  formatBibliography(reference: CanonicalReference): string {
    const parts: string[] = [];

    // Authors
    const authorPart = this.formatAuthors(reference.authors, false);
    parts.push(authorPart);

    // Year
    if (reference.publicationDate) {
      const year = reference.publicationDate.substring(0, 4);
      parts.push(`(${year}).`);
    }

    // Title
    parts.push(reference.title);

    // Source information
    if (reference.kind === "JournalArticle") {
      if (reference.journal) parts.push(`*${reference.journal}*`);
      if (reference.volume) parts.push(`*${reference.volume}*`);
      if (reference.issue) parts.push(`(${reference.issue})`);
      if (reference.pages) parts.push(`, ${reference.pages}`);
    } else if (reference.kind === "Book") {
      const publisher = reference.publisher || reference.source;
      parts.push(`. ${publisher}`);
    } else if (reference.kind === "Website") {
      parts.push(`. ${reference.source}`);
    }

    // DOI/URL
    this.appendDoiOrUrl(parts, reference);

    // Period
    parts[parts.length - 1] = parts[parts.length - 1] + ".";

    return parts.join(" ");
  }

  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /** Format a single author as "Last, F." - omits the initial (and its trailing period) when no first name is known. */
  private formatSingleAuthor(author: ReferenceAuthor): string {
    const initial = author.firstName ? `${author.firstName.charAt(0)}.` : "";
    return initial ? `${author.lastName}, ${initial}` : author.lastName;
  }

  private formatAuthors(authors: ReferenceAuthor[], etAl?: boolean): string {
    if (!authors || authors.length === 0) return "";

    if (etAl && authors.length > 2) {
      return `${authors[0].lastName}, et al.`;
    }

    if (authors.length === 1) {
      return this.formatSingleAuthor(authors[0]);
    }

    if (authors.length === 2) {
      return `${this.formatSingleAuthor(authors[0])} & ${this.formatSingleAuthor(authors[1])}`;
    }

    return `${this.formatSingleAuthor(authors[0])}, et al.`;
  }

  private appendDoiOrUrl(parts: string[], reference: CanonicalReference): void {
    if (reference.doi) {
      const normalizedDoi = reference.doi.startsWith("http") ? reference.doi : `https://doi.org/${reference.doi}`;
      parts.push(`. ${normalizedDoi}`);
    } else if (reference.url) {
      parts.push(`. Retrieved from ${reference.url}`);
    }
  }
}