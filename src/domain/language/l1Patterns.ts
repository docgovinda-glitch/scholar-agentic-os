/**
 * L1 interference pattern catalogue.
 *
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §6.1.
 * "Declared, never inferred... activates anticipation of the specific
 * interference patterns common to writers from that background."
 *
 * This catalogue does two things: (1) supplies the model prompt for levels
 * 2+ with the specific things to watch for, given a declared L1; (2) drives
 * the pattern-reporting feature (docs §6.3) by naming categories that
 * accepted mechanics/diff changes can be tallied against.
 */

import type { L1Profile } from "./types";

export interface L1PatternHint {
  category: string;
  description: string;
}

const CATALOGUE: Record<L1Profile, L1PatternHint[]> = {
  mandarin: [
    { category: "articles", description: "Article omission or misuse (a/an/the) — Mandarin has no articles" },
    { category: "plurals", description: "Plural marking on countable nouns" },
    { category: "tense-consistency", description: "Tense consistency, since Mandarin marks aspect rather than tense" },
    { category: "topic-comment", description: "Topic-comment sentence structure carried into English" },
  ],
  japanese: [
    { category: "articles", description: "Article omission — Japanese has no articles" },
    { category: "plurals", description: "Plural marking on countable nouns" },
    { category: "subject-omission", description: "Omitted subjects carried from a pro-drop language" },
  ],
  korean: [
    { category: "articles", description: "Article omission — Korean has no articles" },
    { category: "plurals", description: "Plural marking on countable nouns" },
    { category: "topic-comment", description: "Topic-comment sentence structure" },
  ],
  turkish: [
    { category: "articles", description: "Article use, since Turkish has no indefinite/definite article system" },
    { category: "prepositions", description: "Preposition selection — Turkish uses case suffixes instead" },
    { category: "compounding", description: "Agglutinative-influenced compound phrasing" },
  ],
  finnish: [
    { category: "articles", description: "Article use — Finnish has no articles" },
    { category: "prepositions", description: "Preposition selection — Finnish uses cases instead" },
  ],
  hungarian: [
    { category: "articles", description: "Article use, since usage differs from English conventions" },
    { category: "prepositions", description: "Preposition selection — Hungarian uses case suffixes" },
  ],
  arabic: [
    { category: "articles", description: "Definite article overuse, since Arabic marks definiteness differently" },
    { category: "coordination", description: "Coordination-heavy sentence structure ('and... and...')" },
    { category: "word-order", description: "Verb-subject-object order carried into English" },
  ],
  hebrew: [
    { category: "articles", description: "Definite article overuse" },
    { category: "coordination", description: "Coordination-heavy sentence structure" },
  ],
  spanish: [
    { category: "false-friends", description: "False cognates (e.g. 'actually' vs 'actualmente')" },
    { category: "gerunds", description: "Gerund overuse where English prefers an infinitive" },
    { category: "sentence-length", description: "Long, comma-linked sentences where English prefers shorter ones" },
  ],
  portuguese: [
    { category: "false-friends", description: "False cognates" },
    { category: "gerunds", description: "Gerund overuse" },
    { category: "comma-splices", description: "Comma splices carried from Portuguese punctuation conventions" },
  ],
  italian: [
    { category: "false-friends", description: "False cognates" },
    { category: "sentence-length", description: "Long, subordinate-clause-heavy sentences" },
  ],
  french: [
    { category: "register", description: "Formality register mismatches" },
    { category: "nominalisation", description: "Dense nominalisation carried from academic French style" },
    { category: "false-friends", description: "False cognates" },
  ],
  german: [
    { category: "compounding", description: "Compound noun phrasing carried directly into English" },
    { category: "verb-placement", description: "Verb-final clause structure" },
    { category: "register", description: "Over-formal register" },
  ],
  dutch: [
    { category: "compounding", description: "Compound noun phrasing" },
    { category: "verb-placement", description: "Verb-final clause structure" },
  ],
  russian: [
    { category: "articles", description: "Article omission — Russian has no articles" },
    { category: "aspect", description: "Tense choice influenced by verbal aspect rather than English tense" },
  ],
  polish: [
    { category: "articles", description: "Article omission" },
    { category: "aspect", description: "Tense choice influenced by verbal aspect" },
  ],
  czech: [
    { category: "articles", description: "Article omission" },
    { category: "aspect", description: "Tense choice influenced by verbal aspect" },
  ],
  hindi: [
    { category: "articles", description: "Article use" },
    { category: "progressive-tense", description: "Progressive tense overextension (e.g. 'I am knowing')" },
    { category: "register", description: "Formulaic register carried from formal Hindi/English instruction" },
  ],
  bengali: [
    { category: "articles", description: "Article use" },
    { category: "progressive-tense", description: "Progressive tense overextension" },
  ],
  urdu: [
    { category: "articles", description: "Article use" },
    { category: "progressive-tense", description: "Progressive tense overextension" },
  ],
};

export function patternsFor(l1: L1Profile): L1PatternHint[] {
  return CATALOGUE[l1];
}

/** A short, model-facing instruction fragment naming what to watch for. */
export function describeL1ForPrompt(l1: L1Profile): string {
  const hints = patternsFor(l1);
  return `The author's first language is ${l1}. Pay particular attention to: ${hints
    .map((h) => h.description)
    .join("; ")}.`;
}

export const ALL_L1_PROFILES: L1Profile[] = Object.keys(CATALOGUE) as L1Profile[];
