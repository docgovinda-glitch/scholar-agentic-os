/**
 * Vancouver Citation Formatter
 */

import { bareDoi, endSentence, familyBareInitials, journalOf, publisherOf, sortedAuthors } from "./bibParts";
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

  /**
   * Vancouver (ICMJE/NLM): "Smith JA, Lopez M, Berg K. Title. Journal.
   * 2021;12(3):45-67. doi:10.1000/xyz" Up to six authors, then "et al.".
   */
  formatBibliography(reference: CanonicalReference): string {
    const all = sortedAuthors(reference).map(familyBareInitials);
    const authors = all.length > 6 ? `${all.slice(0, 6).join(", ")}, et al.` : all.length ? `${all.join(", ")}.` : "";
    const year = reference.year || reference.publicationDate?.slice(0, 4) || "";
    const doi = bareDoi(reference);
    const parts: string[] = [];
    if (authors) parts.push(authors);
    parts.push(endSentence(reference.title));
    if (reference.kind === "Book") {
      const pub = publisherOf(reference);
      const tail = [pub, year].filter(Boolean).join("; ");
      if (tail) parts.push(`${tail}.`);
    } else {
      const journal = journalOf(reference);
      if (journal) parts.push(endSentence(journal));
      let cite = year;
      if (reference.volume) cite += `;${reference.volume}`;
      if (reference.issue) cite += `(${reference.issue})`;
      if (reference.pages) cite += `:${(reference.pages ?? "").replace(/\s*[–—]\s*/g, "-")}`;
      if (cite) parts.push(`${cite}.`);
    }
    if (doi) parts.push(`doi:${doi}`);
    else if (reference.url) parts.push(`Available from: ${reference.url}`);
    return parts.join(" ");
  }
  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref, i) => `${i + 1}. ${this.formatBibliography(ref)}`).join("\n");
  }
}