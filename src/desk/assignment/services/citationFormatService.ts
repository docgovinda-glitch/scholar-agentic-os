/**
 * Citation Format Service for Scholar Core Assignment Workspace
 * Seamlessly integrates the Canonical Citation Compliance Engine (APA 7, Harvard, MLA 9, Chicago, IEEE, Vancouver)
 * with DiscoveredSource and analytical syntheses.
 */

import { CitationFormatterFactory } from "../../../citation_compliance/formattingEngine";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../../../citation_compliance/model/reference";
import type { DiscoveredSource } from "../types";

/**
 * Normalizes author strings (e.g. "Kennedy, P.", "Paul Kennedy", "Morgenthau, H.") into ReferenceAuthor objects.
 */
export function parseAuthorStringToCanonical(authorStr: string, order: number): ReferenceAuthor {
  const trimmed = authorStr.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "Scholar", order };
  }

  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((p) => p.trim());
    return {
      lastName: parts[0] || "Scholar",
      firstName: parts[1] || "",
      order,
    };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: "", lastName: parts[0], order };
  }
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, parts.length - 1).join(" ");
  return { firstName, lastName, order };
}

/**
 * Maps DiscoveredSource or partial source data to CanonicalReference
 */
export function discoveredSourceToCanonical(source: Partial<DiscoveredSource>): CanonicalReference {
  const rawAuthors = (source as any).authors;
  const authorStrings: string[] = Array.isArray(rawAuthors)
    ? rawAuthors
    : typeof rawAuthors === "string" && rawAuthors.trim()
    ? [rawAuthors.trim()]
    : [];

  const authors: ReferenceAuthor[] =
    authorStrings.length > 0
      ? authorStrings.map((a, idx) => parseAuthorStringToCanonical(a, idx + 1))
      : [{ firstName: "", lastName: source.isUserUploaded ? "Course Materials" : "Scholar", order: 1 }];

  let kind: ReferenceKind = "JournalArticle";
  if (source.type === "book") kind = "Book";
  else if (source.type === "conference") kind = "ConferencePaper";
  else if (source.type === "institutional" || source.type === "report") kind = "TechnicalReport";
  else if (source.type === "web") kind = "Website";

  const containerSource = source.journal || source.publisher || "Academic Publication";

  return {
    kind,
    title: source.title || "Untitled Scholarly Work",
    authors,
    source: containerSource,
    publisher: source.publisher,
    journal: source.journal,
    year: source.year || "2024",
    doi: source.doi,
    url: source.url,
  };
}

/**
 * Formats an in-text citation for a source using the active citation style.
 * Fallbacks are provided if formatting fails for any unexpected input.
 */
export function formatSourceInTextCitation(
  source: Partial<DiscoveredSource>,
  styleId: string = "apa7",
  citationIndex?: number
): string {
  const styleNorm = (styleId || "apa7").toLowerCase();

  if (styleNorm.includes("ieee")) {
    return `[${citationIndex || 1}]`;
  }
  if (styleNorm.includes("vancouver")) {
    return `(${citationIndex || 1})`;
  }

  try {
    const canonical = source.canonicalReference || discoveredSourceToCanonical(source);
    const inText = CitationFormatterFactory.formatInText(styleId, canonical);
    if (inText && inText.trim() && !inText.startsWith("[Citation:")) {
      return inText.trim();
    }
  } catch (err) {
    console.warn("Citation compliance engine fallback for in-text citation:", err);
  }

  // Graceful deterministic fallback
  const year = source.year || "2024";
  const rawAuthors = (source as any).authors;
  const authorList = Array.isArray(rawAuthors)
    ? rawAuthors
    : typeof rawAuthors === "string" && rawAuthors.trim()
    ? [rawAuthors.trim()]
    : [];

  if (authorList.length === 0) {
    const shortTitle = source.title ? source.title.split(" ").slice(0, 3).join(" ") : "Source";
    return `(${shortTitle}, ${year})`;
  }

  const getLastName = (authorStr: string) => {
    const t = authorStr.trim();
    if (t.includes(",")) return t.split(",")[0].trim();
    const parts = t.split(/\s+/);
    return parts[parts.length - 1];
  };

  const firstAuthor = getLastName(authorList[0]);

  if (authorList.length === 1) {
    if (styleNorm.includes("mla")) return `(${firstAuthor} 42)`;
    return `(${firstAuthor}, ${year})`;
  }
  if (authorList.length === 2) {
    const secondAuthor = getLastName(authorList[1]);
    if (styleNorm.includes("mla")) return `(${firstAuthor} and ${secondAuthor} 42)`;
    return `(${firstAuthor} & ${secondAuthor}, ${year})`;
  }
  if (styleNorm.includes("mla")) return `(${firstAuthor} et al. 42)`;
  return `(${firstAuthor} et al., ${year})`;
}

/**
 * Formats a full bibliography entry for a source using the active citation style.
 */
export function formatSourceBibliography(
  source: Partial<DiscoveredSource>,
  styleId: string = "apa7"
): string {
  try {
    const canonical = source.canonicalReference || discoveredSourceToCanonical(source);
    const bib = CitationFormatterFactory.formatBibliography(styleId, canonical);
    if (bib && bib.trim()) {
      return bib.trim();
    }
  } catch (err) {
    console.warn("Citation compliance engine fallback for bibliography:", err);
  }

  // Deterministic fallback (Harvard/APA)
  const rawAuthors = (source as any).authors;
  const authorsStr = Array.isArray(rawAuthors) && rawAuthors.length > 0
    ? rawAuthors.join(", ")
    : typeof rawAuthors === "string" && rawAuthors.trim()
    ? rawAuthors.trim()
    : "Author, A.";
  const yearStr = source.year || "2024";
  const titleStr = source.title ? `'${source.title}'` : "Untitled";
  const venueStr = source.journal || source.publisher || "Academic Publication";
  const volStr = source.volumeIssue ? `, ${source.volumeIssue}` : "";
  const doiStr = source.doi ? `. doi: ${source.doi}` : source.url ? `. Available at: ${source.url}` : "";

  return `${authorsStr} (${yearStr}) ${titleStr}, ${venueStr}${volStr}${doiStr}.`;
}
