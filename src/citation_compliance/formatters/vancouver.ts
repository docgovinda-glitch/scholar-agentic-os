/**
 * Vancouver Citation Formatter
 */

import type { CitationStyle, InTextOptions } from "../formattingEngine";
import type { CanonicalReference } from "../model/reference";

export class VancouverFormatter implements CitationStyle {
  id = "vancouver";
  name = "Vancouver";
  version = "latest";

  formatInText(reference: CanonicalReference, options?: InTextOptions): string {
    const position = options?.position ?? 1;
    return "[" + position + "]";
  }

  formatBibliography(reference: CanonicalReference): string {
    const parts: string[] = [];

    // Authors (surname first)
    if (reference.authors && reference.authors.length > 0) {
      const authorNames = reference.authors.map((a) => a.lastName + " " + a.firstName.charAt(0));
      if (authorNames.length > 6) {
        parts.push(authorNames.slice(0, 6).join(", ") + ", et al.");
      } else {
        parts.push(authorNames.join(", ") + ".");
      }
    }

    // Title
    parts.push(reference.title + ".");

    // Source
    if (reference.kind === "JournalArticle" && reference.journal) {
      parts.push(reference.journal);
      if (reference.publicationDate) {
        parts.push(";" + reference.publicationDate.substring(0, 4));
      }
      if (reference.pages) {
        parts.push(":" + reference.pages);
      }
    }

    // DOI
    if (reference.doi) {
      const normalizedDoi = reference.doi.startsWith("http") ? reference.doi : "https://doi.org/" + reference.doi;
      parts.push(normalizedDoi);
    }

    return parts.join(" ");
  }

  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n");
  }
}