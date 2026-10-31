import { describe, it, expect, vi } from "vitest";
import { listLiveModels, ModelListError } from "../modelListers";

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
