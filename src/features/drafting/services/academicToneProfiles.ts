/**
 * Academic Tone Profiles Service
 * ------------------------------
 * Manages the 5 distinct collegiate writing tone profiles:
 * 1. Formal Academic
 * 2. Analytical (Default)
 * 3. Critical
 * 4. Persuasive
 * 5. Conversational Academic
 *
 * Each profile defines specific pedagogical focus, voice, syntactic structure,
 * system prompt directives, and stylistic constraints.
 */

import type { AcademicTone, AcademicToneProfile } from "../types/drafting";
import {
  BANNED_ACADEMIC_BUZZWORDS,
  BANNED_THROAT_CLEARING_OPENINGS,
} from "../prompts/academicWritingPrompts";

export const ACADEMIC_TONE_PROFILES: Record<AcademicTone, AcademicToneProfile> = {
  formal_academic: {
    id: "formal_academic",
    name: "Formal Academic",
    tagline: "Rigorous scholarship, precise terminology, balanced syntax, and PEEL adherence",
    focus:
      "Rigorous scholarship, precise disciplinary terminology, balanced complex-compound syntax, strict adherence to PEEL (Point, Evidence, Explanation, Link).",
    voice: "Impersonal, authoritative third-person analytical stance.",
    sentenceStructureGuidance:
      "Balanced complex-compound syntax with clear thematic topic sentences. Avoid colloquialisms, fragments, or conversational tangents.",
    vocabularyRegister:
      "Formal academic vocabulary without artificial thesaurus padding. Disciplinary terms must be applied accurately.",
    systemInstruction:
      "Write in a formal, scholarly collegiate register. Ground every paragraph in the PEEL structure (Point, Evidence, Explanation, Link). Maintain an impersonal, authoritative third-person voice. Forbid second-person pronouns entirely. Emphasize theoretical rigor and cited peer-reviewed evidence.",
    stylisticConstraints: [
      "Strict third-person voice (no 'I', 'we', 'you', 'your')",
      "PEEL paragraph architecture (Point, Evidence, Explanation, Link)",
      "Hedging language on non-definitive claims (indicates, suggests, correlates)",
      "Sentence variety: balance compound and complex structures",
    ],
    bannedPatterns: [
      ...BANNED_ACADEMIC_BUZZWORDS,
      ...BANNED_THROAT_CLEARING_OPENINGS,
      "I think",
      "In my opinion",
      "you can see",
    ],
    targetPassiveVoiceMaxRatio: 0.2,
    targetFleschKincaidMin: 12,
    targetFleschKincaidMax: 14.5,
  },

  analytical: {
    id: "analytical",
    name: "Analytical",
    tagline: "Cause-and-effect reasoning, trade-offs, and empirical testing of models",
    focus:
      "Deconstructing cause-and-effect mechanisms, evaluating data and trade-offs, comparing theoretical models against real-world practices (e.g., testing Schein's model against Zappos' policies).",
    voice: "Objective, deductive, and logically sequenced.",
    sentenceStructureGuidance:
      "Clear cause-and-effect transitions (Consequently, Therefore, As a result, This indicates). Main clauses precede subordinate qualifications.",
    vocabularyRegister:
      "Precise analytical terms (screening mechanism, person-organization fit, adverse selection, operational alignment).",
    systemInstruction:
      "Write in a clear, deductive analytical tone. Deconstruct the underlying mechanisms and trade-offs of the topic. Test theoretical frameworks against empirical case realities. Emphasize active voice, logical progression, and substantive explanations rather than descriptive summaries.",
    stylisticConstraints: [
      "Objective deductive reasoning",
      "Explicit examination of mechanisms and trade-offs",
      "Active voice in at least 80% of sentences",
      "Immediate entry into claim in sentence 1",
    ],
    bannedPatterns: [
      ...BANNED_ACADEMIC_BUZZWORDS,
      ...BANNED_THROAT_CLEARING_OPENINGS,
      "you",
      "your",
      "huge impact",
      "amazing",
    ],
    targetPassiveVoiceMaxRatio: 0.2,
    targetFleschKincaidMin: 11,
    targetFleschKincaidMax: 14,
  },

  critical: {
    id: "critical",
    name: "Critical",
    tagline: "Interrogates assumptions, uncovers policy vs practice gaps, and probes limits",
    focus:
      "Interrogating underlying assumptions, exposing discrepancies between stated policies and actual behaviors, highlighting operational limitations and alternative viewpoints.",
    voice: "Evaluative, questioning, and probing.",
    sentenceStructureGuidance:
      "Contrastive sentence structures (While... in practice; Although stated... empirical observations reveal). Probing inquiry style.",
    vocabularyRegister:
      "Critical evaluative vocabulary (boundary condition, divergence, superficial compliance, cognitive dissonance, unexamined premises).",
    systemInstruction:
      "Write from an interrogative, critical analytical perspective. Do not accept surface claims at face value. Scrutinize the gap between espoused rhetoric and actual implementation. Evaluate counter-arguments, systemic trade-offs, and ethical or institutional blind spots.",
    stylisticConstraints: [
      "Interrogation of taken-for-granted assumptions",
      "Scrutiny of policy vs. practice discrepancies",
      "Exploration of boundary conditions and institutional risks",
      "Even-handed critique grounded in evidence rather than cynicism",
    ],
    bannedPatterns: [
      ...BANNED_ACADEMIC_BUZZWORDS,
      ...BANNED_THROAT_CLEARING_OPENINGS,
      "proves undeniably",
      "without question",
      "perfect solution",
    ],
    targetPassiveVoiceMaxRatio: 0.2,
    targetFleschKincaidMin: 11.5,
    targetFleschKincaidMax: 14,
  },

  persuasive: {
    id: "persuasive",
    name: "Persuasive",
    tagline: "Thesis-driven, escalating ladder of evidence, and decisive refutation",
    focus:
      "Advancing a distinct thesis statement, building an escalating ladder of evidence, systematically addressing and dismantling counterarguments.",
    voice: "Direct, assertive, and rhetorically cohesive.",
    sentenceStructureGuidance:
      "Strong assertional thesis statements, followed by cumulative evidentiary support and clear transitional signposting.",
    vocabularyRegister:
      "Assertive analytical language (demonstrates decisively, necessitates, compelling evidence, decisive advantage).",
    systemInstruction:
      "Write with persuasive academic clarity. Advance a decisive thesis in the opening sentence. Build a cumulative ladder of evidence supporting the proposition. Explicitly articulate the strongest counter-argument and systematically dismantle it with verifiable evidence.",
    stylisticConstraints: [
      "Clear, assertive thesis statement in opening sentence",
      "Escalating ladder of empirical proof",
      "Explicit address and refutation of counterarguments",
      "Rhetorical coherence linking all paragraphs back to the central thesis",
    ],
    bannedPatterns: [
      ...BANNED_ACADEMIC_BUZZWORDS,
      ...BANNED_THROAT_CLEARING_OPENINGS,
      "unbelievable",
      "undoubtedly true",
      "everyone knows",
    ],
    targetPassiveVoiceMaxRatio: 0.15,
    targetFleschKincaidMin: 11,
    targetFleschKincaidMax: 13.5,
  },

  conversational_academic: {
    id: "conversational_academic",
    name: "Conversational Academic",
    tagline: "Accessible scholarly journalism (HBR / The Conversation style)",
    focus:
      "Accessible scholarly journalism (modeled after Harvard Business Review or The Conversation); retains analytical rigor and literature citations while using shorter sentences, engaging analogies, and active phrasing.",
    voice: "Intellectual yet readable, engaging, and direct.",
    sentenceStructureGuidance:
      "Brisk, varied sentence lengths with lively cadence. Uses clear metaphors and concrete examples to explain complex academic concepts.",
    vocabularyRegister:
      "Clear, approachable collegiate English. Translates technical jargon into vivid, precise operational explanations.",
    systemInstruction:
      "Write in the style of high-quality scholarly journalism (such as Harvard Business Review or The Conversation). Maintain intellectual depth, theoretical accuracy, and scholarly citations, but communicate with maximum clarity. Use active verbs, engaging openings, and real-world illustrations. Avoid dry passive sludge.",
    stylisticConstraints: [
      "Maximum sentence length typically under 25 words",
      "Engaging, real-world opening hooks",
      "Active voice in at least 85% of sentences",
      "Scholarly citations retained but smoothly woven into prose",
    ],
    bannedPatterns: [
      ...BANNED_ACADEMIC_BUZZWORDS,
      ...BANNED_THROAT_CLEARING_OPENINGS,
      "utilize",
      "in order to",
      "slang",
      "gonna",
    ],
    targetPassiveVoiceMaxRatio: 0.15,
    targetFleschKincaidMin: 10,
    targetFleschKincaidMax: 13,
  },
};

/**
 * Normalizes any incoming tone identifier into one of the 5 supported AcademicTones.
 */
export function normalizeAcademicTone(tone?: string | null): AcademicTone {
  if (!tone) return "analytical";
  const clean = tone.toLowerCase().trim().replace(/[-\s]/g, "_");

  if (clean === "formal_academic" || clean === "formal" || clean === "academic") {
    return "formal_academic";
  }
  if (clean === "critical" || clean === "critical_evaluative" || clean === "critique") {
    return "critical";
  }
  if (
    clean === "persuasive" ||
    clean === "argumentative" ||
    clean === "persuade" ||
    clean === "persuasion"
  ) {
    return "persuasive";
  }
  if (
    clean === "conversational_academic" ||
    clean === "conversational" ||
    clean === "natural" ||
    clean === "expository" ||
    clean === "applied_reflective"
  ) {
    return "conversational_academic";
  }
  return "analytical";
}

/**
 * Retrieves the complete tone profile for a given tone string.
 */
export function getAcademicToneProfile(tone?: string | null): AcademicToneProfile {
  const normalized = normalizeAcademicTone(tone);
  return ACADEMIC_TONE_PROFILES[normalized];
}

/**
 * Checks whether a given string is a valid AcademicTone key.
 */
export function isValidAcademicTone(tone: string): tone is AcademicTone {
  return tone in ACADEMIC_TONE_PROFILES;
}

/**
 * Returns all 5 tone profiles in order.
 */
export function getAllToneProfiles(): AcademicToneProfile[] {
  return Object.values(ACADEMIC_TONE_PROFILES);
}

/**
 * Compiles specific prompt instructions for the selected tone.
 */
export function compileTonePromptDirectives(tone?: string | null): string {
  const profile = getAcademicToneProfile(tone);
  return `
TONE: ${profile.name}
FOCUS: ${profile.focus}
VOICE: ${profile.voice}
SENTENCE STRUCTURE: ${profile.sentenceStructureGuidance}
SYSTEM INSTRUCTION: ${profile.systemInstruction}
CONSTRAINTS:
${profile.stylisticConstraints.map((c) => `- ${c}`).join("\n")}
`.trim();
}
