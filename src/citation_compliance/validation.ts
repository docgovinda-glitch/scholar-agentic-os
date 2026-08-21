/**
 * Deterministic Citation Completeness Validation
 *
 * Validates whether a CanonicalReference has all required fields to produce
 * a valid, compliant citation in supported academic styles (APA 7, MLA 9,
 * Chicago, Harvard, IEEE, Vancouver).
 */

import type { CanonicalReference, ReferenceKind } from "./model/reference";

export interface CitationValidationResult {
  isValid: boolean;
  missingFields: string[];
  warnings: string[];
}

/**
 * Validates whether a canonical reference has the required fields for its kind.
 * Style-independent, deterministic check.
 */
export function validateCitationCompleteness(ref: CanonicalReference | undefined | null): CitationValidationResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (!ref) {
    return {
      isValid: false,
      missingFields: ["reference"],
      warnings: ["Reference object is missing or null"],
    };
  }

  // 1. Title is mandatory across all reference kinds
  if (!ref.title || typeof ref.title !== "string" || !ref.title.trim()) {
    missingFields.push("title");
  }

  // 2. Author / Creator validation
  const hasAuthors = Array.isArray(ref.authors) && ref.authors.length > 0 && ref.authors.some(
    (a) => (a.lastName && a.lastName.trim().length > 0) || (a.firstName && a.firstName.trim().length > 0)
  );

  // 3. Year / Date validation
  const hasDate = Boolean(
    (ref.year && String(ref.year).trim().length > 0) ||
    (ref.publicationDate && ref.publicationDate.trim().length > 0)
  );

  const kind: ReferenceKind = ref.kind || "JournalArticle";

  switch (kind) {
    case "JournalArticle":
    case "Preprint":
    case "ConferencePaper": {
      if (!hasAuthors && !ref.publisher) {
        missingFields.push("authors");
      }
      if (!ref.source && !ref.journal) {
        missingFields.push(kind === "JournalArticle" ? "journal" : "source");
      }
      if (!hasDate) {
        missingFields.push("year");
      }
      if (!ref.doi && !ref.url) {
        warnings.push("Adding a DOI or URL improves citation discoverability");
      }
      break;
    }

    case "Book":
    case "BookChapter": {
      if (!hasAuthors && !ref.publisher) {
        missingFields.push("authors");
      }
      if (!ref.publisher && !ref.source) {
        missingFields.push("publisher");
      }
      if (!hasDate) {
        missingFields.push("year");
      }
      if (kind === "BookChapter" && !ref.details?.chapterTitle) {
        warnings.push("Chapter title is recommended for book chapters");
      }
      break;
    }

    case "Website": {
      if (!ref.url || !ref.url.trim()) {
        missingFields.push("url");
      }
      if (!ref.accessDate && !hasDate) {
        missingFields.push("accessDate");
      }
      if (!ref.source && !ref.details?.websiteName && !ref.publisher) {
        missingFields.push("websiteName");
      }
      break;
    }

    case "Dataset":
    case "Software": {
      if (!hasAuthors && !ref.publisher) {
        missingFields.push("creator");
      }
      if (!hasDate) {
        missingFields.push("year");
      }
      if (!ref.doi && !ref.url) {
        missingFields.push("doi_or_url");
      }
      break;
    }

    case "TechnicalReport":
    case "GovernmentPublication":
    case "Standard": {
      if (!hasAuthors && !ref.publisher && !ref.source) {
        missingFields.push("institution_or_author");
      }
      if (!hasDate) {
        missingFields.push("year");
      }
      break;
    }

    case "Thesis":
    case "Dissertation": {
      if (!hasAuthors) {
        missingFields.push("authors");
      }
      if (!ref.publisher && !ref.source) {
        missingFields.push("institution");
      }
      if (!hasDate) {
        missingFields.push("year");
      }
      break;
    }

    default: {
      if (!hasAuthors && !ref.publisher) {
        missingFields.push("authors");
      }
      if (!hasDate) {
        missingFields.push("year");
      }
      break;
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}
