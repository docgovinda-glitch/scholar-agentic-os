/**
 * APA 7 Citation Formatter
 * 
 * Formats citations and references according to APA 7th edition style.
 */

import { pageRange } from "./bibParts";
import type { CitationStyle, InTextOptions } from "../formattingEngine";
import { authorDateYear, type CanonicalReference, type ReferenceAuthor } from "../model/reference";

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
    const author = this.inTextAuthors(reference.authors);

    if (options?.position !== undefined && options.locator) {
      return `${author}, ${options.position}`;
    }

    return `(${author}, ${authorDateYear(reference)})`;
  }

  /**
   * APA 7 in-text names: surnames only (8.17): one author "Kubin", two
   * "Kubin & von Sikorski", three or more "Kubin et al.".
   */
  private inTextAuthors(authors: CanonicalReference["authors"]): string {
    const names = (authors ?? []).map((a) => a.lastName).filter(Boolean);
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names[0]} et al.`;
  }

  /**
   * APA 7 reference entry (9.8, 9.43): every author up to 20 ("A, B., & C, D."),
   * 21+ as the first 19, an ellipsis and the last; sentence-ended parts; the
   * periodical and volume in italics, issue in brackets; the DOI as a URL with
   * no full stop after it. Missing fields are left out, never filled in.
   */
  formatBibliography(reference: CanonicalReference): string {
    const authors = this.formatAuthors(reference.authors, false);
    const year = `(${authorDateYear(reference)}).`;
    const endSentence = (t: string) => (/[.?!]$/.test(t) ? t : `${t}.`);
    const parts: string[] = [];
    if (authors) parts.push(endSentence(authors));
    parts.push(year);

    if (reference.kind === "Book") {
      parts.push(endSentence(`*${reference.title}*`));
      const publisher = reference.publisher || reference.source;
      if (publisher) parts.push(endSentence(publisher));
    } else if (reference.kind === "JournalArticle") {
      parts.push(endSentence(reference.title));
      const journal = reference.journal || reference.source;
      if (journal) {
        let container = `*${journal}*`;
        if (reference.volume) container += `, *${reference.volume}*${reference.issue ? `(${reference.issue})` : ""}`;
        else if (reference.issue) container += `, (${reference.issue})`;
        if (reference.pages) container += `, ${pageRange(reference.pages)}`;
        parts.push(endSentence(container));
      }
    } else {
      parts.push(endSentence(reference.title));
      if (reference.source) parts.push(endSentence(reference.source));
    }

    if (reference.doi) {
      parts.push(reference.doi.startsWith("http") ? reference.doi : `https://doi.org/${reference.doi}`);
    } else if (reference.url) {
      parts.push(reference.url);
    }
    return parts.join(" ");
  }

  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /** "Last, F. M." (initials for every given name; none when no given name is known). */
  private formatSingleAuthor(author: ReferenceAuthor): string {
    const initials = (author.firstName || "")
      .split(/[\s.]+/)
      .filter(Boolean)
      .map((n) => n.split("-").map((p) => `${p.charAt(0).toUpperCase()}.`).join("-"))
      .join(" ");
    return initials ? `${author.lastName}, ${initials}` : author.lastName;
  }

  private formatAuthors(authors: ReferenceAuthor[], etAl?: boolean): string {
    if (!authors || authors.length === 0) return "";
    if (etAl && authors.length > 2) return `${authors[0].lastName}, et al.`;
    const names = authors.map((a) => this.formatSingleAuthor(a));
    if (names.length === 1) return names[0];
    if (names.length > 20) return `${names.slice(0, 19).join(", ")}, . . . ${names[names.length - 1]}`;
    return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
  }


}