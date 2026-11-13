import { describe, it, expect } from "vitest";
import { CLOUD_PROVIDERS } from "../../../config/providerCatalog";
import { resolveRouterTarget, COHERE_COMPAT_BASE } from "../providerMap";

describe("resolveRouterTarget: every catalog provider is reachable", () => {
  const all = CLOUD_PROVIDERS as ReadonlyArray<{ id: string; name: string; baseUrl: string; requiresCustomBaseUrl?: boolean }>;

  it("resolves all providers that do not need the user's own address, over https", () => {
    for (const p of all.filter((x) => !x.requiresCustomBaseUrl)) {
      const r = resolveRouterTarget(p.id);
      expect(r.ok, `${p.id} should resolve`).toBe(true);
      if (r.ok) {
        expect(r.target.via).toBe(p.id);
        if (r.target.baseUrl) expect(r.target.baseUrl.startsWith("https://")).toBe(true);
      }
    }
  });

  it("uses the native protocol for the six native providers and the catalog endpoint for the rest", () => {
    const native: Record<string, string> = { gemini: "google", claude: "anthropic", openai: "openai", groq: "groq", deepseek: "deepseek", mistral: "mistral" };
    for (const [id, provider] of Object.entries(native)) {
      const r = resolveRouterTarget(id);
      expect(r.ok && r.target.provider).toBe(provider);
    }
    const or = resolveRouterTarget("openrouter");
    expect(or).toMatchObject({ ok: true, target: { provider: "custom", via: "openrouter", baseUrl: "https://openrouter.ai/api/v1" } });
    const co = resolveRouterTarget("cohere");
    expect(co).toMatchObject({ ok: true, target: { provider: "custom", baseUrl: COHERE_COMPAT_BASE } });
  });

  it("accepts the legacy aliases settings may hold", () => {
    expect(resolveRouterTarget("anthropic")).toMatchObject({ ok: true, target: { provider: "anthropic" } });
    expect(resolveRouterTarget("google")).toMatchObject({ ok: true, target: { provider: "google" } });
  });

  it("asks for an address instead of guessing when the provider needs one", () => {
    const r = resolveRouterTarget("cloudflare");
    expect(r.ok).toBe(false);
    const ok = resolveRouterTarget("cloudflare", "https://api.cloudflare.com/client/v4/accounts/abc/ai/v1/");
    expect(ok).toMatchObject({ ok: true, target: { provider: "custom", baseUrl: "https://api.cloudflare.com/client/v4/accounts/abc/ai/v1" } });
  });

  it("rejects an unknown provider with no address, and treats one with an address as a custom endpoint", () => {
    expect(resolveRouterTarget("nope").ok).toBe(false);
    expect(resolveRouterTarget("nope", "https://llm.example.org/v1")).toMatchObject({ ok: true, target: { provider: "custom" } });
  });
});
