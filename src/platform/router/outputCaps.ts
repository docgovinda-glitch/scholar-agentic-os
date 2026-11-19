/**
 * Output ceilings a connection said its balance can afford (OpenRouter's "can only afford N"), remembered for a
 * short while so the next request, and the continuation of a long answer, start there instead of paying one refused
 * request first. Short on purpose: a person who adds credit is capped for at most `ttlMs`.
 *
 * Keyed by the connection's circuit name, which on the server includes a hash of the credential.
 */
export interface OutputCapStore {
  get(key: string): number | undefined;
  set(key: string, tokens: number): void;
}

/**
 * A connection-level hint stored beside the per-model ceilings: "some model on this connection was refused at N". It
 * is never a limit, only a signal that the balance is low, so model choice can favour answers that fit in few tokens.
 */
export const balanceHintKey = (connection: string): string => `${connection}#balance`;

export class TtlOutputCaps implements OutputCapStore {
  private m = new Map<string, { tokens: number; until: number }>();
  constructor(private ttlMs = 10 * 60_000, private maxEntries = 5_000, private now: () => number = Date.now) {}
  get(key: string): number | undefined {
    const hit = this.m.get(key);
    if (!hit) return undefined;
    if (hit.until <= this.now()) { this.m.delete(key); return undefined; }
    return hit.tokens;
  }
  set(key: string, tokens: number): void {
    this.m.delete(key);
    this.m.set(key, { tokens, until: this.now() + this.ttlMs });
    if (this.m.size > this.maxEntries) {
      const oldest = this.m.keys().next().value;
      if (oldest !== undefined) this.m.delete(oldest);
    }
  }
  get size() { return this.m.size; }
}
