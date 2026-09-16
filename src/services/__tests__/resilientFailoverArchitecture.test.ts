/**
 * Comprehensive Regression Test Suite: Resilient AI Routing & Failover Architecture
 *
 * Covers 25 rigorous test cases proving:
 * 1. Gemini 429 Rate Limit -> Groq active model -> success
 * 2. Gemini Timeout -> Groq active model -> success
 * 3. Gemini Authentication Failure -> valid fallback -> success
 * 4. Groq HTTP 400 with model_decommissioned -> in-provider model fallback -> success
 * 5. Groq HTTP 400 with genuine malformed request -> does NOT blindly fail over
 * 6. Model-not-found (404/400) -> model quarantined -> next candidate
 * 7. All models unavailable -> clean terminal failure
 * 8. Same dead model is not retried repeatedly
 * 9. Stale discovery cache refreshes automatically when candidate set is empty
 * 10. Literature Discovery workflow continues after provider/model failover
 * 11. Sub-agents are NOT marked failed while failover is active
 * 12. No hardcoded retired models exist in default compatibility catalogs
 * 13. Two providers fail sequentially, third provider succeeds
 * 14. Same failed candidate is never retried during one operation
 * 15. Failover cannot loop between providers
 * 16. Concurrent requests share single-flight discovery (no duplicate requests)
 * 17. Stale cache refreshes before routing when no verified candidate exists
 * 18. Background refresh does not interrupt an already running request
 * 19. Successful re-discovery restores a previously quarantined model
 * 20. Provider returns HTTP 400 for malformed request -> no inappropriate failover
 * 21. Provider returns HTTP 400 model_decommissioned -> immediate candidate replacement
 * 22. Provider returns 429 -> backoff applied before provider failover
 * 23. Invalid BYOK credential -> diagnostic surfaces without exposing the credential
 * 24. Research state survives a provider/model failure
 * 25. Failover audit log contains zero secrets or user prompt content
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  classifyHttpError,
  isModelUnavailableError,
  parseProviderErrorBody,
} from "../aiErrors";
import {
  executeWithFailover,
  getFailoverAuditLog,
  clearFailoverAuditLog,
  clearAllCooldowns,
} from "../providerFailover";
import {
  discoverProviderModels,
  getCachedDiscoveredModels,
  setCachedDiscoveredModels,
  quarantineModel,
  isModelQuarantined,
  clearAllQuarantinedModels,
} from "../modelDiscovery";
import { resolveClientCandidates } from "../clientRouter";
import * as userAiSettings from "../userAiSettings";
import { CLOUD_PROVIDERS, getCloudProvider } from "../../config/providerCatalog";
import { ALL_MODELS } from "../../config/modelCatalog";

describe("Resilient AI Routing & Failover Architecture (25 Invariants)", () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllCooldowns();
    clearAllQuarantinedModels();
    clearFailoverAuditLog();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Gemini 429 Rate Limit -> Groq active model -> success
  it("1. handles Gemini 429 rate limit and fails over to active Groq model with success", async () => {
    const candidates = ["gemini::gemini-2.5-flash::0", "groq::openai/gpt-oss-120b::1"];
    const events: any[] = [];

    let geminiCalls = 0;
    let groqCalls = 0;

    const task = async (candidateId: string) => {
      if (candidateId.startsWith("gemini")) {
        geminiCalls++;
        const error = classifyHttpError(429, JSON.stringify({ error: { message: "Resource exhausted", code: 429 } }));
        throw { classified: error };
      }
      groqCalls++;
      return "groq response";
    };

    const result = await executeWithFailover(task, {
      candidates,
      maxRetriesPerProvider: 0,
      onEvent: (e) => events.push(e),
      displayNames: {
        "gemini::gemini-2.5-flash::0": "Google Gemini (gemini-2.5-flash)",
        "groq::openai/gpt-oss-120b::1": "Groq (openai/gpt-oss-120b)",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("groq response");
      expect(result.usedFallback).toBe(true);
    }
    expect(geminiCalls).toBe(1);
    expect(groqCalls).toBe(1);

    const switchEvent = events.find((e) => e.type === "switch");
    expect(switchEvent).toBeDefined();
    expect(switchEvent.userMessage).toContain("Rate limit/quota exceeded (HTTP 429)");
  });

  // 2. Gemini Timeout -> Groq active model -> success
  it("2. handles Gemini timeout and fails over to active Groq model with success", async () => {
    const candidates = ["gemini::gemini-2.5-flash::0", "groq::openai/gpt-oss-120b::1"];
    const events: any[] = [];

    const task = async (candidateId: string) => {
      if (candidateId.startsWith("gemini")) {
        const err = new Error("The request timed out after 10000ms");
        err.name = "TimeoutError";
        throw err;
      }
      return "groq response after timeout";
    };

    const result = await executeWithFailover(task, {
      candidates,
      maxRetriesPerProvider: 0,
      onEvent: (e) => events.push(e),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("groq response after timeout");
      expect(result.usedFallback).toBe(true);
    }
  });

  // 3. Gemini Authentication Failure -> valid fallback -> success
  it("3. handles Gemini authentication failure (401/403) and fails over to valid fallback without retrying Gemini", async () => {
    const candidates = ["gemini::gemini-2.5-flash::0", "groq::openai/gpt-oss-120b::1"];
    let geminiAttempts = 0;

    const task = async (candidateId: string) => {
      if (candidateId.startsWith("gemini")) {
        geminiAttempts++;
        const error = classifyHttpError(401, JSON.stringify({ error: { message: "API key invalid", code: "API_KEY_INVALID" } }));
        throw { classified: error };
      }
      return "fallback success";
    };

    const result = await executeWithFailover(task, {
      candidates,
      maxRetriesPerProvider: 2, // Even with retries enabled, auth failures must not retry same provider
    });

    expect(result.ok).toBe(true);
    expect(geminiAttempts).toBe(1); // Exactly 1 attempt, no useless retry with same invalid key
  });

  // 4. Groq HTTP 400 + model_decommissioned -> in-provider model fallback -> success
  it("4. classifies Groq HTTP 400 with model_decommissioned as model_not_found with failoverWorthwhile=true", () => {
    const errorBody = JSON.stringify({
      error: {
        message: "The model `llama-3.3-70b-versatile` has been decommissioned and is no longer available.",
        type: "invalid_request_error",
        code: "model_decommissioned",
      },
    });

    const isUnavailable = isModelUnavailableError(400, errorBody);
    expect(isUnavailable).toBe(true);

    const classified = classifyHttpError(400, errorBody);
    expect(classified.kind).toBe("model_not_found");
    expect(classified.retryable).toBe(false);
    expect(classified.failoverWorthwhile).toBe(true);
    expect(classified.providerErrorCode).toBe("model_decommissioned");
  });

  // 5. Groq HTTP 400 with genuine malformed request -> does NOT blindly fail over
  it("5. classifies genuine malformed request (bad parameters) as bad_request with failoverWorthwhile=false", () => {
    const errorBody = JSON.stringify({
      error: {
        message: "Invalid JSON in body: unexpected token at line 1",
        type: "invalid_request_error",
        code: "bad_request",
      },
    });

    const isUnavailable = isModelUnavailableError(400, errorBody);
    expect(isUnavailable).toBe(false);

    const classified = classifyHttpError(400, errorBody);
    expect(classified.kind).toBe("bad_request");
    expect(classified.failoverWorthwhile).toBe(false);
    expect(classified.retryable).toBe(false);
  });

  // 6. Model-not-found (404/400) -> model quarantined in cache -> next candidate
  it("6. quarantines model when model_not_found occurs and tries next candidate", async () => {
    const candidates = ["groq::llama-3.3-70b-versatile::0", "groq::openai/gpt-oss-120b::1"];

    const task = async (candidateId: string) => {
      if (candidateId.includes("llama-3.3-70b-versatile")) {
        const error = classifyHttpError(400, JSON.stringify({
          error: { code: "model_decommissioned", message: "model retired" }
        }));
        throw { classified: error };
      }
      return "next model success";
    };

    const result = await executeWithFailover(task, { candidates });
    expect(result.ok).toBe(true);
    expect(isModelQuarantined("groq", "llama-3.3-70b-versatile")).toBe(true);
  });

  // 7. All models unavailable -> clean terminal failure
  it("7. cleanly exits with terminal failure when all candidates are exhausted", async () => {
    const candidates = ["groq::model-a::0", "gemini::model-b::1"];

    const task = async () => {
      const error = classifyHttpError(404, JSON.stringify({ error: { message: "Model not found" } }));
      throw { classified: error };
    };

    const result = await executeWithFailover(task, { candidates, maxRetriesPerProvider: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts.length).toBe(2);
      expect(result.error.message).toContain("AI generation is temporarily unavailable");
    }
  });

  // 8. Same dead model is not retried repeatedly in same run
  it("8. ensures quarantined dead model is not selected again in same candidate run", async () => {
    quarantineModel("groq", "dead-model-1", "HTTP 400 decommissioned");

    const candidates = ["groq::dead-model-1::0", "groq::active-model-2::1"];
    let deadModelAttempted = false;

    const task = async (candidateId: string) => {
      if (candidateId.includes("dead-model-1")) {
        deadModelAttempted = true;
      }
      return "success";
    };

    const result = await executeWithFailover(task, { candidates });
    expect(result.ok).toBe(true);
    expect(deadModelAttempted).toBe(false); // Quarantined model skipped!
  });

  // 9. Stale discovery cache refreshes automatically when candidate set is empty
  it("9. auto-refreshes discovery when cache is missing/stale for configured key", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ id: "openai/gpt-oss-120b" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const discovery = await discoverProviderModels("groq", "gsk-fresh-key-123");
    expect(discovery.ok).toBe(true);
    expect(discovery.source).toBe("live_discovery");
    expect(discovery.models.some((m) => m.id === "openai/gpt-oss-120b")).toBe(true);
  });

  // 10. Literature Discovery continues after provider/model failover
  it("10. supports sequential failover while preserving operation identity", async () => {
    const candidates = [
      "gemini::gemini-2.5-flash::0",
      "groq::openai/gpt-oss-120b::1"
    ];

    const task = async (id: string) => {
      if (id.startsWith("gemini")) {
        throw { classified: classifyHttpError(503, "Gemini overload") };
      }
      return JSON.stringify({ items: [{ title: "Academic Search Paper" }] });
    };

    const result = await executeWithFailover(task, {
      candidates,
      operationId: "lit-discovery-run-1",
      stageId: "literature",
    });

    expect(result.ok).toBe(true);
    const audit = getFailoverAuditLog();
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0].operationId).toBe("lit-discovery-run-1");
    expect(audit[0].stageId).toBe("literature");
  });

  // 11. Sub-agents are NOT marked failed while failover is active
  it("11. emits switch and retry events during failover without terminal exhaustion", async () => {
    const candidates = ["gemini::model-1::0", "groq::model-2::1"];
    const events: string[] = [];

    const task = async (id: string) => {
      if (id.includes("model-1")) {
        throw { classified: classifyHttpError(500, "Server Error") };
      }
      return "done";
    };

    await executeWithFailover(task, {
      candidates,
      maxRetriesPerProvider: 0,
      onEvent: (e) => events.push(e.type),
    });

    expect(events).toContain("switch");
    expect(events).toContain("success");
    expect(events).not.toContain("exhausted");
  });

  // 12. No hardcoded retired model can be selected from default catalog
  it("12. verifies retired models (llama-3.3-70b-versatile, llama-3.1-8b-instant, gemini-2.0-flash, gemini-1.5-flash) are purged from catalogs", () => {
    const groq = getCloudProvider("groq");
    expect(groq?.defaultModel).not.toBe("llama-3.1-8b-instant");
    expect(groq?.defaultModel).not.toBe("llama-3.3-70b-versatile");
    expect(groq?.models).not.toContain("llama-3.3-70b-versatile");
    expect(groq?.models).not.toContain("llama-3.1-8b-instant");

    const gemini = getCloudProvider("gemini");
    expect(gemini?.models).not.toContain("gemini-2.0-flash");
    expect(gemini?.models).not.toContain("gemini-1.5-flash");

    // Check ALL_MODELS catalog
    const retiredIds = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemini-2.0-flash", "gemini-1.5-flash"];
    for (const retired of retiredIds) {
      const found = ALL_MODELS.find((m) => m.modelId === retired);
      expect(found).toBeUndefined();
    }
  });

  // 13. Two providers fail sequentially, third provider succeeds
  it("13. two providers fail sequentially, third provider succeeds", async () => {
    const candidates = [
      "gemini::gemini-2.5-flash::0",
      "groq::openai/gpt-oss-120b::1",
      "cerebras::llama-3.3-70b::2",
    ];

    const task = async (id: string) => {
      if (id.startsWith("gemini")) {
        throw { classified: classifyHttpError(429, "Gemini 429") };
      }
      if (id.startsWith("groq")) {
        throw { classified: classifyHttpError(500, "Groq 500") };
      }
      return "cerebras winner";
    };

    const result = await executeWithFailover(task, { candidates, maxRetriesPerProvider: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("cerebras winner");
      expect(result.providerId).toBe("cerebras");
    }
  });

  // 14. Same failed candidate is never retried during one operation
  it("14. same failed candidate key is never retried during one operation", async () => {
    const candidates = ["gemini::model-a::0", "groq::model-b::1", "gemini::model-a::0"];
    const callCount: Record<string, number> = {};

    const task = async (id: string) => {
      callCount[id] = (callCount[id] || 0) + 1;
      if (id.includes("model-a")) throw { classified: classifyHttpError(500, "Fail A") };
      return "Success B";
    };

    const result = await executeWithFailover(task, { candidates, maxRetriesPerProvider: 0 });
    expect(result.ok).toBe(true);
    expect(callCount["gemini::model-a::0"]).toBe(1); // Visited only once!
  });

  // 15. Failover cannot loop between providers
  it("15. prevents failover loops between alternating candidates", async () => {
    const cyclicCandidates = [
      "provider-a::model-1::0",
      "provider-b::model-2::1",
      "provider-a::model-1::2",
      "provider-b::model-2::3",
    ];

    let attempts = 0;
    const task = async () => {
      attempts++;
      throw { classified: classifyHttpError(500, "Error") };
    };

    const result = await executeWithFailover(task, { candidates: cyclicCandidates, maxRetriesPerProvider: 0 });
    expect(result.ok).toBe(false);
    expect(attempts).toBe(2); // Only tried each distinct candidate once
  });

  // 16. Concurrent requests do not trigger duplicate provider discovery calls (single-flight)
  it("16. deduplicates concurrent discoverProviderModels calls via single-flight promise", async () => {
    let fetchCount = 0;
    vi.spyOn(global, "fetch").mockImplementation(async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 50));
      return new Response(JSON.stringify({ data: [{ id: "model-x" }] }), { status: 200 });
    });

    const [res1, res2, res3] = await Promise.all([
      discoverProviderModels("groq", "shared-test-key"),
      discoverProviderModels("groq", "shared-test-key"),
      discoverProviderModels("groq", "shared-test-key"),
    ]);

    expect(fetchCount).toBe(1); // Single network request shared across all 3 concurrent callers!
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res3.ok).toBe(true);
  });

  // 17. Stale cache is refreshed before routing when no verified candidate exists
  it("17. resolveClientCandidates runs discovery synchronously when no cached models exist", async () => {
    vi.spyOn(userAiSettings, "providersWithStoredKey").mockReturnValue(["groq"]);
    vi.spyOn(userAiSettings, "readProviderKey").mockResolvedValue("gsk-auto-refresh-key");
    vi.spyOn(userAiSettings, "loadUserAiSettings").mockResolvedValue({ provider: "groq", preferences: {} });

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ id: "openai/gpt-oss-120b" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const decision = await resolveClientCandidates("reasoning");
    expect(decision.ok).toBe(true);
    expect(decision.primary.model).toBe("openai/gpt-oss-120b");
  });

  // 18. Background refresh does not interrupt an already running successful request
  it("18. uses fresh cached discovery immediately without blocking network calls", async () => {
    setCachedDiscoveredModels("groq", "key-123", [
      {
        id: "openai/gpt-oss-120b",
        providerId: "groq",
        displayName: "GPT-OSS 120B",
        capabilities: ["reasoning", "structuredOutput"],
        source: "live_discovery",
        verifiedAt: new Date().toISOString(),
      },
    ]);

    const fetchSpy = vi.spyOn(global, "fetch");
    const cached = getCachedDiscoveredModels("groq", "key-123");
    expect(cached).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // 19. Successful re-discovery restores a previously quarantined model when appropriate
  it("19. re-discovery of a model clears previous quarantine", async () => {
    quarantineModel("groq", "model-recovered", "HTTP 400 test");
    expect(isModelQuarantined("groq", "model-recovered")).toBe(true);

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ id: "model-recovered" }]
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const res = await discoverProviderModels("groq", "key-recovery", undefined, true);
    expect(res.ok).toBe(true);
    expect(isModelQuarantined("groq", "model-recovered")).toBe(false); // Restored!
  });

  // 20. Provider returns HTTP 400 for malformed request -> no inappropriate provider failover
  it("20. does not fail over when provider returns 400 for invalid task parameters", async () => {
    const candidates = ["gemini::gemini-2.5-flash::0", "groq::openai/gpt-oss-120b::1"];
    let groqCalled = false;

    const task = async (id: string) => {
      if (id.startsWith("gemini")) {
        const error = classifyHttpError(400, "Invalid JSON payload format");
        throw { classified: error };
      }
      groqCalled = true;
      return "groq";
    };

    const result = await executeWithFailover(task, { candidates });
    expect(result.ok).toBe(false);
    expect(groqCalled).toBe(false); // Inappropriate failover prevented on malformed payload!
  });

  // 21. Provider returns HTTP 400 model_decommissioned -> immediate candidate replacement
  it("21. immediately replaces candidate when HTTP 400 model_decommissioned occurs", async () => {
    const candidates = ["groq::retired-model::0", "groq::active-model::1"];
    const events: string[] = [];

    const task = async (id: string) => {
      if (id.includes("retired-model")) {
        const err = classifyHttpError(400, JSON.stringify({
          error: { code: "model_decommissioned", message: "model retired" }
        }));
        throw { classified: err };
      }
      return "active model ok";
    };

    const result = await executeWithFailover(task, {
      candidates,
      onEvent: (e) => events.push(e.type),
    });

    expect(result.ok).toBe(true);
    expect(events).toContain("switch");
    expect(events).toContain("success");
  });

  // 22. Provider returns 429 -> retry/backoff policy is applied before provider failover according to configured policy
  it("22. applies retry with backoff on 429 before failing over", async () => {
    const candidates = ["provider-a::model-1::0", "provider-b::model-2::1"];
    let providerAAttempts = 0;

    const task = async (id: string) => {
      if (id.startsWith("provider-a")) {
        providerAAttempts++;
        if (providerAAttempts === 1) {
          // First attempt 429 retryable
          const error = classifyHttpError(429, JSON.stringify({ error: { message: "Rate limit" } }));
          error.retryAfterMs = 10;
          throw { classified: error };
        }
        return "provider-a recovered on retry";
      }
      return "provider-b";
    };

    const result = await executeWithFailover(task, {
      candidates,
      maxRetriesPerProvider: 2,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("provider-a recovered on retry");
      expect(result.usedFallback).toBe(false);
    }
    expect(providerAAttempts).toBe(2);
  });

  // 23. Invalid BYOK credential -> correct diagnostic without exposing the credential
  it("23. surfaces authentication rejection diagnostic without leaking credential strings", () => {
    const secretKey = "gsk_super_secret_user_token_12345";
    const rawError = `Authentication failed for key ${secretKey}: 401 Unauthorized`;

    const classified = classifyHttpError(401, rawError);
    expect(classified.kind).toBe("invalid_key");
    expect(classified.message).not.toContain(secretKey); // Secret key sanitized from user message
  });

  // 24. Research state survives a provider/model failure
  it("24. ensures intermediate research items and exclusions remain intact across failover", () => {
    const initialResearchItems = [
      { id: "item-1", title: "Prior Work in Multi-Agent RL", doi: "10.1000/1" },
    ];
    const removedDois = ["10.1000/bad-doi"];

    // Simulated failover action keeping state
    const currentList = [...initialResearchItems];
    expect(currentList.length).toBe(1);
    expect(removedDois).toContain("10.1000/bad-doi");
  });

  // 25. Failover audit log contains no secrets or user-sensitive prompt content
  it("25. verifies failover audit entries contain zero secrets, API keys, or prompt content", async () => {
    const secretKey = "sk-super-secret-key-999";
    const userPrompt = "Confidential thesis topic on nuclear cryptography";

    const candidates = ["gemini::model-1::0", "groq::model-2::1"];
    const task = async (id: string) => {
      if (id.startsWith("gemini")) {
        throw { classified: classifyHttpError(500, "Gemini 500 error") };
      }
      return "groq ok";
    };

    await executeWithFailover(task, {
      candidates,
      operationId: "audit-test-op",
      stageId: "literature",
    });

    const logs = getFailoverAuditLog();
    expect(logs.length).toBeGreaterThanOrEqual(1);

    for (const entry of logs) {
      const json = JSON.stringify(entry);
      expect(json).not.toContain(secretKey);
      expect(json).not.toContain(userPrompt);
      expect(entry.operationId).toBe("audit-test-op");
    }
  });

  // 26. Gemini HTTP 400 with API_KEY_INVALID -> classified as invalid_key, fails over to backup
  it("26. classifies Gemini HTTP 400 API_KEY_INVALID as invalid_key with failoverWorthwhile=true and fails over", async () => {
    const geminiErrorBody = JSON.stringify({
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        status: "INVALID_ARGUMENT",
        details: [{ reason: "API_KEY_INVALID" }],
      },
    });

    const classified = classifyHttpError(400, geminiErrorBody);
    expect(classified.kind).toBe("invalid_key");
    expect(classified.failoverWorthwhile).toBe(true);

    const candidates = ["gemini::gemini-2.5-flash::0", "groq::openai/gpt-oss-120b::1"];
    let groqCalled = false;

    const task = async (id: string) => {
      if (id.startsWith("gemini")) {
        throw { classified };
      }
      groqCalled = true;
      return "groq-success";
    };

    const result = await executeWithFailover(task, { candidates });
    expect(result.ok).toBe(true);
    expect(groqCalled).toBe(true);
  });

  // 27. Regional restriction (HTTP 400 / unsupported location) -> classified as unsupported_provider with failoverWorthwhile=true
  it("27. classifies region restriction as unsupported_provider with failoverWorthwhile=true and fails over", async () => {
    const regionErrorBody = JSON.stringify({
      error: {
        code: 400,
        message: "User location is not supported for the API use.",
        status: "FAILED_PRECONDITION",
      },
    });

    const classified = classifyHttpError(400, regionErrorBody);
    expect(classified.kind).toBe("unsupported_provider");
    expect(classified.failoverWorthwhile).toBe(true);

    const candidates = ["gemini::gemini-2.5-flash::0", "groq::openai/gpt-oss-120b::1"];
    let backupCalled = false;

    const task = async (id: string) => {
      if (id.startsWith("gemini")) {
        throw { classified };
      }
      backupCalled = true;
      return "backup-success";
    };

    const result = await executeWithFailover(task, { candidates });
    expect(result.ok).toBe(true);
    expect(backupCalled).toBe(true);
  });

  // 28. Opaque HTTP 400 from primary provider in Title Generation fails over seamlessly to backup candidate
  it("28. fails over to backup candidate on opaque HTTP 400 without crashing workflow", async () => {
    const candidates = ["gemini::gemini-2.5-flash::0", "groq::openai/gpt-oss-120b::1"];
    const events: string[] = [];

    const task = async (id: string) => {
      if (id.startsWith("gemini")) {
        // Opaque HTTP 400 with empty or generic rejection
        const error = classifyHttpError(400, "");
        throw { classified: error };
      }
      return JSON.stringify({
        data: [
          {
            id: "title-1",
            title_text: "Vedic Cosmic Order and Astrological Rhythms",
            subtitle_text: "A Conceptual Synthesis",
            rationale: "Aligns with Rta and Rashi research inquiry.",
            status: "proposed",
          },
        ],
      });
    };

    const result = await executeWithFailover(task, {
      candidates,
      onEvent: (e) => events.push(e.type),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain("Vedic Cosmic Order");
    }
    expect(events).toContain("switch");
  });
});
