/**
 * Harvard Citation Formatter
 */

import type { CitationStyle, InTextOptions } from "../formattingEngine";
import { authorDateYear, type CanonicalReference } from "../model/reference";

export class HarvardFormatter implements CitationStyle {
  id = "harvard";
  name = "Harvard";
  version = "latest";

  formatInText(reference: CanonicalReference, options?: InTextOptions): string {
    if (!reference.authors || reference.authors.length === 0) {
      return "(????)";
    }

    const author = reference.authors[0].lastName;
    const year = authorDateYear(reference);
    if (options && options.locator) {
      return "(" + author + " " + year + " " + options.locator + ")";
    }
    return "(" + author + " " + year + ")";
  }

  formatBibliography(reference: CanonicalReference): string {
    const parts: string[] = [];

    if (reference.authors && reference.authors.length > 0) {
      const authorNames = reference.authors.map((a) => (a.firstName ? a.lastName + ", " + a.firstName : a.lastName));
      parts.push(authorNames.join(", ") + ".");
    }

    parts.push(authorDateYear(reference));

    parts.push(reference.title + ".");

    if (reference.kind === "JournalArticle" && reference.journal) {
      parts.push(reference.journal);
    }

    if (reference.doi) {
      const normalizedDoi = reference.doi.startsWith("http") ? reference.doi : "https://doi.org/" + reference.doi;
      parts.push(normalizedDoi);
    }

    return parts.join(" ");
  }

  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }
}