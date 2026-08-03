/**
 * Egress policy evaluation — the second Warden stage.
 *
 * Default policy matrix from docs/04-architecture/41-AI-ARCHITECTURE.md §5.3:
 * public/bibliographic/derived are allowed everywhere; user_content asks the
 * first time per provider then remembers consent; restricted is denied to
 * every provider unconditionally unless the caller passes an override policy
 * that explicitly changes it (a deliberate, per-provider, recorded decision —
 * never a default).
 */

import type { EgressClass, EgressPolicy, PolicyDecision } from "./types";

export function defaultPolicy(): EgressPolicy {
  return {
    rules: {
      public: "allow",
      bibliographic: "allow",
      derived: "allow",
      user_content: "ask",
      restricted: "deny",
    },
    consentedProviders: new Set(),
    restrictedScopes: new Set(),
  };
}

export function decideForClass(
  policy: EgressPolicy,
  provider: string,
  egressClass: EgressClass,
  scopeId?: string
): { decision: PolicyDecision; requiresConsent: boolean; reason: string } {
  if (scopeId && policy.restrictedScopes.has(scopeId)) {
    return {
      decision: "deny",
      requiresConsent: false,
      reason: `Scope "${scopeId}" is marked restricted — no model provider may receive its content.`,
    };
  }

  const configured = policy.rules[egressClass];
  const decision: PolicyDecision = configured ?? "ask";

  if (egressClass === "restricted") {
    return {
      decision: "deny",
      requiresConsent: false,
      reason: "restricted content never egresses to a model provider under default policy.",
    };
  }

  if (decision === "ask") {
    const consented = policy.consentedProviders.has(provider);
    if (consented) {
      return {
        decision: "allow",
        requiresConsent: false,
        reason: `${provider} previously consented for user_content; proceeding.`,
      };
    }
    return {
      decision: "ask",
      requiresConsent: true,
      reason: `First use of ${provider} for user_content — consent required before this request proceeds.`,
    };
  }

  return {
    decision,
    requiresConsent: false,
    reason: `Policy for ${egressClass} content on ${provider} is "${decision}".`,
  };
}
