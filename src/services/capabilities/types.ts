/**
 * `services/capabilities`'s public types.
 *
 * Spec: docs/04-architecture/46-SECURITY-ARCHITECTURE.md §8, capability set
 * from docs/04-architecture/42-MULTI-AGENT-ARCHITECTURE.md §4.1's 18-entry
 * table, EXTENDED with capabilities §3's per-agent "Permissions:" lines
 * name but §4.1's table omits — that table is not actually exhaustive of
 * what §3 assigns (e.g. AG-14 declares `write:citations`, AG-25 declares
 * `read:egress_request`/`write:egress_decision`, AG-26 declares
 * `read:gates`/`write:schedule`, none of which are in §4.1). Added here
 * only as each concrete agent that needs one gets built (AG-14, AG-25,
 * AG-26 so far) — not speculatively for the ~10 other agents' §3 entries
 * that reference still more undeclared capabilities (`read:source`,
 * `read:structure`, `write:formatting`, `read:ledger`, and others), since
 * inventing capabilities for agents that don't exist yet would defeat the
 * "narrow" property this registry exists to enforce.
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
  "read:egress_request",
  "read:gates",
  "write:draft_proposal",
  "write:draft",
  "write:findings",
  "write:suggestions",
  "write:metadata",
  "write:claim_graph",
  "write:candidate_queue",
  "write:vault_metadata",
  "write:artifact",
  "write:citations",
  "write:egress_decision",
  "write:schedule",
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
