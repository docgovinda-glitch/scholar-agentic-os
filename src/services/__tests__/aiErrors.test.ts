// @vitest-environment jsdom

/**
 * Error classification tests.
 *
 * These target the specific failure the classification exists to fix: the old
 * health checks reported a 401 (wrong key), a 429 (rate limited) and a 400
 * (unknown model) all as the same "degraded — Unexpected response", so users
 * had no way to know which of three completely different actions to take.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  classifyHttpError,
  classifyThrownError,
  parseRetryAfter,
  probeReachability,
  refineNetworkError,
  formatAIError,
} from "../aiErrors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyHttpError — distinguishes causes that need different actions", () => {
  it("treats 401 as an invalid key that must NOT be retried", () => {
    const result = classifyHttpError(401, "Incorrect API key provided");

    expect(result.kind).toBe("invalid_key");
    // Retrying a rejected key just burns requests — it will never start working.
    expect(result.retryable).toBe(false);
    expect(result.remedy).toMatch(/generate a fresh key/i);
  });

  it("treats 403 the same as 401", () => {
    expect(classifyHttpError(403, "Forbidden").kind).toBe("invalid_key");
  });

  it("treats 429 as a rate limit that IS retryable", () => {
    const result = classifyHttpError(429, "Rate limit reached");

    expect(result.kind).toBe("rate_limit");
    expect(result.retryable).toBe(true);
    expect(result.failoverWorthwhile).toBe(true);
  });

  it("separates an exhausted quota from a rate limit, since only one clears on its own", () => {
    // Both commonly arrive as 429; only the message text tells them apart, and
    // waiting for a spent quota to recover never works.
    const result = classifyHttpError(429, "You exceeded your current quota, please check your billing");

    expect(result.kind).toBe("insufficient_quota");
    expect(result.retryable).toBe(false);
  });

  it("treats 402 as an exhausted quota", () => {
    expect(classifyHttpError(402, "Payment required").kind).toBe("insufficient_quota");
  });

  it("identifies an unknown model and points at model refresh, not at the key", () => {
    const result = classifyHttpError(404, "The model `gpt-5-turbo` does not exist");

    expect(result.kind).toBe("model_not_found");
    expect(result.remedy).toMatch(/refresh models/i);
  });

  it("recognises the server's own unsupported-provider error as an app bug", () => {
    // This is precisely the response Qwen used to produce from /api/generate.
    const result = classifyHttpError(400, "Unsupported provider: qwen");

    expect(result.kind).toBe("unsupported_provider");
    expect(result.remedy).toMatch(/application bug/i);
  });

  it("marks a malformed request as not worth failing over", () => {
    // A bad request fails identically on every provider, so trying the whole
    // chain would waste one attempt per saved key for no possible benefit.
    const result = classifyHttpError(400, "messages: field required");

    expect(result.kind).toBe("bad_request");
    expect(result.failoverWorthwhile).toBe(false);
  });

  it("treats 5xx as the provider's problem, retryable and worth failing over", () => {
    const result = classifyHttpError(503, "upstream unavailable");

    expect(result.kind).toBe("server_error");
    expect(result.retryable).toBe(true);
    expect(result.failoverWorthwhile).toBe(true);
  });

  it("keeps the provider's own message for the diagnostics log", () => {
    expect(classifyHttpError(400, "temperature must be <= 2").detail).toContain("temperature must be");
  });

  it("truncates a huge error body so one bad response cannot bloat stored state", () => {
    expect(classifyHttpError(500, "x".repeat(5000)).detail!.length).toBeLessThanOrEqual(800);
  });
});

describe("parseRetryAfter", () => {
  it("reads a seconds value", () => {
    expect(parseRetryAfter("30")).toBe(30_000);
  });

  it("reads an HTTP date", () => {
    const future = new Date(Date.now() + 45_000).toUTCString();
    const parsed = parseRetryAfter(future)!;
    expect(parsed).toBeGreaterThan(30_000);
    expect(parsed).toBeLessThanOrEqual(46_000);
  });

  it("never returns a negative wait for a date already in the past", () => {
    expect(parseRetryAfter(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });

  it("returns undefined when the header is absent or nonsense", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });

  it("is picked up from a real Headers object on a 429", () => {
    const headers = new Headers({ "retry-after": "12" });
    expect(classifyHttpError(429, "slow down", headers).retryAfterMs).toBe(12_000);
  });
});

describe("classifyThrownError — failures with no response", () => {
  it("recognises a timeout", () => {
    const abort = Object.assign(new Error("The operation timed out"), { name: "TimeoutError" });
    const result = classifyThrownError(abort);

    expect(result.kind).toBe("timeout");
    expect(result.retryable).toBe(true);
  });

  it("reports being offline and does not suggest another cloud provider", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const result = classifyThrownError(new TypeError("Failed to fetch"));

    expect(result.kind).toBe("network_unreachable");
    // Every cloud provider is equally unreachable with no connection.
    expect(result.failoverWorthwhile).toBe(false);
    expect(result.remedy).toMatch(/local ai/i);
  });

  it("gives local-specific advice when the target was localhost", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const result = classifyThrownError(new TypeError("Failed to fetch"), {
      url: "http://localhost:11434/api/tags",
    });

    expect(result.message).toMatch(/local ai program/i);
  });
});

describe("probeReachability — the one way to prove a CORS block", () => {
  it("reports cors_blocked when a no-cors request succeeds", async () => {
    // A no-cors request is never rejected for cross-origin policy reasons, so
    // it resolving proves the server is up and only the CORS header was missing.
    // An opaque response is what a real no-cors request resolves to; its body
    // is unreadable, and probeReachability only cares that it resolved at all.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "opaque", ok: false }));

    expect(await probeReachability("http://localhost:11434/api/tags")).toBe("cors_blocked");
  });

  it("reports unreachable when even the no-cors request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    expect(await probeReachability("http://localhost:11434/api/tags")).toBe("unreachable");
  });
});

describe("refineNetworkError", () => {
  it("upgrades a vague network failure into a CORS diagnosis with the runner's own fix", async () => {
    // An opaque response is what a real no-cors request resolves to; its body
    // is unreadable, and probeReachability only cares that it resolved at all.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "opaque", ok: false }));
    const vague = classifyThrownError(new TypeError("Failed to fetch"), {
      url: "http://localhost:11434/api/tags",
    });

    const refined = await refineNetworkError(vague, "http://localhost:11434/api/tags", "Set OLLAMA_ORIGINS=*");

    expect(refined.kind).toBe("cors_blocked");
    expect(refined.remedy).toBe("Set OLLAMA_ORIGINS=*");
  });

  it("leaves the error alone when nothing is actually listening", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const vague = classifyThrownError(new TypeError("Failed to fetch"), {
      url: "http://localhost:11434/api/tags",
    });

    expect((await refineNetworkError(vague, "http://localhost:11434/api/tags")).kind).toBe(
      "network_unreachable"
    );
  });

  it("does not probe an error that was never a network failure", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const authError = classifyHttpError(401, "bad key");
    expect((await refineNetworkError(authError, "https://api.openai.com/v1")).kind).toBe("invalid_key");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("formatAIError", () => {
  it("includes the remedy when there is one", () => {
    expect(formatAIError(classifyHttpError(401, "nope"))).toMatch(/generate a fresh key/i);
  });
});
