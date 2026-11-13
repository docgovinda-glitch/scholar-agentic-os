import { describe, it, expect, vi, beforeEach } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("../../originalFetch", () => ({ originalFetch: fetchMock }));
vi.mock("../../../services/supabaseClient", () => ({ isSupabaseConfigured: () => false, getSupabaseClient: () => ({}) }));
vi.mock("../../../services/useAiConfig", () => ({ getClientAiRuntimeConfig: async () => ({ isConfigured: false }) }));
vi.mock("../../ai/keyring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ai/keyring")>()),
  buildKeyring: async () => [{ provider: "anthropic", model: "m1", apiKey: "k-test" }],
}));

import { authedFetch } from "../client";

const sentHeaders = () => (fetchMock.mock.calls.at(-1)?.[1]?.headers ?? {}) as Record<string, string>;

describe("authedFetch: the AI keyring travels only with AI requests", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}"));
  });

  it("attaches x-ai-keyring to an AI route", async () => {
    await authedFetch("/api/projects/p1/thesis/viva-simulate", { method: "POST" });
    const header = sentHeaders()["x-ai-keyring"];
    expect(header).toBeTruthy();
    const decoded = JSON.parse(atob(header.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decoded).toEqual([{ provider: "anthropic", model: "m1", apiKey: "k-test" }]);
  });

  it("never attaches it to other API calls", async () => {
    await authedFetch("/api/projects/p1/document");
    expect(sentHeaders()["x-ai-keyring"]).toBeUndefined();
  });

  it("sanitizes non-ISO-8859-1 characters (such as em-dash or bullets) from headers so window.fetch never throws", async () => {
    await authedFetch("/api/ai/agent", {
      method: "POST",
      headers: {
        "x-test-note": "gemini-2.5-flash — unverified \u200B•",
      },
    });
    const headers = sentHeaders();
    expect(headers["x-test-note"]).toBe("gemini-2.5-flash  unverified");
    for (const val of Object.values(headers)) {
      for (let i = 0; i < val.length; i++) {
        expect(val.charCodeAt(i)).toBeLessThanOrEqual(126);
      }
    }
  });
});
