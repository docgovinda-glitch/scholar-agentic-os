import { describe, it, expect, vi, afterEach } from "vitest";
import { clientVerifyProviderKey } from "../clientProviderVerifier";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("clientVerifyProviderKey", () => {
  it("rejects unknown provider ids", async () => {
    const res = await clientVerifyProviderKey("not-a-real-provider", "x");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Unknown provider");
  });

  it("reports ok:true with models count when live fetch succeeds", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
    } as Response);

    const res = await clientVerifyProviderKey("openai", "sk-real-looking-key");
    expect(res.ok).toBe(true);
    expect(res.modelsDetected).toBe(2);
  });

  it("reports ok:false when provider explicitly rejects key (401/403)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    const res = await clientVerifyProviderKey("openai", "sk-bad-key");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("rejected by the provider");
  });

  it("gracefully falls back to deferred verification when CORS blocks direct fetch", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch (CORS blocked)"));

    const res = await clientVerifyProviderKey("openai", "sk-test");
    expect(res.ok).toBe(true);
    expect(res.deferred).toBe(true);
    expect(res.note).toContain("Direct browser verification is unavailable");
  });

  it("formats Gemini URL query param key= properly", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      capturedUrl = url.toString();
      return Promise.resolve({ ok: true, json: async () => ({ models: [{ name: "gemini-2.5-flash" }] }) } as Response);
    }) as unknown as typeof fetch;

    const res = await clientVerifyProviderKey("gemini", "AIzaTestKey");
    expect(res.ok).toBe(true);
    expect(capturedUrl).toContain("key=AIzaTestKey");
  });
});
