/**
 * Harvard Citation Formatter
 */

import { doiUrl, endSentence, familyInitialsTight, inTextSurnames, joinNames, journalOf, pageRange, publisherOf, sortedAuthors } from "./bibParts";
import type { CitationStyle, InTextOptions } from "../styleTypes";
import { authorDateYear, type CanonicalReference } from "../model/reference";

export class HarvardFormatter implements CitationStyle {
  id = "harvard";
  name = "Harvard";
  version = "latest";

  formatInText(reference: CanonicalReference, options?: InTextOptions): string {
    if (!reference.authors || reference.authors.length === 0) {
      return "(????)";
    }

    const author = inTextSurnames(reference, 3);
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
    // No author: the title leads, once, then the year (Cite Them Right).
    if (!names.length) {
      const journal = journalOf(reference);
      const pub = publisherOf(reference);
      if (reference.kind === "Book") return `*${reference.title}* ${year}${pub ? ` ${endSentence(pub)}` : "."}${tail}`;
      if (reference.kind === "JournalArticle" && journal) {
        const vol = reference.volume ? `, ${reference.volume}${reference.issue ? `(${reference.issue})` : ""}` : "";
        const pages = reference.pages ? `, pp. ${pageRange(reference.pages)}` : "";
        return `'${reference.title}' ${year} *${journal}*${vol}${pages}.${tail}`;
      }
      const src = reference.source && reference.source !== reference.title ? ` ${endSentence(reference.source)}` : ".";
      return `${reference.title} ${year}${src}${tail}`.replace(/\s+/g, " ").trim();
    }
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
    if ((reference.kind === "ConferencePaper" || reference.kind === "BookChapter") && reference.source) {
      // Cite Them Right: a paper or chapter in a named collection is quoted, the collection italic.
      const pages = reference.pages ? `, pp. ${pageRange(reference.pages)}` : "";
      return `${head} '${reference.title}', *${reference.source}*${pages}.${tail}`;
    }
    const body = names.length ? ` ${endSentence(reference.title)}` : "";
    const src = reference.source && reference.source !== reference.title ? ` ${endSentence(reference.source)}` : "";
    return `${names.length ? head : `${reference.title} ${year}`}${body}${src}${tail}`.replace(/\s+/g, " ").trim();
  }
  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }
}