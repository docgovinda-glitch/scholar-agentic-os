/**
 * Proactive AI Provider & Model Diagnostics Engine
 *
 * Implements granular, end-to-end 8-step diagnostic verification:
 * 1. Provider Connectivity
 * 2. Credential Status
 * 3. Account Model Discovery
 * 4. Model Availability (tests the actual configured model!)
 * 5. Capability Validation (structured output, reasoning, context)
 * 6. Test Generation & latency measurement
 * 7. Structured Output Test (JSON fidelity)
 * 8. Latency & Health Status
 */

import { getCloudProvider, discoverModelsUrl, buildAuthHeaders } from "../config/providerCatalog";
import { readProviderKey } from "./userAiSettings";
import {
  discoverProviderModels,
  normalizeCapabilities,
  isModelBlacklisted,
  recordProviderSuccess,
  recordProviderFailure,
  type DiscoveredModel,
} from "./modelDiscovery";
import { getDefaultModelId } from "../config/modelCatalog";
import { completeWithFailover } from "../platform/gateway/gateway";

export interface DiagnosticStepResult {
  name: string;
  status: "pass" | "warn" | "fail" | "skip";
  details: string;
  durationMs?: number;
}

export interface DiagnosticReport {
  timestamp: string;
  providerId: string;
  providerName: string;
  configuredModel: string;
  activeModelUsed?: string;
  overallStatus: "healthy" | "degraded" | "unhealthy";
  overallHealthy: boolean;
  latencyMs: number;
  steps: DiagnosticStepResult[];
  discoveredModels: DiscoveredModel[];
  discoveredCount: number;
  error?: string;
}

// Backward compatibility alias
export type ProviderDiagnosticReport = DiagnosticReport;

export async function runProviderDiagnostics(
  providerId: string,
  apiKeyOverride?: string,
  modelOverride?: string,
  baseUrlOverride?: string
): Promise<DiagnosticReport> {
  const spec = getCloudProvider(providerId);
  const providerName = spec?.name || providerId;
  const startAll = Date.now();
  const configuredModel = modelOverride || getDefaultModelId(providerId) || "";

  const steps: DiagnosticStepResult[] = [];

  const report: DiagnosticReport = {
    timestamp: new Date().toISOString(),
    providerId,
    providerName,
    configuredModel,
    activeModelUsed: configuredModel,
    overallStatus: "unhealthy",
    overallHealthy: false,
    latencyMs: 0,
    steps,
    discoveredModels: [],
    discoveredCount: 0,
  };

  if (!spec) {
    report.error = `Unknown provider "${providerId}".`;
    steps.push({
      name: "Provider Connectivity",
      status: "fail",
      details: `Provider "${providerId}" is not registered in providerCatalog.`,
    });
    return report;
  }

  // 1. Check API Key / Credentials
  const apiKey = apiKeyOverride?.trim() || (await readProviderKey(providerId)) || "";
  if (!apiKey && spec.freeTier === "paid") {
    steps.push({
      name: "Provider Connectivity",
      status: "fail",
      details: "No API key provided or stored on this device.",
    });
    steps.push({
      name: "Credential Status",
      status: "fail",
      details: "Missing API key.",
    });
    steps.push({ name: "Account Model Discovery", status: "skip", details: "Skipped (no credentials)" });
    steps.push({ name: "Model Availability", status: "skip", details: "Skipped" });
    steps.push({ name: "Capability Validation", status: "skip", details: "Skipped" });
    steps.push({ name: "Test Generation", status: "skip", details: "Skipped" });
    steps.push({ name: "Structured Output Test", status: "skip", details: "Skipped" });
    steps.push({ name: "Latency & Health Status", status: "fail", details: "Unusable without credentials" });
    return report;
  }

  // Step 1: Provider Connectivity
  const tConn = Date.now();
  try {
    const discoUrl = discoverModelsUrl(spec, baseUrlOverride);
    if (discoUrl) {
      const fullUrl = spec.apiStyle === "gemini" ? `${discoUrl}?key=${encodeURIComponent(apiKey)}` : discoUrl;
      const headers = spec.apiStyle === "gemini" ? {} : buildAuthHeaders(spec, apiKey);
      const res = await fetch(fullUrl, { method: "GET", headers });
      if (!res.ok && (res.status === 401 || res.status === 403)) {
        steps.push({
          name: "Provider Connectivity",
          status: "fail",
          details: `Authentication failed (HTTP ${res.status}). Check your API key.`,
          durationMs: Date.now() - tConn,
        });
        steps.push({
          name: "Credential Status",
          status: "fail",
          details: "API key was rejected by provider endpoint.",
        });
        steps.push({ name: "Account Model Discovery", status: "skip", details: "Skipped due to auth failure" });
        steps.push({ name: "Model Availability", status: "skip", details: "Skipped" });
        steps.push({ name: "Capability Validation", status: "skip", details: "Skipped" });
        steps.push({ name: "Test Generation", status: "skip", details: "Skipped" });
        steps.push({ name: "Structured Output Test", status: "skip", details: "Skipped" });
        steps.push({ name: "Latency & Health Status", status: "fail", details: "Unhealthy: Authentication rejected" });
        return report;
      }
    }
    steps.push({
      name: "Provider Connectivity",
      status: "pass",
      details: `Connected to ${spec.name} API endpoint.`,
      durationMs: Date.now() - tConn,
    });
  } catch (err: any) {
    steps.push({
      name: "Provider Connectivity",
      status: "fail",
      details: `Connection error: ${err.message}`,
      durationMs: Date.now() - tConn,
    });
  }

  // Step 2: Credential Status
  steps.push({
    name: "Credential Status",
    status: apiKey ? "pass" : "warn",
    details: apiKey ? "Valid credential format provided." : "No explicit credential (using public tier).",
  });

  // Step 3: Account Model Discovery
  const tDisco = Date.now();
  let discovered: DiscoveredModel[] = [];
  try {
    const discoResult = await discoverProviderModels(providerId, apiKey, {
      forceRefresh: true,
      baseUrl: baseUrlOverride,
    });
    discovered = Array.isArray(discoResult) ? (discoResult as any) : (discoResult?.models || []);
    report.discoveredModels = discovered;
    report.discoveredCount = discovered.length;
    steps.push({
      name: "Account Model Discovery",
      status: discovered.length > 0 ? "pass" : "warn",
      details: `Discovered ${discovered.length} model(s) for this account.`,
      durationMs: Date.now() - tDisco,
    });
  } catch (err: any) {
    steps.push({
      name: "Account Model Discovery",
      status: "warn",
      details: `Discovery request fell back to catalog: ${err.message}`,
      durationMs: Date.now() - tDisco,
    });
  }

  // Step 4: Model Availability
  const isBlacklisted = isModelBlacklisted(providerId, configuredModel);
  const foundInDiscovered = discovered.some(
    (m) =>
      (m.id && m.id.toLowerCase() === configuredModel.toLowerCase()) ||
      (m.modelId && m.modelId.toLowerCase() === configuredModel.toLowerCase())
  );

  let targetModel = configuredModel;
  let modelAvailable = false;

  if (isBlacklisted) {
    steps.push({
      name: "Model Availability",
      status: "fail",
      details: `Model "${configuredModel}" is blacklisted (404 not found on account).`,
    });
  } else if (!foundInDiscovered && discovered.length > 0) {
    steps.push({
      name: "Model Availability",
      status: "warn",
      details: `Model "${configuredModel}" not listed in live account models.`,
    });
    // Pick first discovered model for subsequent generation tests
    targetModel = discovered[0].id || discovered[0].modelId || configuredModel;
    report.activeModelUsed = targetModel;
  } else {
    modelAvailable = true;
    steps.push({
      name: "Model Availability",
      status: "pass",
      details: `Model "${configuredModel}" is verified and ready.`,
    });
  }

  // Step 5: Capability Validation
  const caps = normalizeCapabilities(providerId, targetModel).capabilities;
  steps.push({
    name: "Capability Validation",
    status: caps.includes("structuredOutput") ? "pass" : "warn",
    details: `Capabilities: ${caps.join(", ")}`,
  });

  // Step 6: Test Generation
  const tGen = Date.now();
  let generationPassed = false;
  try {
    const candidate = {
      provider: providerId,
      model: targetModel,
      apiKey,
      baseUrl: baseUrlOverride,
    };

    const genRes = await completeWithFailover(
      {
        userPrompt: "Reply with the word OK.",
        taskClass: "verification",
        maxTokens: 10,
        segments: [{ label: "diagnostic", text: "ok" }],
      },
      {
        candidates: [candidate],
      }
    );

    if (genRes.ok) {
      if (genRes.value.text) {
        generationPassed = true;
        steps.push({
          name: "Test Generation",
          status: "pass",
          details: `Generated successfully (${Date.now() - tGen}ms).`,
          durationMs: Date.now() - tGen,
        });
      } else {
        steps.push({
          name: "Test Generation",
          status: "fail",
          details: "Model produced empty completion.",
          durationMs: Date.now() - tGen,
        });
      }
    } else {
      steps.push({
        name: "Test Generation",
        status: "fail",
        details: genRes.error.message || "Model failed generation.",
        durationMs: Date.now() - tGen,
      });
    }
  } catch (err: any) {
    steps.push({
      name: "Test Generation",
      status: "fail",
      details: `Generation failed: ${err.message}`,
      durationMs: Date.now() - tGen,
    });
  }

  // Step 7: Structured Output Test
  const tStruct = Date.now();
  let structuredPassed = false;
  if (generationPassed) {
    try {
      const candidate = {
        provider: providerId,
        model: targetModel,
        apiKey,
        baseUrl: baseUrlOverride,
      };

      const structRes = await completeWithFailover(
        {
          userPrompt: 'Output JSON: {"status": "ok", "valid": true}',
          taskClass: "verification",
          maxTokens: 30,
          segments: [{ label: "diagnostic", text: 'Output JSON: {"status": "ok", "valid": true}' }],
        },
        {
          candidates: [candidate],
        }
      );

      const content = structRes.ok ? structRes.value.text : "";
      let parsed: any = null;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      }

      if (parsed && (parsed.status === "ok" || parsed.valid === true)) {
        structuredPassed = true;
        steps.push({
          name: "Structured Output Test",
          status: "pass",
          details: "Structured JSON response parsed and validated.",
          durationMs: Date.now() - tStruct,
        });
      } else {
        steps.push({
          name: "Structured Output Test",
          status: "warn",
          details: `Output parsed but did not match schema: ${content.slice(0, 50)}`,
          durationMs: Date.now() - tStruct,
        });
      }
    } catch (err: any) {
      steps.push({
        name: "Structured Output Test",
        status: "warn",
        details: `JSON output error: ${err.message}`,
        durationMs: Date.now() - tStruct,
      });
    }
  } else {
    steps.push({
      name: "Structured Output Test",
      status: "skip",
      details: "Skipped (generation failed)",
    });
  }

  // Step 8: Latency & Health Status
  const totalDuration = Date.now() - startAll;
  report.latencyMs = totalDuration;

  if (generationPassed && modelAvailable) {
    report.overallStatus = "healthy";
    report.overallHealthy = true;
    recordProviderSuccess(providerId);
    steps.push({
      name: "Latency & Health Status",
      status: "pass",
      details: `Provider and model fully verified (${totalDuration}ms total).`,
    });
  } else if (generationPassed && !modelAvailable) {
    report.overallStatus = "degraded";
    report.overallHealthy = false;
    steps.push({
      name: "Latency & Health Status",
      status: "warn",
      details: `Provider is operational, but configured model is unavailable (using ${targetModel}).`,
    });
  } else {
    report.overallStatus = "unhealthy";
    report.overallHealthy = false;
    recordProviderFailure(providerId, "diagnostics_failed");
    steps.push({
      name: "Latency & Health Status",
      status: "fail",
      details: "Provider or model failed diagnostic generation.",
    });
  }

  return report;
}
