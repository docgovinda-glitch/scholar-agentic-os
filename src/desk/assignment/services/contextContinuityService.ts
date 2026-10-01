/**
 * Context Continuity Service — Production Spec §4.5
 *
 * After each section is drafted, generates a compact state object that is
 * passed to subsequent sections to maintain:
 *   - Argumentative coherence across sections
 *   - Source citation tracking (avoid over-citing, ensure distribution)
 *   - Thematic threading
 *   - Word count awareness
 *
 * This prevents each section from being generated in isolation.
 */

import type { AssignmentDraftingSection } from "../types";
import type { ContextContinuityState } from "./evidencePackService";

// ─────────────────────────────────────────────────────────────────────────────
// Claim Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract key claims/topic sentences from a section's draft content.
 * Uses heuristic extraction:
 *   1. First sentence of each paragraph (topic sentences)
 *   2. Sentences containing strong assertion markers
 */
function extractClaims(draftContent: string): string[] {
  if (!draftContent || draftContent.trim().length === 0) return [];

  const claims: string[] = [];

  // Split into paragraphs
  const paragraphs = draftContent
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);

  for (const para of paragraphs) {
    // Get first sentence (topic sentence)
    const firstSentence = para.match(/^[^.!?]+[.!?]/);
    if (firstSentence) {
      const claim = firstSentence[0].trim();
      // Filter out headings, transitions, and meta-text
      if (
        claim.length > 15 &&
        claim.length < 300 &&
        !claim.startsWith("#") &&
        !claim.startsWith("**") &&
        !/^(In this section|This section|As discussed|Furthermore|Moreover|Additionally|However|Nevertheless|In conclusion|To summarize)/i.test(claim)
      ) {
        claims.push(claim);
      }
    }
  }

  // Cap at 5 most meaningful claims
  return claims.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Source Citation Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract in-text citation references from draft content.
 * Matches common citation patterns:
 *   - APA: (Author, 2024) or (Author & Author, 2024)
 *   - Harvard: (Author 2024) or (Author, 2024, p. 12)
 *   - IEEE: [1], [2, 3]
 *   - Narrative: Author (2024) argues...
 */
function extractCitedSources(draftContent: string): string[] {
  if (!draftContent) return [];

  const cited = new Set<string>();

  // APA/Harvard parenthetical: (Author, 2024) or (Author & Author, 2024)
  const parenthetical = draftContent.matchAll(/\(([A-Z][a-z]+(?:\s(?:et\s+al\.?|&\s[A-Z][a-z]+))?),?\s*(\d{4})\)/g);
  for (const match of parenthetical) {
    cited.add(`${match[1]} (${match[2]})`);
  }

  // Narrative: Author (2024)
  const narrative = draftContent.matchAll(/([A-Z][a-z]+(?:\s(?:et\s+al\.?|and\s[A-Z][a-z]+))?)\s+\((\d{4})\)/g);
  for (const match of narrative) {
    cited.add(`${match[1]} (${match[2]})`);
  }

  // IEEE: [1], [2]
  const ieee = draftContent.matchAll(/\[(\d+)\]/g);
  for (const match of ieee) {
    cited.add(`[${match[1]}]`);
  }

  return Array.from(cited);
}

// ─────────────────────────────────────────────────────────────────────────────
// Running Theme Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract running themes from completed sections based on
 * recurring concepts and academic function labels.
 */
function extractRunningThemes(completedSections: AssignmentDraftingSection[]): string[] {
  const themes: string[] = [];

  for (const section of completedSections) {
    if (section.academicFunction && section.academicFunction.trim()) {
      themes.push(section.academicFunction);
    }
  }

  // Deduplicate
  return [...new Set(themes)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Last Section Link Extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the concluding/transition sentence from the last completed section.
 * This is typically the last sentence of the last paragraph.
 */
function extractLastSectionLink(draftContent: string): string {
  if (!draftContent || draftContent.trim().length === 0) return "";

  const paragraphs = draftContent
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);

  if (paragraphs.length === 0) return "";

  const lastParagraph = paragraphs[paragraphs.length - 1];
  // Get last sentence
  const sentences = lastParagraph.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    const lastSentence = sentences[sentences.length - 1].trim();
    if (lastSentence.length > 10 && lastSentence.length < 300) {
      return lastSentence;
    }
  }

  return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Word Count
// ─────────────────────────────────────────────────────────────────────────────

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build context continuity state from all completed sections.
 *
 * Call this BEFORE generating the next section to provide the evidence pack
 * with continuity context.
 *
 * @param allSections - All sections in the drafting plan
 * @param currentSectionIndex - Index of the section about to be generated
 * @returns Context continuity state, or null if this is the first section
 */
export function buildContextContinuity(
  allSections: AssignmentDraftingSection[],
  currentSectionIndex: number
): ContextContinuityState | null {
  if (currentSectionIndex <= 0) return null;

  const completedSections = allSections
    .slice(0, currentSectionIndex)
    .filter((s) => s.draftContent && s.draftContent.trim().length > 0);

  if (completedSections.length === 0) return null;

  // Aggregate claims from all completed sections
  const allClaims: string[] = [];
  const allCitedSources: string[] = [];
  let totalWords = 0;

  for (const section of completedSections) {
    const claims = extractClaims(section.draftContent || "");
    allClaims.push(...claims);

    const cited = extractCitedSources(section.draftContent || "");
    allCitedSources.push(...cited);

    totalWords += countWords(section.draftContent || "");
  }

  // Get the last completed section's closing link
  const lastCompleted = completedSections[completedSections.length - 1];
  const lastLink = extractLastSectionLink(lastCompleted.draftContent || "");

  // Extract running themes
  const runningThemes = extractRunningThemes(completedSections);

  return {
    claimsSoFar: allClaims.slice(0, 8), // Cap at 8 to control context window
    sourcesCitedSoFar: [...new Set(allCitedSources)].slice(0, 15),
    lastSectionLink: lastLink,
    runningThemes: runningThemes.slice(0, 5),
    wordsGeneratedSoFar: totalWords,
    sectionsCompleted: completedSections.length,
  };
}

/**
 * Update context continuity after a section has been generated.
 * This is called after `onComplete` in the streaming process to incrementally
 * update the state without recomputing from all sections.
 *
 * @param existing - The current continuity state (may be null for first section)
 * @param completedSection - The section that was just completed
 * @returns Updated context continuity state
 */
export function updateContextContinuityAfterSection(
  existing: ContextContinuityState | null,
  completedSection: AssignmentDraftingSection
): ContextContinuityState {
  const draftContent = completedSection.draftContent || "";
  const newClaims = extractClaims(draftContent);
  const newCited = extractCitedSources(draftContent);
  const newWords = countWords(draftContent);
  const lastLink = extractLastSectionLink(draftContent);

  if (!existing) {
    return {
      claimsSoFar: newClaims,
      sourcesCitedSoFar: newCited,
      lastSectionLink: lastLink,
      runningThemes: completedSection.academicFunction ? [completedSection.academicFunction] : [],
      wordsGeneratedSoFar: newWords,
      sectionsCompleted: 1,
    };
  }

  return {
    claimsSoFar: [...existing.claimsSoFar, ...newClaims].slice(0, 8),
    sourcesCitedSoFar: [...new Set([...existing.sourcesCitedSoFar, ...newCited])].slice(0, 15),
    lastSectionLink: lastLink,
    runningThemes: existing.runningThemes.includes(completedSection.academicFunction || "")
      ? existing.runningThemes
      : [...existing.runningThemes, completedSection.academicFunction || ""].filter(Boolean).slice(0, 5),
    wordsGeneratedSoFar: existing.wordsGeneratedSoFar + newWords,
    sectionsCompleted: existing.sectionsCompleted + 1,
  };
}
