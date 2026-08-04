// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// resolveProviderKey() reads the vault first and otherwise treats the
// settings field as ciphertext, so a plaintext key in AISettings resolves to
// "". With an empty key the old code skipped its Google branch anyway, which
// would make these assertions pass no matter what — the vault has to supply
// the key for the test to exercise the path that was broken.
vi.mock("../apiVault", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../apiVault")>();
  return {
    ...actual,
    getApiKey: (providerId: string) => (providerId === "gemini" ? "AIza-test-key" : ""),
    getEntry: () => undefined,
    isVaultUnlocked: () => true,
  };
});

import AIGateway from "../aiGateway";
import type { AISettings } from "../../types";

/**
 * Gemini used to be special-cased into a direct browser fetch of
 * generativelanguage.googleapis.com. That branch carried no AbortSignal while
 * every other provider goes through /api/generate with
 * AbortSignal.timeout(...), so a stalled Gemini request never settled and the
 * setup wizard's "Test connection" spinner ran forever with no verdict.
 *
 * It also placed the API key in a URL query string sent from the page, which
 * leaks it into browser history and anything that logs URLs.
 *
 * These tests pin both properties: Gemini goes through the proxy, and the key
 * never appears in a request URL.
 */
describe("Gemini routes through the server proxy", () => {
  const originalFetch = global.fetch;
  const settings: AISettings = { provider: "gemini" } as AISettings;

  // Guards the mock above: if the vault stops supplying a key these tests go
  // green for the wrong reason, so assert the key really reaches the proxy.
  it("resolves the vault key (otherwise the rest of this suite proves nothing)", async () => {
    await AIGateway.getAdapter("gemini")!.generate(
      { systemInstruction: "sys", prompt: "hello", temperature: 0, taskType: "connection-test" },
      settings
    );
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const call = mock.mock.calls.find((c) => String(c[0]) === "/api/generate");
    expect(JSON.parse((call![1] as RequestInit).body as string).apiKey).toBe("AIza-test-key");
  });

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "OK" }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function requestUrls(): string[] {
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    return mock.mock.calls.map((c) => String(c[0]));
  }

  it("posts to /api/generate rather than fetching Google directly", async () => {
    await AIGateway.getAdapter("gemini")!.generate(
      { systemInstruction: "sys", prompt: "hello", temperature: 0, taskType: "connection-test" },
      settings
    );

    expect(requestUrls()).toContain("/api/generate");
    expect(requestUrls().some((u) => u.includes("generativelanguage.googleapis.com"))).toBe(false);
  });

  it("never puts the API key in a request URL", async () => {
    await AIGateway.getAdapter("gemini")!.generate(
      { systemInstruction: "sys", prompt: "hello", temperature: 0, taskType: "connection-test" },
      settings
    );

    for (const url of requestUrls()) {
      expect(url).not.toContain("AIza-test-key");
      expect(url).not.toContain("key=");
    }
  });

  it("sends the request with an abort signal so a stalled call cannot hang forever", async () => {
    await AIGateway.getAdapter("gemini")!.generate(
      { systemInstruction: "sys", prompt: "hello", temperature: 0, taskType: "connection-test" },
      settings
    );

    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    const call = mock.mock.calls.find((c) => String(c[0]) === "/api/generate");
    expect(call).toBeDefined();
    expect((call![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});
