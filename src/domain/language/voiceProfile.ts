/**
 * Voice Profile — statistics derived from a user's own writing.
 *
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §5.
 * "The Voice Profile is derived statistics, not stored text... per-user,
 * never shared or pooled across users, never used for training, deletable
 * at any time."
 *
 * This module computes those statistics and compares candidate refined text
 * against them, which is what lets app/studio's voice-check stage flag
 * drift (docs §5.4) and constrain model-backed levels toward the author's
 * own range rather than a generic "elegant" register.
 */

import type { VoiceProfile } from "./types";
import { MIN_VOICE_PROFILE_WORDS } from "./types";

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function words(text: string): string[] {
  return text.match(/[A-Za-z']+/g) ?? [];
}

/** A conservative heuristic for passive voice: a form of "to be" followed by a past participle. */
const PASSIVE_RE = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi;

function countMatches(text: string, re: RegExp): number {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

/**
 * Build a Voice Profile from one or more writing samples. Returns undefined
 * if the combined sample is below MIN_VOICE_PROFILE_WORDS — voice matching
 * must not be fitted to noise (docs §12).
 */
export function buildVoiceProfile(samples: string[]): VoiceProfile | undefined {
  const combined = samples.join("\n\n");
  const wordList = words(combined);
  if (wordList.length < MIN_VOICE_PROFILE_WORDS) return undefined;

  const sentences = splitSentences(combined);
  const lengths = sentences.map((s) => words(s).length).filter((n) => n > 0);
  const mean = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  const variance =
    lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / Math.max(1, lengths.length);

  const perThousand = (count: number) => (count / wordList.length) * 1000;

  return {
    sampleWordCount: wordList.length,
    meanSentenceLength: round2(mean),
    sentenceLengthStdDev: round2(Math.sqrt(variance)),
    passiveVoiceRatio: round2(countMatches(combined, PASSIVE_RE) / Math.max(1, sentences.length)),
    semicolonRate: round2(perThousand(countMatches(combined, /;/g))),
    firstPersonRate: round2(perThousand(countMatches(combined, /\b(I|we|our|my|us)\b/g))),
    averageWordLength: round2(wordList.reduce((sum, w) => sum + w.length, 0) / wordList.length),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface VoiceDriftReport {
  drifted: boolean;
  notes: string[];
}

/**
 * Compare a candidate passage's statistics against the profile. Flags drift
 * when a dimension is meaningfully outside the author's habitual range —
 * used post-refinement to decide whether to pull output back toward the
 * user's voice (docs §5.3–5.4). Correctness always wins over voice, which is
 * why this function only ever *reports* drift; it never vetoes a change.
 */
export function detectVoiceDrift(profile: VoiceProfile, candidateText: string): VoiceDriftReport {
  const sentences = splitSentences(candidateText);
  const lengths = sentences.map((s) => words(s).length).filter((n) => n > 0);
  if (lengths.length === 0) return { drifted: false, notes: [] };

  const candidateMean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const notes: string[] = [];

  // A "meaningful" deviation: more than one profile standard deviation away,
  // with a floor so a tiny stddev doesn't make every passage flag.
  const tolerance = Math.max(profile.sentenceLengthStdDev, 3);
  if (Math.abs(candidateMean - profile.meanSentenceLength) > tolerance) {
    notes.push(
      candidateMean > profile.meanSentenceLength
        ? `This reads with longer sentences (avg ${candidateMean.toFixed(1)} words) than you typically use (avg ${profile.meanSentenceLength}).`
        : `This reads with shorter sentences (avg ${candidateMean.toFixed(1)} words) than you typically use (avg ${profile.meanSentenceLength}).`
    );
  }

  const candidatePassive = countMatches(candidateText, PASSIVE_RE) / sentences.length;
  if (profile.passiveVoiceRatio < 0.15 && candidatePassive > 0.4) {
    notes.push("This uses more passive voice than your other writing.");
  }
  if (profile.passiveVoiceRatio > 0.4 && candidatePassive < 0.15) {
    notes.push("This uses less passive voice than your other writing.");
  }

  return { drifted: notes.length > 0, notes };
}

/** A short, model-facing description of the profile, used to steer levels 3–5. */
export function describeProfileForPrompt(profile: VoiceProfile): string {
  const parts: string[] = [];
  parts.push(`average sentence length ${profile.meanSentenceLength} words`);
  parts.push(
    profile.passiveVoiceRatio > 0.4
      ? "prefers passive voice"
      : profile.passiveVoiceRatio < 0.15
        ? "prefers active voice"
        : "mixes active and passive voice"
  );
  if (profile.semicolonRate < 0.5) parts.push("rarely uses semicolons");
  if (profile.firstPersonRate > 5) parts.push("comfortable with first person");
  return parts.join("; ");
}
