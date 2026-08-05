/**
 * Automatic provider failover.
 *
 * Goal: when the active provider hits a rate limit, exhausts its quota, times
 * out, or returns a server error, the user's task continues on another saved
 * provider without them noticing or losing work.
 *
 * WHAT "WITHOUT LOSING PROGRESS" HONESTLY MEANS
 * ---------------------------------------------
 * A token stream that has already begun on provider A cannot be handed to
 * provider B and resumed — B has no access to A's sampling state, and no
 * provider API accepts "continue this other model's half-finished response"
 * as a request. Any claim of literal mid-stream continuation would be false.
 *
 * What IS achievable, and what this module does, is preserve the user-visible
 * work: the text already streamed to the screen stays there, and the
 * replacement provider is given that partial output as context with an
 * instruction to continue from exactly where it stopped. The user sees a
 * brief pause and then the text carries on. Nothing already written is
 * discarded and nothing is re-rendered.
 *
 * For non-streaming calls the question does not arise: the request itself is
 * the entire state, so retrying it elsewhere is genuinely transparent.
 *
 * WHY IT KEYS OFF ERROR KIND
 * --------------------------
 * The previous fallback logic caught every error identically, which meant a
 * malformed prompt (which fails the same way everywhere) would burn an attempt
 * against every saved key in turn, and a rate limit would be treated as fatal
 * rather than as something that clears in seconds. Decisions here are driven
 * by ClassifiedAIError (src/services/aiErrors.ts): `retryable` decides whether
 * to wait and try the SAME provider again, `failoverWorthwhile` decides
 * whether trying a DIFFERENT one could possibly help.
 */

import type { ClassifiedAIError } from "./aiErrors";

export interface FailoverEvent {
  type: "attempt" | "retry" | "switch" | "success" | "exhausted";
  providerId: string;
  attempt?: number;
  delayMs?: number;
  error?: ClassifiedAIError;
  /** Ready-to-display sentence, e.g. "Groq is rate limited — continuing on Gemini." */
  userMessage?: string;
}

export interface FailoverOptions {
  /** Provider ids to try, best first */
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
  /** The most informative failure — an invalid key beats a generic timeout */
  error: ClassifiedAIError;
  attempts: Array<{ providerId: string; error: ClassifiedAIError }>;
}

export type FailoverResult<T> = FailoverSuccess<T> | FailoverFailure;

// This project's tsconfig.json does not enable `strict`, so `strictNullChecks`
// is off — and without it TypeScript will not narrow a discriminated union
// through `if (!result.ok)`. These explicit type predicates do the narrowing
// regardless of that setting, so callers get full type safety on both
// branches without the project needing a compiler-flag change.
export function isFailoverSuccess<T>(result: FailoverResult<T>): result is FailoverSuccess<T> {
  return result.ok === true;
}

export function isFailoverFailure<T>(result: FailoverResult<T>): result is FailoverFailure {
  return result.ok === false;
}

/** Thrown by a runner so the orchestrator can read the classification. */
export class ProviderCallError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly classified: ClassifiedAIError
  ) {
    super(classified.message);
    this.name = "ProviderCallError";
  }
}

// ─────────────────────────────────────────────────────────
// COOLDOWNS
// ─────────────────────────────────────────────────────────
// A provider that just returned 429 with `Retry-After: 60` should not be the
// first thing tried by the next task 2 seconds later. Cooldowns are process-
// wide and deliberately not persisted — they describe a transient condition,
// and a stale one restored after a reload would skip a healthy provider.

const cooldowns = new Map<string, number>();

export function isInCooldown(providerId: string): boolean {
  const until = cooldowns.get(providerId);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    cooldowns.delete(providerId);
    return false;
  }
  return true;
}

export function cooldownRemainingMs(providerId: string): number {
  const until = cooldowns.get(providerId);
  return until ? Math.max(0, until - Date.now()) : 0;
}

export function setCooldown(providerId: string, ms: number): void {
  if (ms > 0) cooldowns.set(providerId, Date.now() + ms);
}

export function clearCooldown(providerId: string): void {
  cooldowns.delete(providerId);
}

export function clearAllCooldowns(): void {
  cooldowns.clear();
}

/** Healthy providers first, cooled-down ones demoted rather than dropped —
 *  a cooled-down provider is still better than failing outright. */
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

/** Ranks failures so the message shown is the most actionable one. */
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
 *
 * `task` receives the provider id and must throw a ProviderCallError (or any
 * error, which is treated as unknown-and-retryable) on failure.
 */
export async function executeWithFailover<T>(
  task: (providerId: string) => Promise<T>,
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
        label: "No provider available",
        message: "No AI provider is configured with a usable key.",
        remedy: "Add an API key, or start a local AI program.",
        retryable: false,
        failoverWorthwhile: false,
      },
    };
  }

  for (let index = 0; index < candidates.length; index++) {
    const providerId = candidates[index];
    let attempt = 0;

    while (attempt <= maxRetriesPerProvider) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      onEvent?.({ type: "attempt", providerId, attempt: attempt + 1 });

      try {
        const value = await task(providerId);
        clearCooldown(providerId);
        onEvent?.({ type: "success", providerId });
        return {
          ok: true,
          value,
          providerId,
          usedFallback: providerId !== options.candidates[0],
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

        attempts.push({ providerId, error: classified });

        // Park a rate-limited provider for as long as it asked for, so the
        // next task in this session skips straight past it.
        if (classified.kind === "rate_limit" || classified.kind === "insufficient_quota") {
          setCooldown(providerId, classified.retryAfterMs ?? 60_000);
        }

        const canRetrySame = classified.retryable && attempt < maxRetriesPerProvider;
        if (canRetrySame) {
          // Honour Retry-After when the provider supplied one; otherwise use
          // exponential backoff. Capped so a hostile header cannot stall the app.
          const backoff = Math.min(maxBackoffMs, classified.retryAfterMs ?? 1000 * Math.pow(2, attempt));
          onEvent?.({
            type: "retry",
            providerId,
            attempt: attempt + 1,
            delayMs: backoff,
            error: classified,
            userMessage: `${nameOf(providerId)}: ${classified.label.toLowerCase()} — retrying in ${Math.ceil(backoff / 1000)}s.`,
          });
          await sleep(backoff, signal);
          attempt++;
          continue;
        }

        if (!classified.failoverWorthwhile) {
          onEvent?.({ type: "exhausted", providerId, error: classified });
          return { ok: false, error: classified, attempts };
        }

        const next = candidates[index + 1];
        if (next) {
          onEvent?.({
            type: "switch",
            providerId: next,
            error: classified,
            userMessage: `${nameOf(providerId)} is unavailable (${classified.label.toLowerCase()}) — continuing on ${nameOf(next)}.`,
          });
        }
        break; // Move to the next provider.
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
    error: worst?.error ?? {
      kind: "unknown",
      label: "All providers failed",
      message: "Every configured provider failed to respond.",
      remedy: "Check your keys and connection, then try again.",
      retryable: false,
      failoverWorthwhile: false,
    },
  };
}

