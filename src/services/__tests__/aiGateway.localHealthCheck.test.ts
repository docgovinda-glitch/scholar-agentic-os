// Bug fix (2026-08-05): a local runner's healthCheck (Ollama, LM Studio,
// custom, OmniRoute) stored the raw thrown error's `.message` verbatim —
// the one healthCheck path in this file that never went through
// classifyThrownError/classifyResponse, unlike the cloud adapter just above
// it. A browser's own network-error string is not an actionable message:
// Chromium says "Failed to fetch", WebKit says "Load failed" — reported
// live by a user on what "Load failed" implies was Safari, testing exactly
// this path with Ollama not running. These tests pin that the classified,
// actionable message reaches HealthStatus.error instead.

import { describe, it, expect, afterEach, vi } from "vitest";
import AIGateway from "../aiGateway";
import type { AISettings } from "../../types";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe("local runner healthCheck — error classification", () => {
  it("reports an actionable message, not the raw browser error, when the fetch throws (not running / CORS)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Load failed"));

    const result = await AIGateway.healthCheckProvider("ollama", { provider: "ollama" } as AISettings);

    expect(result.status).toBe("offline");
    expect(result.error).not.toBe("Load failed");
    expect(result.error).toMatch(/check the program is running/i);
  });

  it("does the same for Chromium's wording of the identical failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await AIGateway.healthCheckProvider("ollama", { provider: "ollama" } as AISettings);

    expect(result.error).not.toBe("Failed to fetch");
    expect(result.error).toMatch(/check the program is running/i);
  });

  it("classifies a non-OK response rather than a bare status code", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers(),
      text: async () => "",
      json: async () => ({}),
      clone: function () {
        return this;
      },
    } as unknown as Response);

    const result = await AIGateway.healthCheckProvider("ollama", { provider: "ollama" } as AISettings);

    expect(result.status).toBe("offline");
    expect(result.error).toBeTruthy();
    expect(result.error).not.toBe("Status 500");
  });

  it("still reports online with its models on a real success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ models: [{ name: "llama3.1:8b" }] }),
    } as unknown as Response);

    const result = await AIGateway.healthCheckProvider("ollama", { provider: "ollama" } as AISettings);

    expect(result.status).toBe("online");
    expect(result.availableModels).toEqual(["llama3.1:8b"]);
  });
});
