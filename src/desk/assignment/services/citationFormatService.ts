/**
 * Citation Format Service for Scholar Core Assignment Workspace
 * Seamlessly integrates the Canonical Citation Compliance Engine (APA 7, Harvard, MLA 9, Chicago, IEEE, Vancouver)
 * with DiscoveredSource and analytical syntheses.
 */

import { CitationFormatterFactory } from "../../../citation_compliance/formattingEngine";
import type { DiscoveredSource } from "../types";
import { formatReference } from "./referenceListGenerator";
import { parsePersonName } from "./personName";

export { parseAuthorStringToCanonical, discoveredSourceToCanonical } from "./sourceCanonical";
import { discoveredSourceToCanonical } from "./sourceCanonical";

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
