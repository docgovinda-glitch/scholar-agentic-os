/**
 * IEEE Citation Formatter
 * 
 * Formats citations and references according to IEEE style.
 */

import { bareDoi, initialsFamily, joinNames, journalOf, pageRange, publisherOf, quotedTitle, sortedAuthors } from "./bibParts";
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

  /**
   * IEEE: 'J. A. Smith, M. Lopez, and K. Berg, "Title," *Journal*, vol. 12, no. 3,
   * pp. 45–67, 2021, doi: 10.1000/xyz.' Up to six authors; seven or more: the
   * first and "et al.". The list number is added by formatReferenceList.
   */
  formatBibliography(reference: CanonicalReference): string {
    const all = sortedAuthors(reference).map(initialsFamily);
    const authors = all.length > 6 ? `${all[0]} et al.` : joinNames(all, all.length > 2 ? ", and" : "and");
    const year = reference.year || reference.publicationDate?.slice(0, 4) || "";
    const doi = bareDoi(reference);
    const link = doi ? `doi: ${doi}` : reference.url ? `[Online]. Available: ${reference.url}` : "";
    const lead = authors ? `${authors}, ` : "";
    if (reference.kind === "Book") {
      const pub = publisherOf(reference);
      const rest = [pub, year].filter(Boolean).join(", ");
      return `${lead}*${reference.title}*.${rest ? ` ${rest}.` : ""}${link ? ` ${link}.` : ""}`.trim();
    }
    const fields: string[] = [];
    const journal = journalOf(reference);
    if (journal) fields.push(`*${journal}*`);
    if (reference.volume) fields.push(`vol. ${reference.volume}`);
    if (reference.issue) fields.push(`no. ${reference.issue}`);
    if (reference.pages) fields.push(`pp. ${pageRange(reference.pages)}`);
    if (year) fields.push(year);
    if (link) fields.push(link);
    return `${lead}${quotedTitle(reference.title, ",")}${fields.length ? ` ${fields.join(", ")}` : ""}`.replace(/,$/, "") + (fields.length ? "." : "");
  }
  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref, i) => `[${i + 1}] ${this.formatBibliography(ref)}`).join("\n");
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