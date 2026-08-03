/**
 * Language & Voice Studio — pure domain types.
 *
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md.
 *
 * `domain/language` holds everything about the Studio that needs no I/O:
 * level definitions, the deterministic mechanics engine (levels 1–2), voice
 * statistics, and diff construction. `app/studio` (server-side) owns the
 * orchestration and the model-backed levels (3–5) via platform/gateway.
 */

/** The five intervention levels, in increasing order of how much they may change. */
export type InterventionLevel = "proofread" | "clarity" | "flow" | "register" | "rewrite";

export const INTERVENTION_LEVELS: InterventionLevel[] = [
  "proofread",
  "clarity",
  "flow",
  "register",
  "rewrite",
];

/** Whether a level is served by the deterministic engine or requires a model call. */
export function isDeterministicLevel(level: InterventionLevel): boolean {
  return level === "proofread";
}

/**
 * The category a single diff hunk belongs to. This is the distinction that
 * makes stage 4 (meaning verification) real: `content` hunks are surfaced
 * separately and first, never blended into the language-change list
 * (docs 32 §7).
 */
export type ChangeCategory = "language" | "content";

export interface DiffChange {
  id: string;
  category: ChangeCategory;
  /** Character range within the ORIGINAL passage this hunk replaces. */
  originalStart: number;
  originalEnd: number;
  originalText: string;
  replacementText: string;
  /** Why this change was made — always shown, never omitted (docs 32 §7). */
  reason: string;
  /** Populated only for category "content": what specifically changed about the claim. */
  meaningNote?: string;
}

export interface RefinementDiff {
  passageId: string;
  level: InterventionLevel;
  originalText: string;
  changes: DiffChange[];
  /** True if voice matching was applied and influenced at least one change. */
  voiceApplied: boolean;
}

/** A first-language background, used to anticipate specific interference patterns (docs 32 §6.1). */
export type L1Profile =
  | "mandarin"
  | "japanese"
  | "korean"
  | "turkish"
  | "finnish"
  | "hungarian"
  | "arabic"
  | "hebrew"
  | "spanish"
  | "portuguese"
  | "italian"
  | "french"
  | "german"
  | "dutch"
  | "russian"
  | "polish"
  | "czech"
  | "hindi"
  | "bengali"
  | "urdu";

/** Derived statistics from a user's own writing samples (docs 32 §5.2). Never stored text. */
export interface VoiceProfile {
  sampleWordCount: number;
  meanSentenceLength: number;
  sentenceLengthStdDev: number;
  passiveVoiceRatio: number;
  semicolonRate: number; // per 1000 words
  firstPersonRate: number; // per 1000 words
  averageWordLength: number;
}

/** Below this many sample words, voice matching is disabled rather than fitted to noise (docs 32 §12). */
export const MIN_VOICE_PROFILE_WORDS = 1000;

export interface DisciplineRegister {
  discipline: string;
  preferPassiveVoice: boolean;
  allowFirstPerson: boolean;
  hedgingExpected: boolean;
}
