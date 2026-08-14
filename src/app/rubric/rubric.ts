/**
 * app/rubric — public entry point.
 *
 * Spec: docs/03-workflow/31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md.
 *
 * CONVENTION: rule compilation from Atlas (fromAtlas.ts) addresses document
 * sections by the same `key`/`id` Atlas uses in its SectionSpec — the
 * structural_presence evaluator looks up a CDM block by
 * `block.id === params.sectionKey`. A document built from an Atlas
 * structure proposal (docs 12 F-PRJ-2) is expected to assign block ids from
 * section keys for this reason; that assignment is not yet automated (no
 * client/editor exists yet — docs 13 §8.1) and is currently the caller's
 * responsibility when constructing a CanonicalDocument to evaluate.
 */

import type { CanonicalDocument } from "../../domain/document/model";
import type { ClaimEvidenceGraph } from "../../domain/claim/types";
import { evaluateRules } from "../../domain/compliance/evaluators";
import type { Finding, Rule, RuleSeverity } from "../../domain/compliance/types";
import type { OutputTypeSpec } from "../atlas/types";
import type { JournalRequirements } from "../../domain/journal/types";
import { compileRubricFromOutputType } from "./fromAtlas";

export {
  compileWordLimitRule,
  compileStructuralRules,
  compileRubricFromOutputType,
  compileSectionWordLimitGateRules,
  compileDeclarationsPresentGateRules,
  compileCitationStyleGateRules,
} from "./fromAtlas";
export type { Rule, Finding, RuleSeverity, RuleType, RuleScope, FindingStatus } from "../../domain/compliance/types";

export interface RubricReport {
  findings: Finding[];
  blockingFailures: Finding[];
  requiredFailures: Finding[];
  advisoryFindings: Finding[];
  /** True only when G6 could pass: zero unresolved blocking findings and zero unresolved required findings. */
  readyForG6: boolean;
}

export class RuleNotWaivableError extends Error {}

/**
 * Waive a rule with a reason, returning a new rule list (rules are
 * immutable data). Throws if the rule is `blocking` severity — blocking
 * rules are never waivable (docs 31-SUBMISSION-COMPLIANCE-ARCHITECTURE.md
 * §3 Rule Severity table). A reason is mandatory: docs §7 "Reason required.
 * Appears in the compliance report."
 */
export function waiveRule(rules: Rule[], ruleId: string, reason: string): Rule[] {
  if (!reason.trim()) {
    throw new Error(`A waiver reason is required to waive rule "${ruleId}".`);
  }
  const target = rules.find((r) => r.id === ruleId);
  if (!target) {
    throw new Error(`No rule "${ruleId}" to waive.`);
  }
  if (target.severity === "blocking") {
    throw new RuleNotWaivableError(
      `Rule "${ruleId}" is blocking severity and cannot be waived. Its violation prevents G6 by design.`
    );
  }
  return rules.map((r) => (r.id === ruleId ? { ...r, waived: { reason, at: new Date().toISOString() } } : r));
}

/**
 * Reapply previously-recorded waivers (by rule id) onto a freshly compiled
 * rule set. Needed because `compileRubricFromOutputType` always returns
 * unwaived rules — a caller re-evaluating after a document edit (or a
 * venue re-target, `26` Journey 3) would otherwise silently lose every
 * waiver on each recompile. Safe even if a waiver map somehow contains a
 * blocking rule's id (which `waiveRule` itself never produces): the
 * evaluator's `isEffectivelyWaived` still refuses to downgrade blocking
 * severity regardless of what `Rule.waived` is set to.
 */
export function applyWaivers(rules: Rule[], waivers: Record<string, { reason: string; at: string }>): Rule[] {
  return rules.map((r) => (waivers[r.id] ? { ...r, waived: waivers[r.id] } : r));
}

function bySeverity(findings: Finding[], severity: RuleSeverity, statuses: Finding["status"][]): Finding[] {
  return findings.filter((f) => f.severity === severity && statuses.includes(f.status));
}

/**
 * Compile rules from an Atlas output type spec and evaluate them against a
 * document in one call — the common case for a first compliance pass at G1.
 * `claimGraph` is optional and only consulted by `claim_support` rules
 * (e.g. OT-08's contribution-claims gate, OT-20's every-claim-sourced
 * gate); omitting it reports those as `not_applicable`, never a false pass.
 * `journalRequirements` is optional and only consulted by the venue-specific
 * gates `compileRubricFromOutputType` compiles when it's supplied (e.g.
 * OT-10's declarations_present and citation_style_exact).
 */
export function evaluateAgainstOutputType(
  spec: OutputTypeSpec,
  doc: CanonicalDocument,
  extraRules: Rule[] = [],
  claimGraph?: ClaimEvidenceGraph,
  journalRequirements?: JournalRequirements
): RubricReport {
  const rules = [...compileRubricFromOutputType(spec, journalRequirements), ...extraRules];
  return buildReport(rules, doc, claimGraph);
}

/** Evaluate an explicit rule set (e.g. after edits, waivers, or a venue re-target) and build the report. */
export function buildReport(rules: Rule[], doc: CanonicalDocument, claimGraph?: ClaimEvidenceGraph): RubricReport {
  const findings = evaluateRules(rules, doc, claimGraph);
  const blockingFailures = bySeverity(findings, "blocking", ["fail"]);
  const requiredFailures = bySeverity(findings, "required", ["fail"]);
  const advisoryFindings = findings.filter((f) => f.severity === "advisory");

  return {
    findings,
    blockingFailures,
    requiredFailures,
    advisoryFindings,
    readyForG6: blockingFailures.length === 0 && requiredFailures.length === 0,
  };
}
