import type { Failure, FailureKind } from "./types";

/** Errors adapters throw carry status/headers; anything else is classified by shape. */
export class ProviderHttpError extends Error {
  constructor(public status: number, message: string, public headers: Record<string, string> = {}, public code?: string) {
    super(message);
  }
}

/** The stream ended cleanly but carried no text and no tool call. */
export class EmptyOutputError extends Error {
  constructor(public finishReason: string) {
    super(finishReason === "length"
      ? "The model used its whole output limit before writing an answer (reasoning models spend part of it thinking)."
      : "The model returned an empty answer.");
  }
}

export class TimeoutError extends Error {
  constructor(public phase: "first_token" | "idle", ms: number) {
    super(`No ${phase === "first_token" ? "first token" : "new tokens"} for ${Math.round(ms / 1000)}s`);
  }
}

const CREDIT_EXHAUSTED = /quota|billing|insufficient|credit balance|out of credits?|no credits?|payment required|balance (is )?(too low|exhausted)|exceeded your current|resource.?exhausted|spend(ing)? limit|usage limit/i;
const RATE_WINDOW = /per.?minute|per.?day|per.?hour|PerMinute|PerDay|free.?tier|requests per|tokens per|rate.?limit|retry (?:in|after)|retryDelay|\bRPM\b|\bTPM\b|\bRPD\b/i;

/** "Please retry in 41.9s" / "retryDelay": "41s" -> ms. */
function retryAfterFromMessage(msg: string): number | undefined {
  const m = msg.match(/retry(?:\s+in|Delay"?\s*[:=]\s*"?)\s*(\d+(?:\.\d+)?)\s*s/i);
  return m ? Math.round(parseFloat(m[1]) * 1000) : undefined;
}
const MODEL_UNAVAILABLE = /model.{0,60}(not found|does not exist|not available|not supported|deprecated|decommissioned|no longer|retired|invalid)|(unknown|invalid|unsupported) model/i;

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
  if (err instanceof EmptyOutputError) return f("empty_output", err.message, false, true);
  if (err instanceof ProviderHttpError) {
    const s = err.status;
    const msg = err.message.slice(0, 300);
    const code = String(err.code ?? "").toLowerCase();
    if (code.includes("context") || /context.{0,20}(length|window)|too many tokens|maximum context/i.test(msg))
      return f("context_overflow", msg, false, true, { httpStatus: s });
    // A per-minute / per-day / free-tier request limit is a rate limit on this model, not spent credit,
    // even when the provider words it "You exceeded your current quota" (Gemini free tier).
    if (s === 429 && RATE_WINDOW.test(`${err.message} ${code}`) && !/insufficient_quota|credit balance|payment required|out of credits?|billing (?:account )?(?:disabled|not enabled)/i.test(`${err.message} ${code}`)) {
      return f("rate_limit", msg, true, true, { httpStatus: s, retryAfterMs: retryAfterMs(err.headers) ?? retryAfterFromMessage(err.message) });
    }
    // Spent credit shows up differently per provider: 402 (OpenRouter, DeepSeek), 429 insufficient_quota
    // (OpenAI), 400 "credit balance is too low" (Anthropic), 403 billing/quota (Google). All mean "use the next AI".
    if (s === 402 || (s !== 401 && s < 500 && CREDIT_EXHAUSTED.test(`${msg} ${code}`))) return f("quota", msg, false, true, { httpStatus: s });
    if (s === 429) return f("rate_limit", msg, true, true, { httpStatus: s, retryAfterMs: retryAfterMs(err.headers) });
    if (s === 401 || s === 403) return f("auth", msg, false, true, { httpStatus: s });
    if (s === 529 || s === 503) return f("overloaded", msg, true, true, { httpStatus: s, retryAfterMs: retryAfterMs(err.headers) });
    if (s >= 500) return f("server", msg, true, true, { httpStatus: s });
    if (/content.?(filter|policy)|safety/i.test(msg + code)) return f("content_filter", msg, false, false, { httpStatus: s });
    // A retired or unavailable model on this key is that provider's problem, not the prompt's: try the next one.
    if (s === 404 || ((s === 400 || s === 410) && MODEL_UNAVAILABLE.test(`${msg} ${code}`)) || s === 410) return f("model_unavailable", msg, false, true, { httpStatus: s });
    return f("invalid_request", msg, false, false, { httpStatus: s });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return f("network", msg.slice(0, 300), true, true);
}

/** Failures that should count against a provider's circuit. */
export const countsAgainstProvider = (k: FailureKind) =>
  k === "rate_limit" || k === "quota" || k === "auth" || k === "server" || k === "overloaded" || k === "timeout_first_token" || k === "timeout_idle" || k === "network";
