/**
 * Per-candidate circuit breaker: closed → open after N consecutive failures,
 * open → half-open after a cooldown that doubles on each re-open (capped),
 * half-open lets exactly one probe through. State lives behind a store so the
 * server can share it across instances (Redis/Postgres) and the browser can
 * keep it in memory.
 */
export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerRecord {
  state: BreakerState;
  failures: number;
  openedAt: number;
  cooldownMs: number;
  probeInFlight: boolean;
}

export interface BreakerStore {
  get(key: string): Promise<BreakerRecord | undefined>;
  set(key: string, rec: BreakerRecord): Promise<void>;
}

export class MemoryBreakerStore implements BreakerStore {
  private m = new Map<string, BreakerRecord>();
  async get(k: string) { return this.m.get(k); }
  async set(k: string, r: BreakerRecord) { this.m.set(k, r); }
}

export interface BreakerConfig {
  failureThreshold: number;
  baseCooldownMs: number;
  maxCooldownMs: number;
}

export const DEFAULT_BREAKER: BreakerConfig = { failureThreshold: 3, baseCooldownMs: 30_000, maxCooldownMs: 10 * 60_000 };

const fresh = (cfg: BreakerConfig): BreakerRecord => ({ state: "closed", failures: 0, openedAt: 0, cooldownMs: cfg.baseCooldownMs, probeInFlight: false });

export class CircuitBreaker {
  constructor(private store: BreakerStore, private cfg: BreakerConfig = DEFAULT_BREAKER, private now: () => number = Date.now) {}

  /** May we call this candidate now? Returns the remaining cooldown when not. */
  async acquire(key: string): Promise<{ allowed: true } | { allowed: false; retryInMs: number }> {
    const r = (await this.store.get(key)) ?? fresh(this.cfg);
    if (r.state === "closed") return { allowed: true };
    const elapsed = this.now() - r.openedAt;
    if (r.state === "open" && elapsed >= r.cooldownMs) {
      await this.store.set(key, { ...r, state: "half_open", probeInFlight: true });
      return { allowed: true };
    }
    if (r.state === "half_open" && !r.probeInFlight) {
      await this.store.set(key, { ...r, probeInFlight: true });
      return { allowed: true };
    }
    return { allowed: false, retryInMs: Math.max(0, r.cooldownMs - elapsed) };
  }

  async success(key: string): Promise<void> {
    await this.store.set(key, fresh(this.cfg));
  }

  /** Only failures that say something about the provider count (not aborts or bad requests). */
  async failure(key: string): Promise<void> {
    const r = (await this.store.get(key)) ?? fresh(this.cfg);
    if (r.state === "half_open") {
      const cooldownMs = Math.min(r.cooldownMs * 2, this.cfg.maxCooldownMs);
      await this.store.set(key, { state: "open", failures: r.failures + 1, openedAt: this.now(), cooldownMs, probeInFlight: false });
      return;
    }
    const failures = r.failures + 1;
    await this.store.set(key, failures >= this.cfg.failureThreshold
      ? { state: "open", failures, openedAt: this.now(), cooldownMs: r.cooldownMs, probeInFlight: false }
      : { ...r, failures });
  }
}
