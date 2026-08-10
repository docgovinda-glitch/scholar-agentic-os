/**
 * Each test uses its own provider id — the consecutive-failure counter is
 * module-level state (by design, see providerHealth.ts's header), so
 * sharing an id across tests would leak state between them.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const { recordProviderSuccess, recordProviderFailure } = await import("../providerHealth");

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch() {
  const writes: any[] = [];
  global.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.body) writes.push(JSON.parse(init.body as string));
    return Promise.resolve({ ok: true, status: 201, text: async () => "" } as Response);
  }) as unknown as typeof fetch;
  return writes;
}

describe("recordProviderSuccess", () => {
  it("writes status healthy with no error", async () => {
    const writes = mockFetch();
    await recordProviderSuccess("provider-success-1", 250);
    expect(writes[0]).toMatchObject({ provider_id: "provider-success-1", status: "healthy", latency_ms: 250, last_error: null });
  });

  it("resets the failure count — a healthy call after failures immediately reports healthy again, not degraded", async () => {
    const writes = mockFetch();
    await recordProviderFailure("provider-recover-1", "timeout");
    await recordProviderFailure("provider-recover-1", "timeout");
    await recordProviderSuccess("provider-recover-1", 100);
    // Next failure after recovery should be treated as failure #1 again, not #3.
    await recordProviderFailure("provider-recover-1", "timeout");
    const lastWrite = writes[writes.length - 1];
    expect(lastWrite.status).toBe("degraded");
  });
});

describe("recordProviderFailure", () => {
  it("marks degraded after the first failure", async () => {
    const writes = mockFetch();
    await recordProviderFailure("provider-fail-1", "500 error");
    expect(writes[0]).toMatchObject({ provider_id: "provider-fail-1", status: "degraded" });
    expect(writes[0].last_error).toContain("500 error");
  });

  it("marks down after three consecutive failures", async () => {
    const writes = mockFetch();
    await recordProviderFailure("provider-fail-2", "e1");
    await recordProviderFailure("provider-fail-2", "e2");
    await recordProviderFailure("provider-fail-2", "e3");
    expect(writes[2]).toMatchObject({ provider_id: "provider-fail-2", status: "down" });
  });

  it("stays down on further failures past the threshold", async () => {
    const writes = mockFetch();
    for (let i = 0; i < 5; i++) await recordProviderFailure("provider-fail-3", "e");
    expect(writes[4].status).toBe("down");
  });

  it("truncates a very long error message", async () => {
    const writes = mockFetch();
    await recordProviderFailure("provider-fail-4", "x".repeat(2000));
    expect(writes[0].last_error.length).toBeLessThanOrEqual(500);
  });
});
