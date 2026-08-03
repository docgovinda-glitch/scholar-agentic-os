import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { complete, stream, completeWithFailover, GatewayDenied } from "../gateway";
import { defaultPolicy, recordConsent, markRestricted } from "../../warden/warden";
import { __resetAuditLogForTests, getAuditLog } from "../../warden/warden";
import { isFailoverSuccess, isFailoverFailure, clearAllCooldowns } from "../../../services/providerFailover";

const originalFetch = global.fetch;

describe("platform/gateway: complete()", () => {
  beforeEach(() => {
    __resetAuditLogForTests();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("refuses restricted content without calling any provider", async () => {
    global.fetch = vi.fn();
    await expect(
      complete({
        provider: "openai",
        apiKey: "sk-test",
        taskClass: "drafting",
        userPrompt: "refine this",
        segments: [{ label: "restricted participant data", text: "..." }],
      })
    ).rejects.toBeInstanceOf(GatewayDenied);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("refuses user_content on first use without consent, and does not call the provider", async () => {
    global.fetch = vi.fn();
    let caught: GatewayDenied | undefined;
    try {
      await complete({
        provider: "openai",
        apiKey: "sk-test",
        taskClass: "drafting",
        userPrompt: "refine this",
        segments: [{ label: "Your text", text: "the sample comprised 240 participants" }],
      });
    } catch (e) {
      caught = e as GatewayDenied;
    }
    expect(caught).toBeInstanceOf(GatewayDenied);
    expect(caught?.requiresConsent).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("proceeds to call the provider once consent is recorded", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "refined text" } }] }),
    });
    let policy = defaultPolicy();
    policy = recordConsent(policy, "openai");

    const result = await complete(
      {
        provider: "openai",
        apiKey: "sk-test",
        taskClass: "drafting",
        userPrompt: "refine this",
        segments: [{ label: "Your text", text: "the sample comprised 240 participants" }],
      },
      policy
    );
    expect(result.text).toBe("refined text");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("scope-restricted content is refused even with prior provider consent", async () => {
    global.fetch = vi.fn();
    let policy = defaultPolicy();
    policy = recordConsent(policy, "openai");
    policy = markRestricted(policy, "project-1");

    await expect(
      complete(
        {
          provider: "openai",
          apiKey: "sk-test",
          taskClass: "drafting",
          scopeId: "project-1",
          userPrompt: "refine this",
          segments: [{ label: "Your text", text: "..." }],
        },
        policy
      )
    ).rejects.toBeInstanceOf(GatewayDenied);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("public/bibliographic content proceeds without any consent step", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "extracted rules" } }] }),
    });
    const result = await complete({
      provider: "openai",
      apiKey: "sk-test",
      taskClass: "rule_extraction",
      userPrompt: "extract rules",
      segments: [{ label: "published journal guideline", text: "Manuscripts must not exceed 6000 words." }],
    });
    expect(result.text).toBe("extracted rules");
  });

  it("every call, allowed or denied, is recorded in the egress audit log", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });
    try {
      await complete({
        provider: "openai",
        apiKey: "k",
        taskClass: "drafting",
        userPrompt: "x",
        segments: [{ label: "restricted data", text: "x" }],
      });
    } catch {
      /* expected */
    }
    await complete({
      provider: "openai",
      apiKey: "k",
      taskClass: "rule_extraction",
      userPrompt: "x",
      segments: [{ label: "public guideline", text: "x" }],
    });
    expect(getAuditLog()).toHaveLength(2);
  });
});

describe("platform/gateway: architectural — no bypass", () => {
  it("the package's only exported way to reach a provider is complete()", async () => {
    const mod = await import("../gateway");
    const exportedNames = Object.keys(mod);
    // adapters.ts / getAdapter must not be re-exported from the gateway entry point
    expect(exportedNames).not.toContain("getAdapter");
    expect(exportedNames).toContain("complete");
  });
});

describe("platform/gateway: stream()", () => {
  beforeEach(() => {
    __resetAuditLogForTests();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("delivers deltas via onChunk for a provider with native streaming (openai-compatible)", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n`));
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, body });

    const chunks: string[] = [];
    const result = await stream(
      {
        provider: "openai",
        apiKey: "k",
        taskClass: "rule_extraction",
        userPrompt: "hi",
        segments: [{ label: "public guideline", text: "x" }],
      },
      (delta) => chunks.push(delta)
    );

    expect(chunks).toEqual(["Hel", "lo"]);
    expect(result.text).toBe("Hello");
  });

  it("falls back to complete() and a single onChunk call for a provider without stream() (cohere)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: "whole response" }) });

    const chunks: string[] = [];
    const result = await stream(
      {
        provider: "cohere",
        apiKey: "k",
        taskClass: "rule_extraction",
        userPrompt: "hi",
        segments: [{ label: "public guideline", text: "x" }],
      },
      (delta) => chunks.push(delta)
    );

    expect(chunks).toEqual(["whole response"]);
    expect(result.text).toBe("whole response");
  });

  it("refuses restricted content without calling the provider, same as complete()", async () => {
    global.fetch = vi.fn();
    await expect(
      stream(
        {
          provider: "openai",
          apiKey: "k",
          taskClass: "drafting",
          userPrompt: "x",
          segments: [{ label: "restricted participant data", text: "..." }],
        },
        () => {}
      )
    ).rejects.toBeInstanceOf(GatewayDenied);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("platform/gateway: completeWithFailover()", () => {
  beforeEach(() => {
    __resetAuditLogForTests();
    clearAllCooldowns();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("falls to the second candidate when the first fails with a retryable/failover-worthy error", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "server error" })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: [{ text: "from anthropic" }] }) });

    const result = await completeWithFailover(
      { taskClass: "rule_extraction", userPrompt: "extract", segments: [{ label: "published guideline", text: "x" }] },
      {
        candidates: [
          { provider: "openai", apiKey: "k1" },
          { provider: "claude", apiKey: "k2" },
        ],
        maxRetriesPerProvider: 0,
      }
    );

    expect(isFailoverSuccess(result)).toBe(true);
    if (isFailoverSuccess(result)) {
      expect(result.providerId).toBe("claude");
      expect(result.value.text).toBe("from anthropic");
      expect(result.usedFallback).toBe(true);
    }
  });

  it("does not try a second candidate when the Warden hard-denies (provider-independent)", async () => {
    global.fetch = vi.fn();

    const result = await completeWithFailover(
      { taskClass: "drafting", userPrompt: "x", segments: [{ label: "restricted participant data", text: "..." }] },
      {
        candidates: [
          { provider: "openai", apiKey: "k1" },
          { provider: "claude", apiKey: "k2" },
        ],
      }
    );

    expect(isFailoverFailure(result)).toBe(true);
    if (isFailoverFailure(result)) {
      expect(result.attempts).toHaveLength(1);
      expect(result.error.kind).toBe("bad_request");
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("tries the second candidate when the Warden asks for consent, since consent is per-provider", async () => {
    global.fetch = vi.fn();

    const result = await completeWithFailover(
      {
        taskClass: "drafting",
        userPrompt: "x",
        segments: [{ label: "Your text", text: "the sample comprised 240 participants" }],
      },
      {
        candidates: [
          { provider: "openai", apiKey: "k1" },
          { provider: "claude", apiKey: "k2" },
        ],
      }
    );

    expect(isFailoverFailure(result)).toBe(true);
    if (isFailoverFailure(result)) {
      expect(result.attempts.map((a) => a.providerId)).toEqual(["openai", "claude"]);
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
