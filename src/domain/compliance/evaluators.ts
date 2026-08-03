/**
 * Deterministic rule evaluators.
 *
 * Spec: docs/03-workflow/31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md §5.1:
 * "Roughly 80% of rules are deterministic, which is what makes continuous
 * evaluation feasible offline and within NFR-PERF-4's 300ms budget."
 * These two evaluators (word_count, structural_presence) are that 80% case
 * for the two rule types Atlas's specs can compile directly (§9 fromAtlas.ts).
 */

import type { CanonicalDocument } from "../document/model";
import { wordCount } from "../document/ops";
import type { Finding, Rule, WordCountParams, StructuralPresenceParams, MetadataPresenceParams } from "./types";
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
 * Evaluate a single rule against a document. Every rule type this function
 * doesn't yet implement returns "not_applicable" rather than throwing or
 * silently passing — docs 31 §6.1: "the report is a single screen: what
 * blocks, what is advisory, what to do," and a not-yet-implemented check
 * must never be reported as a pass (docs 31 §10, AG-22's QA: "never reports
 * a pass for a rule that did not run").
 */
export function evaluateRule(rule: Rule, doc: CanonicalDocument): Finding {
  switch (rule.evaluator.kind) {
    case "word_count":
      return evaluateWordCount(rule, rule.evaluator.params, doc);
    case "structural_presence":
      return evaluateStructuralPresence(rule, rule.evaluator.params, doc);
    case "metadata_presence":
      return evaluateMetadataPresence(rule, rule.evaluator.params, doc);
    default:
      return {
        ruleId: rule.id,
        status: "not_applicable",
        severity: rule.severity,
        message: "This rule type has no evaluator yet and was not run.",
      };
  }
}

export function evaluateRules(rules: Rule[], doc: CanonicalDocument): Finding[] {
  return rules.map((rule) => evaluateRule(rule, doc));
}
