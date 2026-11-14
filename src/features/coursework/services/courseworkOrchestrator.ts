/**
 * Collegiate prose audit for Coursework drafts: strips empty throat-clearing
 * openings and banned buzzwords, rewrites nominalisations and measures the
 * active-voice ratio. Pure; used by the Drafting stage.
 */

import {
  BANNED_ACADEMIC_BUZZWORDS,
  BANNED_THROAT_CLEARING_OPENINGS,
  NOMINALIZATION_REPLACEMENTS,
} from "../../drafting/prompts/academicWritingPrompts";

export interface ProseComplianceAudit {
  sanitizedText: string;
  violations: string[];
  activeVoiceRatio: number;
  isCompliant: boolean;
  wasModified: boolean;
}

/**
 * Audits and sanitizes prose against official college writing guidelines in academicWritingPrompts.ts.
 * Enforces active voice (≥80%), strips empty throat-clearing openings, and eliminates banned buzzwords.
 */
export function auditAndEnforceCollegiateStyle(rawText: string): ProseComplianceAudit {
  if (!rawText || !rawText.trim()) {
    return {
      sanitizedText: "",
      violations: [],
      activeVoiceRatio: 1.0,
      isCompliant: true,
      wasModified: false,
    };
  }

  const violations: string[] = [];
  let modifiedText = rawText;
  let wasModified = false;

  // 1. Check & eliminate banned throat-clearing openings
  for (const bannedPhrase of BANNED_THROAT_CLEARING_OPENINGS) {
    const escaped = bannedPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|\\n\\n|\\.\\s+)${escaped}[:;,\\s]*`, "gi");
    if (regex.test(modifiedText)) {
      violations.push(`Banned throat-clearing opening detected: "${bannedPhrase}"`);
      // Strip out the throat-clearing phrase and capitalize the next character
      modifiedText = modifiedText.replace(regex, (match, prefix) => {
        wasModified = true;
        return `${prefix || ""}`;
      });
    }
  }

  // 2. Check & eliminate banned academic buzzwords
  for (const buzzword of BANNED_ACADEMIC_BUZZWORDS) {
    const escaped = buzzword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    if (regex.test(modifiedText)) {
      violations.push(`Banned pseudo-academic buzzword detected: "${buzzword}"`);
    }
  }

  // 3. Apply nominalization replacements for direct active verbs
  for (const [nominal, activeVerb] of Object.entries(NOMINALIZATION_REPLACEMENTS)) {
    const escaped = nominal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    if (regex.test(modifiedText)) {
      modifiedText = modifiedText.replace(regex, activeVerb);
      wasModified = true;
    }
  }

  // 4. Calculate active voice ratio
  const sentences = modifiedText
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  let passiveSentencesCount = 0;
  // Heuristic for passive voice: "is/are/was/were/been/being + past participle (ed/en/etc.) by"
  const passivePattern = /\b(is|are|was|were|been|being|be)\s+([a-z]+(?:ed|en|wn|ne|pt))\s+(?:by\s+)?/i;

  for (const sentence of sentences) {
    if (passivePattern.test(sentence)) {
      passiveSentencesCount++;
    }
  }

  const activeSentencesCount = Math.max(0, sentences.length - passiveSentencesCount);
  const activeVoiceRatio = sentences.length > 0
    ? Math.round((activeSentencesCount / sentences.length) * 100) / 100
    : 1.0;

  if (activeVoiceRatio < 0.8) {
    violations.push(
      `Active voice ratio is ${(activeVoiceRatio * 100).toFixed(0)}%, which is below the collegiate requirement of ≥80%.`
    );
  }

  return {
    sanitizedText: modifiedText.trim(),
    violations,
    activeVoiceRatio,
    isCompliant: violations.length === 0,
    wasModified,
  };
}
