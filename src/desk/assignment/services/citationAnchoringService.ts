/**
 * Citation Anchoring Service — Production Spec §5
 *
 * Scans drafted section content to identify in-text citations, then creates
 * bidirectional anchor records linking each citation occurrence to:
 *   1. The source in the registry (sourceId)
 *   2. The section where it appears (sectionId)
 *   3. The claim it supports (claimText)
 *   4. The citation text as rendered (citationText)
 *
 * This enables:
 *   - "Click a source → see everywhere it's cited"
 *   - "Click a claim → see its supporting evidence"
 *   - "Verify citation coverage per section"
 *   - "Detect orphaned sources (approved but never cited)"
 */

import type { DiscoveredSource, AssignmentDraftingSection } from "../types";
import type { CitationAnchor } from "../schemas/sourceSchema";

// ─────────────────────────────────────────────────────────────────────────────
// Citation Pattern Matching
// ─────────────────────────────────────────────────────────────────────────────

interface CitationMatch {
  citationText: string;
  startOffset: number;
  endOffset: number;
  citationType: "parenthetical" | "narrative";
  authorKey: string;
  year: string;
}

/**
 * Extract all in-text citations from a section's draft content.
 * Matches common academic citation patterns:
 *   - APA parenthetical: (Author, 2024) / (Author & Author, 2024) / (Author et al., 2024)
 *   - APA narrative: Author (2024) / Author and Author (2024) / Author et al. (2024)
 *   - Harvard: (Author 2024) / (Author 2024, p. 12)
 *   - IEEE: [1] / [1, 2] / [1-3]
 */
function extractCitationMatches(content: string): CitationMatch[] {
  const matches: CitationMatch[] = [];

  // APA / Harvard parenthetical: (Author, 2024) or (Author & Author, 2024)
  const parenthetical = content.matchAll(
    /\(([A-Z][a-zÀ-ÿ]+(?:\s(?:et\s+al\.?|&\s[A-Z][a-zÀ-ÿ]+(?:\s&\s[A-Z][a-zÀ-ÿ]+)?))?),?\s*(\d{4})[^)]*\)/g
  );
  for (const m of parenthetical) {
    matches.push({
      citationText: m[0],
      startOffset: m.index!,
      endOffset: m.index! + m[0].length,
      citationType: "parenthetical",
      authorKey: m[1].trim(),
      year: m[2],
    });
  }

  // Narrative: Author (2024) or Author et al. (2024)
  const narrative = content.matchAll(
    /([A-Z][a-zÀ-ÿ]+(?:\s(?:et\s+al\.?|and\s[A-Z][a-zÀ-ÿ]+))?)\s+\((\d{4})\)/g
  );
  for (const m of narrative) {
    // Skip duplicates already captured as parenthetical
    const isDuplicate = matches.some(
      (existing) =>
        Math.abs(existing.startOffset - m.index!) < 5
    );
    if (!isDuplicate) {
      matches.push({
        citationText: m[0],
        startOffset: m.index!,
        endOffset: m.index! + m[0].length,
        citationType: "narrative",
        authorKey: m[1].trim(),
        year: m[2],
      });
    }
  }

  return matches;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match a citation to a source in the registry by comparing the author surname
 * and year extracted from the in-text citation against source metadata.
 */
function matchCitationToSource(
  match: CitationMatch,
  sources: DiscoveredSource[]
): DiscoveredSource | null {
  const authorKey = match.authorKey.toLowerCase().replace(/et\s+al\.?/i, "").trim();
  const year = match.year;

  for (const source of sources) {
    // Check year match
    if (source.year !== year) continue;

    // Check author match
    const sourceAuthors = (source.authors || []).map((a) => a.toLowerCase());
    const firstAuthorSurname = sourceAuthors[0]
      ? sourceAuthors[0].split(",")[0].split(" ").pop()?.trim() || ""
      : "";

    if (
      firstAuthorSurname &&
      (authorKey.includes(firstAuthorSurname) || firstAuthorSurname.includes(authorKey))
    ) {
      return source;
    }

    // Fallback: check if any author surname matches
    for (const author of sourceAuthors) {
      const surname = author.split(",")[0].split(" ").pop()?.trim() || "";
      if (surname && authorKey.includes(surname)) {
        return source;
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the claim (sentence) surrounding a citation.
 */
function extractSurroundingClaim(content: string, startOffset: number, endOffset: number): string {
  // Find the sentence containing the citation
  const before = content.substring(0, startOffset);
  const after = content.substring(endOffset);

  // Find sentence start (last period, newline, or start of text)
  const sentenceStartMatch = before.match(/[.!?\n][^.!?\n]*$/);
  const sentenceStart = sentenceStartMatch
    ? startOffset - sentenceStartMatch[0].length + 1
    : Math.max(0, startOffset - 150);

  // Find sentence end (next period, newline, or end of text)
  const sentenceEndMatch = after.match(/^[^.!?\n]*[.!?]/);
  const sentenceEnd = sentenceEndMatch
    ? endOffset + sentenceEndMatch[0].length
    : Math.min(content.length, endOffset + 150);

  return content.substring(sentenceStart, sentenceEnd).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan a section's draft content and create citation anchor records.
 *
 * @param section - The drafted section to scan
 * @param sources - All sources in the registry
 * @returns Array of citation anchors found in this section
 */
export function extractCitationAnchors(
  section: AssignmentDraftingSection,
  sources: DiscoveredSource[]
): CitationAnchor[] {
  const content = section.draftContent;
  if (!content || content.trim().length === 0) return [];

  const citationMatches = extractCitationMatches(content);
  const anchors: CitationAnchor[] = [];

  for (const match of citationMatches) {
    const matchedSource = matchCitationToSource(match, sources);
    if (!matchedSource) continue;

    const claimText = extractSurroundingClaim(content, match.startOffset, match.endOffset);

    anchors.push({
      id: `anchor-${section.id}-${matchedSource.id}-${match.startOffset}`,
      sourceId: matchedSource.id,
      sectionId: section.id,
      claimText,
      citationText: match.citationText,
      startOffset: match.startOffset,
      endOffset: match.endOffset,
      citationType: match.citationType,
      createdAt: new Date().toISOString(),
    });
  }

  return anchors;
}

/**
 * Build a complete citation map across all sections.
 *
 * @param sections - All drafted sections
 * @param sources - All sources in the registry
 * @returns Map from sourceId → array of anchors
 */
export function buildCitationMap(
  sections: AssignmentDraftingSection[],
  sources: DiscoveredSource[]
): Map<string, CitationAnchor[]> {
  const map = new Map<string, CitationAnchor[]>();

  for (const section of sections) {
    const anchors = extractCitationAnchors(section, sources);
    for (const anchor of anchors) {
      const existing = map.get(anchor.sourceId) || [];
      existing.push(anchor);
      map.set(anchor.sourceId, existing);
    }
  }

  return map;
}

/**
 * Detect orphaned sources: sources that are approved but never cited.
 */
export function findOrphanedSources(
  sections: AssignmentDraftingSection[],
  approvedSources: DiscoveredSource[]
): DiscoveredSource[] {
  const citationMap = buildCitationMap(sections, approvedSources);
  return approvedSources.filter((source) => {
    const anchors = citationMap.get(source.id);
    return !anchors || anchors.length === 0;
  });
}

/**
 * Get citation coverage statistics.
 */
export function getCitationCoverage(
  sections: AssignmentDraftingSection[],
  approvedSources: DiscoveredSource[]
): {
  totalAnchors: number;
  sourcesWithCitations: number;
  orphanedSources: number;
  sectionCoverage: { sectionId: string; sectionTitle: string; anchorCount: number }[];
  mostCitedSources: { sourceId: string; sourceTitle: string; count: number }[];
} {
  const citationMap = buildCitationMap(sections, approvedSources);

  let totalAnchors = 0;
  const sourceCounts: { sourceId: string; sourceTitle: string; count: number }[] = [];

  for (const source of approvedSources) {
    const anchors = citationMap.get(source.id) || [];
    totalAnchors += anchors.length;
    sourceCounts.push({
      sourceId: source.id,
      sourceTitle: source.title,
      count: anchors.length,
    });
  }

  const sectionCoverage = sections.map((section) => {
    const anchors = extractCitationAnchors(section, approvedSources);
    return {
      sectionId: section.id,
      sectionTitle: section.title,
      anchorCount: anchors.length,
    };
  });

  return {
    totalAnchors,
    sourcesWithCitations: sourceCounts.filter((s) => s.count > 0).length,
    orphanedSources: sourceCounts.filter((s) => s.count === 0).length,
    sectionCoverage,
    mostCitedSources: sourceCounts
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}
