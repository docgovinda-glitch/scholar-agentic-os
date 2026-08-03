/**
 * services/capabilities — the enforcement point for agent and plugin
 * permissions (docs/04-architecture/46-SECURITY-ARCHITECTURE.md §8: "The
 * enforcement mechanism for both agents and plugins").
 *
 * This module is the only place that issues, verifies, or revokes capability
 * tokens — the same "one sanctioned module" shape as platform/warden for
 * egress. A caller about to perform a guarded action (an agent about to
 * read the Vault, a plugin about to propose draft text) must call verify()
 * immediately before acting, not once at startup — verifying early and
 * trusting the result later would make revocation meaningless.
 *
 * Properties from docs 46 §8.1, and how each is met here:
 *   - Unforgeable: issue() is the only way to create a token; ids are
 *     generated here, never accepted from a caller.
 *   - Narrow: one capability per token; no wildcard capability exists in the
 *     CAPABILITIES registry (types.ts).
 *   - Revocable: revoke()/revokeAll() flip a token dead immediately —
 *     verify() checks `revoked` on every call, not just at issuance.
 *   - Non-transferable: verify() requires the caller to assert the subject
 *     it's calling on behalf of, and rejects a token whose subject doesn't
 *     match — an agent cannot hand its token to a plugin and have it verify.
 *   - Non-escalating: issue() takes no capability token as input, only a
 *     free-form grantedBy actor id — nothing here lets holding one
 *     capability be used to mint another.
 *   - Enforced at the call boundary: this module makes verify() cheap and
 *     side-effect-free specifically so callers have no excuse to skip it.
 *
 * Scope, stated honestly: like sessionPolicyStore.ts, this is in-memory and
 * does not survive a restart or scale past one process — tokens are
 * short-lived by nature (issued per agent run), so that is a smaller gap
 * than services/store's was, but it is still a gap, not a design choice
 * being presented as final.
 */

import { CAPABILITIES, CapabilityDeniedError, CapabilityNotFoundError } from "./types";
import type { Capability, CapabilityToken } from "./types";

/** docs 46 §8.2: "write:draft | Never granted to any agent or plugin". Enforced here, not by caller convention. */
const NEVER_GRANTED: ReadonlySet<Capability> = new Set(["write:draft"]);

const tokens = new Map<string, CapabilityToken>();
let counter = 0;

function isKnownCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Issues a new capability token to `subject` (an agent or plugin id).
 * Throws CapabilityDeniedError for an unknown capability string or for
 * `write:draft`, which is refused unconditionally regardless of who is
 * asking — there is no override path, by design (docs 46 §8.2).
 */
export function issue(subject: string, capability: string, grantedBy: string, scope?: string): CapabilityToken {
  if (!isKnownCapability(capability)) {
    throw new CapabilityDeniedError(`Unknown capability "${capability}".`);
  }
  if (NEVER_GRANTED.has(capability)) {
    throw new CapabilityDeniedError(`"${capability}" is never granted to any agent or plugin (docs 46 §8.2).`);
  }
  counter += 1;
  const token: CapabilityToken = {
    id: `cap-${Date.now().toString(36)}-${counter}`,
    subject,
    capability,
    scope,
    grantedBy,
    grantedAt: new Date().toISOString(),
    revoked: false,
  };
  tokens.set(token.id, token);
  return token;
}

/**
 * The enforcement check. Returns false (never throws) for anything wrong
 * with the token — unknown id, revoked, wrong subject, wrong capability, or
 * wrong scope — so a guarded call site can use it directly as a boolean
 * gate: `if (!verify(...)) return deny();`.
 */
export function verify(tokenId: string, subject: string, capability: Capability, scope?: string): boolean {
  const token = tokens.get(tokenId);
  if (!token) return false;
  if (token.revoked) return false;
  if (token.subject !== subject) return false;
  if (token.capability !== capability) return false;
  if (token.scope !== undefined && token.scope !== scope) return false;
  return true;
}

export function revoke(tokenId: string): CapabilityToken {
  const token = tokens.get(tokenId);
  if (!token) throw new CapabilityNotFoundError(tokenId);
  if (!token.revoked) {
    token.revoked = true;
    token.revokedAt = new Date().toISOString();
  }
  return token;
}

/** Revokes every still-active token held by `subject` — e.g. when an agent run ends or a plugin is uninstalled. Returns how many were revoked. */
export function revokeAll(subject: string): number {
  let count = 0;
  const now = new Date().toISOString();
  for (const token of tokens.values()) {
    if (token.subject === subject && !token.revoked) {
      token.revoked = true;
      token.revokedAt = now;
      count += 1;
    }
  }
  return count;
}

export function listBySubject(subject: string): CapabilityToken[] {
  return [...tokens.values()].filter((t) => t.subject === subject);
}

/** Test-only: forgets every issued token. */
export function __resetCapabilitiesForTests(): void {
  tokens.clear();
  counter = 0;
}
