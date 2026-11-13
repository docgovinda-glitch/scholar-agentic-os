import { describe, it, expect, vi } from "vitest";
vi.mock("../../aiAccess/accountKeys", () => ({ syncKeysWithAccount: vi.fn(async () => null) }));
vi.mock("../../../services/userAiSettings", () => ({ loadUserAiSettings: vi.fn(), providersWithStoredKey: () => [], readProviderKey: vi.fn() }));
import { buildKeyring, encodeKeyring } from "../keyring";

describe("keyring", () => {
  it("puts the primary provider first, maps catalog ids, skips entries without key or model, and adds an enabled local model last", async () => {
    const settings = { provider: "anthropic", preferences: {
      anthropicModel: "a-model", openaiModel: "o-model", geminiModel: "g-model", gemini_note: "x",
      ollamaModel: "llama-local", ollamaEnabled: "true", ollamaEndpoint: "http://localhost:11434",
    } };
    const keys: Record<string, string> = { anthropic: "ka", openai: "ko", gemini: "kg", groq: "kq" };
    const ring = await buildKeyring(settings, ["openai", "gemini", "groq", "anthropic"], async (id) => keys[id] ?? null);
    expect(ring.map((e) => `${e.provider}:${e.model}`)).toEqual(["anthropic:a-model", "openai:o-model", "google:g-model", "ollama:llama-local"]);
    expect(ring.at(-1)).toMatchObject({ baseUrl: "http://localhost:11434" });
    expect(ring.at(-1)).not.toHaveProperty("apiKey");
  });

  it("encodes as base64url JSON the server can read", () => {
    const enc = encodeKeyring([{ provider: "openai", model: "m", apiKey: "k/+?" }]);
    expect(enc).not.toMatch(/[+/=]/);
    expect(JSON.parse(Buffer.from(enc, "base64url").toString("utf8"))).toEqual([{ provider: "openai", model: "m", apiKey: "k/+?" }]);
  });

  it("adds backup keys right after the main key, with the same model and their own slot", async () => {
    const settings = { provider: "openai", preferences: { openaiModel: "o-model", anthropicModel: "a-model" } };
    const keys: Record<string, string> = { openai: "k1", "openai#2": "k2", "openai#3": "k3", anthropic: "ka" };
    const ring = await buildKeyring(settings, ["openai", "openai#2", "openai#3", "anthropic"], async (id) => keys[id] ?? null);
    expect(ring.map((e) => `${e.provider}:${e.model}:${e.slot ?? 1}:${e.apiKey}`)).toEqual([
      "openai:o-model:1:k1", "openai:o-model:2:k2", "openai:o-model:3:k3", "anthropic:a-model:1:ka",
    ]);
    expect(ring[1].label).toMatch(/backup key 2/);
  });

  it("ignores an unused backup slot", async () => {
    const settings = { provider: "openai", preferences: { openaiModel: "o-model" } };
    const ring = await buildKeyring(settings, ["openai"], async (id) => (id === "openai" ? "k1" : null));
    expect(ring).toHaveLength(1);
  });
});
