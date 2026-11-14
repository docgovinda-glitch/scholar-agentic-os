/**
 * MLA 9 Citation Formatter
 * 
 * Formats citations and references according to MLA 9th edition style.
 */

import { doiUrl, endSentence, familyGiven, givenFamily, journalOf, pageRange, publisherOf, quotedTitle, sortedAuthors } from "./bibParts";
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

    return "(" + authorPart + ")";
  }

  /**
   * MLA 9: 'Smith, John, et al. "Title." *Journal*, vol. 12, no. 3, 2021,
   * pp. 45–67, https://doi.org/….' Two authors: "Smith, John, and Maria Lopez."
   */
  formatBibliography(reference: CanonicalReference): string {
    const list = sortedAuthors(reference);
    const authors =
      list.length === 0 ? "" : list.length === 1 ? familyGiven(list[0]) : list.length === 2 ? `${familyGiven(list[0])}, and ${givenFamily(list[1])}` : `${familyGiven(list[0])}, et al`;
    const year = reference.year || reference.publicationDate?.slice(0, 4) || "";
    const link = doiUrl(reference);
    const parts: string[] = [];
    if (authors) parts.push(endSentence(authors));
    if (reference.kind === "Book") {
      parts.push(endSentence(`*${reference.title}*`));
      const tail = [publisherOf(reference), year].filter(Boolean).join(", ");
      if (tail) parts.push(`${tail}${link ? `, ${link}` : ""}.`);
      else if (link) parts.push(endSentence(link));
      return parts.join(" ");
    }
    parts.push(quotedTitle(reference.title, "."));
    const container: string[] = [];
    const journal = journalOf(reference);
    if (journal) container.push(`*${journal}*`);
    if (reference.volume) container.push(`vol. ${reference.volume}`);
    if (reference.issue) container.push(`no. ${reference.issue}`);
    if (year) container.push(year);
    if (reference.pages) container.push(`pp. ${pageRange(reference.pages)}`);
    if (link) container.push(link);
    if (container.length) parts.push(`${container.join(", ")}.`);
    return parts.join(" ");
  }
  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }
}