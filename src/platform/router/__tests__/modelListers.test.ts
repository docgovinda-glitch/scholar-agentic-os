import { describe, it, expect, vi } from "vitest";
import { listLiveModels, listModelsFor, ModelListError } from "../modelListers";

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("model listers", () => {
  it("OpenAI-compatible lists map id and created date, and send the key as a bearer token", async () => {
    const fetchImpl = reply(200, { data: [{ id: "acme-6.1", created: 1_790_000_000 }, { id: "old", active: false }] });
    const out = await listLiveModels("groq", { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual([{ id: "acme-6.1", createdAt: 1_790_000_000_000, contextWindow: undefined }]);
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: "Bearer k" });
  });

  it("Gemini maps names, token limits and whether the model generates text", async () => {
    const fetchImpl = reply(200, { models: [
      { name: "models/acme-flash-3.8", inputTokenLimit: 1_000_000, outputTokenLimit: 65_000, supportedGenerationMethods: ["generateContent"] },
      { name: "models/acme-embed", supportedGenerationMethods: ["embedContent"] },
    ] });
    const out = await listLiveModels("google", { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out[0]).toMatchObject({ id: "acme-flash-3.8", contextWindow: 1_000_000, maxOutputTokens: 65_000, generatesText: true });
    expect(out[1].generatesText).toBe(false);
  });

  it("Mistral marks deprecated models and capabilities", async () => {
    const fetchImpl = reply(200, { data: [{ id: "acme-large-4", max_context_length: 256_000, capabilities: { completion_chat: true, function_calling: true } }, { id: "acme-old", deprecation: "2026-11-30" }] });
    const out = await listLiveModels("mistral", { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out[0]).toMatchObject({ contextWindow: 256_000, supportsTools: true, deprecated: false });
    expect(out[1].deprecated).toBe(true);
  });

  it("a rejected key is a clear error, and a missing key never calls the provider", async () => {
    await expect(listLiveModels("openai", { apiKey: "bad", fetchImpl: reply(401, { error: "nope" }) as unknown as typeof fetch })).rejects.toThrow("The key was rejected");
    const fetchImpl = reply(200, {});
    await expect(listLiveModels("anthropic", { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toBeInstanceOf(ModelListError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("catalog model listers (every provider)", () => {
  const f = (status: number, body: unknown) => reply(status, body) as unknown as typeof fetch;

  it("OpenRouter-style lists read context, output limit, release date and text-only output", async () => {
    const fetchImpl = f(200, { data: [
      { id: "vendor/chat-3", created: 1_790_000_000, context_length: 200_000, top_provider: { max_completion_tokens: 16_000 }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] } },
      { id: "vendor/draw-1", architecture: { output_modalities: ["image"] } },
    ] });
    const out = await listModelsFor({ provider: "custom", via: "openrouter", baseUrl: "https://openrouter.ai/api/v1" }, { apiKey: "k", fetchImpl });
    expect(out[0]).toMatchObject({ id: "vendor/chat-3", contextWindow: 200_000, maxOutputTokens: 16_000, createdAt: 1_790_000_000_000, generatesText: true, supportsVision: true });
    expect(out[1].generatesText).toBe(false);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models");
  });

  it("reads a bare-array envelope (Together) and a `models` envelope", async () => {
    const together = await listModelsFor({ provider: "custom", via: "together" }, { apiKey: "k", fetchImpl: f(200, [{ id: "a/chat", type: "chat", context_length: 8000 }, { id: "a/embed", type: "embedding" }]) });
    expect(together.map((m) => [m.id, m.generatesText])).toEqual([["a/chat", true], ["a/embed", false]]);
    const wrapped = await listModelsFor({ provider: "custom", via: "cerebras" }, { apiKey: "k", fetchImpl: f(200, { models: [{ name: "x-1" }] }) });
    expect(wrapped[0].id).toBe("x-1");
  });

  it("Cohere lists chat-capable models from its own endpoint", async () => {
    const fetchImpl = f(200, { models: [{ name: "co-chat-1", endpoints: ["chat", "generate"], context_length: 128_000 }, { name: "co-embed", endpoints: ["embed"] }] });
    const out = await listModelsFor({ provider: "custom", via: "cohere" }, { apiKey: "k", fetchImpl });
    expect(out.map((m) => [m.id, m.generatesText])).toEqual([["co-chat-1", true], ["co-embed", false]]);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("https://api.cohere.com/v1/models");
  });

  it("a provider with no list endpoint says so (unsupported) rather than failing or guessing", async () => {
    const fetchImpl = f(200, {});
    const err = await listModelsFor({ provider: "custom", via: "qwen" }, { apiKey: "k", fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelListError);
    expect(err.unsupported).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("every catalog provider either lists models or is explicitly unsupported", async () => {
    const { CLOUD_PROVIDERS } = await import("../../../config/providerCatalog");
    for (const p of CLOUD_PROVIDERS as ReadonlyArray<{ id: string; modelsPath: string | null; baseUrl: string }>) {
      const target = { provider: "custom" as const, via: p.id, baseUrl: p.baseUrl || "https://example.org/v1" };
      const native = ["gemini", "claude", "openai", "groq", "deepseek", "mistral"].includes(p.id);
      const t = native ? { provider: ({ gemini: "google", claude: "anthropic" } as Record<string, string>)[p.id] ?? p.id } : target;
      const fetchImpl = f(200, { data: [{ id: "m" }], models: [{ name: "models/m" }] });
      const r = await listModelsFor(t as never, { apiKey: "k", fetchImpl }).then(() => "listed", (e) => (e instanceof ModelListError && e.unsupported ? "unsupported" : `error:${(e as Error).message}`));
      expect(r === "listed" || (r === "unsupported" && p.modelsPath === null), `${p.id}: ${r}`).toBe(true);
    }
  });
});
