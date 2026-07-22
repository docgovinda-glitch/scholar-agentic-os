import { CitationMetadata, CitationAuthor, CitationValidationError } from "../types";
import { lookupByIdentifier, type CitationLookupResult } from "./citationEnrichmentService";

export function formatAuthorList(authors: CitationAuthor[], style: "APA" | "MLA" | "Chicago" | "IEEE" | "BibTeX" | "Harvard" | "Vancouver"): string {
  if (!authors || authors.length === 0) return "Anonymous";
  const sorted = [...authors].sort((a, b) => a.order - b.order);

  if (style === "APA" || style === "Harvard" || style === "Vancouver") {
    if (sorted.length === 1) {
      const a = sorted[0];
      return `${a.lastName}, ${a.firstName.charAt(0)}.${a.middleName ? " " + a.middleName.charAt(0) + "." : ""}`;
    }
    if (sorted.length === 2) {
      const a = sorted[0];
      const b = sorted[1];
      return `${a.lastName}, ${a.firstName.charAt(0)}., & ${b.lastName}, ${b.firstName.charAt(0)}.`;
    }
    const a = sorted[0];
    return `${a.lastName}, ${a.firstName.charAt(0)}., et al.`;
  }

  if (style === "MLA") {
    const a = sorted[0];
    if (sorted.length === 1) return `${a.lastName}, ${a.firstName}.`;
    if (sorted.length === 2) return `${a.lastName}, ${a.firstName}, and ${sorted[1].firstName} ${sorted[1].lastName}.`;
    return `${a.lastName}, ${a.firstName}, et al.`;
  }

  if (style === "IEEE") {
    if (sorted.length === 1) return `${sorted[0].firstName.charAt(0)}. ${sorted[0].lastName}`;
    if (sorted.length <= 3) return sorted.map(a => `${a.firstName.charAt(0)}. ${a.lastName}`).join(", ");
    return `${sorted[0].firstName.charAt(0)}. ${sorted[0].lastName} et al.`;
  }

  if (style === "BibTeX") {
    return sorted.map(a => `${a.lastName}, ${a.firstName}`).join(" and ");
  }

  return sorted.map(a => `${a.firstName} ${a.lastName}`).join(", ");
}

export function generateCitation(meta: CitationMetadata, format: string): string {
  const year = meta.dates.publicationDate ? meta.dates.publicationDate.substring(0, 4) : "n.d.";
  const title = meta.title || "Untitled Document";
  const journal = meta.publicationDetails.journalName || meta.publicationDetails.publisher || "Academic Press";
  const vol = meta.publicationDetails.volume ? `(${meta.publicationDetails.volume})` : "";
  const pages = meta.publicationDetails.pages ? `, ${meta.publicationDetails.pages}` : "";
  const doi = meta.identifiers.doi ? ` https://doi.org/${meta.identifiers.doi}` : meta.identifiers.url ? ` ${meta.identifiers.url}` : "";

  switch (format) {
    case "APA 7":
    case "APA": {
      const auth = formatAuthorList(meta.authors, "APA");
      return `${auth} (${year}). ${title}. ${journal}${vol}${pages}.${doi}`;
    }
    case "MLA 9":
    case "MLA": {
      const auth = formatAuthorList(meta.authors, "MLA");
      return `${auth} "${title}." ${journal}, vol. ${meta.publicationDetails.volume || "1"}, no. ${meta.publicationDetails.issue || "1"}, ${year}${pages}.${doi}`;
    }
    case "Chicago":
    case "Chicago Notes": {
      const auth = formatAuthorList(meta.authors, "Chicago");
      return `${auth}, "${title}," ${journal} ${meta.publicationDetails.volume || "1"} (${year}): ${meta.publicationDetails.pages || "1-15"}.`;
    }
    case "Chicago Author-Date":
    case "Turabian": {
      const auth = formatAuthorList(meta.authors, "Chicago");
      return `${auth}. ${year}. "${title}." ${journal} ${meta.publicationDetails.volume || "1"}: ${meta.publicationDetails.pages || "1-15"}.`;
    }
    case "AMA": {
      const auth = formatAuthorList(meta.authors, "IEEE");
      return `${auth}. ${title}. ${journal}. ${year};${meta.publicationDetails.volume || "1"}:${meta.publicationDetails.pages || "1-15"}.${doi}`;
    }
    case "ACS": {
      const auth = formatAuthorList(meta.authors, "IEEE");
      return `${auth} ${title}. ${journal} ${year}, ${meta.publicationDetails.volume || "1"}, ${meta.publicationDetails.pages || "1-15"}.`;
    }
    case "CSE": {
      const auth = formatAuthorList(meta.authors, "APA");
      return `${auth}. ${year}. ${title}. ${journal}. ${meta.publicationDetails.volume || "1"}:${meta.publicationDetails.pages || "1-15"}.`;
    }
    case "Bluebook": {
      const auth = formatAuthorList(meta.authors, "Chicago");
      return `${auth}, ${title}, ${meta.publicationDetails.volume || "1"} ${journal} ${meta.publicationDetails.pages || "1"} (${year}).`;
    }
    case "Harvard": {
      const auth = formatAuthorList(meta.authors, "APA");
      return `${auth} (${year}) '${title}', ${journal}${vol}${pages}.`;
    }
    case "IEEE": {
      const auth = formatAuthorList(meta.authors, "IEEE");
      return `${auth}, "${title}," ${journal}, ${year}${doi}.`;
    }
    case "Vancouver": {
      const auth = formatAuthorList(meta.authors, "APA");
      return `${auth}. ${title}. ${journal}. ${year}${vol}${pages}.`;
    }
    case "OSCOLA": {
      const auth = formatAuthorList(meta.authors, "Chicago");
      return `${auth}, '${title}' [${year}] ${journal} ${meta.publicationDetails.pages || "1"}.`;
    }
    case "BibTeX": {
      const bibAuth = formatAuthorList(meta.authors, "BibTeX");
      const tag = (meta.authors[0]?.lastName.toLowerCase() || "anon") + year;
      return `@article{${tag},\n  author = {${bibAuth}},\n  title = {${title}},\n  journal = {${journal}},\n  year = {${year}},\n  volume = {${meta.publicationDetails.volume || "1"}},\n  pages = {${meta.publicationDetails.pages || "1-10"}},\n  doi = {${meta.identifiers.doi || ""}}\n}`;
    }
    case "CSL JSON": {
      const json = {
        id: (meta.authors[0]?.lastName || "Anon") + year,
        type: meta.sourceType.toLowerCase().replace(" ", "-"),
        title: title,
        author: meta.authors.map(a => ({ family: a.lastName, given: a.firstName })),
        issued: { "date-parts": [[parseInt(year) || 2026]] },
        "container-title": journal,
        DOI: meta.identifiers.doi || "",
        URL: meta.identifiers.url || ""
      };
      return JSON.stringify(json, null, 2);
    }
    case "RIS": {
      return `TY  - JOUR\nTI  - ${title}\nAU  - ${meta.authors.map(a => `${a.lastName}, ${a.firstName}`).join("\nAU  - ")}\nJO  - ${journal}\nPY  - ${year}\nVL  - ${meta.publicationDetails.volume || ""}\nSP  - ${meta.publicationDetails.pages || ""}\nDO  - ${meta.identifiers.doi || ""}\nER  -`;
    }
    case "EndNote": {
      return `<xml><records><record><contributors><authors>${meta.authors.map(a => `<author>${a.lastName}, ${a.firstName}</author>`).join("")}</authors></contributors><titles><title>${title}</title><secondary-title>${journal}</secondary-title></titles><dates><year>${year}</year></dates></record></records></xml>`;
    }
    case "Zotero Export": {
      return `Zotero Item Format:\nTitle: ${title}\nItem Type: ${meta.sourceType}\nCreators: ${formatAuthorList(meta.authors, "APA")}\nPublication: ${journal}\nDate: ${year}\nDOI: ${meta.identifiers.doi || "N/A"}`;
    }
    default:
      return `${title} (${year}).`;
  }
}

function citationLookupResultsToMetadata(matches: CitationLookupResult[], type: string): Partial<CitationMetadata> {
  if (matches.length === 0) return {};

  const primary = matches[0];
  const secondary = matches[1];
  const pick = (a?: string, b?: string) => (a && a.trim()) || (b && b.trim()) || undefined;
  const normalizedType = type.trim().toUpperCase();

  const metadata: Partial<CitationMetadata> = {};

  if (primary.title) metadata.title = primary.title;

  const abstract = pick(primary.abstract, secondary?.abstract);
  if (abstract) metadata.abstract = abstract;

  const authorSource = primary.authors.length > 0 ? primary : secondary?.authors.length ? secondary : undefined;
  if (authorSource) {
    metadata.authors = authorSource.authors.map((a, i) => ({
      id: `lookup-author-${i}`,
      firstName: a.firstName,
      lastName: a.lastName,
      order: i + 1,
    }));
  }

  const journalName = pick(primary.journalName, secondary?.journalName);
  const publisher = pick(primary.publisher, secondary?.publisher);
  const volume = pick(primary.volume, secondary?.volume);
  const issue = pick(primary.issue, secondary?.issue);
  const issn = pick(primary.issn, secondary?.issn);
  const eissn = pick(primary.eissn, secondary?.eissn);
  if (journalName || publisher || volume || issue || issn || eissn) {
    metadata.publicationDetails = { journalName, publisher, volume, issue, issn, eissn };
  }

  const year = pick(primary.year, secondary?.year);
  if (year) {
    metadata.dates = { publicationDate: year, accessDate: new Date().toISOString().split("T")[0] };
  }

  const doi = pick(primary.doi, secondary?.doi);
  const openAlexId = matches.find((m) => m.openAlexId)?.openAlexId;
  if (doi || openAlexId) {
    metadata.identifiers = { doi, openAlexId: openAlexId || undefined };
  }

  metadata.verification = {
    doiLookup: normalizedType === "DOI",
    crossref: matches.some((m) => m.source === "Crossref"),
    openAlex: matches.some((m) => m.source === "OpenAlex"),
    pubmed: matches.some((m) => m.source === "PubMed"),
  };

  metadata.sourceType = normalizedType === "ISBN" ? "Book" : "Journal Article";

  // Note: `reliability` (peerReviewed/evidenceLevel/publicationType) is deliberately
  // never set here. OpenAlex's open_access.is_oa would be a real signal for the
  // `openAccess` sub-field, but CitationReliability requires the other three fields
  // together and none of them has an honest value derivable from these sources —
  // same discipline as aiService.ts's enrichCitationMetadata: don't guess two fields
  // just to attach a real value to a third.

  return metadata;
}

/**
 * Real lookup against Crossref/OpenAlex (DOI), PubMed (PMID), OpenAlex directly (its
 * own IDs), or Open Library (ISBN) — replaces a hardcoded stub that returned identical
 * fabricated content (fake ORCIDs, a fake DOI, fake author affiliations) for every
 * identifier and type, and — worse — presented that fabricated data as independently
 * "verified" with fake confidence scores. Same defect pattern already fixed for
 * discoverDataSources/discoverJournals/enrichCitationMetadata; same conventions reused
 * (citationEnrichmentService.ts: Promise.allSettled tolerance, AbortSignal.timeout,
 * the word-overlap match-guard from the Crossref-tombstone-record finding).
 *
 * Honesty note: only DOI/PMID/OpenAlex-ID/ISBN have a real, free, CORS-clean
 * structured lookup available — every other identifier type this UI offers (URL
 * Import, SSRN, Zenodo, ResearchGate, Google Books, YouTube, Podcast) and arXiv
 * (explicitly out of scope) return an empty result rather than fabricating anything;
 * see citationEnrichmentService.ts's lookupByIdentifier for why. When nothing is
 * found or the type isn't supported, this returns `{}` — an honest no-op, not a
 * fallback to invented content.
 */
export async function simulateLookup(identifier: string, type: string): Promise<Partial<CitationMetadata>> {
  const { matches } = await lookupByIdentifier(identifier, type);
  return citationLookupResultsToMetadata(matches, type);
}

export function validateCitationRecord(meta: CitationMetadata, existingRecords?: CitationMetadata[]): CitationValidationError[] {
  const errors: CitationValidationError[] = [];

  if (!meta.title || meta.title.trim().length === 0) {
    errors.push({ id: "err-title", severity: "error", message: "Missing document title", suggestedFix: "Extract title via AI or enter manually" });
  }

  if (!meta.authors || meta.authors.length === 0) {
    errors.push({ id: "err-auth", severity: "error", message: "Missing primary authors", suggestedFix: "Fetch authors from DOI or Crossref" });
  } else {
    meta.authors.forEach((a, i) => {
      if (!a.lastName || a.lastName.trim() === "" || a.lastName === "Unknown") {
        errors.push({ id: `err-surname-${i}`, severity: "warning", message: `Author #${i + 1} missing valid surname`, suggestedFix: "Edit author name format" });
      }
    });
  }

  if (!meta.dates?.publicationDate || meta.dates.publicationDate === "Unknown") {
    errors.push({ id: "err-year", severity: "warning", message: "Missing publication year", suggestedFix: "Set default to current academic year" });
  }

  if (meta.identifiers?.doi && !meta.identifiers.doi.includes("/")) {
    errors.push({ id: "err-doi-fmt", severity: "error", message: "Invalid DOI formatting (missing prefix/suffix slash)", suggestedFix: "Prepend standard 10.xxxx/ prefix" });
  }

  if (existingRecords && existingRecords.some(r => r.title.toLowerCase() === meta.title.toLowerCase() && r !== meta)) {
    errors.push({ id: "err-dup", severity: "warning", message: "Potential duplicate citation record detected in Knowledge Vault", suggestedFix: "Merge with existing record" });
  }

  return errors;
}
