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
});
