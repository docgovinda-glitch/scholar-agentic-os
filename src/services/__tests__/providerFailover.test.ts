/**
 * Failover tests.
 *
 * The behaviour under test is the promise made to the user: if a provider is
 * rate limited or fails, the work continues somewhere else without them doing
 * anything and without losing what has already been produced.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  executeWithFailover,
  ProviderCallError,
  buildContinuationRequest,
  isFailoverSuccess,
  isFailoverFailure,
  setCooldown,
  clearAllCooldowns,
  isInCooldown,
  orderCandidates,
  type FailoverEvent,
} from "../providerFailover";
import { classifyHttpError } from "../aiErrors";
import type { AIRequest } from "../../types";

beforeEach(() => {
  clearAllCooldowns();
});

function fail(providerId: string, status: number, body = "") {
  return new ProviderCallError(providerId, classifyHttpError(status, body));
}

describe("executeWithFailover — switching providers", () => {
  it("returns the first provider's result without touching the others", async () => {
    const task = vi.fn().mockResolvedValue("done");

    const result = await executeWithFailover(task, { candidates: ["groq", "gemini"] });

    expect(isFailoverSuccess(result) && result.value).toBe("done");
    expect(isFailoverSuccess(result) && result.providerId).toBe("groq");
    expect(isFailoverSuccess(result) && result.usedFallback).toBe(false);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("moves to the next provider when the first key is rejected", async () => {
    const task = vi.fn(async (id: string) => {
      if (id === "groq") throw fail("groq", 401, "Invalid key");
      return "recovered";
    });

    const result = await executeWithFailover(task, { candidates: ["groq", "gemini"] });

    expect(isFailoverSuccess(result) && result.providerId).toBe("gemini");
    expect(isFailoverSuccess(result) && result.usedFallback).toBe(true);
  });

  it("does not retry an invalid key against the same provider", async () => {
    const task = vi.fn(async () => {
      throw fail("groq", 401, "Invalid key");
    });

    await executeWithFailover(task, { candidates: ["groq"], maxRetriesPerProvider: 3 });

    // One attempt only — a rejected key cannot start working by being asked again.
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("retries the same provider on a rate limit before giving up on it", async () => {
    let calls = 0;
    const task = vi.fn(async () => {
      calls++;
      if (calls === 1) throw fail("groq", 429, "slow down");
      return "ok";
    });

    const result = await executeWithFailover(task, {
      candidates: ["groq"],
      maxRetriesPerProvider: 2,
      maxBackoffMs: 1,
    });

    expect(isFailoverSuccess(result) && result.value).toBe("ok");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on a malformed request instead of burning every saved key", async () => {
    // A bad request fails identically everywhere, so walking the chain would
    // waste one attempt per provider for no possible benefit.
    const task = vi.fn(async () => {
      throw fail("groq", 400, "messages: field required");
    });

    const result = await executeWithFailover(task, { candidates: ["groq", "gemini", "openai"] });

    expect(isFailoverFailure(result)).toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("reports the most actionable failure after exhausting the chain", async () => {
    const task = vi.fn(async (id: string) => {
      if (id === "groq") throw fail("groq", 503, "down");
      throw fail("gemini", 401, "Invalid key");
    });

    const result = await executeWithFailover(task, { candidates: ["groq", "gemini"] });

    // "Your key is wrong" is something the user can fix; "a provider was down"
    // is not, so the former is what surfaces.
    expect(isFailoverFailure(result) && result.error.kind).toBe("invalid_key");
  });

  it("fails cleanly when there is no provider to try", async () => {
    const result = await executeWithFailover(vi.fn(), { candidates: [] });

    expect(isFailoverFailure(result)).toBe(true);
    expect(isFailoverFailure(result) && result.error.message).toMatch(/no ai provider/i);
  });

  it("emits a switch event naming both providers so the UI can explain itself", async () => {
    const events: FailoverEvent[] = [];
    const task = vi.fn(async (id: string) => {
      if (id === "groq") throw fail("groq", 429, "rate limited");
      return "ok";
    });

    await executeWithFailover(task, {
      candidates: ["groq", "gemini"],
      maxRetriesPerProvider: 0,
      displayNames: { groq: "Groq", gemini: "Google Gemini" },
      onEvent: (e) => events.push(e),
    });

    const message = events.find((e) => e.type === "switch")?.userMessage;
    expect(message).toContain("Groq");
    expect(message).toContain("Google Gemini");
  });

  it("propagates an abort instead of swallowing it as a provider failure", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeWithFailover(vi.fn().mockResolvedValue("x"), {
        candidates: ["groq"],
        signal: controller.signal,
      })
    ).rejects.toThrow(/abort/i);
  });
});

describe("cooldowns", () => {
  it("parks a rate-limited provider for the duration it asked for", async () => {
    const headers = new Headers({ "retry-after": "30" });
    const task = vi.fn(async () => {
      throw new ProviderCallError("groq", classifyHttpError(429, "slow", headers));
    });

    await executeWithFailover(task, { candidates: ["groq"], maxRetriesPerProvider: 0 });

    expect(isInCooldown("groq")).toBe(true);
  });

  it("demotes a cooling provider rather than dropping it", () => {
    // Still better to try a cooling provider than to fail outright.
    setCooldown("groq", 60_000);

    expect(orderCandidates(["groq", "gemini"])).toEqual(["gemini", "groq"]);
  });

  it("clears the cooldown once a provider succeeds", async () => {
    setCooldown("groq", 60_000);

    await executeWithFailover(vi.fn().mockResolvedValue("ok"), { candidates: ["groq"] });

    expect(isInCooldown("groq")).toBe(false);
  });

  it("expires a cooldown when its time has passed", () => {
    setCooldown("groq", -1);
    expect(isInCooldown("groq")).toBe(false);
  });
});

describe("buildContinuationRequest — the no-work-lost mechanism", () => {
  const base: AIRequest = {
    systemInstruction: "You are an academic writing assistant.",
    prompt: "Draft the methodology section.",
    temperature: 0.8,
    taskType: "drafting",
  };

  it("hands the partial output to the replacement provider as context", () => {
    const partial = "This study adopts a mixed-methods design in which";

    const continuation = buildContinuationRequest(base, partial);

    expect(continuation.prompt).toContain(partial);
    expect(continuation.prompt).toContain(base.prompt);
  });

  it("instructs the replacement not to repeat or reintroduce", () => {
    // Without this, a model handed a partial answer will typically restate it,
    // which the reader sees as duplicated text rather than a seamless resume.
    const continuation = buildContinuationRequest(base, "Some existing text");

    expect(continuation.prompt).toMatch(/do not repeat/i);
    expect(continuation.prompt).toMatch(/do not add a new introduction/i);
  });

  it("lowers temperature so the continuation matches what came before", () => {
    expect(buildContinuationRequest(base, "text").temperature).toBeLessThanOrEqual(0.4);
  });

  it("leaves the request untouched when nothing was produced yet", () => {
    // Nothing to preserve means this should be an ordinary fresh attempt.
    expect(buildContinuationRequest(base, "   ")).toBe(base);
  });

  it("preserves the system instruction and task type across the switch", () => {
    const continuation = buildContinuationRequest(base, "text");

    expect(continuation.systemInstruction).toBe(base.systemInstruction);
    expect(continuation.taskType).toBe(base.taskType);
  });
});
