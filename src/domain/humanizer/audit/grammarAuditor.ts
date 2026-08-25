/**
 * Grammar & Structural Mechanics Auditor.
 *
 * Catches sentence fragments, accidental concatenation, missing punctuation,
 * run-on sentences, subject-verb disagreement, and malformed boundaries.
 */

import {
  HumanizerDocument,
  HumanizerAuditFinding,
  AuditDecision,
  AuditSeverity,
} from "../types";
import { renderHumanizerDocument } from "../document/humanizerDocument";

export interface GrammarAuditResult {
  passed: boolean;
  decision: AuditDecision;
  errorsCount: number;
  issues: string[];
  findings: HumanizerAuditFinding[];
}

/** Layer 1: Detect run-on sentences (lowercase followed by uppercase without punctuation) */
function detectMissingSentencePunctuation(text: string): { match: string; index: number }[] {
  const issues: { match: string; index: number }[] = [];
  // Pattern: word ending with lowercase, space, then Capitalized non-proper common noun/pronoun without punctuation
  // E.g. "ghee Cow dung", "world It has", "farming People keep"
  const runOnRegex = /\b([a-z]{3,})\s+([A-Z][a-z]{2,})\b/g;
  let m: RegExpExecArray | null;

  const ALLOWED_CAPITALIZED_AFTER_LOWERCASE = new Set([
    "January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday", "Sunday", "English", "French", "German",
    "Spanish", "Latin", "Greek", "Hindu", "Buddhist", "Christian", "Muslim",
    "Nepal", "India", "China", "America", "Asia", "Europe", "Africa", "Wilson",
    "Smith", "Adams", "Miller", "Tihar", "Gai", "Rajadharma", "Vedic", "IEEE", "APA"
  ]);

  while ((m = runOnRegex.exec(text)) !== null) {
    const secondWord = m[2];
    if (!ALLOWED_CAPITALIZED_AFTER_LOWERCASE.has(secondWord)) {
      // Check if it's a common pronoun or noun starting a new sentence without punctuation
      const sentenceStarters = ["It", "They", "We", "This", "These", "That", "Those", "Cow", "Cows", "People", "The", "In", "On", "However", "Ultimately", "Empirical", "Studies"];
      if (sentenceStarters.includes(secondWord)) {
        issues.push({ match: m[0], index: m.index });
      }
    }
  }
  return issues;
}

/** Layer 2: Detect obvious Determiner-Noun / Subject-Verb agreement errors */
function detectAgreementErrors(text: string): { match: string; reason: string }[] {
  const issues: { match: string; reason: string }[] = [];

  // "This vitamins", "This factors", "This results" (singular 'this' + plural noun)
  const thisPluralRegex = /\b(?:this)\s+(?:vitamins|factors|results|studies|animals|cows|products|nutrients|methods|findings|patients)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = thisPluralRegex.exec(text)) !== null) {
    issues.push({
      match: m[0],
      reason: `Determiner agreement mismatch: '${m[0]}' (singular 'this' with plural noun).`,
    });
  }

  // "These animal", "These factor" (plural 'these' + singular noun)
  const theseSingularRegex = /\b(?:these)\s+(?:animal|factor|result|study|cow|product|nutrient|method|finding|patient)\b/gi;
  while ((m = theseSingularRegex.exec(text)) !== null) {
    issues.push({
      match: m[0],
      reason: `Determiner agreement mismatch: '${m[0]}' (plural 'these' with singular noun).`,
    });
  }

  // Subject-verb mismatch: "cows is", "animals has"
  const pluralIsRegex = /\b(?:cows|animals|studies|findings|results|farmers)\s+(?:is|was)\b/gi;
  while ((m = pluralIsRegex.exec(text)) !== null) {
    issues.push({
      match: m[0],
      reason: `Subject-verb agreement error: '${m[0]}' (plural subject with singular verb).`,
    });
  }

  return issues;
}

/** Layer 3: Detect repeated adjacent words ("the the", "and and") */
function detectRepeatedWords(text: string): string[] {
  const issues: string[] = [];
  const repeatedRegex = /\b([a-zA-Z]{2,})\s+\1\b/gi;
  let m: RegExpExecArray | null;
  while ((m = repeatedRegex.exec(text)) !== null) {
    issues.push(m[0]);
  }
  return issues;
}

/** Layer 4: Detect double punctuation or malformed sentence boundaries */
function detectMalformedPunctuation(text: string): string[] {
  const issues: string[] = [];
  const doublePunctRegex = /(?:[.,;]\s*[.,;]|[\?!]\s*[\?!]|,\s*\.)/g;
  let m: RegExpExecArray | null;
  while ((m = doublePunctRegex.exec(text)) !== null) {
    issues.push(m[0]);
  }
  return issues;
}

/** Layer 5: Detect broken sentence fragments starting with conjunctions without main clause */
function detectBrokenFragments(text: string): string[] {
  const issues: string[] = [];
  // E.g. ". And is used to make..." or ". This vitamins and is used..."
  const fragmentRegex = /(?:\.|\?|\!)\s+(?:and\s+is\s+|and\s+are\s+|which\s+is\s+|which\s+are\s+)/gi;
  let m: RegExpExecArray | null;
  while ((m = fragmentRegex.exec(text)) !== null) {
    issues.push(m[0]);
  }
  return issues;
}

/**
 * Audits grammar and mechanical integrity across a HumanizerDocument.
 */
export function auditGrammar(
  candidate: HumanizerDocument | string
): GrammarAuditResult {
  const candidateText =
    typeof candidate === "string"
      ? candidate
      : renderHumanizerDocument(candidate, "processed");

  const findings: HumanizerAuditFinding[] = [];
  const issues: string[] = [];

  // 1. Run-on / missing sentence boundary
  const runOns = detectMissingSentencePunctuation(candidateText);
  for (const ro of runOns) {
    const msg = `Missing sentence boundary or run-on concatenation detected at '${ro.match}'.`;
    issues.push(msg);
    findings.push({
      auditor: "grammar_auditor",
      category: "sentence_boundary",
      severity: "CRITICAL",
      decision: "REJECT",
      code: "GRAMMAR_RUN_ON_BOUNDARY",
      message: msg,
      candidateValue: ro.match,
    });
  }

  // 2. Agreement Errors
  const agreementErrors = detectAgreementErrors(candidateText);
  for (const ag of agreementErrors) {
    issues.push(ag.reason);
    findings.push({
      auditor: "grammar_auditor",
      category: "agreement",
      severity: "CRITICAL",
      decision: "REJECT",
      code: "GRAMMAR_AGREEMENT_ERROR",
      message: ag.reason,
      candidateValue: ag.match,
    });
  }

  // 3. Broken fragments
  const fragments = detectBrokenFragments(candidateText);
  for (const frag of fragments) {
    const msg = `Broken sentence fragment / predicate detected: '${frag}'.`;
    issues.push(msg);
    findings.push({
      auditor: "grammar_auditor",
      category: "fragment",
      severity: "CRITICAL",
      decision: "REJECT",
      code: "GRAMMAR_FRAGMENT_ERROR",
      message: msg,
      candidateValue: frag,
    });
  }

  // 4. Repeated Words
  const repeatedWords = detectRepeatedWords(candidateText);
  for (const rw of repeatedWords) {
    const msg = `Repeated adjacent word detected: '${rw}'.`;
    issues.push(msg);
    findings.push({
      auditor: "grammar_auditor",
      category: "mechanics",
      severity: "WARNING",
      decision: "WARNING",
      code: "GRAMMAR_REPEATED_WORD",
      message: msg,
      candidateValue: rw,
    });
  }

  // 5. Malformed Punctuation
  const badPunct = detectMalformedPunctuation(candidateText);
  for (const bp of badPunct) {
    const msg = `Malformed or duplicated punctuation detected: '${bp}'.`;
    issues.push(msg);
    findings.push({
      auditor: "grammar_auditor",
      category: "mechanics",
      severity: "WARNING",
      decision: "WARNING",
      code: "GRAMMAR_PUNCTUATION_ERROR",
      message: msg,
      candidateValue: bp,
    });
  }

  const hasCritical = findings.some((f) => f.severity === "CRITICAL" && f.decision === "REJECT");
  const hasWarning = findings.some((f) => f.decision === "WARNING");

  const decision: AuditDecision = hasCritical ? "REJECT" : hasWarning ? "WARNING" : "SAFE";

  return {
    passed: !hasCritical,
    decision,
    errorsCount: findings.length,
    issues,
    findings,
  };
}
