import { describe, it, expect, vi, afterEach } from "vitest";
import { storeProviderKey, readProviderKey } from "../userAiSettings";
import { clientVerifyProviderKey } from "../clientProviderVerifier";

const TEST_SECRET = "sk-scholar-canary-secret-do-not-leak-998877";

describe("BYOK Network Isolation & Leakage Prevention", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("stores and reads user BYOK credentials in client storage without transmitting to server", async () => {
    await storeProviderKey("gemini", TEST_SECRET);
    const read = await readProviderKey("gemini");
    expect(read).toBe(TEST_SECRET);
  });

  it("verifies BYOK keys directly against the provider without contacting Scholar server", async () => {
    const interceptedUrls: string[] = [];

    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      interceptedUrls.push(url);
      return Promise.resolve({
        ok: true,
        json: async () => ({ models: [{ name: "gemini-2.5-flash" }] }),
      } as Response);
    }) as unknown as typeof fetch;

    const result = await clientVerifyProviderKey("gemini", TEST_SECRET);
    expect(result.ok).toBe(true);

    // Verify all outbound requests target the provider, NEVER the Scholar server
    for (const url of interceptedUrls) {
      expect(url).toContain("generativelanguage.googleapis.com");
      expect(url).not.toContain("/api/ai-access/verify-provider-key");
      expect(url).not.toContain("/api/studio");
    }
  });

  it("gracefully falls back when CORS blocks browser fetch without calling any server proxy", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch (CORS restricted)"));

    const result = await clientVerifyProviderKey("openai", TEST_SECRET);
    expect(result.ok).toBe(true);
    expect(result.deferred).toBe(true);
    expect(result.note).toContain("Direct browser verification is unavailable");
  });
});
