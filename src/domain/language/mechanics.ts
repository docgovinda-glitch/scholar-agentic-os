/**
 * The deterministic mechanics engine — Level 1 "Proofread".
 *
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §4 Level 1:
 * "spelling, punctuation, subject-verb agreement, articles, prepositions,
 * verb tense consistency, capitalisation, hyphenation. Never changes: word
 * choice, sentence structure, order, length."
 *
 * SCOPE, STATED HONESTLY. A complete grammar checker is a standing research
 * problem, not something this module claims to be. What is implemented here
 * is a curated, deterministic, fully-tested set of high-frequency mechanical
 * error patterns — the ones a proofreading pass reliably catches and that
 * cost nothing (no model call, works offline, instant). It is not exhaustive
 * and does not pretend to be; anything it misses is still catchable by
 * levels 2+ (model-backed) or by the user. Every rule here:
 *   - never changes a word that is not, by its own rule, in error
 *   - never restructures a sentence
 *   - always states a specific reason (docs 32 §7)
 *
 * Extending this file with more rules is safe and expected — it is exactly
 * where L1-aware pattern support (docs 32 §6.1) plugs in over time.
 */

import type { DiffChange } from "./types";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `mech-${counter}`;
}

/** Reset the id counter — tests only, so ids are deterministic per test run. */
export function __resetMechanicsIdsForTests(): void {
  counter = 0;
}

interface MechanicsRule {
  name: string;
  reason: string;
  /** Find every match in `text`, returning [start, end, replacement] triples. */
  find(text: string): { start: number; end: number; replacement: string }[];
}

const DOUBLE_SPACE: MechanicsRule = {
  name: "double-space",
  reason: "Double space collapsed to one.",
  find(text) {
    const out: { start: number; end: number; replacement: string }[] = [];
    const re = /  +/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      out.push({ start: m.index, end: m.index + m[0].length, replacement: " " });
    }
    return out;
  },
};

const REPEATED_WORD: MechanicsRule = {
  name: "repeated-word",
  reason: "Repeated word removed.",
  find(text) {
    const out: { start: number; end: number; replacement: string }[] = [];
    const re = /\b([A-Za-z]+)([ \t]+)\1\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      out.push({ start: m.index, end: m.index + m[0].length, replacement: m[1] });
    }
    return out;
  },
};

const MISSING_SPACE_AFTER_PERIOD: MechanicsRule = {
  name: "missing-space-after-period",
  reason: "Missing space after a full stop.",
  find(text) {
    const out: { start: number; end: number; replacement: string }[] = [];
    // A period directly followed by an uppercase letter, not part of an
    // abbreviation/decimal/ellipsis — deliberately conservative.
    const re = /([a-z])\.([A-Z][a-z])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      out.push({ start: m.index, end: m.index + m[0].length, replacement: `${m[1]}. ${m[2]}` });
    }
    return out;
  },
};

const SENTENCE_START_CAPITALISATION: MechanicsRule = {
  name: "sentence-start-capitalisation",
  reason: "Sentence should start with a capital letter.",
  find(text) {
    const out: { start: number; end: number; replacement: string }[] = [];
    // Start of string, or after ". "/"! "/"? " followed by a lowercase letter.
    const re = /(^|[.!?]\s+)([a-z])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const letterIndex = m.index + m[1].length;
      out.push({ start: letterIndex, end: letterIndex + 1, replacement: m[2].toUpperCase() });
    }
    return out;
  },
};

/** "a" before a vowel-sound word -> "an", and vice versa. Deliberately scoped to
 *  letter-based heuristics with the known common exceptions (docs note the
 *  limitation rather than hide it). */
const ARTICLE_AGREEMENT: MechanicsRule = {
  name: "article-agreement",
  reason: "Article corrected to match the sound of the following word.",
  find(text) {
    const out: { start: number; end: number; replacement: string }[] = [];
    // Common exceptions where spelling misleads a naive vowel check.
    const consonantSoundStartsWithVowelLetter = /^(uni|use|user|usual|europe|one|once)/i;
    const vowelSoundStartsWithConsonantLetter = /^(hour|honest|honor|heir|mba)/i;

    const re = /\b(a|an)\s+([A-Za-z][A-Za-z-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const article = m[1];
      const word = m[2];
      let wantsAn: boolean;
      if (vowelSoundStartsWithConsonantLetter.test(word)) wantsAn = true;
      else if (consonantSoundStartsWithVowelLetter.test(word)) wantsAn = false;
      else wantsAn = /^[aeiouAEIOU]/.test(word);

      const isAn = article.toLowerCase() === "an";
      if (wantsAn !== isAn) {
        const correct = wantsAn ? (article === "A" ? "An" : "an") : article === "An" ? "A" : "a";
        out.push({ start: m.index, end: m.index + article.length, replacement: correct });
      }
    }
    return out;
  },
};

/** A small, explicit list of plural-subject + singular-verb agreement errors. */
const SUBJECT_VERB_AGREEMENT: MechanicsRule = {
  name: "subject-verb-agreement",
  reason: "Verb form corrected to agree with a plural subject.",
  find(text) {
    const out: { start: number; end: number; replacement: string }[] = [];
    const pluralHints = [
      "results",
      "findings",
      "participants",
      "groups",
      "studies",
      "data",
      "measures",
      "variables",
      "scores",
      "samples",
    ];
    const singularToPlural: Record<string, string> = { was: "were", is: "are", has: "have" };
    const hintPattern = pluralHints.join("|");
    const re = new RegExp(`\\b(${hintPattern})\\s+(was|is|has)\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const verb = m[2].toLowerCase();
      const correctedVerb = singularToPlural[verb];
      if (!correctedVerb) continue;
      const verbStart = m.index + m[1].length + (m[0].length - m[1].length - verb.length);
      const preserved = m[2][0] === m[2][0].toUpperCase() ? capitalise(correctedVerb) : correctedVerb;
      out.push({ start: verbStart, end: verbStart + verb.length, replacement: preserved });
    }
    return out;
  },
};

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const RULES: MechanicsRule[] = [
  DOUBLE_SPACE,
  REPEATED_WORD,
  MISSING_SPACE_AFTER_PERIOD,
  SENTENCE_START_CAPITALISATION,
  ARTICLE_AGREEMENT,
  SUBJECT_VERB_AGREEMENT,
];

/**
 * Run every mechanics rule against `text` and return non-overlapping
 * DiffChange hunks, sorted by position. Where two rules would touch the same
 * span, the first rule in RULES order wins and later overlaps are dropped —
 * a rare case in practice given how narrow each pattern is.
 */
export function runMechanicsEngine(text: string): DiffChange[] {
  const matches: { start: number; end: number; replacement: string; reason: string }[] = [];
  for (const rule of RULES) {
    for (const m of rule.find(text)) {
      matches.push({ ...m, reason: rule.reason });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const nonOverlapping: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      nonOverlapping.push(m);
      lastEnd = m.end;
    }
  }

  return nonOverlapping.map((m) => ({
    id: nextId(),
    category: "language" as const,
    originalStart: m.start,
    originalEnd: m.end,
    originalText: text.slice(m.start, m.end),
    replacementText: m.replacement,
    reason: m.reason,
  }));
}
