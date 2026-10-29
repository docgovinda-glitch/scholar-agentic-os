import { describe, it, expect, beforeEach, vi } from "vitest";

const state = vi.hoisted(() => ({
  routing: { premiumQuotaRemaining: 1000 as number | null, entitlementActive: true, quota: null as unknown },
  resources: [] as Array<{ providerId: string; label: string; modelId: string | null; credentialLabel: string }>,
  credentials: {} as Record<string, string | null>,
  deduct: "ok" as string,
  deductCalls: [] as unknown[][],
  failures: [] as string[],
  successes: [] as string[],
  ledger: [] as Record<string, unknown>[],
}));

vi.mock("../../aiEngine/userRouter.ts", () => ({ assembleUserCandidates: async () => state.routing }));
vi.mock("../../aiEngine/adminRouter.ts", () => ({ resolvePremiumResources: async () => state.resources }));
vi.mock("../../aiEngine/credentialVault.ts", () => ({
  getDecryptedCredential: async (providerId: string) => state.credentials[providerId] ?? null,
}));
vi.mock("../../aiEngine/creditEngine.ts", () => ({
  deductCredits: async (...args: unknown[]) => {
    state.deductCalls.push(args);
    return state.deduct;
  },
}));
vi.mock("../../aiEngine/providerHealth.ts", () => ({
  recordProviderFailure: async (id: string) => void state.failures.push(id),
  recordProviderSuccess: async (id: string) => void state.successes.push(id),
}));
vi.mock("../../supabaseRest.ts", () => ({
  getSupabaseRestConfig: () => ({ supabaseUrl: "https://x", serviceRoleKey: "k" }),
  SupabaseTable: class {
    async insert(row: Record<string, unknown>) {
      state.ledger.push(row);
    }
  },
}));

import { runPremium } from "../premium.ts";
import { GatewayDenied } from "../../../../src/platform/gateway/gateway.ts";
import { creditsForUsage } from "../../aiEngine/creditPolicy.ts";

const base = { userId: "u1", estimatedCredits: 10, taskType: "test_task", describe: (l: string) => `test: ${l}` };

beforeEach(() => {
  state.routing = { premiumQuotaRemaining: 1000, entitlementActive: true, quota: null };
  state.resources = [
    { providerId: "p1", label: "Writing A", modelId: "m1", credentialLabel: "default" },
    { providerId: "p2", label: "Writing B", modelId: null, credentialLabel: "default" },
  ];
  state.credentials = { p1: "key-1", p2: "key-2" };
  state.deduct = "ok";
  state.deductCalls = [];
  state.failures = [];
  state.successes = [];
  state.ledger = [];
});

describe("runPremium (the single Premium pipeline)", () => {
  it("refuses without an entitlement and never calls a provider", async () => {
    state.routing.entitlementActive = false;
    const call = vi.fn();
    const out = await runPremium({ ...base, call });
    expect(out).toMatchObject({ ok: false, status: 402 });
    expect(call).not.toHaveBeenCalled();
  });

  it("refuses before calling a provider when the balance can't cover the estimate", async () => {
    state.routing.premiumQuotaRemaining = 3;
    const call = vi.fn();
    const out = await runPremium({ ...base, call });
    expect(out).toMatchObject({ ok: false, status: 402, error: expect.stringContaining("needs about 10 credits") });
    expect(call).not.toHaveBeenCalled();
  });

  it("charges real usage, records success and shows only the resource label", async () => {
    const usage = { inputTokensEstimate: 1200, outputTokensEstimate: 800, model: "m1" };
    const out = await runPremium({ ...base, call: async () => ({ text: "done", usage }), usageOf: (r) => r.usage });
    const credits = creditsForUsage(1200, 800);
    expect(out).toEqual({
      ok: true,
      result: { text: "done", usage },
      aiSource: { tier: "premium", provider: "Writing A", model: "Writing A", creditsUsed: credits },
    });
    expect(state.deductCalls[0][1]).toBe(credits);
    expect(state.deductCalls[0][6]).toBe("test: Writing A");
    expect(state.ledger).toEqual([expect.objectContaining({ task_type: "test_task", status: "success", scholar_credits_charged: credits })]);
    expect(state.successes).toEqual(["p1"]);
  });

  it("charges the estimate when the feature reports no usage", async () => {
    const out = await runPremium({ ...base, call: async () => "ok" });
    expect(out.ok && out.aiSource.creditsUsed).toBe(10);
  });

  it("falls through to the next resource on a provider error, without charging the failed one", async () => {
    const call = vi.fn(async ({ provider }: { provider: string }) => {
      if (provider === "p1") throw new Error("upstream 500");
      return "from p2";
    });
    const out = await runPremium({ ...base, call });
    expect(out).toMatchObject({ ok: true, result: "from p2", aiSource: { provider: "Writing B" } });
    expect(state.failures).toEqual(["p1"]);
    expect(state.deductCalls).toHaveLength(1);
  });

  it("skips a resource with no credential", async () => {
    state.credentials.p1 = null;
    const out = await runPremium({ ...base, call: async ({ apiKey }) => apiKey });
    expect(out).toMatchObject({ ok: true, result: "key-2" });
  });

  it("returns 428 on a consent verdict and does not retry or charge", async () => {
    const call = vi.fn(async () => {
      throw new GatewayDenied("consent needed", true);
    });
    const out = await runPremium({ ...base, call });
    expect(out).toMatchObject({ ok: false, status: 428, provider: "p1" });
    expect(call).toHaveBeenCalledTimes(1);
    expect(state.failures).toEqual([]);
    expect(state.deductCalls).toEqual([]);
  });

  it("returns 403 on a hard Warden denial and does not retry", async () => {
    const call = vi.fn(async () => {
      throw new GatewayDenied("blocked by policy", false);
    });
    const out = await runPremium({ ...base, call });
    expect(out).toEqual({ ok: false, status: 403, error: "blocked by policy" });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("withholds the result when the charge is refused, and logs it as quota_exhausted", async () => {
    state.deduct = "daily_limit_exceeded";
    const out = await runPremium({ ...base, call: async () => "secret result" });
    expect(out).toMatchObject({ ok: false, status: 402, error: expect.stringContaining("daily") });
    expect(JSON.stringify(out)).not.toContain("secret result");
    expect(state.ledger).toEqual([expect.objectContaining({ status: "quota_exhausted", scholar_credits_charged: 0 })]);
  });

  it("reports 502 with the last error when every resource fails", async () => {
    const out = await runPremium({ ...base, call: async () => { throw new Error("all down"); } });
    expect(out).toEqual({ ok: false, status: 502, error: "all down" });
  });
});
