import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  discoverProviderModels,
  getCachedDiscoveredModels,
  cacheDiscoveredModels,
  blacklistModel,
  isModelBlacklisted,
  clearModelBlacklist,
  recordProviderFailure,
  recordProviderSuccess,
  isProviderAvailable,
  getProviderHealth,
  clearProviderHealth,
  normalizeDiscoveredCapabilities,
  type DiscoveredModel,
} from "../modelDiscovery";

describe("modelDiscovery: Session Blacklisting", () => {
  beforeEach(() => {
    clearModelBlacklist();
    clearProviderHealth();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("blacklists a model for 404/not_found and checks membership", () => {
    expect(isModelBlacklisted("groq", "llama-3.1-8b-instant")).toBe(false);
    blacklistModel("groq", "llama-3.1-8b-instant", "Model not found on account (404)");
    expect(isModelBlacklisted("groq", "llama-3.1-8b-instant")).toBe(true);
    // Other models on the same provider remain un-blacklisted
    expect(isModelBlacklisted("groq", "openai/gpt-oss-120b")).toBe(false);
  });

  it("handles case-insensitive and slash variations in blacklisted model names", () => {
    blacklistModel("gemini", "gemini-2.5-flash");
    expect(isModelBlacklisted("gemini", "models/gemini-2.5-flash")).toBe(true);
    expect(isModelBlacklisted("gemini", "GEMINI-2.5-FLASH")).toBe(true);
  });
});

describe("modelDiscovery: Provider Health State Machine", () => {
  beforeEach(() => {
    clearProviderHealth();
    vi.restoreAllMocks();
  });

  it("starts in healthy state", () => {
    expect(isProviderAvailable("gemini")).toBe(true);
    expect(getProviderHealth("gemini").status).toBe("healthy");
  });

  it("marks provider as auth_failed on 401/403 and puts it in cooldown", () => {
    recordProviderFailure("openai", 401, "Invalid API key");
    expect(isProviderAvailable("openai")).toBe(false);
    const health = getProviderHealth("openai");
    expect(health.status).toBe("auth_failed");
    expect(health.consecutiveFailures).toBe(1);
    expect(health.cooldownUntil).toBeGreaterThan(Date.now());
  });

  it("handles 429 rate limits with custom Retry-After", () => {
    recordProviderFailure("groq", 429, "Rate limit exceeded", 15);
    expect(isProviderAvailable("groq")).toBe(false);
    const health = getProviderHealth("groq");
    expect(health.status).toBe("rate_limited");
    // Cooldown should be at least ~14 seconds in the future
    expect(health.cooldownUntil).toBeGreaterThan(Date.now() + 10_000);
  });

  it("treats 500/503 outages with progressive backoff", () => {
    recordProviderFailure("mistral", 503, "Service Unavailable");
    expect(isProviderAvailable("mistral")).toBe(false);
    expect(getProviderHealth("mistral").status).toBe("outage");
  });

  it("resets provider to healthy on successful request", () => {
    recordProviderFailure("together", 500, "Server Error");
    expect(isProviderAvailable("together")).toBe(false);
    recordProviderSuccess("together");
    expect(isProviderAvailable("together")).toBe(true);
    expect(getProviderHealth("together").status).toBe("healthy");
    expect(getProviderHealth("together").consecutiveFailures).toBe(0);
  });
});

describe("modelDiscovery: Discovery Cache & Account Privacy", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores discovered models without leaking raw API keys into localStorage", () => {
    const rawApiKey = "sk-live-super-secret-key-1234567890abcdef";
    const models: DiscoveredModel[] = [
      {
        modelId: "gpt-4.5-preview",
        displayName: "GPT-4.5 Preview",
        contextWindow: 128000,
        capabilities: ["reasoning", "structuredOutput"],
        source: "live_api",
        discoveredAt: new Date().toISOString(),
      },
    ];

    cacheDiscoveredModels("openai", rawApiKey, models);
    const cached = getCachedDiscoveredModels("openai", rawApiKey);
    expect(cached).toHaveLength(1);
    expect(cached![0].modelId).toBe("gpt-4.5-preview");

    // Verify localStorage does NOT contain the raw key
    const rawStorage = localStorage.getItem("scholar_discovered_models:openai");
    expect(rawStorage).toBeTruthy();
    expect(rawStorage).not.toContain(rawApiKey);
  });

  it("invalidates cache when API key fingerprint differs", () => {
    const keyA = "sk-proj-account-A-1111111111111111111";
    const keyB = "sk-proj-account-B-2222222222222222222";
    const models: DiscoveredModel[] = [
      {
        modelId: "custom-fine-tuned",
        displayName: "Custom Model",
        contextWindow: 32000,
        capabilities: ["structuredOutput"],
        source: "live_api",
        discoveredAt: new Date().toISOString(),
      },
    ];

    cacheDiscoveredModels("openai", keyA, models);
    // Key A retrieves the cached model
    expect(getCachedDiscoveredModels("openai", keyA)).toHaveLength(1);
    // Key B has different fingerprint, so returns null (stale/different account cache)
    expect(getCachedDiscoveredModels("openai", keyB)).toBeNull();
  });

  it("expires cache after TTL has passed", () => {
    const key = "sk-proj-ttl-test-key-1234567890";
    const models: DiscoveredModel[] = [
      {
        modelId: "test-model",
        displayName: "Test Model",
        contextWindow: 8000,
        capabilities: [],
        source: "live_api",
        discoveredAt: new Date().toISOString(),
      },
    ];

    cacheDiscoveredModels("openai", key, models);

    // Manipulate cached timestamp to simulate 25 hours ago (TTL is 24 hours)
    const stored = JSON.parse(localStorage.getItem("scholar_discovered_models:openai")!);
    stored.timestamp = Date.now() - 25 * 60 * 60 * 1000;
    localStorage.setItem("scholar_discovered_models:openai", JSON.stringify(stored));

    expect(getCachedDiscoveredModels("openai", key)).toBeNull();
  });
});

describe("modelDiscovery: Capability Normalization & Conservative Rules", () => {
  it("normalizes capabilities conservatively using metadata and model naming cues", () => {
    const caps1 = normalizeDiscoveredCapabilities("openai", "gpt-4o", {
      supportsStructuredOutput: true,
      contextWindow: 128000,
    });
    expect(caps1).toContain("structuredOutput");
    expect(caps1).toContain("vision");

    const caps2 = normalizeDiscoveredCapabilities("groq", "deepseek-r1-distill-llama-70b", {});
    expect(caps2).toContain("reasoning");

    const caps3 = normalizeDiscoveredCapabilities("gemini", "gemini-1.5-pro", {});
    expect(caps3).toContain("longContext");
    expect(caps3).toContain("structuredOutput");
  });

  it("does not blindly grant capabilities to unrecognized models without metadata", () => {
    const caps = normalizeDiscoveredCapabilities("custom_provider", "random-text-bot-v1", {});
    expect(caps).not.toContain("reasoning");
    expect(caps).not.toContain("structuredOutput");
    expect(caps).not.toContain("vision");
    expect(caps).toContain("fastGeneration");
  });
});
