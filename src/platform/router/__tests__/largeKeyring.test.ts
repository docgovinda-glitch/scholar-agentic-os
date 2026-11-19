/**
 * Large keyrings and every local runner: free-tier stacking (a dozen providers plus backup keys plus local
 * runners) must reach the server whole, and every runner in the local catalog must map onto a router adapter.
 */
import { describe, expect, it } from "vitest";
import { assembleKeyring, MAX_KEYRING_ENTRIES } from "../keyringAssemble";
import { isLocalRunnerId, localRunnerTarget, LOCAL_RUNNER_IDS } from "../localRunners";
import { isRemoteHttpsEndpoint } from "../baseUrl";
import { resolveRouterTarget } from "../providerMap";
import { LOCAL_RUNNERS } from "../../../config/localRunnerCatalog";
import { CLOUD_PROVIDERS } from "../../../config/providerCatalog";
import { MAX_KEYS_PER_PROVIDER } from "../../../config/keySlots";

const FREE = ["cerebras", "groq", "openrouter", "gemini", "mistral", "zhipu", "ovhcloud", "scaleway", "sambanova", "nvidia", "cohere", "huggingface"];

describe("keyring assembly beyond eight connections", () => {
  it("keeps a dozen providers with their backup keys, in order", () => {
    const withKey = [...FREE, "cerebras#2", "cerebras#3", "groq#2"];
    const ring = assembleKeyring({ provider: "cerebras", preferences: {} }, withKey, (id) => (withKey.includes(id) ? `key-${id}` : null));
    expect(ring.length).toBe(FREE.length + 3);
    expect(ring.length).toBeGreaterThan(8);
    expect(ring[0]).toMatchObject({ via: "cerebras", apiKey: "key-cerebras" });
    expect(ring.slice(0, 3).map((e) => e.slot)).toEqual([undefined, 2, 3]);
    expect(ring.filter((e) => e.via === "groq").map((e) => e.slot)).toEqual([undefined, 2]);
  });

  it("allows as many connections as the server accepts, and never more", () => {
    expect(MAX_KEYRING_ENTRIES).toBeGreaterThanOrEqual(24);
    const everyone = CLOUD_PROVIDERS.flatMap((p) => Array.from({ length: MAX_KEYS_PER_PROVIDER }, (_, i) => (i === 0 ? p.id : `${p.id}#${i + 1}`)));
    const ring = assembleKeyring({ provider: "cerebras", preferences: { cloudflareEndpoint: "https://api.cloudflare.com/client/v4/accounts/a/ai/v1" } }, everyone, () => "k");
    expect(ring.length).toBe(MAX_KEYRING_ENTRIES);
  });

  it("a long cloud list gives way before the local fallbacks do", () => {
    const everyone = CLOUD_PROVIDERS.map((p) => p.id);
    const ring = assembleKeyring(
      { provider: "cerebras", preferences: { cloudflareEndpoint: "https://api.cloudflare.com/client/v4/accounts/a/ai/v1", janModel: "m", janEnabled: "true", vllmModel: "m", vllmEnabled: "true" } },
      everyone, () => "k",
    );
    expect(ring.length).toBeLessThanOrEqual(MAX_KEYRING_ENTRIES);
    expect(ring.slice(-2).map((e) => e.via)).toEqual(["jan", "vllm"]);
  });
});

describe("every catalog runner reaches the router", () => {
  it("maps each runner onto the local Ollama or OpenAI-compatible adapter, keeping its id", () => {
    expect(LOCAL_RUNNER_IDS).toEqual(LOCAL_RUNNERS.map((r) => r.id));
    for (const r of LOCAL_RUNNERS) {
      const t = localRunnerTarget(r.id);
      expect(t, r.id).toBeDefined();
      expect(t!.provider).toBe(r.apiStyle === "ollama-native" ? "ollama" : "lmstudio");
      expect(t!.via).toBe(r.id);
      expect(t!.baseUrl).toBe(r.defaultEndpoint);
      expect(isLocalRunnerId(r.id)).toBe(true);
    }
    expect(isLocalRunnerId("openai")).toBe(false);
    expect(localRunnerTarget("openai")).toBeUndefined();
  });

  it("puts Jan, llama.cpp and vLLM (previously dropped) into the keyring with their own address", () => {
    const prefs = { janModel: "j", janEnabled: "true", llamacppModel: "l", llamacppEnabled: "true", vllmModel: "v", vllmEnabled: "true", vllmEndpoint: "https://gpu.example.com/v1/" };
    const ring = assembleKeyring({ provider: "ollama", preferences: { ...prefs, ollamaModel: "o" } }, [], () => null);
    const byVia = Object.fromEntries(ring.map((e) => [e.via, e]));
    expect(Object.keys(byVia)).toEqual(["ollama", "jan", "llamacpp", "vllm"]);
    expect(byVia.ollama.provider).toBe("ollama");
    expect(byVia.jan).toMatchObject({ provider: "lmstudio", baseUrl: "http://localhost:1337/v1", model: "j" });
    expect(byVia.llamacpp).toMatchObject({ provider: "lmstudio", baseUrl: "http://localhost:8080/v1" });
    expect(byVia.vllm.baseUrl).toBe("https://gpu.example.com/v1");
  });

  it("leaves a runner out until the person enables it (or makes it the default)", () => {
    expect(assembleKeyring({ provider: "gemini", preferences: { janModel: "j" } }, [], () => null)).toEqual([]);
    expect(assembleKeyring({ provider: "jan", preferences: { janModel: "j" } }, [], () => null)).toHaveLength(1);
  });
});

describe("custom https endpoints (tunnelled GPUs, LiteLLM, Modal)", () => {
  it("treats a public https address as remote, and loopback, private, http and local names as not", () => {
    for (const u of ["https://abc.trycloudflare.com/v1", "https://my-app--serve.modal.run/v1", "https://litellm.example.org"]) expect(isRemoteHttpsEndpoint(u), u).toBe(true);
    for (const u of ["http://localhost:11434", "https://localhost:8443", "https://127.0.0.1", "https://192.168.1.5/v1", "https://10.0.0.7", "https://172.20.1.1", "https://[::1]/v1", "https://box.local/v1", "https://nas/v1", "http://abc.trycloudflare.com/v1", undefined, "not a url"]) {
      expect(isRemoteHttpsEndpoint(u), String(u)).toBe(false);
    }
    expect(isRemoteHttpsEndpoint("https://fcm.example.com")).toBe(true); // a name that merely starts like an IPv6 prefix
  });

  it("an unknown provider id with the person's own https address becomes a custom OpenAI-compatible target", () => {
    const t = resolveRouterTarget("my-litellm", "https://litellm.example.org/v1/chat/completions");
    expect(t).toMatchObject({ ok: true, target: { provider: "custom", baseUrl: "https://litellm.example.org/v1", via: "my-litellm" } });
    expect(resolveRouterTarget("my-litellm")).toMatchObject({ ok: false });
  });
});
