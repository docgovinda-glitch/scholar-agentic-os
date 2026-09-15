import { describe, it, expect, vi, beforeEach } from "vitest";
import { runProviderDiagnostics } from "../aiDiagnostics";
import * as modelDiscovery from "../modelDiscovery";
import * as gateway from "../../platform/gateway/gateway";

describe("aiDiagnostics: Proactive 8-Step Validation Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles missing API keys gracefully with clear diagnostic steps", async () => {
    const report = await runProviderDiagnostics("openai", "", "gpt-4o");

    expect(report.providerId).toBe("openai");
    expect(report.configuredModel).toBe("gpt-4o");
    expect(report.overallStatus).toBe("unhealthy");

    // Connectivity should fail due to missing credentials
    const connStep = report.steps.find((s) => s.name === "Provider Connectivity");
    expect(connStep?.status).toBe("fail");
    expect(connStep?.details).toContain("No API key provided");

    // Subsequent dependent steps should be skipped
    const genStep = report.steps.find((s) => s.name === "Test Generation");
    expect(genStep?.status).toBe("skip");
  });

  it("runs full diagnostic pipeline when provider and model are healthy", async () => {
    // Mock discovery
    vi.spyOn(modelDiscovery, "discoverProviderModels").mockResolvedValue([
      {
        modelId: "mock-model-v1",
        displayName: "Mock Model V1",
        contextWindow: 128000,
        capabilities: ["structuredOutput", "reasoning"],
        source: "live_api",
        discoveredAt: new Date().toISOString(),
      },
    ]);

    // Mock fetch for connectivity check
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      return new Response(JSON.stringify({ data: [{ id: "mock-model-v1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    // Mock gateway completeWithFailover
    vi.spyOn(gateway, "completeWithFailover").mockImplementation(async (req: any) => {
      if (req?.userPrompt?.includes("Output JSON")) {
        return {
          ok: true,
          value: { text: '{"status": "ok", "valid": true}', model: "mock-model-v1" },
          providerId: "openai",
          usedFallback: false,
          attempts: [],
        } as any;
      }
      return {
        ok: true,
        value: { text: "OK", model: "mock-model-v1" },
        providerId: "openai",
        usedFallback: false,
        attempts: [],
      } as any;
    });

    const report = await runProviderDiagnostics("openai", "sk-mock-valid-key", "mock-model-v1");

    expect(report.overallStatus).toBe("healthy");
    expect(report.steps.length).toBe(8);

    const modelAvail = report.steps.find((s) => s.name === "Model Availability");
    expect(modelAvail?.status).toBe("pass");

    const structTest = report.steps.find((s) => s.name === "Structured Output Test");
    expect(structTest?.status).toBe("pass");

    const healthStep = report.steps.find((s) => s.name === "Latency & Health Status");
    expect(healthStep?.status).toBe("pass");
  });

  it("reports degraded health when provider connects but configured model is unavailable", async () => {
    // Provider discovery succeeds with different models
    vi.spyOn(modelDiscovery, "discoverProviderModels").mockResolvedValue({
      ok: true,
      models: [
        {
          id: "available-model-b",
          providerId: "openai",
          displayName: "Model B",
          contextWindow: 32000,
          capabilities: ["fastGeneration"],
          source: "live_discovery",
          verifiedAt: new Date().toISOString(),
        },
      ],
      source: "live_discovery",
    } as any);

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "available-model-b" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    // Configured model was not listed, so diagnostics runs generation with the discovered model
    vi.spyOn(gateway, "completeWithFailover").mockResolvedValue({
      ok: true,
      value: { text: '{"status": "ok"}', model: "available-model-b" },
      providerId: "openai",
      usedFallback: false,
      attempts: [],
    } as any);

    const report = await runProviderDiagnostics("openai", "sk-valid-key", "retired-model-x");

    // Provider is operational via alternative model, but configured model is unavailable -> degraded
    expect(report.overallStatus).toBe("degraded");

    const modelAvail = report.steps.find((s) => s.name === "Model Availability");
    expect(modelAvail?.status).toBe("warn");
    expect(modelAvail?.details).toContain("not listed in live account");

    const genStep = report.steps.find((s) => s.name === "Test Generation");
    expect(genStep?.status).toBe("pass");
  });
});
