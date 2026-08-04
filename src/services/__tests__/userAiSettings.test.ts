// @vitest-environment jsdom
//
// User-scoped AI configuration.
//
// The behaviour worth pinning here is the storage split, because getting it
// wrong is not a visible bug — it is a quiet one. If a provider key ever
// reaches the server, nothing breaks and no test fails; the key is simply
// somewhere it was promised not to be. So the assertions below are largely
// about what does NOT happen.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const from = vi.fn();
const getUser = vi.fn();
vi.mock("../supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ auth: { getUser }, from }),
}));

const {
  DEFAULT_AI_SETTINGS,
  forgetProviderKey,
  isConfigured,
  loadUserAiSettings,
  providersWithStoredKey,
  readProviderKey,
  saveUserAiSettings,
  storeProviderKey,
  toAISettings,
} = await import("../userAiSettings");

const USER = { id: "11111111-1111-4111-8111-111111111111" };

beforeEach(() => {
  localStorage.clear();
  getUser.mockResolvedValue({ data: { user: USER } });
});

afterEach(() => vi.clearAllMocks());

describe("provider keys stay on the device", () => {
  it("round-trips a key through encrypted local storage", async () => {
    await storeProviderKey("gemini", "sk-secret-value");
    expect(await readProviderKey("gemini")).toBe("sk-secret-value");
  });

  it("never writes the key in plaintext", async () => {
    await storeProviderKey("gemini", "sk-secret-value");

    // Whatever the storage layout, the raw secret must not be findable in it.
    const everything = JSON.stringify(localStorage);
    expect(everything).not.toContain("sk-secret-value");
  });

  it("does not send keys to Supabase", async () => {
    await storeProviderKey("openai", "sk-should-not-be-uploaded");
    // Storing a key must involve no network write at all — that is the whole
    // point of the split.
    expect(from).not.toHaveBeenCalled();
  });

  it("reports which providers have a key on this device", async () => {
    expect(providersWithStoredKey()).toEqual([]);
    await storeProviderKey("gemini", "a");
    await storeProviderKey("openai", "b");
    expect(providersWithStoredKey().sort()).toEqual(["gemini", "openai"]);
  });

  it("forgets a key on request", async () => {
    await storeProviderKey("gemini", "a");
    forgetProviderKey("gemini");
    expect(providersWithStoredKey()).toEqual([]);
    expect(await readProviderKey("gemini")).toBeNull();
  });

  it("returns null, and drops the row, when the ciphertext cannot be decrypted", async () => {
    await storeProviderKey("gemini", "a");
    // Simulate the device secret being cleared while ciphertext survives.
    localStorage.removeItem("scholar-device-secret");

    expect(await readProviderKey("gemini")).toBeNull();
    // Left in place, the UI would keep showing a configured provider whose key
    // silently fails on every request.
    expect(providersWithStoredKey()).toEqual([]);
  });

  it("returns null for a provider that was never configured", async () => {
    expect(await readProviderKey("claude")).toBeNull();
  });
});

describe("synced preferences", () => {
  it("falls back to defaults when the user has no row yet", async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    });

    // A missing row is the normal state before setup, not an error.
    expect(await loadUserAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("reads the stored provider and preferences", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { provider: "openai", preferences: { openaiModel: "gpt-4o" } },
            error: null,
          }),
          }),
      }),
    });

    expect(await loadUserAiSettings()).toEqual({
      provider: "openai",
      preferences: { openaiModel: "gpt-4o" },
    });
  });

  it("upserts against the user's own row", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await saveUserAiSettings({ provider: "openai", preferences: { openaiModel: "gpt-4o" } });

    const [row, opts] = upsert.mock.calls[0];
    expect(row.user_id).toBe(USER.id);
    expect(row.provider).toBe("openai");
    expect(opts).toEqual({ onConflict: "user_id" });
    // The row must carry no secret — RLS scopes it to the user, but the
    // guarantee we are making is stronger than "only you can read it".
    expect(JSON.stringify(row)).not.toMatch(/sk-|apiKey/i);
  });

  it("reports a save failure rather than silently discarding it", async () => {
    from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: "denied" } }) });
    expect(await saveUserAiSettings(DEFAULT_AI_SETTINGS)).toEqual({ success: false, error: "denied" });
  });
});

describe("runtime assembly", () => {
  it("produces the AISettings shape the gateway already understands", async () => {
    await storeProviderKey("gemini", "sk-live");
    const settings = await toAISettings({ provider: "gemini", preferences: { geminiModel: "gemini-2.5-pro" } });

    // Adapters read `<provider>ApiKey`; callers that only know a provider id
    // read `apiKey`. Both are populated so neither has to special-case.
    expect(settings.provider).toBe("gemini");
    expect((settings as Record<string, unknown>).geminiApiKey).toBe("sk-live");
    expect((settings as Record<string, unknown>).apiKey).toBe("sk-live");
    expect((settings as Record<string, unknown>).geminiModel).toBe("gemini-2.5-pro");
  });

  it("omits key fields entirely when no key is stored", async () => {
    const settings = await toAISettings({ provider: "gemini", preferences: {} });
    // An empty-string key would look configured to a truthiness check
    // somewhere downstream; absent is unambiguous.
    expect((settings as Record<string, unknown>).geminiApiKey).toBeUndefined();
    expect((settings as Record<string, unknown>).apiKey).toBeUndefined();
  });
});

describe("isConfigured", () => {
  it("is false for a provider with no key on this device", () => {
    expect(isConfigured({ provider: "gemini", preferences: {} })).toBe(false);
  });

  it("is true once a key is stored", async () => {
    await storeProviderKey("gemini", "sk-live");
    expect(isConfigured({ provider: "gemini", preferences: {} })).toBe(true);
  });

  it("is true for the server provider, which needs no key from the user", () => {
    // This deployment's own credential serves that path.
    expect(isConfigured({ provider: "server", preferences: {} })).toBe(true);
  });
});
