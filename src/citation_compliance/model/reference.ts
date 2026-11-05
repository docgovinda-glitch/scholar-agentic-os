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

export interface ReferenceIdentifiers {
  doi?: string;
  url?: string;

  isbn?: string;
  issn?: string;

  /** ORCID can appear at both author and reference levels */
  orcid?: string;

  /** Optional permanent link variants */
  permanentUrl?: string;
  shortUrl?: string;

  /** Optional identifiers by some ingestion systems */
  pmid?: string;
  pmcid?: string;
  arxivId?: string;
  ssrnId?: string;
  handleIdentifier?: string;
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

export interface ReferenceDates {
  publicationDate?: string; // ISO-ish or journal-provided; engine handles parsing deterministically
  onlinePublicationDate?: string;
  lastUpdated?: string;

  accessDate?: string; // for online sources
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
}

/**
 * Year for author-date styles (APA, Harvard, Chicago author-date): the
 * publication date's year, else the reference's own year. Never emits "n.d." or a made-up year.
 */
export function authorDateYear(reference: Pick<CanonicalReference, "publicationDate" | "year">): string {
  const fromDate = reference.publicationDate?.match(/^\d{4}/)?.[0];
  if (fromDate) return fromDate;
  const fromYear = typeof reference.year === "string" ? reference.year.match(/^\d{4}/)?.[0] : undefined;
  return fromYear ?? "";
}
