/**
 * AI error classification.
 *
 * Why this exists (2026-07-31): every provider health check in aiGateway.ts
 * used to do this —
 *
 *     const resp = await fetch("/api/generate", {...});
 *     const data = await resp.json();
 *     if (data.text?.includes("OK")) return { status: "online" };
 *     return { status: "degraded", error: "Unexpected response" };
 *
 * — with no `resp.ok` check anywhere. A 401 from a mistyped key, a 429 from a
 * spent quota, and a 400 for an unsupported provider were all flattened into
 * the same useless "degraded — Unexpected response", and the real error text
 * was discarded. Users had no way to tell "your key is wrong" from "you are
 * rate limited" from "this provider is down", which is a large part of why
 * AI setup felt like it "just doesn't connect".
 *
 * This module turns a failed request into a specific, actionable diagnosis,
 * and — because the same information decides whether retrying is pointless —
 * it is also what the failover layer (providerFailover.ts) keys off.
 */

export type AIErrorKind =
  | "invalid_key"
  | "insufficient_quota"
  | "rate_limit"
  | "server_error"
  | "timeout"
  | "cors_blocked"
  | "network_unreachable"
  /**
   * This app's own server is still booting. Distinct from
   * `network_unreachable` because the remedy is completely different: nothing
   * is misconfigured and nothing needs checking, the user just has to wait a
   * moment. See src/services/serverWarmup.ts.
   */
  | "server_waking"
  | "bad_request"
  | "model_not_found"
  | "unsupported_provider"
  | "unknown";

export interface ClassifiedAIError {
  kind: AIErrorKind;
  /** Short label for a status pill, e.g. "Rate limit exceeded" */
  label: string;
  /** Plain-language explanation the user can act on */
  message: string;
  /** The concrete next step, or null when there is nothing the user can do */
  remedy: string | null;
  /** HTTP status when the request reached a server at all */
  status?: number;
  /** Raw provider error text, preserved for the diagnostics log */
  detail?: string;
  /** Worth trying the SAME provider again shortly? */
  retryable: boolean;
  /**
   * Worth trying a DIFFERENT provider instead? False for problems that are
   * about the request rather than the provider (a malformed prompt fails
   * everywhere, so failing over just burns quota on every key in turn).
   */
  failoverWorthwhile: boolean;
  /** From a Retry-After header when present, in milliseconds */
  retryAfterMs?: number;
}

const KIND_LABELS: Record<AIErrorKind, string> = {
  invalid_key: "Invalid API key",
  insufficient_quota: "Quota exhausted",
  rate_limit: "Rate limit exceeded",
  server_error: "Provider server error",
  timeout: "Request timed out",
  cors_blocked: "Blocked by the browser (CORS)",
  network_unreachable: "Could not reach the service",
  server_waking: "Server is starting up",
  bad_request: "Request rejected",
  model_not_found: "Model not available",
  unsupported_provider: "Provider not supported",
  unknown: "Unexpected error",
};

/** Parses a Retry-After header, which may be seconds or an HTTP date. */
export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(headerValue);
  if (!Number.isNaN(date)) {
    const delta = date - Date.now();
    return delta > 0 ? delta : 0;
  }
  return undefined;
}

/**
 * Classify a response that actually reached a server.
 *
 * `body` is the raw response text — several providers return 429 for both
 * "too many requests per minute" (retry shortly, same key is fine) and
 * "you are out of credit" (retrying will never help), and the only way to
 * tell them apart is the message text, so we inspect it.
 */
export function classifyHttpError(
  status: number,
  body: string,
  headers?: Headers | null
): ClassifiedAIError {
  const detail = (body || "").slice(0, 800);
  const lower = detail.toLowerCase();
  const retryAfterMs = parseRetryAfter(headers?.get("retry-after"));

  const base = { status, detail, retryAfterMs };

  if (status === 401 || status === 403) {
    return {
      ...base,
      kind: "invalid_key",
      label: KIND_LABELS.invalid_key,
      message:
        "The provider rejected this API key. It may be mistyped, revoked, or issued for a different product.",
      remedy: "Open the provider's dashboard, generate a fresh key, and paste it in again.",
      retryable: false,
      failoverWorthwhile: true,
    };
  }

  if (status === 402 || lower.includes("insufficient_quota") || lower.includes("insufficient credit") ||
      lower.includes("exceeded your current quota") || lower.includes("billing")) {
    return {
      ...base,
      kind: "insufficient_quota",
      label: KIND_LABELS.insufficient_quota,
      message: "This account has no remaining credit or quota with the provider.",
      remedy: "Add credit with the provider, or switch to another provider in your vault.",
      retryable: false,
      failoverWorthwhile: true,
    };
  }

  if (status === 429) {
    return {
      ...base,
      kind: "rate_limit",
      label: KIND_LABELS.rate_limit,
      message: retryAfterMs
        ? `Too many requests — the provider asked to wait about ${Math.ceil(retryAfterMs / 1000)}s.`
        : "Too many requests in a short window. This usually clears on its own within a minute.",
      remedy: "Nothing to fix — another saved provider will be used automatically in the meantime.",
      retryable: true,
      failoverWorthwhile: true,
    };
  }

  if (status === 404 || lower.includes("model_not_found") || lower.includes("does not exist") ||
      lower.includes("unknown model")) {
    return {
      ...base,
      kind: "model_not_found",
      label: KIND_LABELS.model_not_found,
      message:
        "The selected AI model is currently unavailable on this account. Providers update, rename, and retire models regularly.",
      remedy: "The system will automatically try backup models. You can also run AI Diagnostics in settings to refresh models.",
      retryable: false,
      failoverWorthwhile: true,
    };
  }

  if (lower.includes("unsupported provider")) {
    return {
      ...base,
      kind: "unsupported_provider",
      label: KIND_LABELS.unsupported_provider,
      message: "This app sent the request to a provider its server does not know how to handle.",
      remedy: "This is an application bug — please report which provider you selected.",
      retryable: false,
      failoverWorthwhile: true,
    };
  }

  if (status >= 500) {
    return {
      ...base,
      kind: "server_error",
      label: KIND_LABELS.server_error,
      message: "The provider's own servers returned an error. This is on their side, not yours.",
      remedy: "Nothing to fix — another saved provider will be used automatically.",
      retryable: true,
      failoverWorthwhile: true,
    };
  }

  if (status >= 400) {
    const isCapabilityMismatch =
      /unsupported|not supported|unknown field|parameter|response_format|json_schema|system prompt|feature not enabled/i.test(
        detail || ""
      );

    return {
      ...base,
      kind: "bad_request",
      label: isCapabilityMismatch ? "Provider capability mismatch" : KIND_LABELS.bad_request,
      message: isCapabilityMismatch
        ? `The provider does not support a parameter or capability required for this task.`
        : `The provider rejected the request (status ${status}).`,
      remedy: detail ? "See the provider's message in the diagnostics log below." : null,
      retryable: false,
      failoverWorthwhile: isCapabilityMismatch,
    };
  }

  return {
    ...base,
    kind: "unknown",
    label: KIND_LABELS.unknown,
    message: `Unexpected response (status ${status}).`,
    remedy: null,
    retryable: false,
    failoverWorthwhile: true,
  };
}

/**
 * Classify an exception thrown before any response arrived.
 *
 * A CORS rejection and a genuinely unreachable server are deliberately
 * indistinguishable to JavaScript — both surface as `TypeError: Failed to
 * fetch` (Chromium) or `TypeError: Load failed` (WebKit). Rather than guess,
 * callers that need certainty should follow up with probeReachability()
 * below, which CAN tell them apart.
 */
export function classifyThrownError(error: unknown, opts?: { url?: string }): ClassifiedAIError {
  const err = error as { name?: string; message?: string } | undefined;
  const name = err?.name || "";
  const message = err?.message || String(error ?? "");

  if (name === "AbortError" || name === "TimeoutError" || /timed?\s?out/i.test(message)) {
    return {
      kind: "timeout",
      label: KIND_LABELS.timeout,
      message: "The request took too long and was cancelled.",
      remedy: "Try again — if it keeps happening the provider is likely overloaded.",
      detail: message,
      retryable: true,
      failoverWorthwhile: true,
    };
  }

  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (isOffline) {
    return {
      kind: "network_unreachable",
      label: KIND_LABELS.network_unreachable,
      message: "This device appears to be offline.",
      remedy: "Reconnect to the internet, or switch to Local AI which works without a connection.",
      detail: message,
      retryable: true,
      failoverWorthwhile: false,
    };
  }

  const isLocalTarget = !!opts?.url && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(opts.url);
  return {
    kind: "network_unreachable",
    label: KIND_LABELS.network_unreachable,
    message: isLocalTarget
      ? "Could not reach the local AI program. Either it is not running, or it is refusing requests from this page."
      : "Could not reach the provider. The browser blocked the request or the service is unreachable.",
    remedy: isLocalTarget
      ? "Check the program is running, then run the connection test for the exact cause."
      : "Check your connection; if it persists the provider may be down.",
    detail: message,
    retryable: true,
    failoverWorthwhile: true,
  };
}

/**
 * The classified form of "this app's own server is still waking up" — the
 * normal consequence of Render's free plan idling the instance out, not a
 * fault. See src/services/serverWarmup.ts.
 *
 * `retryable` is true and `failoverWorthwhile` is false, and that combination
 * is the entire reason this kind exists. Every cloud provider reaches its API
 * through the same /api/generate proxy on the same instance, so while that
 * instance is booting, the next provider in the failover chain cannot succeed
 * either — walking the chain would multiply one unavoidable wait by the number
 * of configured providers, and end by blaming whichever provider happened to
 * be last. Retrying the same provider, by contrast, is exactly right: the
 * container is on its way up.
 */
export function serverWakingError(detail?: string): ClassifiedAIError {
  return {
    kind: "server_waking",
    label: KIND_LABELS.server_waking,
    message:
      "The server had gone to sleep and is starting back up. This happens after a spell of inactivity and usually takes under a minute.",
    remedy: "Give it a few seconds and try again — nothing needs changing in your settings.",
    detail,
    retryable: true,
    failoverWorthwhile: false,
  };
}

/**
 * Tell a CORS rejection apart from an unreachable server — the one case where
 * the distinction IS recoverable.
 *
 * A `no-cors` request is never blocked for cross-origin policy reasons: the
 * browser sends it and hands back an opaque response whose body we cannot
 * read. So if the normal request failed but the no-cors probe resolves, the
 * server is definitively up and reachable, and the only thing that stopped us
 * was its missing Access-Control-Allow-Origin header. If the probe also
 * throws, nothing is listening.
 *
 * This turns the single most confusing local-AI failure ("it's running, why
 * won't it connect?") into a precise instruction.
 */
export async function probeReachability(
  url: string,
  timeoutMs = 3000
): Promise<"cors_blocked" | "unreachable"> {
  try {
    await fetch(url, {
      mode: "no-cors",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return "cors_blocked";
  } catch {
    return "unreachable";
  }
}

/** Upgrade a generic network failure into a precise CORS diagnosis when possible. */
export async function refineNetworkError(
  error: ClassifiedAIError,
  url: string,
  corsGuidance?: string
): Promise<ClassifiedAIError> {
  if (error.kind !== "network_unreachable") return error;

  const verdict = await probeReachability(url);
  if (verdict === "unreachable") return error;

  return {
    ...error,
    kind: "cors_blocked",
    label: KIND_LABELS.cors_blocked,
    message:
      "The service is running and reachable, but it refused this page's request because it does not allow requests from other web addresses.",
    remedy:
      corsGuidance ||
      "Enable cross-origin requests (CORS) in the service's settings, then run the test again.",
    retryable: false,
    // The same browser policy will block every other endpoint on that host,
    // but a different provider entirely may still work.
    failoverWorthwhile: true,
  };
}

/**
 * Read an error out of a failed Response, classifying it. Consumes the body,
 * so callers must not have read it already.
 */
export async function classifyResponse(response: Response): Promise<ClassifiedAIError> {
  const body = await response.text().catch(() => "");
  return classifyHttpError(response.status, body, response.headers);
}

/** A one-line summary suitable for a log entry or a toast. */
export function formatAIError(error: ClassifiedAIError): string {
  return error.remedy ? `${error.label}: ${error.message} ${error.remedy}` : `${error.label}: ${error.message}`;
}
