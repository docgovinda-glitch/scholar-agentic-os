/**
 * Chicago Notes-Bibliography Citation Formatter (17th edition).
 *
 * Distinct from ChicagoFormatter (`chicago.ts`), which implements the
 * Author-Date system — CMOS 17 documents these as two different citation
 * systems, not two variants of the same one. Notes-Bibliography cites via a
 * numbered footnote/endnote marker rather than an inline (Author Year)
 * parenthetical, with a full note on first use and a shortened note on
 * subsequent citations of the same source (CMOS 17 §14.34).
 *
 * Templates verified against CMOS 17 worked examples for a book and a
 * journal article (the two kinds with authoritative examples available);
 * other kinds fall back to the book-like scheme, the same simplification
 * every sibling formatter in this directory already makes for kinds beyond
 * article/book.
 *
 * KNOWN GAPS, STATED PLAINLY:
 * - `CanonicalReference` has no place-of-publication field, so book
 *   citations render "(Publisher, Year)" rather than CMOS's
 *   "(City: Publisher, Year)" — every formatter in this directory already
 *   omits place of publication for the same reason; this is not a new gap.
 * - The short-title heuristic (drop any subtitle after a colon, then cap at
 *   five words — CMOS 17 §14.34's own numeric guidance) is mechanical, not
 *   an editorial judgment call. CMOS's own worked examples sometimes pick a
 *   more distinctive fragment of the title (e.g. the object of a
 *   preposition) that no general rule reproduces; this formatter is
 *   internally consistent and traceable to the full title, not a claim of
 *   matching every hand-picked example in the manual.
 */

import type { CitationStyle, InTextOptions, NoteOptions } from "../formattingEngine";
import type { CanonicalReference, ReferenceAuthor } from "../model/reference";

const SHORT_TITLE_MAX_WORDS = 5;

export class ChicagoNotesFormatter implements CitationStyle {
  id = "chicago-notes-bibliography";
  name = "Chicago Notes-Bibliography";
  version = "17";

  /** The in-text marker is the footnote/endnote number, not a parenthetical — the note's content comes from formatNote/formatShortNote. */
  formatInText(_reference: CanonicalReference, options?: InTextOptions): string {
    return String(options?.position ?? 1);
  }

  /** The full note — first citation of this source. CMOS 17 §14.19 (journal article), §14.30 (book). */
  formatNote(reference: CanonicalReference, options?: NoteOptions): string {
    const author = this.authorsFullName(reference.authors);
    const page = options?.locator ?? reference.pages;

    if (reference.kind === "JournalArticle") {
      let note = `${author}, "${reference.title},"`;
      const container = this.journalContainer(reference);
      if (container) note += ` ${container}`;
      if (page) note += `: ${page}`;
      return `${note}.`;
    }

    const publisherYear = this.publisherYear(reference);
    let note = `${author}, *${reference.title}*`;
    if (publisherYear) note += ` (${publisherYear})`;
    if (page) note += `, ${page}`;
    return `${note}.`;
  }

  /** The shortened note used for every citation after the first (CMOS 17 §14.34): last name, short title, locator. */
  formatShortNote(reference: CanonicalReference, options?: NoteOptions): string {
    const lastName = reference.authors?.[0]?.lastName ?? "";
    const short = this.shortTitle(reference.title);
    const page = options?.locator ?? reference.pages;
    const isArticle = reference.kind === "JournalArticle";
    if (page) {
      const withComma = isArticle ? `"${short},"` : `*${short}*,`;
      return `${lastName}, ${withComma} ${page}.`;
    }
    const withoutComma = isArticle ? `"${short}."` : `*${short}*.`;
    return `${lastName}, ${withoutComma}`;
  }

  /** The bibliography entry: only the first author's name is inverted (CMOS 17 §14.8). */
  formatBibliography(reference: CanonicalReference): string {
    const author = this.authorsInverted(reference.authors);

    if (reference.kind === "JournalArticle") {
      let entry = `${author} "${reference.title}."`;
      const container = this.journalContainer(reference);
      if (container) entry += ` ${container}`;
      if (reference.pages) entry += `: ${reference.pages}`;
      return `${entry}.`;
    }

    const publisherYear = this.publisherYear(reference);
    let entry = `${author} *${reference.title}*.`;
    if (publisherYear) entry += ` ${publisherYear}.`;
    return entry;
  }

  /** Alphabetical ordering of the returned entries is the caller's responsibility — same convention as every other formatter in this registry. */
  formatReferenceList(references: CanonicalReference[]): string {
    return references.map((ref) => this.formatBibliography(ref)).join("\n\n");
  }

  private journalContainer(reference: CanonicalReference): string {
    if (!reference.journal) return "";
    const year = reference.publicationDate?.substring(0, 4) ?? reference.year;
    const volume = reference.volume ? ` ${reference.volume}` : "";
    const yearPart = year ? ` (${year})` : "";
    return `*${reference.journal}*${volume}${yearPart}`;
  }

  private publisherYear(reference: CanonicalReference): string {
    const year = reference.publicationDate?.substring(0, 4) ?? reference.year;
    if (reference.publisher && year) return `${reference.publisher}, ${year}`;
    return reference.publisher ?? year ?? "";
  }

  /** Drop any subtitle after a colon, then cap at five words (CMOS 17 §14.34: "no more than four or five words"). See the module comment's short-title gap note. */
  private shortTitle(title: string): string {
    const mainTitle = title.split(":")[0].trim();
    const words = mainTitle.split(/\s+/);
    return words.length <= SHORT_TITLE_MAX_WORDS ? mainTitle : words.slice(0, SHORT_TITLE_MAX_WORDS).join(" ");
  }

  /** "First Last, First Last, and First Last" — up to 3 authors listed in full; 4+ abbreviated to the first plus "et al.", matching this registry's existing author-count handling in vancouver.ts/apa7.ts. */
  private authorsFullName(authors: ReferenceAuthor[]): string {
    if (!authors || authors.length === 0) return "";
    const full = (a: ReferenceAuthor) => `${a.firstName} ${a.lastName}`.trim();
    if (authors.length > 3) return `${full(authors[0])} et al.`;
    if (authors.length === 1) return full(authors[0]);
    const allButLast = authors.slice(0, -1).map(full).join(", ");
    return `${allButLast}, and ${full(authors[authors.length - 1])}`;
  }

  /** "Last, First, First Last, and First Last." — only the first author is inverted. */
  private authorsInverted(authors: ReferenceAuthor[]): string {
    if (!authors || authors.length === 0) return "";
    const first = `${authors[0].lastName}, ${authors[0].firstName}`.trim();
    if (authors.length === 1) return `${first}.`;
    if (authors.length > 3) return `${first}, et al.`;
    const rest = authors.slice(1).map((a) => `${a.firstName} ${a.lastName}`.trim());
    const allButLast = [first, ...rest.slice(0, -1)].join(", ");
    return `${allButLast}, and ${rest[rest.length - 1]}.`;
  }
}
