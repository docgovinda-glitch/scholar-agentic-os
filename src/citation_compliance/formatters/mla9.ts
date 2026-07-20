/**
 * MLA 9 Citation Formatter
 * 
 * Formats citations and references according to MLA 9th edition style.
 */

import type { CitationStyle, InTextOptions } from "../formattingEngine";
import type { CanonicalReference } from "../model/reference";

// ============================================================================
// MLA 9 Formatter
// ============================================================================

export class MLA9Formatter implements CitationStyle {
  id = "mla-9";
  name = "MLA 9th Edition";
  version = "9";

  formatInText(reference: CanonicalReference, options?: InTextOptions): string {
    if (!reference.authors || reference.authors.length === 0) {
      return "( ? )";
    }

    const author = reference.authors[0];
    const authorPart = author.lastName;

    if (options && options.locator) {
      return "(" + authorPart + " " + options.locator + ")";
    }

    return "( " + authorPart + " )";
  }

  formatBibliography(reference: CanonicalReference): string {
    const parts: string[] = [];

    // Authors
    if (reference.authors && reference.authors.length > 0) {
      const authorNames = reference.authors.map((a) => a.lastName + ", " + a.firstName);
      if (authorNames.length > 1) {
        const allButLast = authorNames.slice(0, -1).join(", ");
        const last = authorNames[authorNames.length - 1];
        parts.push(allButLast + ", and " + last + ".");
      } else {
        parts.push(authorNames[0] + ".");
      }
    }

    // Title
    parts.push(reference.title);

    // Container
    if (reference.kind === "JournalArticle" && reference.journal) {
      parts.push("*" + reference.journal + "*");
    }

    // Publisher
    if (reference.publisher) {
      parts.push(reference.publisher);
    }

    // Date
    if (reference.publicationDate) {
      const year = reference.publicationDate.substring(0, 4);
      parts.push(", " + year);
    }

    // DOI
    if (reference.doi) {
      const normalizedDoi = reference.doi.startsWith("http") ? reference.doi : "https://doi.org/" + reference.doi;
      parts.push(". " + normalizedDoi);
    }

    return parts.join(" ");
  }

  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }
}