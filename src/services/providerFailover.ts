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
  quarantineModel,
  isModelQuarantined,
} from "./modelDiscovery";

export interface FailoverAuditEntry {
  timestamp: string;
  operationId: string;
  stageId?: string;
  providerId: string;
  modelId: string;
  failureKind: string;
  httpStatus?: number;
  providerErrorCode?: string;
  providerMessage?: string;
  retryable: boolean;
  failoverWorthwhile: boolean;
  quarantined: boolean;
  nextCandidate?: string;
  attemptNumber: number;
  finalOutcome?: "success" | "switched" | "exhausted" | "terminal_error";
}

const failoverAuditLog: FailoverAuditEntry[] = [];

export function getFailoverAuditLog(): FailoverAuditEntry[] {
  return [...failoverAuditLog];
}

export function clearFailoverAuditLog(): void {
  failoverAuditLog.length = 0;
}

export function formatFailoverReason(classified: ClassifiedAIError): string {
  if (classified.kind === "rate_limit" || classified.kind === "insufficient_quota") {
    return `Rate limit/quota exceeded (HTTP 429)`;
  }
  if (classified.kind === "invalid_key") {
    return `Authentication failed (HTTP ${classified.status || "401/403"})`;
  }
  if (classified.kind === "model_not_found") {
    const code = classified.providerErrorCode ? ` [${classified.providerErrorCode}]` : "";
    return `Model decommissioned or unavailable${code}`;
  }
  if (classified.kind === "timeout") {
    return `Request timed out`;
  }
  if (classified.kind === "cors_blocked" || classified.kind === "network_unreachable") {
    return `Network/connectivity error`;
  }
  if (classified.kind === "server_error") {
    return `Provider server error (HTTP 5xx)`;
  }
  if (classified.status) {
    return `Provider error (HTTP ${classified.status})`;
  }
  return classified.message || "Provider unavailable";
}

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
  /** Maximum number of distinct candidates to attempt before exhausting (candidate budget) */
  maxCandidatesToTry?: number;
  /** Upper bound on any single backoff wait */
  maxBackoffMs?: number;
  onEvent?: (event: FailoverEvent) => void;
  signal?: AbortSignal;
  /** Display names for messages; falls back to the raw id */
  displayNames?: Record<string, string>;
  /** Unique operation ID for audit logging */
  operationId?: string;
  /** Current stage ID (e.g. literatureDiscovery) */
  stageId?: string;
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
  const until = cooldowns.get(candidateId);
  if (until !== undefined) {
    if (Date.now() >= until) {
      cooldowns.delete(candidateId);
    } else {
      return true;
    }
  }
  const base = baseProviderId(candidateId);
  const health = getProviderHealth(base);
  if (health.cooldownUntil && Date.now() < health.cooldownUntil) {
    if (health.status === "auth_failed" || health.status === "offline") {
      return true;
    }
  }
  const baseUntil = cooldowns.get(base);
  if (baseUntil !== undefined) {
    if (Date.now() >= baseUntil) {
      cooldowns.delete(base);
    } else {
      return true;
    }
  }
  return false;
}

export function cooldownRemainingMs(candidateId: string): number {
  const base = baseProviderId(candidateId);
  const health = getProviderHealth(base);
  const healthRemaining =
    health.cooldownUntil && (health.status === "auth_failed" || health.status === "offline")
      ? Math.max(0, health.cooldownUntil - Date.now())
      : 0;
  const until = cooldowns.get(candidateId) ?? cooldowns.get(base);
  const localRemaining = until ? Math.max(0, until - Date.now()) : 0;
  return Math.max(healthRemaining, localRemaining);
}

export function setCooldown(candidateId: string, ms: number): void {
  const base = baseProviderId(candidateId);
  if (ms > 0) {
    const expires = Date.now() + ms;
    cooldowns.set(candidateId, expires);
    if (candidateId === base) {
      cooldowns.set(base, expires);
      recordProviderFailure(base, "rate_limited", ms);
    }
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

function extractModelId(key: string): string {
  if (key.includes("::")) {
    return key.split("::")[1] || key;
  }
  return key;
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
    maxCandidatesToTry = 12,
    maxBackoffMs = 8000,
    onEvent,
    signal,
    displayNames = {},
    operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stageId,
  } = options;

  const nameOf = (id: string) => displayNames[id] || id;
  const rawCandidates = orderCandidates(options.candidates);
  const attempts: Array<{ providerId: string; error: ClassifiedAIError }> = [];

  // Filter out any models currently under runtime quarantine, unless no other candidates exist
  const unquarantined = rawCandidates.filter((id) => {
    const base = baseProviderId(id);
    const model = extractModelId(id);
    return !isModelQuarantined(base, model);
  });
  const candidates = unquarantined.length > 0 ? unquarantined : rawCandidates;

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

  const attemptedCandidates = new Set<string>();
  const MAX_OVERALL_DISPATCHES = 12; // Safety ceiling against runaway loops
  let totalDispatches = 0;
  let candidateAttempts = 0;

  for (let index = 0; index < candidates.length; index++) {
    if (totalDispatches >= MAX_OVERALL_DISPATCHES) {
      break;
    }
    const candidateId = candidates[index];
    const baseId = baseProviderId(candidateId);
    const modelId = extractModelId(candidateId);
    const candidateKey = `${baseId}::${modelId}`;

    // Loop prevention: skip candidate if already attempted in this operation
    if (attemptedCandidates.has(candidateKey)) {
      continue;
    }

    // Distinct candidate budget check: prevents trying more candidates than maxCandidatesToTry
    if (++candidateAttempts > maxCandidatesToTry) {
      break;
    }
    attemptedCandidates.add(candidateKey);

    let attempt = 0;

    while (attempt <= maxRetriesPerProvider) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (++totalDispatches > MAX_OVERALL_DISPATCHES) {
        break;
      }

      onEvent?.({ type: "attempt", providerId: candidateId, attempt: attempt + 1 });

      try {
        const value = await task(candidateId);
        clearCooldown(candidateId);
        onEvent?.({
          type: "success",
          providerId: candidateId,
          userMessage: candidateId !== options.candidates[0] ? `✓ Backup model connected (${nameOf(candidateId)})` : undefined,
        });

        failoverAuditLog.push({
          timestamp: new Date().toISOString(),
          operationId,
          stageId,
          providerId: baseId,
          modelId,
          failureKind: "none",
          retryable: false,
          failoverWorthwhile: false,
          quarantined: false,
          attemptNumber: totalDispatches,
          finalOutcome: "success",
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
            : raw && typeof raw === "object" && "classified" in raw && (raw as any).classified
            ? (raw as any).classified
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

        // Auth errors (401/403) and decommissioned models: do NOT retry same candidate
        const isAuthFailure = classified.kind === "invalid_key";
        const isModelFailure = classified.kind === "model_not_found";

        if (isModelFailure) {
          quarantineModel(baseId, modelId, classified.message);
        }

        const canRetrySame = !isAuthFailure && !isModelFailure && classified.retryable && attempt < maxRetriesPerProvider;

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

        // Find next viable candidate not yet attempted
        let nextIndex = index + 1;
        while (nextIndex < candidates.length && attemptedCandidates.has(`${baseProviderId(candidates[nextIndex])}::${extractModelId(candidates[nextIndex])}`)) {
          nextIndex++;
        }
        const next = candidates[nextIndex];

        failoverAuditLog.push({
          timestamp: new Date().toISOString(),
          operationId,
          stageId,
          providerId: baseId,
          modelId,
          failureKind: classified.kind,
          httpStatus: classified.status,
          providerErrorCode: classified.providerErrorCode,
          providerMessage: classified.providerMessage,
          retryable: canRetrySame,
          failoverWorthwhile: classified.failoverWorthwhile,
          quarantined: isModelFailure,
          nextCandidate: next,
          attemptNumber: totalDispatches,
          finalOutcome: next ? "switched" : classified.failoverWorthwhile ? "exhausted" : "terminal_error",
        });

        if (!classified.failoverWorthwhile && !isModelFailure) {
          onEvent?.({ type: "exhausted", providerId: candidateId, error: classified });
          return { ok: false, error: classified, attempts };
        }

        if (next) {
          const isPrimary = index === 0;
          const reasonText = formatFailoverReason(classified);
          const prefix = isPrimary ? "Primary AI model" : "Backup AI model";
          onEvent?.({
            type: "switch",
            providerId: next,
            error: classified,
            userMessage: `${prefix} unavailable: ${nameOf(candidateId)} (${reasonText}). Automatically switching to backup model (${nameOf(next)})…`,
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
          message:
            worst.error.message && worst.error.message.includes("AI generation is temporarily unavailable")
              ? worst.error.message
              : `AI generation is temporarily unavailable (${worst.error.message || "all candidates exhausted"}). Your research data is safe. Retry when a provider becomes available.`,
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
