/**
 * Readability statistics — the pure logic behind AG-18, the Readability
 * Analyst (docs/04-architecture/42-MULTI-AGENT-ARCHITECTURE.md §3 Group E:
 * "Reading level, sentence-length distribution, jargon density, passive-
 * voice ratio — assessed against the output type's audience. Mode:
 * deterministic.").
 *
 * Flesch Reading Ease and Flesch-Kincaid Grade Level both need an
 * approximate syllable count; there is no dictionary here, so
 * countSyllables() is the standard vowel-group heuristic (count runs of
 * vowels, drop a trailing silent "e"). It is wrong for plenty of individual
 * words (silent letters, diphthongs, loanwords) but is the same heuristic
 * most readability tools use, and averages out over a paragraph — this is a
 * documented approximation, not a claim of dictionary-grade accuracy.
 */

import { splitSentences, words, PASSIVE_RE, countMatches } from "./textStats";

export interface ReadabilityMetrics {
  wordCount: number;
  sentenceCount: number;
  averageSentenceLength: number;
  /** Standard Flesch Reading Ease: higher is easier, roughly 0-100 (can exceed the range for extreme text). */
  fleschReadingEase: number;
  /** Standard Flesch-Kincaid Grade Level: approximate US school grade needed to read the text. */
  fleschKincaidGradeLevel: number;
  /** Fraction (0-1) of sentences matching the passive-voice heuristic (domain/language/textStats.ts's PASSIVE_RE). */
  passiveVoiceRatio: number;
  /** Fraction (0-1) of words with 3+ syllables — the "complex word" proxy Gunning Fog and similar indices use for jargon density. */
  jargonDensity: number;
}

export type ReadabilityAudience = "general" | "academic" | "professional";

/** Grade-level ceiling before a finding is raised, per audience — academic prose is expected to run denser than general-audience writing. */
const GRADE_LEVEL_THRESHOLD: Record<ReadabilityAudience, number> = {
  general: 10,
  professional: 13,
  academic: 17,
};

export interface ReadabilityFinding {
  metric: keyof ReadabilityMetrics;
  message: string;
}

export interface ReadabilityReport {
  metrics: ReadabilityMetrics;
  findings: ReadabilityFinding[];
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return 0;
  const vowelGroups = w.match(/[aeiouy]+/g) ?? [];
  let count = vowelGroups.length;
  if (w.endsWith("e") && !w.endsWith("le") && count > 1) count -= 1; // drop a trailing silent e
  return Math.max(1, count);
}

const EMPTY_METRICS: ReadabilityMetrics = {
  wordCount: 0,
  sentenceCount: 0,
  averageSentenceLength: 0,
  fleschReadingEase: 0,
  fleschKincaidGradeLevel: 0,
  passiveVoiceRatio: 0,
  jargonDensity: 0,
};

/**
 * Computes readability metrics for `text`, and — if `audience` is given —
 * raises a finding when the Flesch-Kincaid grade level exceeds that
 * audience's threshold. Empty or word-less text returns EMPTY_METRICS
 * rather than NaN (a zero-word/zero-sentence input has no readability, not
 * an undefined one).
 */
export function analyzeReadability(text: string, audience?: ReadabilityAudience): ReadabilityReport {
  const wordList = words(text);
  const sentences = splitSentences(text);
  if (wordList.length === 0 || sentences.length === 0) {
    return { metrics: EMPTY_METRICS, findings: [] };
  }

  const syllableCount = wordList.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordsPerSentence = wordList.length / sentences.length;
  const syllablesPerWord = syllableCount / wordList.length;

  const fleschReadingEase = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const fleschKincaidGradeLevel = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  const complexWords = wordList.filter((w) => countSyllables(w) >= 3).length;

  const metrics: ReadabilityMetrics = {
    wordCount: wordList.length,
    sentenceCount: sentences.length,
    averageSentenceLength: round2(wordsPerSentence),
    fleschReadingEase: round2(fleschReadingEase),
    fleschKincaidGradeLevel: round2(fleschKincaidGradeLevel),
    passiveVoiceRatio: round2(countMatches(text, PASSIVE_RE) / sentences.length),
    jargonDensity: round2(complexWords / wordList.length),
  };

  const findings: ReadabilityFinding[] = [];
  if (audience) {
    const threshold = GRADE_LEVEL_THRESHOLD[audience];
    if (metrics.fleschKincaidGradeLevel > threshold) {
      findings.push({
        metric: "fleschKincaidGradeLevel",
        message: `Flesch-Kincaid grade level ${metrics.fleschKincaidGradeLevel} exceeds the ${audience} audience's threshold of ${threshold}.`,
      });
    }
  }

  return { metrics, findings };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
