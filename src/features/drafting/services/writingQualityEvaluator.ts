/**
 * Writing Quality Evaluator Service
 * ---------------------------------
 * Post-generation heuristics enforcing collegiate writing standards:
 * - Readability benchmark (Flesch-Kincaid Grade Level 11–14)
 * - Active voice ratio enforcement (≥80% active voice / <20% passive)
 * - Filler, throat-clearing, and banned buzzword detection
 * - Cross-section repetition / n-gram overlap check (≤20% overlap)
 */

import type {
  AcademicTone,
  WritingQualityEvaluation,
  WritingQualityIssue,
} from "../types/drafting";
import {
  BANNED_ACADEMIC_BUZZWORDS,
  BANNED_THROAT_CLEARING_OPENINGS,
} from "../prompts/academicWritingPrompts";

/**
 * Splits text into individual sentences accurately.
 */
export function extractSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  // Remove markdown headers
  const stripped = text
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join(" ");

  // Split on sentence boundaries (. ? !)
  const rawSentences = stripped.split(/(?<=[.?!])\s+/);

  return rawSentences
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && /[a-zA-Z]/.test(s));
}

/**
 * Approximate syllable counter for standard English words.
 */
export function countSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 1;
  if (clean.length <= 3) return 1;

  // Replace common endings that don't add syllables
  const trimmed = clean
    .replace(/(?:[^laeiouy]|ed|es|e)$/, "")
    .replace(/^y/, "");

  const matches = trimmed.match(/[aeiouy]{1,2}/g);
  return matches ? Math.max(1, matches.length) : 1;
}

/**
 * Calculates Flesch-Kincaid Grade Level.
 * Formula: 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
 */
export function calculateFleschKincaid(text: string): number {
  const sentences = extractSentences(text);
  if (sentences.length === 0) return 12.0;

  const words = text
    .replace(/[-—–/\\_]/g, " ")
    .replace(/[#*_`[\]()"“”'’]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim().replace(/[^a-zA-Z]/g, ""))
    .filter((w) => w.length > 0);

  if (words.length === 0) return 12.0;

  let totalSyllables = 0;
  for (const w of words) {
    totalSyllables += countSyllables(w);
  }

  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = totalSyllables / words.length;

  const score = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;
  return Math.round(score * 10) / 10;
}

/**
 * Common passive voice patterns: auxiliary 'be' + past participle verb.
 */
const PASSIVE_VOICE_REGEX =
  /\b(is|are|was|were|be|been|being)\b\s+(?:\w+ly\s+)?(examined|conducted|demonstrated|evaluated|assessed|shown|analyzed|observed|implemented|tested|found|considered|derived|structured|configured|used|applied|seen|made|written|given|taken|filtered|tested|mandated|measured|supported|uncovered|illustrated)\b/i;

const PASSIVE_BY_AGENT_REGEX =
  /\b(is|are|was|were|be|been|being)\b\s+(?:\w+ly\s+)?\w+(?:ed|en)\s+by\b/i;

/**
 * Checks whether a single sentence is in passive voice.
 */
export function isPassiveSentence(sentence: string): boolean {
  return (
    PASSIVE_VOICE_REGEX.test(sentence) || PASSIVE_BY_AGENT_REGEX.test(sentence)
  );
}

/**
 * Calculates the active and passive sentence ratios.
 */
export function analyzeVoiceRatios(text: string): {
  activeRatio: number;
  passiveRatio: number;
  passiveSentences: string[];
  totalSentences: number;
} {
  const sentences = extractSentences(text);
  if (sentences.length === 0) {
    return {
      activeRatio: 1.0,
      passiveRatio: 0.0,
      passiveSentences: [],
      totalSentences: 0,
    };
  }

  const passiveSentences = sentences.filter(isPassiveSentence);
  const passiveRatio =
    Math.round((passiveSentences.length / sentences.length) * 100) / 100;
  const activeRatio = Math.round((1 - passiveRatio) * 100) / 100;

  return {
    activeRatio,
    passiveRatio,
    passiveSentences,
    totalSentences: sentences.length,
  };
}

/**
 * Scans text for blacklisted pseudo-academic buzzwords.
 */
export function detectBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  const detected: string[] = [];

  for (const phrase of BANNED_ACADEMIC_BUZZWORDS) {
    if (lower.includes(phrase.toLowerCase())) {
      detected.push(phrase);
    }
  }

  return detected;
}

/**
 * Scans sentence beginnings for banned throat-clearing fluff.
 */
export function detectThroatClearing(text: string): string[] {
  const sentences = extractSentences(text);
  const detected: string[] = [];

  for (const s of sentences) {
    const sLower = s.toLowerCase();
    for (const opening of BANNED_THROAT_CLEARING_OPENINGS) {
      if (sLower.startsWith(opening.toLowerCase())) {
        detected.push(opening);
        break;
      }
    }
  }

  return detected;
}

/**
 * Normalizes tokens for n-gram comparison.
 */
function tokenizeForNGrams(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Checks n-gram overlap between candidate text and existing sections.
 */
export function checkSectionRepetition(
  candidateText: string,
  otherSections: Array<string | { title?: string; content: string }>,
  n = 4
): { maxOverlap: number; conflictingSection?: string } {
  if (!otherSections || otherSections.length === 0) {
    return { maxOverlap: 0 };
  }

  const normalizedSections: Array<{ title?: string; content: string }> = otherSections.map(
    (item) => (typeof item === "string" ? { content: item } : item)
  );

  const candidateTokens = tokenizeForNGrams(candidateText);
  if (candidateTokens.length < n) return { maxOverlap: 0 };

  const candidateNGrams = new Set<string>();
  for (let i = 0; i <= candidateTokens.length - n; i++) {
    candidateNGrams.add(candidateTokens.slice(i, i + n).join(" "));
  }

  if (candidateNGrams.size === 0) return { maxOverlap: 0 };

  let maxOverlap = 0;
  let conflictingSection: string | undefined;

  for (const other of normalizedSections) {
    if (!other.content) continue;

    if (other.content.trim() === candidateText.trim()) {
      return {
        maxOverlap: 1.0,
        conflictingSection: other.title || "Existing Section",
      };
    }

    const otherTokens = tokenizeForNGrams(other.content);
    if (otherTokens.length < n) continue;

    let matches = 0;
    for (let i = 0; i <= otherTokens.length - n; i++) {
      const gram = otherTokens.slice(i, i + n).join(" ");
      if (candidateNGrams.has(gram)) {
        matches++;
      }
    }

    const overlap = matches / candidateNGrams.size;
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      conflictingSection = other.title || "Another Section";
    }
  }

  return {
    maxOverlap: Math.round(maxOverlap * 100) / 100,
    conflictingSection,
  };
}

/**
 * Calculates n-gram overlap ratio between candidate text and other sections.
 */
export function calculateRepetitionRatio(
  candidateText: string,
  otherSections: Array<string | { title?: string; content: string }>,
  n = 4
): number {
  return checkSectionRepetition(candidateText, otherSections, n).maxOverlap;
}

export interface WritingQualityOptions {
  otherSections?: Array<string | { title?: string; content: string }>;
  existingSections?: Array<string | { title?: string; content: string }>;
  tone?: AcademicTone | string;
  targetWordCount?: number;
}

/**
 * Main quality evaluator function.
 * Evaluates passive voice, Flesch-Kincaid readability, banned phrases,
 * throat clearing, informal pronouns, and n-gram repetition.
 */
export function evaluateWritingQuality(
  text: string,
  options?: WritingQualityOptions
): WritingQualityEvaluation {
  const issues: WritingQualityIssue[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const { activeRatio, passiveRatio, passiveSentences, totalSentences } =
    analyzeVoiceRatios(text);

  const gradeLevel = calculateFleschKincaid(text);
  const bannedPhrasesFound = detectBannedPhrases(text);
  const throatClearingFound = detectThroatClearing(text);

  const referenceSections = options?.otherSections || options?.existingSections || [];
  const { maxOverlap, conflictingSection } = checkSectionRepetition(
    text,
    referenceSections
  );

  // 1. Passive voice check: passive sentences must be < 20% (active >= 80%)
  if (passiveRatio > 0.2) {
    issues.push({
      type: "passive_voice",
      severity: "warning",
      message: `Passive voice ratio is ${Math.round(passiveRatio * 100)}% (threshold: <20%). Active voice must exceed 80%.`,
      snippet: passiveSentences[0],
      suggestion:
        "Rewrite passive constructions with direct subjects: e.g. instead of 'an examination was conducted by researchers', write 'researchers examined'.",
    });
  }

  // 2. Banned phrases check
  if (bannedPhrasesFound.length > 0) {
    issues.push({
      type: "banned_buzzword",
      severity: "error",
      message: `Detected banned pseudo-academic buzzwords: ${bannedPhrasesFound.map((p) => `"${p}"`).join(", ")}.`,
      snippet: bannedPhrasesFound[0],
      suggestion:
        "Replace robotic academic jargon with direct, precise claims grounded in concrete evidence.",
    });
  }

  // 3. Throat-clearing openings check
  if (throatClearingFound.length > 0) {
    issues.push({
      type: "throat_clearing",
      severity: "error",
      message: `Found empty throat-clearing fluff: "${throatClearingFound[0]}".`,
      snippet: throatClearingFound[0],
      suggestion:
        "Delete rhetorical preambles and state the analytical claim directly in sentence 1.",
    });
  }

  // 4. Second-person informal pronoun check
  const secondPersonMatches = text.match(/\b(you|your|yours|yourself|yourselves)\b/gi);
  if (secondPersonMatches && secondPersonMatches.length > 0) {
    issues.push({
      type: "second_person_informal",
      severity: "error",
      message: `Found informal second-person pronoun: "${secondPersonMatches[0]}". Academic writing requires objective third-person voice.`,
      snippet: secondPersonMatches[0],
      suggestion:
        "Replace second-person pronouns ('you', 'your') with third-person analytical subjects ('organizations', 'leaders', 'analysts').",
    });
  }

  // 5. Readability check (Collegiate standard is Grade 11–14)
  if (gradeLevel > 16.0) {
    issues.push({
      type: "readability",
      severity: "warning",
      message: `Flesch-Kincaid Grade Level is ${gradeLevel} (target: 11–14). Text resembles overly convoluted academic soup.`,
      suggestion:
        "Shorten long sentences, unbundle stacked prepositional clauses, and use simpler verbs.",
    });
  } else if (gradeLevel < 9.0 && wordCount > 50) {
    issues.push({
      type: "readability",
      severity: "warning",
      message: `Flesch-Kincaid Grade Level is ${gradeLevel} (target: 11–14). Text may be too simplistic for collegiate academic standards.`,
      suggestion:
        "Combine short choppy sentences with logical subordinating conjunctions to demonstrate scholarly depth.",
    });
  }

  // 6. Repetition check (≤20% overlap)
  if (maxOverlap > 0.2) {
    issues.push({
      type: "repetition",
      severity: "error",
      message: `Section shares ${Math.round(maxOverlap * 100)}% n-gram overlap with ${conflictingSection || "existing sections"} (max allowed: 20%).`,
      suggestion:
        "Regenerate section to advance distinct, topic-specific arguments rather than duplicating content.",
    });
  }

  // Compute overall score (100 base, deductions for issues)
  let score = 100;
  for (const issue of issues) {
    score -= issue.severity === "error" ? 25 : 10;
  }
  score = Math.max(0, Math.min(100, score));

  const hasErrors = issues.some((i) => i.severity === "error");
  const meetsStandard = !hasErrors && passiveRatio <= 0.2 && maxOverlap <= 0.2;
  const isValid = meetsStandard;

  const suggestedRewrites = issues
    .map((i) => i.suggestion)
    .filter((s): s is string => Boolean(s));

  return {
    isValid,
    meetsStandard,
    score,
    qualityScore: score,
    activeSentenceRatio: activeRatio,
    passiveSentenceRatio: passiveRatio,
    fleschKincaidGradeLevel: gradeLevel,
    wordCount,
    sentenceCount: totalSentences,
    issues,
    suggestedRewrites,
    bannedPhrasesFound,
    throatClearingFound,
    repetitionRatio: maxOverlap,
    metrics: {
      activeVoiceRatio: activeRatio,
      passiveVoiceRatio: passiveRatio,
      fleschKincaidGradeLevel: gradeLevel,
      bannedPhraseCount: bannedPhrasesFound.length,
      throatClearingCount: throatClearingFound.length,
      repetitionRatio: maxOverlap,
      wordCount,
      sentenceCount: totalSentences,
    },
  };
}
