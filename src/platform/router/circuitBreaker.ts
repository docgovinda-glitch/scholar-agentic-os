/**
 * Per-circuit breaker: closed → open, open → half-open after a cooldown that
 * doubles on each re-open (capped), half-open lets exactly one probe through.
 * State lives behind a store so the server can share it across instances
 * (Redis/Postgres: the interface is async and two methods) and the browser can
 * keep it in memory.
 *
 * What opens a circuit depends on what failed (`FailureInfo.kind`), because
 * providers fail in very different ways:
 *
 *   quota / auth    The account or key is unusable until a person acts (credit
 *                   added, key replaced) or a window resets. Opens at once, for
 *                   a long cooldown, so the next requests skip it instead of
 *                   paying a failed round trip each. One probe after the
 *                   cooldown tells whether it recovered.
 *   rate_limit      A per-minute (RPM/TPM) window recovers quickly: a provider
 *                   `retry-after` of a few seconds or more opens the circuit for
 *                   exactly that long (never longer than a couple of minutes);
 *                   without a hint it counts like a transient error but with a
 *                   short cooldown. A per-day limit (RPD) is long-lived: it
 *                   opens at once for an hour or the provider's own hint.
 *   everything else 5xx, overload, timeouts, network: transient. Opens only
 *                   after `failureThreshold` failures in a row, so a glitch
 *                   never blacklists a healthy key.
 */
import type { FailureKind } from "./types";

export type BreakerState = "closed" | "open" | "half_open";

export interface BreakerRecord {
  state: BreakerState;
  failures: number;
  openedAt: number;
  cooldownMs: number;
  probeInFlight: boolean;
  /** When the half-open probe was let through; a probe that never reports back is re-issued after `probeTimeoutMs`. */
  probeAt?: number;
  /** What opened the circuit, so a skipped candidate can say why. */
  reason?: FailureKind;
  /** Longest cooldown a re-open may grow to for this kind of failure. */
  capMs?: number;
}

export interface BreakerStore {
  get(key: string): Promise<BreakerRecord | undefined>;
  set(key: string, rec: BreakerRecord): Promise<void>;
}

/**
 * In-memory store. Capped, because circuits are keyed per credential: the
 * oldest entries go first once `maxEntries` is reached (a forgotten closed
 * circuit costs nothing; an open one is re-learned on the next failure).
 */
export class MemoryBreakerStore implements BreakerStore {
  private m = new Map<string, BreakerRecord>();
  constructor(private maxEntries = 5_000) {}
  async get(k: string) { return this.m.get(k); }
  async set(k: string, r: BreakerRecord) {
    this.m.delete(k); // re-insert so the most recently touched circuit is the last to be evicted
    this.m.set(k, r);
    if (this.m.size > this.maxEntries) {
      const oldest = this.m.keys().next().value;
      if (oldest !== undefined) this.m.delete(oldest);
    }
  }
  get size() { return this.m.size; }
}

export interface BreakerConfig {
  /** Consecutive transient failures (5xx, overload, timeout, network, unhinted rate limit) that open a circuit. */
  failureThreshold: number;
  baseCooldownMs: number;
  maxCooldownMs: number;
  /** Cooldown after a rate limit that came without a retry hint. */
  rateLimitCooldownMs: number;
  /** A per-minute window never keeps a circuit open longer than this. */
  maxRateLimitCooldownMs: number;
  /** A retry hint shorter than this is handled by the router's own retry, not the circuit. */
  minHintedRateLimitMs: number;
  /** Per-day limit (RPD/TPD): how long before the next probe. */
  dailyLimitCooldownMs: number;
  /** Spent credit. */
  quotaCooldownMs: number;
  /** Rejected key. */
  authCooldownMs: number;
  /** Ceiling for quota/auth/daily cooldowns, including re-open doubling. */
  maxHardCooldownMs: number;
  /** A half-open probe that never reports back is re-issued after this long. */
  probeTimeoutMs: number;
}

const MIN = 60_000;
export const DEFAULT_BREAKER: BreakerConfig = {
  failureThreshold: 3,
  baseCooldownMs: 30_000,
  maxCooldownMs: 10 * MIN,
  rateLimitCooldownMs: 15_000,
  maxRateLimitCooldownMs: 2 * MIN,
  minHintedRateLimitMs: 3_000,
  dailyLimitCooldownMs: 60 * MIN,
  quotaCooldownMs: 30 * MIN,
  authCooldownMs: 30 * MIN,
  maxHardCooldownMs: 6 * 60 * MIN,
  probeTimeoutMs: 60_000,
};

/** What the router tells the breaker about a failed call. */
export interface FailureInfo {
  kind?: FailureKind;
  /** The provider's own "try again in" hint. */
  retryAfterMs?: number;
  /** The limit that was hit resets daily (RPD/TPD), not per minute. */
  daily?: boolean;
}

interface Policy { immediate: boolean; cooldownMs: number; capMs: number }

/** What a failure means for a circuit: open now or count it, for how long, and how far a re-open may grow. */
export function policyFor(cfg: BreakerConfig, info: FailureInfo = {}): Policy {
  const hint = info.retryAfterMs && info.retryAfterMs > 0 ? info.retryAfterMs : 0;
  switch (info.kind) {
    case "quota":
      return { immediate: true, cooldownMs: Math.min(cfg.maxHardCooldownMs, Math.max(hint, cfg.quotaCooldownMs)), capMs: cfg.maxHardCooldownMs };
    case "auth":
      return { immediate: true, cooldownMs: Math.min(cfg.maxHardCooldownMs, Math.max(hint, cfg.authCooldownMs)), capMs: cfg.maxHardCooldownMs };
    case "rate_limit":
      if (info.daily) return { immediate: true, cooldownMs: Math.min(cfg.maxHardCooldownMs, Math.max(hint, cfg.dailyLimitCooldownMs)), capMs: cfg.maxHardCooldownMs };
      if (hint >= cfg.minHintedRateLimitMs) return { immediate: true, cooldownMs: Math.min(cfg.maxRateLimitCooldownMs, hint), capMs: cfg.maxRateLimitCooldownMs };
      return { immediate: false, cooldownMs: cfg.rateLimitCooldownMs, capMs: cfg.maxRateLimitCooldownMs };
    default:
      return { immediate: false, cooldownMs: cfg.baseCooldownMs, capMs: cfg.maxCooldownMs };
  }
}

const fresh = (cfg: BreakerConfig): BreakerRecord => ({ state: "closed", failures: 0, openedAt: 0, cooldownMs: cfg.baseCooldownMs, probeInFlight: false });

export type Gate = { allowed: true } | { allowed: false; retryInMs: number; reason?: FailureKind };

export class CircuitBreaker {
  constructor(private store: BreakerStore, private cfg: BreakerConfig = DEFAULT_BREAKER, private now: () => number = Date.now) {}

  /** May we call this candidate now? Returns the remaining cooldown (and why it is paused) when not. */
  async acquire(key: string): Promise<Gate> {
    const r = (await this.store.get(key)) ?? fresh(this.cfg);
    if (r.state === "closed") return { allowed: true };
    const t = this.now();
    const elapsed = t - r.openedAt;
    if (r.state === "open" && elapsed >= r.cooldownMs) {
      await this.store.set(key, { ...r, state: "half_open", probeInFlight: true, probeAt: t });
      return { allowed: true };
    }
    // A probe that was let through but never reported back (the caller was cancelled, or skipped the candidate afterwards) must not pause the circuit forever.
    if (r.state === "half_open" && (!r.probeInFlight || t - (r.probeAt ?? 0) >= this.cfg.probeTimeoutMs)) {
      await this.store.set(key, { ...r, probeInFlight: true, probeAt: t });
      return { allowed: true };
    }
    const retryInMs = r.state === "half_open" ? Math.max(0, this.cfg.probeTimeoutMs - (t - (r.probeAt ?? t))) : Math.max(0, r.cooldownMs - elapsed);
    return { allowed: false, retryInMs, reason: r.reason };
  }

  async success(key: string): Promise<void> {
    const r = await this.store.get(key);
    if (r && r.state === "closed" && r.failures === 0) return; // nothing to reset
    await this.store.set(key, fresh(this.cfg));
  }

  /**
   * The probe this acquire let through did not tell us anything about the
   * provider (a cancelled call, a bad request, a skipped candidate): let the
   * next caller probe instead of waiting for the lease to expire.
   */
  async release(key: string): Promise<void> {
    const r = await this.store.get(key);
    if (r?.state === "half_open" && r.probeInFlight) await this.store.set(key, { ...r, probeInFlight: false });
  }

  /** Only failures that say something about the provider count (not aborts or bad requests). */
  async failure(key: string, info: FailureInfo = {}): Promise<void> {
    const r = (await this.store.get(key)) ?? fresh(this.cfg);
    const p = policyFor(this.cfg, info);
    const t = this.now();
    if (r.state === "half_open") {
      // The probe failed: re-open, backing off from whichever is longer, the last cooldown doubled or this failure's own.
      const cooldownMs = Math.min(Math.max(r.cooldownMs * 2, p.cooldownMs), Math.max(p.capMs, r.capMs ?? 0));
      await this.store.set(key, { state: "open", failures: r.failures + 1, openedAt: t, cooldownMs, probeInFlight: false, reason: info.kind, capMs: Math.max(p.capMs, r.capMs ?? 0) });
      return;
    }
    if (r.state === "open") {
      // Already open (a concurrent request failed too): keep the longer of the two cooldowns, never shorten one.
      const remaining = Math.max(0, r.cooldownMs - (t - r.openedAt));
      if (p.cooldownMs > remaining) await this.store.set(key, { ...r, openedAt: t, cooldownMs: p.cooldownMs, reason: info.kind ?? r.reason });
      return;
    }
    const failures = r.failures + 1;
    if (p.immediate || failures >= this.cfg.failureThreshold) {
      await this.store.set(key, { state: "open", failures, openedAt: t, cooldownMs: p.cooldownMs, probeInFlight: false, reason: info.kind, capMs: p.capMs });
    } else {
      await this.store.set(key, { ...r, failures, cooldownMs: p.cooldownMs });
    }
  }
}
