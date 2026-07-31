/**
 * Catalog integrity.
 *
 * The catalog is now the single source of truth for the client adapters, the
 * server proxy, and the UI. A typo in one entry therefore breaks a provider
 * everywhere at once, silently — which is the failure mode these tests exist
 * to catch. They deliberately assert structure and internal consistency
 * rather than pinning exact values, so genuine catalog updates are not
 * treated as regressions.
 */

import { describe, it, expect } from "vitest";
import {
  CLOUD_PROVIDERS,
  DIRECT_BROWSER_CALL_ORIGINS,
  getCloudProvider,
  isCloudProvider,
  getOpenAICompatibleProviders,
  getFreeAccessProviders,
  resolveBaseUrl,
  chatUrl,
  discoverModelsUrl,
  buildAuthHeaders,
  apiKeyField,
  modelField,
} from "../providerCatalog";
import {
  LOCAL_RUNNERS,
  getLocalRunner,
  resolveRunnerEndpoint,
  runnerChatUrl,
} from "../localRunnerCatalog";

describe("cloud provider catalog", () => {
  it("covers the 20-25+ providers the redesign targeted", () => {
    expect(CLOUD_PROVIDERS.length).toBeGreaterThanOrEqual(25);
  });

  it("has no duplicate ids", () => {
    const ids = CLOUD_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every provider that existed before the redesign", () => {
    // Removing one of these would silently strip a working key from a user
    // who already configured it.
    const preExisting = [
      "gemini", "openai", "claude", "deepseek", "qwen",
      "cohere", "groq", "together", "openrouter",
    ];
    preExisting.forEach((id) => expect(isCloudProvider(id)).toBe(true));
  });

  it("gives every provider the fields the UI and adapters both rely on", () => {
    CLOUD_PROVIDERS.forEach((spec) => {
      expect(spec.name, spec.id).toBeTruthy();
      expect(spec.description, spec.id).toBeTruthy();
      expect(spec.defaultModel, spec.id).toBeTruthy();
      expect(spec.models.length, spec.id).toBeGreaterThan(0);
      expect(spec.freeTierNote, spec.id).toBeTruthy();
      expect(spec.chatPath.startsWith("/"), spec.id).toBe(true);
    });
  });

  it("always includes the default model in the suggestion list", () => {
    // Otherwise the UI's datalist omits the very value it prefills.
    CLOUD_PROVIDERS.forEach((spec) => {
      expect(spec.models, spec.id).toContain(spec.defaultModel);
    });
  });

  it("uses HTTPS everywhere and never leaves a trailing slash", () => {
    CLOUD_PROVIDERS.forEach((spec) => {
      if (!spec.baseUrl) return; // Cloudflare supplies its own at runtime.
      expect(spec.baseUrl.startsWith("https://"), spec.id).toBe(true);
      expect(spec.baseUrl.endsWith("/"), spec.id).toBe(false);
    });
  });

  it("points every 'get a key' link at a real HTTPS page", () => {
    CLOUD_PROVIDERS.forEach((spec) => {
      expect(spec.getKeyUrl.startsWith("https://"), spec.id).toBe(true);
    });
  });

  it("requires a custom base URL exactly when the catalog cannot supply one", () => {
    CLOUD_PROVIDERS.forEach((spec) => {
      if (!spec.baseUrl) {
        // An empty base URL with no hint would produce requests to "".
        expect(spec.requiresCustomBaseUrl, spec.id).toBe(true);
        expect(spec.customBaseUrlHint, spec.id).toBeTruthy();
      }
    });
  });

  it("serves the great majority of providers with the one generic adapter", () => {
    // This ratio is the reason 27 providers need no per-provider code.
    expect(getOpenAICompatibleProviders().length).toBeGreaterThanOrEqual(CLOUD_PROVIDERS.length - 4);
  });

  it("offers a genuine set of free options", () => {
    expect(getFreeAccessProviders().length).toBeGreaterThanOrEqual(6);
  });

  it("lists every direct-from-browser origin so CSP can allow it", () => {
    // A provider called directly from the browser needs a matching
    // connect-src entry in server.ts, or it fails only in production.
    expect(DIRECT_BROWSER_CALL_ORIGINS).toContain("https://generativelanguage.googleapis.com");
  });
});

describe("URL construction", () => {
  it("builds a chat URL from the base and path", () => {
    expect(chatUrl(getCloudProvider("groq")!)).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("handles DeepSeek's versionless base without doubling a slash", () => {
    expect(chatUrl(getCloudProvider("deepseek")!)).toBe("https://api.deepseek.com/chat/completions");
  });

  it("accepts an override and strips its trailing slash", () => {
    const spec = getCloudProvider("cloudflare")!;
    const url = chatUrl(spec, "https://api.cloudflare.com/client/v4/accounts/abc/ai/v1/");
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/abc/ai/v1/chat/completions");
  });

  it("returns no models URL for providers that expose no such endpoint", () => {
    expect(discoverModelsUrl(getCloudProvider("perplexity")!)).toBeNull();
    expect(discoverModelsUrl(getCloudProvider("groq")!)).toContain("/models");
  });

  it("resolves an empty base URL to an empty string rather than 'undefined'", () => {
    expect(resolveBaseUrl(getCloudProvider("cloudflare")!)).toBe("");
  });
});

describe("auth headers", () => {
  it("uses bearer auth for OpenAI-compatible providers", () => {
    const headers = buildAuthHeaders(getCloudProvider("groq")!, "gsk_test");
    expect(headers["Authorization"]).toBe("Bearer gsk_test");
  });

  it("uses Anthropic's x-api-key plus the required version header", () => {
    // Sending Authorization: Bearer to Anthropic is a silent 401 — this is
    // the exact per-provider detail the shared helper exists to get right.
    const headers = buildAuthHeaders(getCloudProvider("claude")!, "sk-ant-test");
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBeTruthy();
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("omits auth entirely when there is no key", () => {
    const headers = buildAuthHeaders(getCloudProvider("groq")!, "");
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("settings field naming", () => {
  it("matches the legacy AISettings field names so saved keys still resolve", () => {
    expect(apiKeyField("gemini")).toBe("geminiApiKey");
    expect(modelField("openai")).toBe("openaiModel");
  });
});

describe("local runner catalog", () => {
  it("covers every runner named in the redesign", () => {
    const expected = [
      "ollama", "lmstudio", "localai", "jan",
      "vllm", "textgenwebui", "llamacpp", "koboldcpp",
    ];
    expected.forEach((id) => expect(getLocalRunner(id), id).toBeDefined());
  });

  it("has no duplicate ids", () => {
    const ids = LOCAL_RUNNERS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every runner real install and CORS guidance", () => {
    LOCAL_RUNNERS.forEach((spec) => {
      expect(spec.installGuidance.length, spec.id).toBeGreaterThan(30);
      // CORS is the most common reason local AI appears not to work, so no
      // runner may ship without a specific answer for it.
      expect(spec.corsGuidance.length, spec.id).toBeGreaterThan(30);
      expect(spec.installUrl.startsWith("https://"), spec.id).toBe(true);
      expect(spec.defaultEndpoint.startsWith("http://"), spec.id).toBe(true);
      expect(spec.defaultEndpoint.endsWith("/"), spec.id).toBe(false);
    });
  });

  it("routes Ollama to its own API shape and everything else to OpenAI's", () => {
    expect(runnerChatUrl(getLocalRunner("ollama")!)).toBe("http://localhost:11434/api/chat");
    expect(runnerChatUrl(getLocalRunner("lmstudio")!)).toBe("http://localhost:1234/v1/chat/completions");
  });

  it("honours an endpoint override", () => {
    expect(resolveRunnerEndpoint(getLocalRunner("ollama")!, "http://192.168.1.5:11434/")).toBe(
      "http://192.168.1.5:11434"
    );
  });

  it("documents the one port collision rather than hiding it", () => {
    // LocalAI and llama.cpp both default to 8080; users running both need to
    // know why the second one appears to answer as the first.
    const collision = LOCAL_RUNNERS.filter((r) => r.defaultEndpoint.includes(":8080"));
    expect(collision.length).toBe(2);
    expect(getLocalRunner("llamacpp")!.installGuidance).toMatch(/same default port/i);
  });
});
