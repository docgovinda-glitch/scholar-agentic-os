/**
 * `services/capabilities`'s public types.
 *
 * Spec: docs/04-architecture/46-SECURITY-ARCHITECTURE.md §8, capability set
 * from docs/04-architecture/42-MULTI-AGENT-ARCHITECTURE.md §4.1 — the exact
 * 18 capabilities agents and plugins are permissioned against there.
 */

export const CAPABILITIES = [
  "read:project",
  "read:draft",
  "read:corpus",
  "read:vault",
  "read:evidence",
  "read:rubric",
  "read:voice_profile",
  "read:index",
  "write:draft_proposal",
  "write:draft",
  "write:findings",
  "write:suggestions",
  "write:metadata",
  "write:claim_graph",
  "write:candidate_queue",
  "write:vault_metadata",
  "write:artifact",
  "net:outbound",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface CapabilityToken {
  id: string;
  /** The agent or plugin this token was issued to — non-transferable, checked by verify(). */
  subject: string;
  capability: Capability;
  /** Narrows the grant further, e.g. a projectId — a token scoped to one project does not verify for another. Undefined means unscoped. */
  scope?: string;
  /** Who authorised the grant (a user id, or "system" for a manifest-declared default). */
  grantedBy: string;
  grantedAt: string;
  revoked: boolean;
  revokedAt?: string;
}

export class CapabilityDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapabilityDeniedError";
  }
}

export class CapabilityNotFoundError extends Error {
  constructor(tokenId: string) {
    super(`No capability token "${tokenId}".`);
    this.name = "CapabilityNotFoundError";
  }
}
