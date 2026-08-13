// @vitest-environment jsdom
//
// Local Runtime Connectivity — the LNA-aware wrapper around
// localRunnerProbe.ts. Everything here is mocked fetch (no real local
// runtime, no real browser LNA prompt) — see this module's own header
// comment for exactly what a real machine with Chrome 142+ would still need
// to confirm that no amount of mocking here can prove.

import { describe, it, expect, vi, afterEach } from "vitest";
import { getLocalRunner } from "../../config/localRunnerCatalog";
import { checkLocalRuntimeConnectivity } from "../localRuntimeConnectivity";

const ollama = getLocalRunner("ollama")!;

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkLocalRuntimeConnectivity — reachable", () => {
  it("reports reachable with the detected models when the primary probe succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: "llama3.1:8b" }] }));

    const result = await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);

    expect(result).toEqual({
      diagnosis: "reachable",
      models: ["llama3.1:8b"],
      guidance: expect.stringContaining("reachable"),
      requiresRealMachineVerification: [],
    });
  });

  it("passes a targetAddressSpace hint on the primary fetch attempt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ models: [] }));

    await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);

    const [, init] = fetchImpl.mock.calls[0];
    expect((init as Record<string, unknown>).targetAddressSpace).toBe("local");
  });

  it("passes the address-space hint unconditionally — an environment that doesn't recognize it (per the Fetch spec) just ignores the extra field rather than needing a fallback branch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: "llama3.1:8b" }] }));

    const result = await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);

    expect(result.diagnosis).toBe("reachable");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("checkLocalRuntimeConnectivity — reachable-but-blocked", () => {
  it("reports reachable-but-blocked when the primary probe fails but the no-cors probe succeeds", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "opaque", ok: false }));

    const result = await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);

    expect(result.diagnosis).toBe("reachable-but-blocked");
    expect(result.models).toEqual([]);
    expect(result.requiresRealMachineVerification.length).toBeGreaterThan(0);
  });

  it("mentions the runner's own CORS guidance in the returned guidance text", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "opaque", ok: false }));

    const result = await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);

    expect(result.guidance).toContain(ollama.corsGuidance);
  });

  it("adds a Chromium-specific Local Network Access note only on a Chromium user agent", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "opaque", ok: false }));

    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36" });
    const chromeResult = await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);
    expect(chromeResult.guidance).toMatch(/Local Network Access/i);

    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Firefox/128.0" });
    const firefoxResult = await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);
    expect(firefoxResult.guidance).not.toMatch(/Local Network Access/i);
  });

  it("never claims to distinguish an LNA block from a plain CORS misconfiguration — the diagnosis states only what the probe can prove", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ type: "opaque", ok: false }));

    const result = await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);

    expect(result.diagnosis).not.toMatch(/lna|cors/i);
    expect(result.diagnosis).toBe("reachable-but-blocked");
  });
});

describe("checkLocalRuntimeConnectivity — unreachable", () => {
  it("reports unreachable when both the primary and the no-cors probe fail", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await checkLocalRuntimeConnectivity(ollama, undefined, fetchImpl);

    expect(result.diagnosis).toBe("unreachable");
    expect(result.requiresRealMachineVerification).toEqual([]);
  });
});

describe("checkLocalRuntimeConnectivity — endpoint override", () => {
  it("uses a private (not local) address space hint for a non-loopback override", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ models: [] }));

    await checkLocalRuntimeConnectivity(ollama, "http://192.168.1.50:11434", fetchImpl);

    const [, init] = fetchImpl.mock.calls[0];
    expect((init as Record<string, unknown>).targetAddressSpace).toBe("private");
  });
});
