import { describe, expect, it } from "vitest";
import { orderChain, strictOrderFromHeader, ROUTING_HEADER, ROUTING_MANUAL } from "../taskAffinity";
import { cloudAllowed, confidentialModeAllows, noCloudOnly } from "../privacyPolicy";
import { assembleKeyring } from "../keyringAssemble";
import { CLOUD_PROVIDERS, isFreeWorkhorse, getCloudProvider } from "../../../config/providerCatalog";
import type { Candidate } from "../types";

const c = (group: string, extra: Partial<Candidate> = {}): Candidate => ({ id: `byok:${group}:m`, group, lane: "byok", provider: "custom", model: "m", label: group, contextWindow: 1, maxOutputTokens: 1, runsIn: "server", ...extra });
const names = (l: Candidate[]) => l.map((x) => x.group);
const userOrder = [c("openrouter"), c("gemini"), c("cerebras"), c("anthropic"), c("groq"), c("groq#2"), c("openai")];

describe("task-aware order", () => {
  it("quick work tries the free workhorses first, keeping the person's order inside each group", () => {
    expect(names(orderChain(userOrder, "fast"))).toEqual(["cerebras", "groq", "groq#2", "openrouter", "gemini", "anthropic", "openai"]);
  });

  it("reasoning, drafting, coding, long-context and vision keep the person's own order", () => {
    for (const task of ["reasoning", "drafting", "coding", "long-context", "vision"] as const) {
      expect(names(orderChain(userOrder, task)), task).toEqual(names(userOrder));
    }
  });

  it("'use my order exactly' turns the reordering off, even for quick work", () => {
    expect(names(orderChain(userOrder, "fast", { strict: true }))).toEqual(names(userOrder));
    expect(strictOrderFromHeader(ROUTING_MANUAL)).toBe(true);
    expect(strictOrderFromHeader(undefined)).toBe(false);
    expect(ROUTING_HEADER).toBe("x-ai-routing");
  });

  it("a model that runs in the browser always stays last, so no cloud candidate is lost behind a hand-off", () => {
    const browserLocal = c("ollama", { lane: "local", runsIn: "browser", provider: "ollama" });
    const tunnel = c("vllm", { lane: "local", runsIn: "server", provider: "lmstudio" });
    const chain = [browserLocal, c("openrouter"), c("cerebras"), tunnel];
    expect(names(orderChain(chain, "fast"))).toEqual(["cerebras", "vllm", "openrouter", "ollama"]);
    expect(names(orderChain(chain, "reasoning"))).toEqual(["openrouter", "cerebras", "vllm", "ollama"]);
  });

  it("the workhorses are the catalog's flagged providers: Cerebras, Groq, Zhipu, Cloudflare, OVHcloud; not the scarce reasoning ones", () => {
    const flagged = CLOUD_PROVIDERS.filter((p) => isFreeWorkhorse(p.id)).map((p) => p.id).sort();
    expect(flagged).toEqual(["cerebras", "cloudflare", "groq", "ovhcloud", "zhipu"]);
    for (const scarce of ["openrouter", "gemini", "claude", "openai"]) expect(isFreeWorkhorse(scarce)).toBe(false);
  });
});

describe("Confidential mode and Local AI only", () => {
  const withKeys = ["gemini", "mistral", "openai", "claude", "groq", "cerebras"];
  const build = (prefs: Record<string, string>) => assembleKeyring({ provider: "claude", preferences: prefs }, withKeys, (id) => (withKeys.includes(id) ? "k" : null)).map((e) => e.via);

  it("off by default: every connection is offered", () => {
    expect(build({}).sort()).toEqual([...withKeys].map((id) => getCloudProvider(id)!.id).sort());
  });

  it("on: free tiers that train, opt-in training and unconfirmed providers are skipped; a no-training API stays", () => {
    expect(build({ confidentialMode: "true" })).toEqual(["claude"]);
    expect(confidentialModeAllows("gemini", {})).toMatchObject({ allowed: false });
    expect((confidentialModeAllows("mistral", {}) as { reason: string }).reason).toMatch(/train/i);
    expect((confidentialModeAllows("groq", {}) as { reason: string }).reason).toMatch(/not confirmed/i);
  });

  it("the person can confirm a key is paid / zero-retention to bring a provider back", () => {
    expect(build({ confidentialMode: "true", geminiPrivateTier: "true", groqPrivateTier: "true" }).sort()).toEqual(["claude", "gemini", "groq"]);
  });

  it("local runners always qualify, including a tunnelled one", () => {
    const ring = assembleKeyring({ provider: "gemini", preferences: { confidentialMode: "true", vllmModel: "v", vllmEnabled: "true", vllmEndpoint: "https://gpu.trycloudflare.com/v1" } }, ["gemini"], () => "k");
    expect(ring.map((e) => e.via)).toEqual(["vllm"]);
  });

  it("Local AI only offers no cloud connection at all, as the setting promises", () => {
    expect(noCloudOnly({ privacyPreference: "no-cloud" })).toBe(true);
    expect(cloudAllowed("claude", { privacyPreference: "no-cloud" })).toBe(false);
    expect(assembleKeyring({ provider: "claude", preferences: { privacyPreference: "no-cloud", ollamaModel: "o", ollamaEnabled: "true" } }, ["claude"], () => "k").map((e) => e.via)).toEqual(["ollama"]);
  });

  it("every catalog provider that trains on its free tier is marked, with a plain explanation", () => {
    for (const id of ["gemini", "mistral"]) expect(getCloudProvider(id)!.dataPolicy).toMatchObject({ trainsOnFreeTier: "free-tier-trains" });
    expect(getCloudProvider("openai")!.dataPolicy?.trainsOnFreeTier).toBe("opt-in-training");
    for (const p of CLOUD_PROVIDERS) if ("dataPolicy" in p && p.dataPolicy) expect(p.dataPolicy.note.length).toBeGreaterThan(20);
  });
});

import { isUndersizedForProse } from "../taskAffinity";
describe("undersized local models", () => {
  it("flags tiny and code-only ids, not capable ones", () => {
    expect(isUndersizedForProse("qwen2.5-coder:1.5b")).toBe(true);
    expect(isUndersizedForProse("llama3.2:3b")).toBe(true);
    expect(isUndersizedForProse("llama3.1:8b")).toBe(false);
    expect(isUndersizedForProse("qwen2.5:14b")).toBe(false);
    expect(isUndersizedForProse(undefined)).toBe(false);
  });
  it("moves them behind capable local models for heavy tasks unless strict", () => {
    const c = [
      { lane: "local" as const, provider: "ollama", runsIn: "server" as const, model: "qwen2.5-coder:1.5b" },
      { lane: "local" as const, provider: "lmstudio", runsIn: "server" as const, model: "llama3.1:8b" },
    ];
    expect(orderChain(c, "reasoning").map((x) => x.model)).toEqual(["llama3.1:8b", "qwen2.5-coder:1.5b"]);
    expect(orderChain(c, "reasoning", { strict: true }).map((x) => x.model)[0]).toBe("qwen2.5-coder:1.5b");
  });
});
