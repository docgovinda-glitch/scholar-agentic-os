/**
 * In-memory, per-session Warden policy store.
 *
 * The Warden's "ask once per provider, then remember" behaviour
 * (docs 41-AI-ARCHITECTURE.md §5.3) requires *something* to hold that
 * memory across requests. Full account-scoped persistence belongs in
 * `services/store` per docs/01-product/13-MODULE-SPECIFICATIONS.md — that
 * needs the auth/session system this codebase doesn't have wired end-to-end
 * yet. This module is the honestly-scoped interim: an in-memory map keyed by
 * a caller-supplied session id, good enough for a single server process and
 * for exercising the real consent flow end-to-end today. It is explicitly
 * NOT durable across restarts and NOT shared across instances — both are
 * the documented next step (docs 13-MODULE-SPECIFICATIONS.md §8.3).
 */

import { defaultPolicy, recordConsent, markRestricted, type EgressPolicy } from "../../platform/warden/warden";

const policies = new Map<string, EgressPolicy>();

export function getPolicyForSession(sessionId: string): EgressPolicy {
  const existing = policies.get(sessionId);
  if (existing) return existing;
  const fresh = defaultPolicy();
  policies.set(sessionId, fresh);
  return fresh;
}

export function grantConsent(sessionId: string, provider: string): EgressPolicy {
  const current = getPolicyForSession(sessionId);
  const updated = recordConsent(current, provider);
  policies.set(sessionId, updated);
  return updated;
}

export function restrictScope(sessionId: string, scopeId: string): EgressPolicy {
  const current = getPolicyForSession(sessionId);
  const updated = markRestricted(current, scopeId);
  policies.set(sessionId, updated);
  return updated;
}

/** Test-only: reset all in-memory session policy state between test cases. */
export function __resetSessionPoliciesForTests(): void {
  policies.clear();
}
