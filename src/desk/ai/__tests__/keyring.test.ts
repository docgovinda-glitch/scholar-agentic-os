import { describe, it, expect, vi } from "vitest";
vi.mock("../../aiAccess/accountKeys", () => ({ syncKeysWithAccount: vi.fn(async () => null) }));
vi.mock("../../../services/userAiSettings", () => ({ loadUserAiSettings: vi.fn(), providersWithStoredKey: () => [], readProviderKey: vi.fn() }));
import { buildKeyring, encodeKeyring } from "../keyring";

describe("keyring", () => {
  it("puts the primary provider first, maps catalog ids, skips entries without a key, uses auto when no model is saved, and adds an enabled local model last", async () => {
    const settings = { provider: "anthropic", preferences: {
      anthropicModel: "a-model", openaiModel: "o-model", geminiModel: "g-model", gemini_note: "x",
      ollamaModel: "llama-local", ollamaEnabled: "true", ollamaEndpoint: "http://localhost:11434",
    } };
    const keys: Record<string, string> = { anthropic: "ka", openai: "ko", gemini: "kg", groq: "kq" };
    const ring = await buildKeyring(settings, ["openai", "gemini", "groq", "anthropic"], async (id) => keys[id] ?? null);
    expect(ring.map((e) => `${e.provider}:${e.model}`)).toEqual(["anthropic:a-model", "openai:o-model", "google:g-model", "groq:auto", "ollama:llama-local"]);
    expect(ring.at(-1)).toMatchObject({ baseUrl: "http://localhost:11434" });
    expect(ring.at(-1)).not.toHaveProperty("apiKey");
  });

  it("includes every catalog provider with a key, by its endpoint and catalog id, never naming a model", async () => {
    const keys: Record<string, string> = { openrouter: "k1", cerebras: "k2", cohere: "k3", cloudflare: "k4", qwen: "k5" };
    const ring = await buildKeyring({ provider: "openrouter", preferences: { cloudflareBaseUrl: "https://api.cloudflare.com/client/v4/accounts/abc/ai/v1" } }, Object.keys(keys), async (id) => keys[id] ?? null);
    expect(ring.map((e) => e.via)).toEqual(["openrouter", "cerebras", "cohere", "cloudflare", "qwen"]);
    expect(ring.every((e) => e.provider === "custom" && e.model === "auto")).toBe(true);
    expect(ring.find((e) => e.via === "openrouter")?.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(ring.find((e) => e.via === "cohere")?.baseUrl).toContain("compatibility");
    expect(ring.find((e) => e.via === "cloudflare")?.baseUrl).toContain("accounts/abc");
  });

  it("leaves out a provider that needs an address it does not have, and never exceeds the server's limit", async () => {
    const ring = await buildKeyring({ provider: "cloudflare", preferences: {} }, ["cloudflare"], async () => "k");
    expect(ring).toEqual([]);
    const many = ["openrouter", "cerebras", "together", "fireworks", "deepinfra", "novita", "hyperbolic", "nebius", "sambanova", "chutes"];
    expect((await buildKeyring({ provider: "openrouter", preferences: {} }, many, async () => "k")).length).toBe(8);
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

import { assembleKeyring } from "../../../platform/router/keyringAssemble";

describe("assembleKeyring (shared by browser and server)", () => {
  it("builds the same keyring from the same settings and keys on any device", () => {
    const settings = { provider: "groq", preferences: { groqModel: "g-1", openrouterModel: "or-1" } };
    const keys: Record<string, string> = { groq: "k1", openrouter: "k2", cohere: "k3" };
    const a = assembleKeyring(settings, Object.keys(keys), (id) => keys[id]);
    const b = assembleKeyring(settings, Object.keys(keys).reverse(), (id) => keys[id]);
    expect(a.map((e) => [e.via, e.model])).toEqual([["groq", "g-1"], ["openrouter", "or-1"], ["cohere", "auto"]]);
    expect(b[0].via).toBe("groq");
  });
});
