/**
 * Reference List Generator — Production Spec §6
 *
 * Generates properly formatted reference lists / bibliographies from the
 * Canonical Source Registry. Supports APA 7th, Harvard, IEEE, Chicago,
 * MHRA, and Vancouver citation styles.
 *
 * Key rules from the spec:
 *   - NEVER fabricate DOIs, page numbers, volume/issue numbers, or URLs
 *   - If metadata is missing, use the appropriate "unknown" marker for that style
 *   - Only include sources that are actually cited in the draft (using citation anchors)
 *   - Sort order depends on citation style (alphabetical vs numbered)
 */

import type { DiscoveredSource } from "../types";
import type { CitationAnchor } from "../schemas/sourceSchema";

// ─────────────────────────────────────────────────────────────────────────────
// Author Formatting Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format author name for APA style: "Surname, F. M."
 */
function formatAuthorAPA(author: string): string {
  const trimmed = author.trim();
  // Already in "Surname, F. M." format
  if (/^[A-ZÀ-ÿ][a-zÀ-ÿ]+,\s[A-Z]\./.test(trimmed)) {
    return trimmed;
  }
  // "First Last" → "Last, F."
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const surname = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map((p) => `${p[0]}.`).join(" ");
    return `${surname}, ${initials}`;
  }
  return trimmed;
}

/**
 * Format author name for Harvard style: "Surname, F."
 * (Same as APA in practice)
 */
function formatAuthorHarvard(author: string): string {
  return formatAuthorAPA(author);
}

/**
 * Format author name for IEEE: "F. M. Surname"
 */
function formatAuthorIEEE(author: string): string {
  const trimmed = author.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const surname = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map((p) => `${p[0]}.`).join(" ");
    return `${initials} ${surname}`;
  }
  return trimmed;
}

/**
 * Format author name for Chicago: "Surname, First Middle"
 * (First author inverted, subsequent authors in natural order)
 */
function formatAuthorChicago(author: string, isFirst: boolean): string {
  const trimmed = author.trim();
  if (isFirst) {
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      const surname = parts[parts.length - 1];
      const given = parts.slice(0, -1).join(" ");
      return `${surname}, ${given}`;
    }
  }
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Author List Formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatAuthorsAPA(authors: string[]): string {
  if (!authors || authors.length === 0) return "Anonymous";
  const formatted = authors.map(formatAuthorAPA);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
  if (formatted.length <= 20) {
    return formatted.slice(0, -1).join(", ") + ", & " + formatted[formatted.length - 1];
  }
  // APA 7: 20+ authors → first 19, ..., last author
  return formatted.slice(0, 19).join(", ") + ", ... " + formatted[formatted.length - 1];
}

function formatAuthorsHarvard(authors: string[]): string {
  if (!authors || authors.length === 0) return "Anonymous";
  const formatted = authors.map(formatAuthorHarvard);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  if (formatted.length <= 3) {
    return formatted.slice(0, -1).join(", ") + " and " + formatted[formatted.length - 1];
  }
  return `${formatted[0]} et al.`;
}

function formatAuthorsIEEE(authors: string[]): string {
  if (!authors || authors.length === 0) return "Anonymous";
  const formatted = authors.map(formatAuthorIEEE);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  return formatted.slice(0, -1).join(", ") + ", and " + formatted[formatted.length - 1];
}

function formatAuthorsChicago(authors: string[]): string {
  if (!authors || authors.length === 0) return "Anonymous";
  const formatted = authors.map((a, i) => formatAuthorChicago(a, i === 0));
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]}, and ${formatted[1]}`;
  if (formatted.length <= 10) {
    return formatted.slice(0, -1).join(", ") + ", and " + formatted[formatted.length - 1];
  }
  return formatted.slice(0, 7).join(", ") + " et al.";
}

// ─────────────────────────────────────────────────────────────────────────────
// DOI / URL Formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatDOI(doi?: string): string {
  if (!doi) return "";
  const cleaned = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();
  if (!cleaned) return "";
  return `https://doi.org/${cleaned}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style-Specific Reference Formatters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * APA 7th Edition
 * Author, A. A., & Author, B. B. (Year). Title of article. Journal Name, Volume(Issue), Pages. DOI
 */
function formatReferenceAPA7(source: DiscoveredSource): string {
  const authors = formatAuthorsAPA(source.authors);
  const year = source.year || "n.d.";
  const title = source.title || "Untitled";
  const doi = formatDOI(source.doi);

  if (source.type === "book" || source.type === "chapter") {
    const publisher = source.publisher || source.journal || "";
    return `${authors} (${year}). *${title}*. ${publisher}.${doi ? ` ${doi}` : ""}`.trim();
  }

  if (source.type === "conference") {
    const venue = source.journal || "Conference Proceedings";
    const volumeInfo = source.volumeIssue || buildVolumeIssue(source);
    return `${authors} (${year}). ${title}. In *${venue}*${volumeInfo ? `, ${volumeInfo}` : ""}.${doi ? ` ${doi}` : ""}`.trim();
  }

  // Journal article (default)
  const journal = source.journal || "";
  const volumeInfo = source.volumeIssue || buildVolumeIssue(source);
  const pages = source.pages ? `, ${source.pages}` : "";

  if (journal) {
    return `${authors} (${year}). ${title}. *${journal}*${volumeInfo ? `, ${volumeInfo}` : ""}${pages}.${doi ? ` ${doi}` : ""}`.trim();
  }

  return `${authors} (${year}). ${title}.${doi ? ` ${doi}` : ""}`.trim();
}

/**
 * Harvard
 * Author, F. (Year) 'Title of article', Journal Name, Volume(Issue), pp. Pages. Available at: DOI.
 */
function formatReferenceHarvard(source: DiscoveredSource): string {
  const authors = formatAuthorsHarvard(source.authors);
  const year = source.year || "n.d.";
  const title = source.title || "Untitled";
  const doi = formatDOI(source.doi);

  if (source.type === "book" || source.type === "chapter") {
    const publisher = source.publisher || source.journal || "";
    return `${authors} (${year}) *${title}*. ${publisher}.${doi ? ` Available at: ${doi}.` : ""}`.trim();
  }

  const journal = source.journal || "";
  const volumeInfo = source.volumeIssue || buildVolumeIssue(source);
  const pages = source.pages ? `, pp. ${source.pages}` : "";

  if (journal) {
    return `${authors} (${year}) '${title}', *${journal}*${volumeInfo ? `, ${volumeInfo}` : ""}${pages}.${doi ? ` Available at: ${doi}.` : ""}`.trim();
  }

  return `${authors} (${year}) '${title}'.${doi ? ` Available at: ${doi}.` : ""}`.trim();
}

/**
 * IEEE
 * [1] F. M. Author, "Title," Journal, vol. X, no. Y, pp. Z, Year. DOI
 */
function formatReferenceIEEE(source: DiscoveredSource, index: number): string {
  const authors = formatAuthorsIEEE(source.authors);
  const year = source.year || "n.d.";
  const title = source.title || "Untitled";
  const doi = formatDOI(source.doi);
  const num = `[${index + 1}]`;

  const journal = source.journal || "";
  const vol = source.volume ? `vol. ${source.volume}` : "";
  const iss = source.issue ? `no. ${source.issue}` : "";
  const pages = source.pages ? `pp. ${source.pages}` : "";
  const details = [vol, iss, pages].filter(Boolean).join(", ");

  if (journal) {
    return `${num} ${authors}, "${title}," *${journal}*${details ? `, ${details}` : ""}, ${year}.${doi ? ` ${doi}` : ""}`.trim();
  }

  return `${num} ${authors}, "${title}," ${year}.${doi ? ` ${doi}` : ""}`.trim();
}

/**
 * Chicago (Author-Date)
 * Author, First. Year. "Title." Journal Volume (Issue): Pages. DOI.
 */
function formatReferenceChicago(source: DiscoveredSource): string {
  const authors = formatAuthorsChicago(source.authors);
  const year = source.year || "n.d.";
  const title = source.title || "Untitled";
  const doi = formatDOI(source.doi);

  if (source.type === "book" || source.type === "chapter") {
    const publisher = source.publisher || source.journal || "";
    return `${authors}. ${year}. *${title}*. ${publisher}.${doi ? ` ${doi}.` : ""}`.trim();
  }

  const journal = source.journal || "";
  const vol = source.volume || "";
  const iss = source.issue ? `(${source.issue})` : "";
  const pages = source.pages ? `: ${source.pages}` : "";

  if (journal) {
    return `${authors}. ${year}. "${title}." *${journal}* ${vol}${iss}${pages}.${doi ? ` ${doi}.` : ""}`.trim();
  }

  return `${authors}. ${year}. "${title}."${doi ? ` ${doi}.` : ""}`.trim();
}

/**
 * MHRA
 * Author, 'Title', Journal, Volume.Issue (Year), Pages <DOI>.
 */
function formatReferenceMHRA(source: DiscoveredSource): string {
  const authors = source.authors?.join(", ") || "Anonymous";
  const year = source.year || "n.d.";
  const title = source.title || "Untitled";
  const doi = formatDOI(source.doi);

  const journal = source.journal || "";
  const volumeInfo = source.volumeIssue || buildVolumeIssue(source);
  const pages = source.pages ? `, ${source.pages}` : "";

  if (journal) {
    return `${authors}, '${title}', *${journal}*${volumeInfo ? `, ${volumeInfo}` : ""} (${year})${pages}${doi ? ` <${doi}>` : ""}.`.trim();
  }

  return `${authors}, '${title}' (${year})${doi ? ` <${doi}>` : ""}.`.trim();
}

/**
 * Vancouver
 * 1. Author AA. Title. Journal. Year;Volume(Issue):Pages. DOI
 */
function formatReferenceVancouver(source: DiscoveredSource, index: number): string {
  const authors = source.authors?.map((a) => {
    const parts = a.trim().split(/\s+/);
    if (parts.length >= 2) {
      const surname = parts[parts.length - 1];
      const initials = parts.slice(0, -1).map((p) => p[0]).join("");
      return `${surname} ${initials}`;
    }
    return a;
  }).join(", ") || "Anonymous";

  const year = source.year || "n.d.";
  const title = source.title || "Untitled";
  const doi = formatDOI(source.doi);
  const num = `${index + 1}.`;

  const journal = source.journal || "";
  const vol = source.volume || "";
  const iss = source.issue ? `(${source.issue})` : "";
  const pages = source.pages ? `:${source.pages}` : "";

  if (journal) {
    return `${num} ${authors}. ${title}. ${journal}. ${year};${vol}${iss}${pages}.${doi ? ` ${doi}` : ""}`.trim();
  }

  return `${num} ${authors}. ${title}. ${year}.${doi ? ` ${doi}` : ""}`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildVolumeIssue(source: DiscoveredSource): string {
  if (source.volumeIssue) return source.volumeIssue;
  const vol = source.volume || "";
  const iss = source.issue ? `(${source.issue})` : "";
  return vol ? `${vol}${iss}` : "";
}

function normalizeCitationStyle(style: string): string {
  return (style || "harvard").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a single source as a reference entry in the specified citation style.
 */
export function formatReference(
  source: DiscoveredSource,
  style: string,
  index: number = 0
): string {
  // If the source already has a pre-formatted citation and it looks complete, use it
  if (source.citation && source.citation.trim().length > 30 && !source.retrievalSource) {
    return source.citation.trim();
  }

  const norm = normalizeCitationStyle(style);

  if (norm.includes("apa") || norm === "apa7") return formatReferenceAPA7(source);
  if (norm.includes("ieee")) return formatReferenceIEEE(source, index);
  if (norm.includes("chicago")) return formatReferenceChicago(source);
  if (norm.includes("mhra")) return formatReferenceMHRA(source);
  if (norm.includes("vancouver")) return formatReferenceVancouver(source, index);

  // Default: Harvard
  return formatReferenceHarvard(source);
}

/**
 * Generate the complete reference list for an assignment.
 *
 * @param sources - All sources in the registry
 * @param style - Citation style
 * @param citedSourceIds - If provided, only include sources that were actually cited
 * @returns Formatted reference entries, properly sorted
 */
export function generateReferenceList(
  sources: DiscoveredSource[],
  style: string,
  citedSourceIds?: Set<string>
): string[] {
  const norm = normalizeCitationStyle(style);
  const isNumbered = norm.includes("ieee") || norm.includes("vancouver");

  // Filter to active, non-removed sources
  let pool = sources.filter((s) => s.status !== "removed" && (s as any).status !== "dismissed" && (s as any).status !== "excluded" && s.isActive !== false);
  if (citedSourceIds && citedSourceIds.size > 0) {
    pool = pool.filter((s) => citedSourceIds.has(s.id));
  }

  if (pool.length === 0) return [];

  if (isNumbered) {
    // IEEE/Vancouver: numbered in order of first citation (or alphabetical if no order)
    return pool.map((s, idx) => formatReference(s, style, idx));
  }

  // Alphabetical styles (APA, Harvard, Chicago, MHRA)
  const formatted = pool.map((s) => formatReference(s, style));
  formatted.sort((a, b) => {
    // Strip leading punctuation/markers for comparison
    const cleanA = a.replace(/^\W+/, "").toLowerCase();
    const cleanB = b.replace(/^\W+/, "").toLowerCase();
    return cleanA.localeCompare(cleanB);
  });

  return formatted;
}

/**
 * Generate reference list as a single formatted string block.
 */
export function generateReferenceListBlock(
  sources: DiscoveredSource[],
  style: string,
  citedSourceIds?: Set<string>
): string {
  const norm = normalizeCitationStyle(style);
  const entries = generateReferenceList(sources, style, citedSourceIds);

  if (entries.length === 0) return "";

  // Title varies by style
  const title = norm.includes("ieee") || norm.includes("vancouver")
    ? "References"
    : norm.includes("apa")
    ? "References"
    : norm.includes("chicago")
    ? "Bibliography"
    : "Reference List";

  return `## ${title}\n\n${entries.join("\n\n")}`;
}

/**
 * Generate the reference list heading appropriate for the citation style.
 */
export function getReferenceListHeading(style: string): string {
  const norm = normalizeCitationStyle(style);
  if (norm.includes("chicago")) return "Bibliography";
  if (norm.includes("mhra")) return "Bibliography";
  return "Reference List";
}

/**
 * Escapes untrusted text for HTML contexts and converts markdown italics (*text*)
 * into safe <i>text</i> tags.
 */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatReferenceHtml(entry: string): string {
  const escaped = escapeHtml(entry);
  return escaped.replace(/\*([^*]+)\*/g, "<i>$1</i>");
}
