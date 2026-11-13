import type { Failure, FailureKind } from "./types";

/** Errors adapters throw carry status/headers; anything else is classified by shape. */
export class ProviderHttpError extends Error {
  constructor(public status: number, message: string, public headers: Record<string, string> = {}, public code?: string) {
    super(message);
  }
}

export class TimeoutError extends Error {
  constructor(public phase: "first_token" | "idle", ms: number) {
    super(`No ${phase === "first_token" ? "first token" : "new tokens"} for ${Math.round(ms / 1000)}s`);
  }
}

function retryAfterMs(h: Record<string, string>): number | undefined {
  const v = h["retry-after-ms"] ?? h["retry-after"];
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n)) return h["retry-after-ms"] ? n : n * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

const f = (kind: FailureKind, message: string, retryable: boolean, fallbackWorthy: boolean, extra: Partial<Failure> = {}): Failure =>
  ({ kind, message, retryable, fallbackWorthy, ...extra });

export function classify(err: unknown, signal: AbortSignal): Failure {
  if (signal.aborted) return f("aborted", "Cancelled", false, false);
  if (err instanceof TimeoutError) return f(err.phase === "first_token" ? "timeout_first_token" : "timeout_idle", err.message, err.phase === "first_token", true);
  if (err instanceof ProviderHttpError) {
    const s = err.status;
    const msg = err.message.slice(0, 300);
    const code = (err.code ?? "").toLowerCase();
    if (code.includes("context") || /context.{0,20}(length|window)|too many tokens|maximum context/i.test(msg))
      return f("context_overflow", msg, false, true, { httpStatus: s });
    // Out of credits or quota: no amount of retrying helps, so move to the next key or provider at once.
    if (s === 402 || ((s === 429 || s === 403) && /quota|billing|insufficient|exhausted|credit|limit.{0,10}reached/i.test(msg + code)))
      return f("quota", msg, false, true, { httpStatus: s });
    if (s === 429) return f("rate_limit", msg, true, true, { httpStatus: s, retryAfterMs: retryAfterMs(err.headers) });
    if (s === 401 || s === 403) return f("auth", msg, false, true, { httpStatus: s });
    if (s === 529 || s === 503) return f("overloaded", msg, true, true, { httpStatus: s, retryAfterMs: retryAfterMs(err.headers) });
    if (s >= 500) return f("server", msg, true, true, { httpStatus: s });
    if (/content.?(filter|policy)|safety/i.test(msg + code)) return f("content_filter", msg, false, false, { httpStatus: s });
    return f("invalid_request", msg, false, false, { httpStatus: s });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return f("network", msg.slice(0, 300), true, true);
}

/** Failures that should count against a provider's circuit. */
export const countsAgainstProvider = (k: FailureKind) =>
  k === "rate_limit" || k === "server" || k === "overloaded" || k === "timeout_first_token" || k === "timeout_idle" || k === "network";
