/**
 * Harvard Citation Formatter
 */

import { doiUrl, endSentence, familyInitialsTight, joinNames, journalOf, pageRange, publisherOf, sortedAuthors } from "./bibParts";
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

  /**
   * Harvard (Cite Them Right): "Smith, J.A., Lopez, M. and Berg, K. (2021) 'Title',
   * *Journal*, 12(3), pp. 45–67. Available at: https://doi.org/…".
   */
  formatBibliography(reference: CanonicalReference): string {
    const names = sortedAuthors(reference).map(familyInitialsTight);
    const year = `(${authorDateYear(reference)})`;
    const head = names.length ? `${joinNames(names)} ${year}` : `${reference.title} ${year}`;
    const link = doiUrl(reference);
    const tail = link ? ` Available at: ${link}.` : "";
    if (reference.kind === "Book") {
      const pub = publisherOf(reference);
      return `${head} *${reference.title}*.${pub ? ` ${endSentence(pub)}` : ""}${tail}`;
    }
    const journal = journalOf(reference);
    if (reference.kind === "JournalArticle" && journal) {
      const vol = reference.volume ? `, ${reference.volume}${reference.issue ? `(${reference.issue})` : ""}` : reference.issue ? `, (${reference.issue})` : "";
      const pages = reference.pages ? `, pp. ${pageRange(reference.pages)}` : "";
      return `${head} '${reference.title}', *${journal}*${vol}${pages}.${tail}`;
    }
    const body = names.length ? ` ${endSentence(reference.title)}` : "";
    const src = reference.source && reference.source !== reference.title ? ` ${endSentence(reference.source)}` : "";
    return `${names.length ? head : `${reference.title} ${year}`}${body}${src}${tail}`.replace(/\s+/g, " ").trim();
  }
  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }
}