/**
 * Section Analytical Synthesis Service for Scholar Core Assignment Workspace (Phase II)
 * Constructs research-grounded analytical argumentation for outline sections:
 * - Claim
 * - Evidence
 * - Source (with in-text citation integrated with Citation Compliance Engine)
 * - Interpretation
 * - Counterargument
 * - Analytical Link
 *
 * Fully preserves user edits and supports dynamic citation recalculation across styles.
 */

import type {
  AssignmentStructure,
  AssignmentSubheading,
  DiscoveredSource,
  SectionAnalyticalSynthesis,
} from "../types";
import { flattenStructureSubheadings } from "../types";
import { formatSourceInTextCitation } from "./citationFormatService";

/**
 * Recalculates in-text citations for all analytical syntheses when citation style changes.
 * Preserves user-written claims, interpretations, counterarguments, and links.
 */
export function recalculateAllSynthesesCitations(
  syntheses: SectionAnalyticalSynthesis[],
  sources: DiscoveredSource[],
  newCitationStyle: string
): SectionAnalyticalSynthesis[] {
  return syntheses.map((item) => {
    const matchedSource = item.sourceId ? sources.find((s) => s.id === item.sourceId) : undefined;
    if (matchedSource) {
      const updatedCitation = formatSourceInTextCitation(matchedSource, newCitationStyle);
      return {
        ...item,
        citation: updatedCitation,
        inTextCitation: updatedCitation,
        sourceTitle: matchedSource.title || item.sourceTitle,
        sourceAuthors: matchedSource.authors || item.sourceAuthors,
        sourceYear: matchedSource.year || item.sourceYear,
        sourceJournal: matchedSource.journal || matchedSource.publisher || item.sourceJournal,
      };
    }
    // If no direct source match, update fallback citation string if it looks like an author-year
    return item;
  });
}

/**
 * Finds the best-matching sources for an outline section
 */
export function matchSourcesForSection(
  section: { id: string; title: string; guidance?: string; keyTheories?: string[]; keyArguments?: string[] },
  sources: DiscoveredSource[],
  maxCount: number = 3
): DiscoveredSource[] {
  if (sources.length === 0) return [];

  // 1. Direct mapped subheading matches
  const directMatches = sources.filter(
    (s) => s.mappedSubheadingIds && s.mappedSubheadingIds.includes(section.id)
  );
  if (directMatches.length >= maxCount) {
    return directMatches.slice(0, maxCount);
  }

  // 2. Keyword & semantic matching
  const sectionKeywords = [
    ...section.title.toLowerCase().split(/\s+/),
    ...(section.guidance ? section.guidance.toLowerCase().split(/\s+/) : []),
    ...(section.keyTheories || []).flatMap((t) => t.toLowerCase().split(/\s+/)),
    ...(section.keyArguments || []).flatMap((a) => a.toLowerCase().split(/\s+/)),
  ].filter((w) => w.length > 3);

  const scored = sources
    .filter((s) => !directMatches.some((dm) => dm.id === s.id))
    .map((s) => {
      const sourceText = `${s.title} ${s.mainFinding || ""} ${s.suggestedUse || ""} ${s.whyThisSource || ""} ${(s.keyConcepts || []).join(" ")}`.toLowerCase();
      let matchScore = s.relevanceScore || 50;
      for (const kw of sectionKeywords) {
        if (sourceText.includes(kw)) {
          matchScore += 8;
        }
      }
      return { source: s, matchScore };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  return [...directMatches, ...scored.map((item) => item.source)].slice(0, maxCount);
}

/**
 * A synthesis card for a section and a source, holding only what is real: a
 * quote checked against the source (with the claim it supports) or, failing
 * that, the source's own abstract. Interpretation, counterargument and link
 * start empty for the student to write; nothing is attributed to an author
 * that the source does not say.
 */
export function buildSynthesisCard(
  section: { id: string; title: string; numberStr?: string },
  source: DiscoveredSource,
  index: number,
  _question: string,
  citationStyle: string
): SectionAnalyticalSynthesis {
  const citation = formatSourceInTextCitation(source, citationStyle);
  const quoted = source.extractedEvidences && source.extractedEvidences.length > 0 ? source.extractedEvidences[0] : null;
  const abstract = (source.abstract || "").trim();
  const excerpt = quoted?.excerpt || (abstract ? abstract.slice(0, 300) : "");
  return {
    id: `synth-${section.id}-${source.id}-${index}`,
    sectionId: section.id,
    sectionTitle: section.title,
    sectionNumberStr: section.numberStr || "",
    claim: quoted?.claim || "",
    evidence: excerpt,
    sourceId: source.id,
    sourceTitle: source.title,
    sourceAuthors: source.authors,
    sourceYear: source.year || "n.d.",
    sourceJournal: source.journal || source.publisher,
    evidenceExcerpt: excerpt || undefined,
    evidenceLocation: quoted?.sourceLocation || (abstract ? "Abstract" : undefined),
    citation,
    inTextCitation: citation,
    canonicalReference: source.canonicalReference,
    interpretation: "",
    counterargument: "",
    analyticalLink: "",
    isUserEdited: false,
    basedOn: quoted ? "source_evidence" : abstract ? "abstract" : undefined,
  };
}

/** A card worth keeping or sending to the AI: written by the student, or built from the source itself. */
export function isGroundedSynthesis(card: SectionAnalyticalSynthesis): boolean {
  return Boolean(card.isUserEdited || card.basedOn);
}

/**
 * Generates or synchronizes section analytical syntheses for all outline sections.
 * Guarantees that existing user edits are strictly preserved.
 */
export function generateOrSyncAnalyticalSyntheses(
  structure: AssignmentStructure | null | undefined,
  sources: DiscoveredSource[],
  question: string,
  citationStyle: string,
  existingSyntheses: SectionAnalyticalSynthesis[] = []
): SectionAnalyticalSynthesis[] {
  const subheadings: AssignmentSubheading[] = flattenStructureSubheadings(structure);
  const targetSections =
    subheadings.length > 0
      ? subheadings.map((s) => ({
          id: s.id,
          title: s.title,
          numberStr: s.numberStr,
          guidance: s.guidance || s.purpose,
          analyticalObjective: s.analyticalObjective,
          keyTheories: s.keyTheories,
          keyArguments: s.keyArguments,
        }))
      : (structure?.headings || []).map((h) => ({
          id: h.id,
          title: h.title,
          numberStr: `${h.number}.0`,
          guidance: h.notes || h.purpose,
          analyticalObjective: h.analyticalObjective,
          keyTheories: h.keyTheories,
          keyArguments: h.keyArguments,
        }));

  if (targetSections.length === 0) {
    return existingSyntheses;
  }

  const result: SectionAnalyticalSynthesis[] = [];

  for (const sec of targetSections) {
    // Check if we already have syntheses for this section
    // Old template cards (not edited, not built from the source) are rebuilt.
    const existingForSec = existingSyntheses.filter((s) => s.sectionId === sec.id && isGroundedSynthesis(s));

    if (existingForSec.length > 0) {
      // Preserve existing syntheses, update citations to match active citationStyle
      for (const item of existingForSec) {
        const matchedSource = item.sourceId ? sources.find((s) => s.id === item.sourceId) : undefined;
        if (matchedSource) {
          result.push({
            ...item,
            citation: formatSourceInTextCitation(matchedSource, citationStyle),
          });
        } else {
          result.push(item);
        }
      }
      continue;
    }

    // Otherwise, generate initial analytical syntheses for this section
    const matchedSources = matchSourcesForSection(sec, sources, 2);
    if (matchedSources.length > 0) {
      matchedSources.forEach((src, idx) => {
        result.push(buildSynthesisCard(sec, src, idx + 1, question, citationStyle));
      });
    }
    // No matching source: no card (a placeholder citation would be invented).
  }

  return result;
}


/**
 * Convenience alias for generating analytical syntheses across all sections
 */
export const synthesizeSectionAnalysis = (
  question: string,
  structure: AssignmentStructure | null | undefined,
  sources: DiscoveredSource[],
  citationStyle: string
): SectionAnalyticalSynthesis[] =>
  generateOrSyncAnalyticalSyntheses(structure, sources, question, citationStyle);

