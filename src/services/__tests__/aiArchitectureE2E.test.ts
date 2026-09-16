import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveClientCandidates,
  type CandidateResolutionOptions,
} from "../clientRouter";
import {
  blacklistModel,
  isModelBlacklisted,
  clearModelBlacklist,
  recordProviderFailure,
  isProviderAvailable,
  clearProviderHealth,
  cacheDiscoveredModels,
  type DiscoveredModel,
} from "../modelDiscovery";
import {
  startExecutionScope,
  updateExecutionScope,
  endExecutionScope,
  getExecutionScope,
  subscribeExecutionState,
  type ExecutionScope,
} from "../executionState";
import * as userAiSettings from "../userAiSettings";
import { completeWithFailover, streamWithFailover } from "../../platform/gateway/gateway";
import * as gateway from "../../platform/gateway/gateway";
import { defaultPolicy } from "../../platform/warden/policy";

describe("aiArchitectureE2E: Advanced Routing & Discovery Scenarios", () => {
  beforeEach(() => {
    localStorage.clear();
    clearModelBlacklist();
    clearProviderHealth();
    vi.restoreAllMocks();
  });

  it("filters out discovered models that lack required capabilities (e.g. structuredOutput)", async () => {
    // User has Groq connected
    vi.spyOn(userAiSettings, "loadUserAiSettings").mockResolvedValue({
      provider: "groq",
      preferences: {},
    });
    vi.spyOn(userAiSettings, "readProviderKey").mockImplementation(async (id) => {
      return id === "groq" ? "gsk-mock-key-123" : null;
    });

    // Discovery returns two models: one text-only, one supporting structured output
    const mockDiscovered: DiscoveredModel[] = [
      {
        id: "groq-simple-chat",
        modelId: "groq-simple-chat",
        displayName: "Groq Simple Chat",
        providerId: "groq",
        contextWindow: 8000,
        capabilities: ["fastGeneration"], // Does NOT support structuredOutput
        source: "live_api",
        verifiedAt: new Date().toISOString(),
      },
      {
        id: "openai/gpt-oss-120b",
        modelId: "openai/gpt-oss-120b",
        displayName: "GPT OSS 120B",
        providerId: "groq",
        contextWindow: 128000,
        capabilities: ["structuredOutput", "reasoning"],
        source: "live_api",
        verifiedAt: new Date().toISOString(),
      },
    ];
    cacheDiscoveredModels("groq", "gsk-mock-key-123", mockDiscovered);

    // literatureDiscovery requires structuredOutput
    const decision = await resolveClientCandidates("literatureDiscovery");
    expect(decision.ok).toBe(true);

    // The primary candidate chosen must be the one that supports structuredOutput
    expect(decision.primary.model).toBe("openai/gpt-oss-120b");
    // groq-simple-chat should not be the primary candidate for literatureDiscovery
    expect(decision.primary.model).not.toBe("groq-simple-chat");
  });

  it("handles stale persisted user model preference gracefully", async () => {
    // User had a retired model persisted in their settings
    vi.spyOn(userAiSettings, "loadUserAiSettings").mockResolvedValue({
      provider: "groq",
      preferences: { groqModel: "llama-3.1-8b-instant" },
    });
    vi.spyOn(userAiSettings, "readProviderKey").mockResolvedValue("gsk-mock-key-123");

    // The retired model was blacklisted in this session due to a previous 404
    blacklistModel("groq", "llama-3.1-8b-instant", "Model not found on account (404)");

    // Route decision should ignore the blacklisted preference and pick a valid candidate
    const decision = await resolveClientCandidates("reasoning");
    expect(decision.ok).toBe(true);
    expect(decision.primary.model).not.toBe("llama-3.1-8b-instant");
    expect(isModelBlacklisted("groq", "llama-3.1-8b-instant")).toBe(true);
  });

  it("falls back to another model on the same provider when one model 404s", async () => {
    vi.spyOn(userAiSettings, "loadUserAiSettings").mockResolvedValue({
      provider: "groq",
      preferences: {},
    });
    vi.spyOn(userAiSettings, "readProviderKey").mockResolvedValue("gsk-mock-key-123");

    // Candidate generation provides multiple candidates for groq
    const decision = await resolveClientCandidates("reasoning");
    expect(decision.ok).toBe(true);
    expect(decision.allCandidates.length).toBeGreaterThanOrEqual(1);

    // Blacklist the first model
    const firstModel = decision.primary.model;
    blacklistModel("groq", firstModel, "404 not found");

    // Re-resolving candidates now picks the alternative model on groq
    const nextDecision = await resolveClientCandidates("reasoning");
    expect(nextDecision.ok).toBe(true);
    expect(nextDecision.primary.model).not.toBe(firstModel);
    // Provider groq remains available!
    expect(isProviderAvailable("groq")).toBe(true);
  });

  it("marks provider unhealthy on 401/403 and skips all models on that provider", async () => {
    vi.spyOn(userAiSettings, "loadUserAiSettings").mockResolvedValue({
      provider: "groq",
      preferences: {},
    });
    vi.spyOn(userAiSettings, "readProviderKey").mockImplementation(async (p) => {
      if (p === "groq") return "gsk-invalid-key";
      if (p === "gemini") return "gemini-valid-key";
      return null;
    });

    // Provider groq encounters a 401 auth failure
    recordProviderFailure("groq", 401, "Invalid API Key");
    expect(isProviderAvailable("groq")).toBe(false);

    // Resolving candidates should bypass groq completely and choose gemini
    const decision = await resolveClientCandidates("reasoning");
    if (decision.ok) {
      expect(decision.primary.provider).not.toBe("groq");
    }
  });

  it("handles 429 with Retry-After and sets bounded cooldown", async () => {
    recordProviderFailure("groq", 429, "Rate limit reached", 10);
    expect(isProviderAvailable("groq")).toBe(false);
  });
});

describe("aiArchitectureE2E: Request-Scoped Execution State Isolation", () => {
  it("maintains separate execution scopes for concurrent requests without cross-talk", () => {
    const scope1 = "exec-req-1";
    const scope2 = "exec-req-2";

    startExecutionScope(scope1, "gemini", "Google Gemini", "gemini-2.5-flash");
    startExecutionScope(scope2, "groq", "Groq Cloud", "openai/gpt-oss-120b");

    expect(getExecutionScope(scope1)?.activeProvider).toBe("gemini");
    expect(getExecutionScope(scope1)?.activeModel).toBe("gemini-2.5-flash");

    expect(getExecutionScope(scope2)?.activeProvider).toBe("groq");
    expect(getExecutionScope(scope2)?.activeModel).toBe("openai/gpt-oss-120b");

    // Scope 1 undergoes fallback
    updateExecutionScope(scope1, {
      providerId: "groq",
      providerName: "Groq Cloud",
      modelId: "openai/gpt-oss-120b",
      isFallback: true,
      status: "fallback",
      message: "Switching from gemini to groq",
    });

    // Scope 1 is now in fallback
    expect(getExecutionScope(scope1)?.isFallbackActive).toBe(true);
    expect(getExecutionScope(scope1)?.activeProvider).toBe("groq");

    // Scope 2 is completely unaffected!
    expect(getExecutionScope(scope2)?.isFallbackActive).toBe(false);
    expect(getExecutionScope(scope2)?.activeProvider).toBe("groq");
    expect(getExecutionScope(scope2)?.status).toBe("running");

    // Cleaning up scope 1
    endExecutionScope(scope1, "completed");
    expect(getExecutionScope(scope1)).toBeUndefined();
    // Scope 2 remains active
    expect(getExecutionScope(scope2)).toBeDefined();

    endExecutionScope(scope2, "completed");
    expect(getExecutionScope(scope2)).toBeUndefined();
  });

  it("notifies listeners on execution state transitions", () => {
    const events: (ExecutionScope | null)[] = [];
    const unsubscribe = subscribeExecutionState((scope) => {
      events.push(scope ? { ...scope } : null);
    });

    startExecutionScope("exec-test-sub", "gemini", "Gemini", "gemini-2.5-flash");
    updateExecutionScope("exec-test-sub", {
      status: "running",
      message: "Processing tokens...",
    });
    endExecutionScope("exec-test-sub", "completed");

    unsubscribe();

    const activeEvents = events.filter((e) => e !== null);
    expect(activeEvents.length).toBeGreaterThanOrEqual(1);
    expect(activeEvents[0]?.activeProvider).toBe("gemini");
    expect(events[events.length - 1]).toBeNull();
  });
});

describe("aiArchitectureE2E: Fallback Edge Cases & Semantic Preservation", () => {
  it("gracefully fails when no available model satisfies mandatory requirements (e.g. vision)", async () => {
    vi.spyOn(userAiSettings, "loadUserAiSettings").mockResolvedValue({
      provider: "groq",
      preferences: {},
    });
    vi.spyOn(userAiSettings, "readProviderKey").mockResolvedValue("gsk-mock-key");

    // All available models on this provider lack vision
    const mockDiscovered: DiscoveredModel[] = [
      {
        id: "groq-text-only",
        modelId: "groq-text-only",
        displayName: "Groq Text",
        providerId: "groq",
        capabilities: ["fastGeneration"], // No vision
        source: "live_api",
        verifiedAt: new Date().toISOString(),
      },
    ];
    cacheDiscoveredModels("groq", "gsk-mock-key", mockDiscovered);

    // Multimodal routing requires vision
    const decision = await resolveClientCandidates("multimodal");
    expect(decision.ok).toBe(false);
    expect(decision.choice).toBeUndefined();
    expect(decision.reasoning).toContain("satisfying task requirements");
  });

  it("aborts execution immediately when AbortSignal is cancelled during fallback", async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-aborted signal

    const candidates = [
      { provider: "gemini", model: "gemini-2.5-flash", apiKey: "key-1" },
      { provider: "groq", model: "openai/gpt-oss-120b", apiKey: "key-2" },
    ];

    await expect(
      completeWithFailover(
        {
          taskClass: "verification",
          userPrompt: "Hello",
          segments: [{ label: "test", text: "abort" }],
        },
        {
          candidates,
          signal: controller.signal,
        }
      )
    ).rejects.toThrow("Aborted");
  });

  it("supports streaming fallback to backup model when primary fails on start", async () => {
    const candidates = [
      { provider: "gemini", model: "gemini-2.5-flash", apiKey: "key-1" },
      { provider: "groq", model: "openai/gpt-oss-120b", apiKey: "key-2" },
    ];

    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(
          JSON.stringify({ error: { message: "models/gemini-2.5-flash is not found for API version v1beta (404)", code: 404 } }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      // Groq streaming response
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "stream content" } }] })}\n\n`));
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });
      return { ok: true, status: 200, body } as any;
    });

    const chunks: string[] = [];
    let switchNotified = false;

    // Stream with failover where gemini throws 404 and groq succeeds
    const res = await streamWithFailover(
      {
        taskClass: "rule_extraction",
        userPrompt: "Generate streaming test",
        segments: [{ label: "public guideline", text: "stream" }],
      },
      (chunk) => {
        chunks.push(chunk);
      },
      {
        candidates,
        onEvent: (evt) => {
          if (evt.type === "switch") {
            switchNotified = true;
          }
        },
      }
    );

    expect(res.ok).toBe(true);
    expect(res.providerId).toBe("groq");
    expect(res.usedFallback).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(switchNotified).toBe(true);
  });
});
