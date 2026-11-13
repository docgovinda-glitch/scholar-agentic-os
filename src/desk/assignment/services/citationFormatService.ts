/**
 * Citation Format Service for Scholar Core Assignment Workspace
 * Seamlessly integrates the Canonical Citation Compliance Engine (APA 7, Harvard, MLA 9, Chicago, IEEE, Vancouver)
 * with DiscoveredSource and analytical syntheses.
 */

import { CitationFormatterFactory } from "../../../citation_compliance/formattingEngine";
import type { CanonicalReference, ReferenceAuthor, ReferenceKind } from "../../../citation_compliance/model/reference";
import type { DiscoveredSource } from "../types";
import { formatReference, parsePersonName } from "./referenceListGenerator";

/**
 * Converts one author string into a ReferenceAuthor using the workspace's one
 * name parser (parsePersonName): "Family, Given", "Given Family", particles and
 * "et al." are all handled the same way as in the reference list.
 */
export function parseAuthorStringToCanonical(authorStr: string, order: number): ReferenceAuthor {
  const parsed = parsePersonName(authorStr || "");
  if (!parsed.family) return { firstName: "", lastName: "[Author unknown]", order };
  return { firstName: parsed.given, lastName: parsed.family, order };
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
      : [{ firstName: "", lastName: source.isUserUploaded ? "Course Materials" : "[Author unknown]", order: 1 }];

  let kind: ReferenceKind = "JournalArticle";
  if (source.type === "book") kind = "Book";
  else if (source.type === "conference") kind = "ConferencePaper";
  else if (source.type === "institutional" || source.type === "report") kind = "TechnicalReport";
  else if (source.type === "web") kind = "Website";

  // A missing venue stays missing; it is never given a made-up name.
  const containerSource = source.journal || source.publisher || "";

  return {
    kind,
    title: source.title || "Untitled Scholarly Work",
    authors,
    source: containerSource,
    publisher: source.publisher,
    journal: source.journal,
    year: source.year || "n.d.",
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
  const year = source.year || "n.d.";
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

  const getLastName = (authorStr: string) => parsePersonName(authorStr).family || authorStr.trim();

  const firstAuthor = getLastName(authorList[0]);

  if (authorList.length === 1) {
    if (styleNorm.includes("mla")) return `(${firstAuthor})`;
    return `(${firstAuthor}, ${year})`;
  }
  if (authorList.length === 2) {
    const secondAuthor = getLastName(authorList[1]);
    if (styleNorm.includes("mla")) return `(${firstAuthor} and ${secondAuthor})`;
    return `(${firstAuthor} & ${secondAuthor}, ${year})`;
  }
  if (styleNorm.includes("mla")) return `(${firstAuthor} et al.)`;
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

  // Fallback: the workspace reference-list formatter (same metadata rules, never invents fields).
  return formatReference(source as DiscoveredSource, styleId);
}
