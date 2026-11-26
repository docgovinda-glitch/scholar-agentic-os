/**
 * Canonical Reference Model (Phase 6C, deterministic only)
 *
 * This module defines the authoritative, style-independent canonical model
 * that all future citation formatting, bibliography generation, and compliance
 * validation must consume.
 */

export type ReferenceKind =
  | "JournalArticle"
  | "Book"
  | "BookChapter"
  | "ConferencePaper"
  | "Thesis"
  | "Dissertation"
  | "Website"
  | "GovernmentPublication"
  | "Dataset"
  | "Patent"
  | "Preprint"
  | "TechnicalReport"
  | "Software"
  | "Standard";

export interface ReferenceAuthor {
  /** Stable internal author id (optional if unknown) */
  id?: string;

  firstName: string;
  middleName?: string;
  lastName: string;

  /** Optional suffix, e.g. Jr, III */
  suffix?: string;

  /** ORCID associated with author (optional) */
  orcid?: string;

  /** Author language/casing is preserved as provided */
  corresponding?: boolean;
  affiliation?: string;
  email?: string;

  /** Order of authors in the original source */
  order: number;
}

export interface ReferenceDetails {
  /** “Source” is the journal/conference name or container */
  source?: string;

  publisher?: string;
  journal?: string;

  volume?: string;
  issue?: string;

  pages?: string;
  articleNumber?: string;

  /** For book chapters / proceedings / reports */
  chapterTitle?: string;
  conferenceName?: string;
  conferenceLocation?: string;

  edition?: string;
  series?: string;
  seriesNumber?: string;

  /** For standards */
  standardNumber?: string;
  standardTitle?: string;

  /** For websites */
  websiteName?: string;

  /** For software */
  softwareVersion?: string;

  /** Free-form: may help adapters without affecting determinism */
  language?: string;
}

export interface CanonicalReference {
  /** Discriminant */
  kind: ReferenceKind;

  /** Required core bibliographic fields */
  title: string;

  authors: ReferenceAuthor[];

  /** Required canonical fields from the mission spec */
  source: string; // journal/conference/site name or container
  publisher?: string;

  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;

  doi?: string;
  url?: string;

  isbn?: string;
  issn?: string;
  orcid?: string;

  publicationDate?: string;
  accessDate?: string;
  year?: string;

  language?: string;
  keywords?: string[];

  /** Additional type-specific details */
  details?: ReferenceDetails;

  /** Adapter metadata (non-authoritative) */
  _meta?: {
    /** original id from ingestion / vault */
    sourceRecordId?: string;
  };

  /** Engine-produced canonical key for equality / duplicate detection */
  canonicalKey?: string;

  /** Engine-produced numeric position within a reference list */
  _position?: number;

  /** "a", "b", … when two works in one list share the author-date label (2021a, 2021b). */
  yearSuffix?: string;
}

/**
 * Year for author-date styles (APA, Harvard, Chicago author-date): the
 * publication date's year, else the reference's own year, else "n.d." as those
 * styles require. Never a made-up year.
 */
export function authorDateYear(reference: Pick<CanonicalReference, "publicationDate" | "year" | "yearSuffix">): string {
  const year = bareAuthorDateYear(reference);
  const suffix = reference.yearSuffix ?? "";
  return suffix ? (year === "n.d." ? `n.d.-${suffix}` : `${year}${suffix}`) : year;
}

function bareAuthorDateYear(reference: Pick<CanonicalReference, "publicationDate" | "year">): string {
  const fromDate = reference.publicationDate?.match(/^\d{4}/)?.[0];
  if (fromDate) return fromDate;
  if (typeof reference.year === "string") {
    const match = reference.year.match(/^\d{4}/)?.[0];
    if (match) return match;
    if (/n\.?d\.?/i.test(reference.year)) return "n.d.";
  }
  return "n.d.";
}
