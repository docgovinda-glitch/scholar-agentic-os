import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { complete, GatewayDenied } from "../gateway";
import { defaultPolicy, recordConsent, markRestricted } from "../../warden/warden";
import { __resetAuditLogForTests, getAuditLog } from "../../warden/warden";

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
