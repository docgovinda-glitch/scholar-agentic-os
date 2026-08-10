/**
 * The Warden — egress classification and policy types.
 *
 * Spec: docs/04-architecture/41-AI-ARCHITECTURE.md §5,
 *       docs/04-architecture/44-DATA-RESIDENCY-AND-PRIVACY.md §5.
 *
 * The Warden is the mandatory checkpoint between anything that wants to send
 * content to a model provider and the provider itself. Every outbound call to
 * platform/gateway passes through evaluate() first. There is no bypass path:
 * an architectural test (src/platform/warden/__tests__/noBypass.test.ts)
 * asserts that no other module constructs a provider HTTP client directly.
 */

/** Sensitivity classification assigned to a payload before it may egress. */
export type EgressClass =
  | "public"
  | "bibliographic"
  | "derived"
  | "user_content"
  | "restricted";

/** The task an outbound call serves. Drives routing and default policy. */
export type TaskClass =
  | "drafting"
  | "refinement"
  | "chat"
  | "summarisation"
  | "verification"
  | "rule_extraction"
  | "discovery"
  | "embedding"
  | "classification";

export type PolicyDecision = "allow" | "deny" | "redact" | "ask";

export interface EgressPolicy {
  /** decision per (providerId, EgressClass). Missing pairs fall back to defaultDecision. */
  rules: Partial<Record<EgressClass, PolicyDecision>>;
  /** Providers the user has explicitly consented to for user_content, ever. */
  consentedProviders: Set<string>;
  /** Projects/sections marked as never-egress regardless of provider. */
  restrictedScopes: Set<string>;
}

export interface EgressSegment {
  /** Human-readable label for preview UI, e.g. "Your text: current section". */
  label: string;
  text: string;
  redact?: boolean;
}

export interface EgressRequest {
  provider: string;
  taskClass: TaskClass;
  /** Scope id (project, section, or workspace) used for restricted-mode checks. */
  scopeId?: string;
  segments: EgressSegment[];
  /**
   * True when `provider` is a local runtime — the request never leaves this
   * device. Changes only the "ask" consent decision (policy.ts's
   * decideForClass): a local call is not asked for cloud-transfer consent,
   * since there is no cloud transfer. restricted-scope and hard `deny`
   * decisions are unaffected — this is not a general local exemption.
   */
  local?: boolean;
}

export interface ClassifiedSegment extends EgressSegment {
  egressClass: EgressClass;
}

export interface EgressEvaluation {
  decision: PolicyDecision;
  egressClass: EgressClass;
  reason: string;
  /** The payload as it would actually be sent — after minimisation/redaction. */
  preview: ClassifiedSegment[];
  requiresConsent: boolean;
}

export interface EgressAuditEntry {
  at: string;
  provider: string;
  taskClass: TaskClass;
  egressClass: EgressClass;
  decision: PolicyDecision;
  payloadChars: number;
  scopeId?: string;
}
