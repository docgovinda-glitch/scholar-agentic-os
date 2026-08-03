/**
 * The Warden — public entry point.
 *
 * This is the ONLY module any caller should import to gate an outbound model
 * call. src/platform/gateway wraps every provider adapter call with
 * evaluate(); nothing else may construct a provider HTTP client (enforced by
 * __tests__/noBypass.test.ts).
 *
 * Spec: docs/04-architecture/41-AI-ARCHITECTURE.md §5,
 *       docs/01-product/13-MODULE-SPECIFICATIONS.md `platform/warden`.
 */

import { classifySegment, highestClass } from "./classify";
import { decideForClass, defaultPolicy } from "./policy";
import type {
  ClassifiedSegment,
  EgressAuditEntry,
  EgressEvaluation,
  EgressPolicy,
  EgressRequest,
} from "./types";

export type { EgressClass, TaskClass, PolicyDecision, EgressPolicy, EgressRequest, EgressSegment, EgressEvaluation, EgressAuditEntry, ClassifiedSegment } from "./types";
export { defaultPolicy } from "./policy";

const auditLog: EgressAuditEntry[] = [];

/**
 * Redact a segment's text for preview/logging when policy calls for it.
 * Minimisation (§5.1 of 41-AI-ARCHITECTURE.md): send the least payload that
 * will do the job. Callers are expected to construct EgressRequest.segments
 * already minimised (e.g. Studio sends only the selected passage, not the
 * whole document) — this function only handles the "redact" policy decision,
 * which blanks a segment's text while preserving its label for the preview.
 */
function applyRedaction(segments: ClassifiedSegment[], shouldRedact: boolean): ClassifiedSegment[] {
  if (!shouldRedact) return segments;
  return segments.map((s) => ({ ...s, text: "[redacted by privacy policy]", redact: true }));
}

/**
 * Evaluate an outbound request against policy. This does NOT make the call —
 * platform/gateway calls this first, inspects `.decision`, and only proceeds
 * on "allow". "ask" means the caller must obtain explicit user consent
 * (recording it via recordConsent()) and re-evaluate before proceeding.
 */
export function evaluate(request: EgressRequest, policy: EgressPolicy = defaultPolicy()): EgressEvaluation {
  const classified: ClassifiedSegment[] = request.segments.map((seg) => ({
    ...seg,
    egressClass: classifySegment(request.taskClass, seg.label, seg.text),
  }));

  const overallClass = highestClass(classified.map((c) => c.egressClass));
  const { decision, requiresConsent, reason } = decideForClass(
    policy,
    request.provider,
    overallClass,
    request.scopeId
  );

  const preview = applyRedaction(classified, decision === "redact");

  record({
    at: new Date().toISOString(),
    provider: request.provider,
    taskClass: request.taskClass,
    egressClass: overallClass,
    decision,
    payloadChars: preview.reduce((n, s) => n + s.text.length, 0),
    scopeId: request.scopeId,
  });

  return { decision, egressClass: overallClass, reason, preview, requiresConsent };
}

/** Record a user's consent decision for (provider, user_content) going forward. */
export function recordConsent(policy: EgressPolicy, provider: string): EgressPolicy {
  const next: EgressPolicy = {
    ...policy,
    consentedProviders: new Set(policy.consentedProviders).add(provider),
  };
  return next;
}

/** Mark a project/section scope as never-egress. Reversible by the user. */
export function markRestricted(policy: EgressPolicy, scopeId: string): EgressPolicy {
  return { ...policy, restrictedScopes: new Set(policy.restrictedScopes).add(scopeId) };
}

export function unmarkRestricted(policy: EgressPolicy, scopeId: string): EgressPolicy {
  const next = new Set(policy.restrictedScopes);
  next.delete(scopeId);
  return { ...policy, restrictedScopes: next };
}

function record(entry: EgressAuditEntry): void {
  auditLog.push(entry);
}

/** The local egress audit log (docs 46-SECURITY-ARCHITECTURE.md §11.1). */
export function getAuditLog(): readonly EgressAuditEntry[] {
  return auditLog;
}

/** Test-only: clear the in-memory audit log between test cases. */
export function __resetAuditLogForTests(): void {
  auditLog.length = 0;
}
