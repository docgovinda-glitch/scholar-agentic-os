/**
 * Citation Format Service for Scholar Core Assignment Workspace
 * Seamlessly integrates the Canonical Citation Compliance Engine (APA 7, Harvard, MLA 9, Chicago, IEEE, Vancouver)
 * with DiscoveredSource and analytical syntheses.
 */

import { CitationFormatterFactory } from "../../../citation_compliance/formattingEngine";
import type { DiscoveredSource } from "../types";
import { formatReference } from "./referenceListGenerator";

export { parseAuthorStringToCanonical, discoveredSourceToCanonical } from "./sourceCanonical";
import { discoveredSourceToCanonical } from "./sourceCanonical";

/**
 * The in-text citation for a source in the active style, from the shared
 * formatters (the one citation engine): author-date styles name the authors
 * (the title's first words when there is no author) and year; IEEE and
 * Vancouver give the source's number.
 */
export function formatSourceInTextCitation(
  source: Partial<DiscoveredSource>,
  styleId: string = "apa7",
  citationIndex?: number
): string {
  const canonical = source.canonicalReference || discoveredSourceToCanonical(source);
  return CitationFormatterFactory.formatInText(styleId || "apa7", canonical, { position: citationIndex || 1 }).trim();
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
