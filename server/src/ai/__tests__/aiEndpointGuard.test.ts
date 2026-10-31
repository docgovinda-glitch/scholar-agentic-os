import { afterEach, describe, expect, it, vi } from "vitest";
import { AiEndpointBlockedError, checkAiEndpoint, createAiFetch, screenCandidates } from "../aiEndpointGuard.ts";
import type { Candidate } from "../../../../src/platform/router/types.ts";

const saved = process.env.ALLOW_PRIVATE_AI_ENDPOINTS;
afterEach(() => {
  if (saved === undefined) delete process.env.ALLOW_PRIVATE_AI_ENDPOINTS;
  else process.env.ALLOW_PRIVATE_AI_ENDPOINTS = saved;
});

const cand = (over: Partial<Candidate>): Candidate => ({
  id: "byok:custom:m", lane: "byok", provider: "custom", model: "m", label: "m · your key",
  contextWindow: 32_000, maxOutputTokens: 4096, runsIn: "server", ...over,
});

describe("AI endpoint guard", () => {
  it("lets the providers' own API hosts through without a DNS check", async () => {
    expect(await checkAiEndpoint("https://api.openai.com/v1")).toEqual({ ok: true });
    expect(await checkAiEndpoint("https://generativelanguage.googleapis.com/v1beta")).toEqual({ ok: true });
  });

  it("blocks private, loopback, metadata and non-https endpoints", async () => {
    delete process.env.ALLOW_PRIVATE_AI_ENDPOINTS;
    for (const url of [
      "https://localhost:11434",
      "https://127.0.0.1/v1",
      "https://10.0.0.5/v1",
      "https://169.254.169.254/latest",
      "https://[::1]/v1",
      "https://metadata.google.internal/v1",
      "http://api.example.com/v1",
      "file:///etc/passwd",
      "not a url",
    ]) {
      const r = await checkAiEndpoint(url);
      expect(r.ok, url).toBe(false);
    }
  });

  it("rejects credentials embedded in the address", async () => {
    const r = await checkAiEndpoint("https://user:pass@api.example.com/v1");
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("key field") });
  });

  it("an explicit opt-in allows a private endpoint (self-hosted installs)", async () => {
    process.env.ALLOW_PRIVATE_AI_ENDPOINTS = "true";
    expect((await checkAiEndpoint("http://127.0.0.1:8080/v1")).ok).toBe(true);
  });

  it("screens only server-run candidates that carry a base URL", async () => {
    delete process.env.ALLOW_PRIVATE_AI_ENDPOINTS;
    const { kept, blocked } = await screenCandidates([
      cand({ id: "a", credential: { apiKey: "k", baseUrl: "https://127.0.0.1/v1" } }),
      cand({ id: "b", provider: "openai", credential: { apiKey: "k" } }),
      cand({ id: "c", lane: "local", provider: "ollama", runsIn: "browser", credential: { baseUrl: "http://localhost:11434" } }),
    ]);
    expect(kept.map((c) => c.id)).toEqual(["b", "c"]);
    expect(blocked).toEqual([{ label: "m · your key", reason: expect.stringContaining("private") }]);
  });

  it("the guarded fetch refuses a private endpoint before any connection", async () => {
    delete process.env.ALLOW_PRIVATE_AI_ENDPOINTS;
    const base = vi.fn<typeof fetch>();
    const aiFetch = createAiFetch(base);
    await expect(aiFetch("https://127.0.0.1/v1/chat/completions", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(AiEndpointBlockedError);
    expect(base).not.toHaveBeenCalled();
  });

  it("the guarded fetch passes provider hosts to the normal fetch", async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    const aiFetch = createAiFetch(base);
    await aiFetch("https://api.anthropic.com/v1/messages", { method: "POST", body: "{}" });
    expect(base).toHaveBeenCalledOnce();
  });
});
