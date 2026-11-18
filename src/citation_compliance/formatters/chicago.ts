/**
 * Chicago Author-Date Citation Formatter
 */

import { doiUrl, endSentence, familyGiven, givenFamily, inTextSurnames, joinNames, journalOf, pageRange, publisherOf, quotedTitle, sortedAuthors } from "./bibParts";
import type { CitationStyle, InTextOptions } from "../styleTypes";
import { authorDateYear, type CanonicalReference } from "../model/reference";

export class ChicagoFormatter implements CitationStyle {
  id = "chicago-author-date";
  name = "Chicago Author-Date";
  version = "17";

  formatInText(reference: CanonicalReference, options?: InTextOptions): string {
    const author = inTextSurnames(reference, 3, ", and");
    const year = authorDateYear(reference);
    if (options && options.locator) {
      return "(" + author + " " + year + ", " + options.locator + ")";
    }
    return "(" + author + " " + year + ")";
  }

  /**
   * Chicago author-date (17th ed.): 'Smith, John, Maria Lopez, and Kim Berg. 2021.
   * "Title." *Journal* 12 (3): 45–67. https://doi.org/…'. Eleven or more authors:
   * the first seven and "et al.".
   */
  formatBibliography(reference: CanonicalReference): string {
    const list = sortedAuthors(reference);
    const names = list.map((a, i) => (i === 0 ? familyGiven(a) : givenFamily(a)));
    const authors = names.length >= 11 ? `${names.slice(0, 7).join(", ")}, et al` : joinNames(names, ", and");
    const year = authorDateYear(reference);
    const link = doiUrl(reference);
    const parts: string[] = [];
    const title = reference.kind === "Book" ? endSentence(`*${reference.title}*`) : quotedTitle(reference.title, ".");
    // Chicago 15.37: with no author, the title leads the entry.
    if (authors) parts.push(endSentence(authors), `${year}.`, title);
    else parts.push(title, `${year}.`);
    if (reference.kind === "Book") {
      const pub = publisherOf(reference);
      if (pub) parts.push(endSentence(pub));
    } else {
      const journal = journalOf(reference);
      if (journal) {
        let c = `*${journal}*`;
        if (reference.volume) c += ` ${reference.volume}`;
        if (reference.issue) c += ` (${reference.issue})`;
        if (reference.pages) c += `: ${pageRange(reference.pages)}`;
        parts.push(endSentence(c));
      }
    }
    if (link) parts.push(endSentence(link));
    return parts.join(" ");
  }
  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }
}