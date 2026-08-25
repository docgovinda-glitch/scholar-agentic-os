/**
 * Deterministic Integrity Auditor.
 *
 * Enforces strict, zero-tolerance preservation of protected tokens
 * (citations, mathematics, numbers, DOIs, locked terms) and verifies
 * exact byte-for-byte restoration.
 */

import { TokenRegistry } from "../protection/tokenRegistry";
import { HumanizerAuditFinding, HumanizerDocument } from "../types";
import { renderHumanizerDocument } from "../document/humanizerDocument";

export interface IntegrityAuditResult {
  passed: boolean;
  decision: "SAFE" | "REJECT";
  findings: HumanizerAuditFinding[];
  missingTokens: string[];
  duplicatedTokens: string[];
  unexpectedTokens: string[];
  malformedTokens: string[];
  exactRestoration: boolean;
}

/**
 * Audits a candidate document or text against the TokenRegistry.
 */
export function auditIntegrity(
  candidate: HumanizerDocument | string,
  registry: TokenRegistry
): IntegrityAuditResult {
  const candidateText =
    typeof candidate === "string"
      ? candidate
      : renderHumanizerDocument(candidate, "processed");

  const findings: HumanizerAuditFinding[] = [];
  const occResult = registry.validateOccurrences(candidateText);

  // 1. Missing Tokens (Critical Reject)
  for (const token of occResult.missing) {
    const el = registry.get(token);
    findings.push({
      auditor: "integrity_auditor",
      category: "token_integrity",
      severity: "CRITICAL",
      decision: "REJECT",
      code: "INTEGRITY_TOKEN_MISSING",
      message: `Protected token '${token}' (${el?.type || "unknown"}) was omitted in the candidate rewrite.`,
      token,
      originalValue: el?.originalValue,
      blockId: el?.blockId,
      sentenceId: el?.sentenceId,
    });
  }

  // 2. Duplicated Tokens (Critical Reject)
  for (const token of occResult.duplicated) {
    const el = registry.get(token);
    findings.push({
      auditor: "integrity_auditor",
      category: "token_integrity",
      severity: "CRITICAL",
      decision: "REJECT",
      code: "INTEGRITY_TOKEN_DUPLICATED",
      message: `Protected token '${token}' (${el?.type || "unknown"}) appears multiple times in the candidate rewrite.`,
      token,
      originalValue: el?.originalValue,
      blockId: el?.blockId,
    });
  }

  // 3. Unexpected Tokens (Critical Reject)
  for (const token of occResult.unexpected) {
    findings.push({
      auditor: "integrity_auditor",
      category: "token_integrity",
      severity: "CRITICAL",
      decision: "REJECT",
      code: "INTEGRITY_TOKEN_UNEXPECTED",
      message: `Unexpected or unauthorized token '${token}' was introduced in the candidate rewrite.`,
      token,
    });
  }

  // 4. Malformed Tokens (Critical Reject)
  const malformedList: string[] = [];
  for (const err of occResult.errors) {
    if (err.includes("Malformed")) {
      malformedList.push(err);
      findings.push({
        auditor: "integrity_auditor",
        category: "token_integrity",
        severity: "CRITICAL",
        decision: "REJECT",
        code: "INTEGRITY_TOKEN_MALFORMED",
        message: err,
      });
    }
  }

  // 5. Test Restoration
  let exactRestoration = false;
  try {
    const restoredText = registry.restore(candidateText);
    exactRestoration = !restoredText.includes("⟦PROTECTED_");
    if (!exactRestoration) {
      findings.push({
        auditor: "integrity_auditor",
        category: "token_integrity",
        severity: "CRITICAL",
        decision: "REJECT",
        code: "INTEGRITY_RESTORATION_INCOMPLETE",
        message: "Protected token restoration failed to resolve all placeholders.",
      });
    }
  } catch (err: any) {
    findings.push({
      auditor: "integrity_auditor",
      category: "token_integrity",
      severity: "CRITICAL",
      decision: "REJECT",
      code: "INTEGRITY_RESTORATION_ERROR",
      message: `Token restoration error: ${err.message}`,
    });
  }

  const passed = findings.length === 0;

  return {
    passed,
    decision: passed ? "SAFE" : "REJECT",
    findings,
    missingTokens: occResult.missing,
    duplicatedTokens: occResult.duplicated,
    unexpectedTokens: occResult.unexpected,
    malformedTokens: malformedList,
    exactRestoration,
  };
}
