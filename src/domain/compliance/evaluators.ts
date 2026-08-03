/**
 * Deterministic rule evaluators.
 *
 * Spec: docs/03-workflow/31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md §5.1:
 * "Roughly 80% of rules are deterministic, which is what makes continuous
 * evaluation feasible offline and within NFR-PERF-4's 300ms budget."
 * word_count, structural_presence, metadata_presence, claim_support, and
 * readability are that 80% case for the rule types app/rubric/fromAtlas.ts
 * can compile directly from an Atlas spec.
 */

import type { CanonicalDocument } from "../document/model";
import { wordCount } from "../document/ops";
import type { ClaimEvidenceGraph } from "../claim/types";
import { unsupportedClaims } from "../claim/graph";
import { analyzeReadability } from "../language/readability";
import type { Finding, Rule, WordCountParams, StructuralPresenceParams, MetadataPresenceParams, ClaimSupportParams, ReadabilityParams } from "./types";
import { isEffectivelyWaived } from "./types";

function excludingSections(doc: CanonicalDocument, exclude: string[]): CanonicalDocument {
  if (exclude.length === 0) return doc;
  return { ...doc, blocks: doc.blocks.filter((b) => !exclude.includes(b.id)) };
}

function evaluateWordCount(rule: Rule, params: WordCountParams, doc: CanonicalDocument): Finding {
  const scoped = excludingSections(doc, params.exclude ?? []);
  const actual = wordCount(scoped);

  const overMax = params.max !== undefined && actual > params.max;
  const underMin = params.min !== undefined && actual < params.min;

  if (!overMax && !underMin) {
    return {
      ruleId: rule.id,
      status: "pass",
      severity: rule.severity,
      actual: String(actual),
      message: `Word count (${actual}) is within limits.`,
    };
  }

  const expected =
    params.max !== undefined && params.min !== undefined
      ? `${params.min}–${params.max}`
      : params.max !== undefined
        ? `≤ ${params.max}`
        : `≥ ${params.min}`;

  const overage = overMax ? actual - (params.max as number) : 0;
  const shortfall = underMin ? (params.min as number) - actual : 0;

  return {
    ruleId: rule.id,
    status: isEffectivelyWaived(rule) ? "warn" : "fail",
    severity: rule.severity,
    actual: String(actual),
    expected,
    message: overMax
      ? `Exceeds the word limit by ${overage} words (currently ${actual}, limit ${params.max}).`
      : `Below the minimum word count by ${shortfall} words (currently ${actual}, minimum ${params.min}).`,
    remedy: overMax ? `Reduce by approximately ${overage} words.` : `Add approximately ${shortfall} words.`,
  };
}

function evaluateStructuralPresence(rule: Rule, params: StructuralPresenceParams, doc: CanonicalDocument): Finding {
  const block = doc.blocks.find((b) => b.id === params.sectionKey);

  if (!block) {
    return {
      ruleId: rule.id,
      status: isEffectivelyWaived(rule) ? "warn" : "fail",
      severity: rule.severity,
      location: { sectionKey: params.sectionKey },
      message: `Required section "${params.sectionKey}" is missing.`,
      remedy: `Add the "${params.sectionKey}" section.`,
    };
  }

  const words = block.text.trim().split(/\s+/).filter(Boolean).length;
  const minWords = params.minWords ?? 1;

  if (block.text.trim().length === 0 || words < minWords) {
    return {
      ruleId: rule.id,
      status: isEffectivelyWaived(rule) ? "warn" : "fail",
      severity: rule.severity,
      location: { sectionKey: params.sectionKey },
      actual: String(words),
      expected: `≥ ${minWords} words`,
      message: `Section "${params.sectionKey}" is present but empty or too short.`,
      remedy: `Write at least ${minWords} words in "${params.sectionKey}".`,
    };
  }

  return {
    ruleId: rule.id,
    status: "pass",
    severity: rule.severity,
    location: { sectionKey: params.sectionKey },
    message: `Section "${params.sectionKey}" is present.`,
  };
}

function evaluateMetadataPresence(rule: Rule, params: MetadataPresenceParams, doc: CanonicalDocument): Finding {
  const value = doc.metadata?.[params.key];
  const minLength = params.minLength ?? 1;

  if (value === undefined || value.trim().length < minLength) {
    return {
      ruleId: rule.id,
      status: isEffectivelyWaived(rule) ? "warn" : "fail",
      severity: rule.severity,
      message: value === undefined ? `Required declaration "${params.key}" is missing.` : `Declaration "${params.key}" is present but too short.`,
      remedy: `Provide "${params.key}".`,
    };
  }

  return {
    ruleId: rule.id,
    status: "pass",
    severity: rule.severity,
    message: `Declaration "${params.key}" is present.`,
  };
}

/**
 * Checks a `ClaimEvidenceGraph`, not the document — `claimGraph` is
 * undefined for any caller that doesn't have one to offer (every existing
 * caller before this evaluator kind existed), which correctly reports
 * `not_applicable` rather than a false pass, same discipline as an
 * unimplemented evaluator kind.
 */
function evaluateClaimSupport(rule: Rule, _params: ClaimSupportParams, claimGraph: ClaimEvidenceGraph | undefined): Finding {
  if (!claimGraph) {
    return {
      ruleId: rule.id,
      status: "not_applicable",
      severity: rule.severity,
      message: "No claim graph was supplied for this evaluation.",
    };
  }

  const unsupported = unsupportedClaims(claimGraph);
  if (unsupported.length > 0) {
    return {
      ruleId: rule.id,
      status: isEffectivelyWaived(rule) ? "warn" : "fail",
      severity: rule.severity,
      actual: String(unsupported.length),
      expected: "0",
      message: `${unsupported.length} claim(s) have no supporting evidence: ${unsupported.map((c) => c.id).join(", ")}.`,
      remedy: "Bind evidence to every claim, or remove claims that can't be supported.",
    };
  }

  return {
    ruleId: rule.id,
    status: "pass",
    severity: rule.severity,
    message: "Every claim is supported by at least one evidence binding.",
  };
}

/**
 * Checks Flesch-Kincaid grade level against `params.maxGradeLevel`.
 * `not_applicable` for missing/empty text (a section that doesn't exist yet
 * has no reading level to assess — `structural_presence` is what reports a
 * missing required section as a failure, this evaluator doesn't duplicate
 * that job).
 */
function evaluateReadability(rule: Rule, params: ReadabilityParams, doc: CanonicalDocument): Finding {
  const text = params.sectionKey
    ? (doc.blocks.find((b) => b.id === params.sectionKey)?.text ?? "")
    : doc.blocks.map((b) => b.text).join("\n\n");

  if (text.trim().length === 0) {
    return {
      ruleId: rule.id,
      status: "not_applicable",
      severity: rule.severity,
      message: params.sectionKey
        ? `Section "${params.sectionKey}" is missing or empty — nothing to assess for readability.`
        : "The document has no text yet — nothing to assess for readability.",
    };
  }

  const { metrics } = analyzeReadability(text);
  const withinThreshold = metrics.fleschKincaidGradeLevel <= params.maxGradeLevel;

  return {
    ruleId: rule.id,
    status: withinThreshold ? "pass" : isEffectivelyWaived(rule) ? "warn" : "fail",
    severity: rule.severity,
    location: params.sectionKey ? { sectionKey: params.sectionKey } : undefined,
    actual: `grade ${metrics.fleschKincaidGradeLevel}`,
    expected: `≤ grade ${params.maxGradeLevel}`,
    message: withinThreshold
      ? `Reading level (grade ${metrics.fleschKincaidGradeLevel}) is at or below the target of grade ${params.maxGradeLevel}.`
      : `Reading level (grade ${metrics.fleschKincaidGradeLevel}) exceeds the target of grade ${params.maxGradeLevel}.`,
    remedy: withinThreshold ? undefined : "Shorten sentences and prefer shorter, more common words to lower the reading level.",
  };
}

/**
 * Evaluate a single rule against a document. Every rule type this function
 * doesn't yet implement returns "not_applicable" rather than throwing or
 * silently passing — docs 31 §6.1: "the report is a single screen: what
 * blocks, what is advisory, what to do," and a not-yet-implemented check
 * must never be reported as a pass (docs 31 §10, AG-22's QA: "never reports
 * a pass for a rule that did not run"). `claimGraph` is optional and only
 * consulted by `claim_support` rules — every other evaluator kind ignores
 * it, so existing callers that only ever evaluated against a document are
 * unaffected by its addition.
 */
export function evaluateRule(rule: Rule, doc: CanonicalDocument, claimGraph?: ClaimEvidenceGraph): Finding {
  switch (rule.evaluator.kind) {
    case "word_count":
      return evaluateWordCount(rule, rule.evaluator.params, doc);
    case "structural_presence":
      return evaluateStructuralPresence(rule, rule.evaluator.params, doc);
    case "metadata_presence":
      return evaluateMetadataPresence(rule, rule.evaluator.params, doc);
    case "claim_support":
      return evaluateClaimSupport(rule, rule.evaluator.params, claimGraph);
    case "readability":
      return evaluateReadability(rule, rule.evaluator.params, doc);
    default:
      return {
        ruleId: rule.id,
        status: "not_applicable",
        severity: rule.severity,
        message: "This rule type has no evaluator yet and was not run.",
      };
  }
}

export function evaluateRules(rules: Rule[], doc: CanonicalDocument, claimGraph?: ClaimEvidenceGraph): Finding[] {
  return rules.map((rule) => evaluateRule(rule, doc, claimGraph));
}
