/**
 * Section Drafting Engine
 * -----------------------
 * Dynamic, topic-grounded collegiate academic drafting engine.
 * Strictly enforces official college writing standards:
 * - Active voice (≥80%) and strong analytical verbs
 * - Anti-thesaurus clarity over convoluted academic jargon
 * - Elimination of throat-clearing fluff and canned buzzwords
 * - Calibrated tone adaptation across 5 distinct collegiate styles
 * - Strict section uniqueness (<20% overlap) and automated quality evaluation
 */

import type { AcademicTone } from "../types/drafting";
import {
  compileAcademicSystemPrompt,
  BANNED_ACADEMIC_BUZZWORDS,
  BANNED_THROAT_CLEARING_OPENINGS,
} from "../prompts/academicWritingPrompts";
import {
  normalizeAcademicTone,
  compileTonePromptDirectives,
} from "./academicToneProfiles";
import {
  evaluateWritingQuality,
  calculateRepetitionRatio,
} from "./writingQualityEvaluator";

export interface SectionDraftParams {
  sectionTitle: string;
  assignmentQuestion?: string;
  academicFunction?: string;
  targetWordCount?: number;
  academicLevel?: string;
  citationStyle?: string;
  thesis?: string;
  keyPoints?: string[];
  tone?: AcademicTone | string;
  boundSources?: Array<{
    title: string;
    authors?: string[];
    year?: string;
    citation?: string;
  }>;
  revisionPrompt?: "deepen" | "expand" | "condense";
  allDraftedSections?: Array<{ id?: string; title: string; content: string }>;
}

export interface UniquenessValidationResult {
  isUnique: boolean;
  maxSimilarity: number;
  conflictingPair?: [string, string];
}

/**
 * Normalizes a sentence for similarity comparison.
 */
function normalizeSentence(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

/**
 * Validates that no two sections in a document share more than 20% identical sentences.
 */
export function validateSectionUniqueness(
  sections: Array<{ id?: string; title: string; content: string }>
): UniquenessValidationResult {
  if (!sections || sections.length < 2) {
    return { isUnique: true, maxSimilarity: 0 };
  }

  let maxSimilarity = 0;
  let conflictingPair: [string, string] | undefined;

  for (let i = 0; i < sections.length; i++) {
    const s1Sentences = sections[i].content
      .split(/(?<=[.?!])\s+/)
      .map(normalizeSentence)
      .filter((s) => s.length > 20);

    if (s1Sentences.length === 0) continue;
    const s1Set = new Set(s1Sentences);

    for (let j = i + 1; j < sections.length; j++) {
      const s2Sentences = sections[j].content
        .split(/(?<=[.?!])\s+/)
        .map(normalizeSentence)
        .filter((s) => s.length > 20);

      if (s2Sentences.length === 0) continue;

      let shared = 0;
      for (const sent of s2Sentences) {
        if (s1Set.has(sent)) {
          shared++;
        }
      }

      const similarity = shared / Math.min(s1Sentences.length, s2Sentences.length);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
      }

      if (similarity > 0.2) {
        conflictingPair = [sections[i].title, sections[j].title];
        return {
          isUnique: false,
          maxSimilarity: Math.round(maxSimilarity * 100) / 100,
          conflictingPair,
        };
      }
    }
  }

  return {
    isUnique: true,
    maxSimilarity: Math.round(maxSimilarity * 100) / 100,
  };
}

/**
 * Assembles a comprehensive LLM drafting prompt adhering to college writing tone standards.
 */
export function assembleDraftingPrompt(params: SectionDraftParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const tone = normalizeAcademicTone(params.tone);
  const systemPrompt = compileAcademicSystemPrompt(tone, {
    topic: params.sectionTitle,
    question: params.assignmentQuestion,
    academicLevel: params.academicLevel || "undergraduate",
    citationStyle: params.citationStyle || "apa7",
  });

  let userPrompt = `Draft the following academic section adhering strictly to collegiate clarity and active voice standards.\n\n`;
  userPrompt += `SECTION TITLE: ${params.sectionTitle}\n`;
  if (params.assignmentQuestion) {
    userPrompt += `ASSIGNMENT QUESTION: ${params.assignmentQuestion}\n`;
  }
  if (params.targetWordCount) {
    userPrompt += `TARGET WORD COUNT: ~${params.targetWordCount} words\n`;
  }
  if (params.thesis) {
    userPrompt += `CENTRAL THESIS: ${params.thesis}\n`;
  }
  if (params.keyPoints && params.keyPoints.length > 0) {
    userPrompt += `KEY INQUIRY POINTS:\n${params.keyPoints.map((p) => `- ${p}`).join("\n")}\n`;
  }
  if (params.boundSources && params.boundSources.length > 0) {
    userPrompt += `EVIDENTIARY SOURCES TO INTEGRATE:\n${params.boundSources
      .map(
        (s) =>
          `- ${s.title} (${s.authors?.join(", ") || "Author"}, ${s.year || "Year"})`
      )
      .join("\n")}\n`;
  }
  if (params.revisionPrompt) {
    userPrompt += `REVISION DIRECTIVE: ${params.revisionPrompt.toUpperCase()}\n`;
  }

  userPrompt += `\nSTRICT INSTRUCTIONS:\n`;
  userPrompt += `- Ensure active voice in at least 80% of sentences.\n`;
  userPrompt += `- Start directly with the main analytical point in sentence 1 (NO throat-clearing fluff).\n`;
  userPrompt += `- Forbid pretentious buzzwords like "Primary Phenomenon" or "computational expediency".\n`;
  userPrompt += `- Maintain Flesch-Kincaid Grade Level 11–14.\n`;

  return { systemPrompt, userPrompt };
}
