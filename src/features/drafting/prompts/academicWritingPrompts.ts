/**
 * Collegiate writing word lists (used by the Coursework prose audit)
 * -----------------------------------------------------------
 * Grounded in official college writing guide principles:
 * - Clear diction over artificial thesaurus inflation
 * - Active voice (≥80%) and strong analytical verbs
 * - Elimination of empty throat-clearing openings and filler
 * - Objective, third-person evidence grounding
 * - Zero pseudo-intellectual buzzwords or robotic academic soup
 */

/**
 * Phrases strictly banned across all academic writing prompts and outputs.
 */
export const BANNED_ACADEMIC_BUZZWORDS: readonly string[] = [
  "primary phenomenon",
  "Primary Phenomenon",
  "procedural objectivity",
  "computational expediency",
  "privileges computational",
  "methodological contestation",
  "Methodological Contestation",
  "comparative institutional analysis",
  "Comparative Institutional Analysis",
  "Pasquale, 2023",
  "Kearns & Roth, 2022",
];

/**
 * Empty throat-clearing phrases that must never start or occupy academic paragraphs.
 */
export const BANNED_THROAT_CLEARING_OPENINGS: readonly string[] = [
  "A critical point of departure for evaluating this dimension lies in how",
  "It is important to consider the fact that",
  "In today's modern world and society",
  "In today's society",
  "Throughout history, humans have always",
  "It is widely known that",
  "Needless to say",
  "It goes without saying that",
  "In order to properly understand",
  "At the end of the day",
];

/**
 * Common weak nominalizations mapped to direct active verbs.
 */
export const NOMINALIZATION_REPLACEMENTS: Record<string, string> = {
  "conducts an examination of": "examines",
  "conduct an examination of": "examine",
  "conducts an analysis of": "analyzes",
  "conduct an analysis of": "analyze",
  "serves as an illustration of": "illustrates",
  "serve as an illustration of": "illustrate",
  "is in agreement with": "agrees with",
  "are in agreement with": "agree with",
  "makes an assessment of": "assesses",
  "make an assessment of": "assess",
  "provides a demonstration of": "demonstrates",
  "provide a demonstration of": "demonstrate",
  "leads to the destruction of": "destroys",
  "lead to the destruction of": "destroy",
  "has a tendency to": "tends to",
  "have a tendency to": "tend to",
};

/**
 * Subject-grounded few-shot exemplars illustrating the contrast between
 * pseudo-academic soup and college-standard clear analytical writing.
 */
