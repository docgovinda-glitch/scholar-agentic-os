import type { CitationMetadata } from "../../types";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../model/reference";

/**
 * Deterministically adapt existing CitationMetadata into the canonical
 * reference model required by Phase 6C.
 *
 * Notes:
 * - No AI, no network lookups.
 * - This is a normalization/adaptation layer; it does not “fix” missing data,
 *   it only maps what exists and applies deterministic derivations.
 */

function normalizeWhitespace(s: string | undefined | null): string | undefined {
  if (s === undefined || s === null) return undefined;
  const trimmed = String(s).trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\s+/g, " ");
}

function toAuthor(m: CitationMetadata["authors"][number]): ReferenceAuthor {
  return {
    id: m.id,
    firstName: normalizeWhitespace(m.firstName) ?? "",
    middleName: normalizeWhitespace(m.middleName),
    lastName: normalizeWhitespace(m.lastName) ?? "",
    suffix: m.suffix,
    orcid: normalizeWhitespace(m.orcid),
    corresponding: m.corresponding,
    affiliation: normalizeWhitespace(m.affiliation),
    email: normalizeWhitespace(m.email),
    order: m.order,
  };
}

function kindFromSourceType(sourceType: CitationMetadata["sourceType"]): ReferenceKind {
  switch (sourceType) {
    case "Journal Article":
      return "JournalArticle";
    case "Book":
      return "Book";
    case "Book Chapter":
      return "BookChapter";
    case "Conference Paper":
      return "ConferencePaper";
    case "Thesis":
      return "Thesis";
    case "Dissertation":
      return "Dissertation";
    case "Webpage":
      return "Website";
    case "Government Publication":
      return "GovernmentPublication";
    case "Dataset":
      return "Dataset";
    case "arXiv Preprint":
      return "Preprint";
    case "Research Report":
      // CitationMetadata.sourceType does not include "Technical Report" in this codebase;
      // map deterministically to TechnicalReport to preserve intent.
      return "TechnicalReport";
    case "Software":
      return "Software";
    default:
      // Deterministic fallback: map to Website (online) to avoid lying.
      return "Website";
  }
}

function computeCanonicalKey(ref: CanonicalReference): string {
  // Canonical key is intentionally deterministic and conservative.
  // Prefer DOI; otherwise URL; otherwise (lowercased title + year if present).
  const doi = (ref.doi ?? "").toLowerCase().trim();
  if (doi) return `doi:${doi}`;

  const url = (ref.url ?? "").toLowerCase().trim();
  if (url) return `url:${url}`;

  const title = (ref.title ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const year = (ref.publicationDate ?? "").slice(0, 4);
  return `title:${title}|year:${year || ""}|authors:${ref.authors
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((a) => (a.lastName || "").toLowerCase().trim())
    .filter(Boolean)
    .join(",")}`;
}

export function normalizeCitationMetadataToCanonicalReference(
  meta: CitationMetadata,
  sourceRecordId?: string
): CanonicalReference {
  const kind = kindFromSourceType(meta.sourceType);

  const title = normalizeWhitespace(meta.title) ?? "Untitled";
  const authors: ReferenceAuthor[] = (meta.authors ?? []).map(toAuthor);

  const publicationDetails = meta.publicationDetails ?? ({} as any);

  const identifiers = meta.identifiers ?? ({} as any);

  const canonical: CanonicalReference = {
    kind,
    title,
    authors,

    // Phase 6C requires “source” (journal/conference/site/publisher container)
    source:
      normalizeWhitespace(publicationDetails.journalName) ??
      normalizeWhitespace(publicationDetails.publisher) ??
      normalizeWhitespace(meta.websiteName) ??
      "Unknown Source",

    publisher: normalizeWhitespace(publicationDetails.publisher),

    journal: normalizeWhitespace(publicationDetails.journalName),

    volume: normalizeWhitespace(publicationDetails.volume),
    issue: normalizeWhitespace(publicationDetails.issue),
    pages: normalizeWhitespace(publicationDetails.pages),
    doi: normalizeWhitespace(identifiers.doi),
    url: normalizeWhitespace(identifiers.url),

    isbn: normalizeWhitespace(publicationDetails.isbn),
    issn: normalizeWhitespace(publicationDetails.issn),

    orcid: normalizeWhitespace(meta.authors?.[0]?.orcid),

    publicationDate: normalizeWhitespace(meta.dates?.publicationDate),
    accessDate: normalizeWhitespace(meta.dates?.accessDate),

    language: normalizeWhitespace(meta.language),
    keywords: meta.keywords?.map((k) => normalizeWhitespace(k)).filter((x): x is string => !!x),

    details: {
      source: normalizeWhitespace(publicationDetails.journalName) ?? undefined,
      publisher: normalizeWhitespace(publicationDetails.publisher),
      journal: normalizeWhitespace(publicationDetails.journalName),
      volume: normalizeWhitespace(publicationDetails.volume),
      issue: normalizeWhitespace(publicationDetails.issue),
      pages: normalizeWhitespace(publicationDetails.pages),
      edition: normalizeWhitespace(publicationDetails.edition),
      series: normalizeWhitespace(publicationDetails.series),
      seriesNumber: normalizeWhitespace(publicationDetails.seriesNumber),
      conferenceName: normalizeWhitespace(publicationDetails.conferenceName),
      conferenceLocation: normalizeWhitespace(publicationDetails.conferenceLocation),
      chapterTitle: normalizeWhitespace((publicationDetails as any).chapterTitle),
      websiteName: normalizeWhitespace(publicationDetails.websiteName),
      softwareVersion: normalizeWhitespace((publicationDetails as any).softwareVersion),
      standardNumber: normalizeWhitespace((publicationDetails as any).standardNumber),
      standardTitle: normalizeWhitespace((publicationDetails as any).standardTitle),
    },

    _meta: sourceRecordId ? { sourceRecordId } : undefined,
  };

  canonical.canonicalKey = computeCanonicalKey(canonical);
  return canonical;
}
