/**
 * The one circuit breaker every server-side AI call shares (`/api/ai/run`, the
 * routed completions behind every workspace route), so a key that ran out of
 * credit on one route is skipped on all of them.
 *
 * Circuits are keyed per credential: this server serves many people, and one
 * person's spent or rejected key must never pause another person's connection
 * to the same provider. Only a hash of the key is ever part of a circuit name.
 */
import { createHash } from "node:crypto";
import { CircuitBreaker, MemoryBreakerStore } from "../../../src/platform/router/circuitBreaker.ts";
import { TtlOutputCaps } from "../../../src/platform/router/outputCaps.ts";
import type { Candidate } from "../../../src/platform/router/types.ts";

const digest = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Circuit names for one candidate: its model, and its connection (provider + key + address). */
export function serverBreakerKeys(c: Candidate): { model: string; connection: string } {
  const who = digest(`${c.credential?.apiKey ?? ""}\0${c.credential?.baseUrl ?? ""}`);
  return { model: `${c.id}|${who}`, connection: `conn:${c.group ?? c.provider}|${who}` };
}

export const serverBreaker = new CircuitBreaker(new MemoryBreakerStore());

/** Output ceilings learned from "can only afford N" refusals, per credential, shared like the breaker. */
export const serverOutputCaps = new TtlOutputCaps();
