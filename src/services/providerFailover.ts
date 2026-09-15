/**
 * Automatic provider failover.
 *
 * Goal: when the active provider hits a rate limit, exhausts its quota, times
 * out, or returns a server error, the user's task continues on another saved
 * provider without them noticing or losing work.
 *
 * Preserves task state, isolates dead models without aborting healthy providers,
 * applies bounded 429 backoff, and communicates friendly user status.
 */

import type { ClassifiedAIError } from "./aiErrors";
import {
  getProviderHealth,
  recordProviderFailure,
  recordProviderSuccess,
  clearAllProviderHealth,
} from "./modelDiscovery";

export interface FailoverEvent {
  type: "attempt" | "retry" | "switch" | "success" | "exhausted";
  providerId: string;
  attempt?: number;
  delayMs?: number;
  error?: ClassifiedAIError;
  /** Ready-to-display status sentence */
  userMessage?: string;
}

export interface FailoverOptions {
  /** Provider/candidate ids to try, best first */
  candidates: string[];
  /** Retries against the same provider before moving on */
  maxRetriesPerProvider?: number;
  /** Upper bound on any single backoff wait */
  maxBackoffMs?: number;
  onEvent?: (event: FailoverEvent) => void;
  signal?: AbortSignal;
  /** Display names for messages; falls back to the raw id */
  displayNames?: Record<string, string>;
}

export interface FailoverSuccess<T> {
  ok: true;
  value: T;
  providerId: string;
  /** True when the first choice did not serve the request */
  usedFallback: boolean;
  attempts: Array<{ providerId: string; error: ClassifiedAIError }>;
}

export interface FailoverFailure {
  ok: false;
  /** The most informative failure */
  error: ClassifiedAIError;
  attempts: Array<{ providerId: string; error: ClassifiedAIError }>;
}

export type FailoverResult<T> = FailoverSuccess<T> | FailoverFailure;

export function isFailoverSuccess<T>(result: FailoverResult<T>): result is FailoverSuccess<T> {
  return result.ok === true;
}

export function isFailoverFailure<T>(result: FailoverResult<T>): result is FailoverFailure {
  return result.ok === false;
}

export class ProviderCallError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly classified: ClassifiedAIError
  ) {
    super(classified.message);
    this.name = "ProviderCallError";
  }
}

export function baseProviderId(id: string): string {
  return id.includes("::") ? id.split("::")[0] : id;
}

// ─────────────────────────────────────────────────────────
// COOLDOWNS
// ─────────────────────────────────────────────────────────
const cooldowns = new Map<string, number>();

export function isInCooldown(candidateId: string): boolean {
  const base = baseProviderId(candidateId);
  const health = getProviderHealth(base);
  if (health.cooldownUntil && Date.now() < health.cooldownUntil) {
    return true;
  }
  const until = cooldowns.get(base) ?? cooldowns.get(candidateId);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    cooldowns.delete(base);
    cooldowns.delete(candidateId);
    return false;
  }
  return true;
}

export function cooldownRemainingMs(candidateId: string): number {
  const base = baseProviderId(candidateId);
  const health = getProviderHealth(base);
  const healthRemaining = health.cooldownUntil ? Math.max(0, health.cooldownUntil - Date.now()) : 0;
  const until = cooldowns.get(base) ?? cooldowns.get(candidateId);
  const localRemaining = until ? Math.max(0, until - Date.now()) : 0;
  return Math.max(healthRemaining, localRemaining);
}

export function setCooldown(candidateId: string, ms: number): void {
  const base = baseProviderId(candidateId);
  if (ms > 0) {
    const expires = Date.now() + ms;
    cooldowns.set(base, expires);
    cooldowns.set(candidateId, expires);
    // Sync with shared provider-health state machine across concurrent agents
    recordProviderFailure(base, "rate_limited", ms);
  } else {
    clearCooldown(candidateId);
  }
}

export function clearCooldown(candidateId: string): void {
  const base = baseProviderId(candidateId);
  cooldowns.delete(base);
  cooldowns.delete(candidateId);
  recordProviderSuccess(base);
}

export function clearAllCooldowns(): void {
  cooldowns.clear();
  clearAllProviderHealth();
}

/** Healthy providers first, cooled-down ones demoted rather than dropped */
export function orderCandidates(candidates: string[]): string[] {
  const ready = candidates.filter((id) => !isInCooldown(id));
  const cooling = candidates
    .filter((id) => isInCooldown(id))
    .sort((a, b) => cooldownRemainingMs(a) - cooldownRemainingMs(b));
  return [...ready, ...cooling];
}

// ─────────────────────────────────────────────────────────
// ORCHESTRATION
// ─────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

function severityRank(error: ClassifiedAIError): number {
  switch (error.kind) {
    case "invalid_key":
    case "insufficient_quota":
      return 5;
    case "cors_blocked":
      return 4;
    case "model_not_found":
    case "bad_request":
      return 3;
    case "rate_limit":
      return 2;
    default:
      return 1;
  }
}

/**
 * Run `task` against the first provider that succeeds.
 */
export async function executeWithFailover<T>(
  task: (candidateId: string) => Promise<T>,
  options: FailoverOptions
): Promise<FailoverResult<T>> {
  const {
    maxRetriesPerProvider = 2,
    maxBackoffMs = 8000,
    onEvent,
    signal,
    displayNames = {},
  } = options;

  const nameOf = (id: string) => displayNames[id] || id;
  const candidates = orderCandidates(options.candidates);
  const attempts: Array<{ providerId: string; error: ClassifiedAIError }> = [];

  if (candidates.length === 0) {
    return {
      ok: false,
      attempts,
      error: {
        kind: "unknown",
        label: "AI generation unavailable",
        message: "No AI provider is configured with a usable key.",
        remedy: "Add an API key in AI Access settings, or start a local AI runtime.",
        retryable: false,
        failoverWorthwhile: false,
      },
    };
  }

  for (let index = 0; index < candidates.length; index++) {
    const candidateId = candidates[index];
    const baseId = baseProviderId(candidateId);
    let attempt = 0;

    while (attempt <= maxRetriesPerProvider) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      onEvent?.({ type: "attempt", providerId: candidateId, attempt: attempt + 1 });

      try {
        const value = await task(candidateId);
        clearCooldown(candidateId);
        onEvent?.({
          type: "success",
          providerId: candidateId,
          userMessage: candidateId !== options.candidates[0] ? `✓ Backup model connected (${nameOf(candidateId)})` : undefined,
        });
        return {
          ok: true,
          value,
          providerId: baseId,
          usedFallback: candidateId !== options.candidates[0],
          attempts,
        };
      } catch (raw) {
        if (raw instanceof DOMException && raw.name === "AbortError") throw raw;

        const classified: ClassifiedAIError =
          raw instanceof ProviderCallError
            ? raw.classified
            : {
                kind: "unknown",
                label: "Unexpected error",
                message: raw instanceof Error ? raw.message : String(raw),
                remedy: null,
                retryable: true,
                failoverWorthwhile: true,
              };

        attempts.push({ providerId: baseId, error: classified });

        // Cooldown management for 429 or quota exhaustion
        if (classified.kind === "rate_limit" || classified.kind === "insufficient_quota") {
          setCooldown(candidateId, classified.retryAfterMs ?? 60_000);
        }

        // Auth errors (401/403): do NOT retry same candidate
        const isAuthFailure = classified.kind === "invalid_key";
        const canRetrySame = !isAuthFailure && classified.retryable && attempt < maxRetriesPerProvider;

        if (canRetrySame) {
          const backoff = Math.min(maxBackoffMs, classified.retryAfterMs ?? 1000 * Math.pow(2, attempt));
          onEvent?.({
            type: "retry",
            providerId: candidateId,
            attempt: attempt + 1,
            delayMs: backoff,
            error: classified,
            userMessage: `${nameOf(candidateId)}: retrying in ${Math.ceil(backoff / 1000)}s...`,
          });
          await sleep(backoff, signal);
          attempt++;
          continue;
        }

        if (!classified.failoverWorthwhile) {
          onEvent?.({ type: "exhausted", providerId: candidateId, error: classified });
          return { ok: false, error: classified, attempts };
        }

        const next = candidates[index + 1];
        if (next) {
          onEvent?.({
            type: "switch",
            providerId: next,
            error: classified,
            userMessage: `Primary AI model unavailable (${nameOf(candidateId)}). Automatically switching to backup model (${nameOf(next)})…`,
          });
        }
        break; // Move to the next candidate
      }
    }
  }

  const worst = attempts.reduce(
    (acc, a) => (acc && severityRank(acc.error) >= severityRank(a.error) ? acc : a),
    attempts[0]
  );

  onEvent?.({ type: "exhausted", providerId: worst?.providerId ?? "", error: worst?.error });

  return {
    ok: false,
    attempts,
    error: worst?.error
      ? {
          ...worst.error,
          message: "AI generation is temporarily unavailable. Your research data is safe. Retry when a provider becomes available.",
        }
      : {
          kind: "unknown",
          label: "AI generation unavailable",
          message: "AI generation is temporarily unavailable. Your research data is safe. Retry when a provider becomes available.",
          remedy: "Check your provider connections in AI Access settings, or retry in a moment.",
          retryable: true,
          failoverWorthwhile: false,
        },
  };
}
