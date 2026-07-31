/**
 * Live connection testing with actionable diagnostics.
 *
 * The old "Test connection" button reported one of two things: "online", or
 * "degraded — Unexpected response". The second covered a wrong key, a spent
 * quota, an unknown model, a blocked request, and a provider outage, which
 * made it useless for the one job it had. This module runs a real request and
 * reports what actually went wrong, plus what to do about it.
 *
 * For local runners it goes one step further: when a request fails without a
 * response, a no-cors probe distinguishes "the program is running but refuses
 * requests from this page" (fixable in seconds with the runner's own CORS
 * setting) from "nothing is listening on that port" (start the program). That
 * single distinction resolves the most common local-AI support question.
 */

import type { AISettings } from "../types";
import AIGateway from "./aiGateway";
import { getCloudProvider } from "../config/providerCatalog";
import { getLocalRunner, runnerHealthUrl, resolveRunnerEndpoint } from "../config/localRunnerCatalog";
import { classifyThrownError, refineNetworkError, type ClassifiedAIError } from "./aiErrors";
import { ProviderCallError } from "./providerFailover";
import * as vault from "./apiVault";

export interface ConnectionTestResult {
  providerId: string;
  ok: boolean;
  latencyMs: number;
  /** Present only on failure */
  error?: ClassifiedAIError;
  /** Models the key can actually use, when the provider will say */
  models?: string[];
  testedAt: string;
}

/**
 * Test one provider end to end.
 *
 * Deliberately performs a real generation rather than merely listing models:
 * several providers accept a key for `/models` that is not entitled to
 * inference, so a passing model list can still mean a failing app.
 */
export async function testProviderConnection(
  providerId: string,
  settings: AISettings
): Promise<ConnectionTestResult> {
  const start = Date.now();
  const testedAt = new Date().toISOString();

  const adapter = AIGateway.getAdapter(providerId);
  if (!adapter) {
    return {
      providerId,
      ok: false,
      latencyMs: 0,
      testedAt,
      error: {
        kind: "unsupported_provider",
        label: "Unknown provider",
        message: `"${providerId}" is not a provider this app knows about.`,
        remedy: null,
        retryable: false,
        failoverWorthwhile: false,
      },
    };
  }

  if (adapter.requiresApiKey) {
    const key = await adapter.getApiKey(settings);
    if (!key) {
      return {
        providerId,
        ok: false,
        latencyMs: 0,
        testedAt,
        error: {
          kind: "invalid_key",
          label: "No API key",
          message: "No key is saved for this provider.",
          remedy: "Paste a key above, or unlock the vault if you have already saved one.",
          retryable: false,
          failoverWorthwhile: false,
        },
      };
    }
  }

  try {
    await adapter.generate(
      {
        systemInstruction: "You are a connection test. Reply with one word.",
        prompt: "Respond with exactly the word: OK",
        temperature: 0,
        taskType: "connection-test",
      },
      settings
    );

    const latencyMs = Date.now() - start;

    // Best effort — a provider that generates fine but hides its model list
    // is still a healthy provider, so failures here are ignored.
    let models: string[] | undefined;
    try {
      models = await AIGateway.discoverModels(providerId, settings);
    } catch {
      models = undefined;
    }

    if (vault.isVaultUnlocked() && vault.getEntry(providerId)) {
      await vault.recordValidation(providerId, "valid");
    }

    return { providerId, ok: true, latencyMs, models, testedAt };
  } catch (e) {
    let error: ClassifiedAIError =
      e instanceof ProviderCallError ? e.classified : classifyThrownError(e);

    // Upgrade a bare network failure into a precise CORS verdict where we can.
    const runner = getLocalRunner(providerId) || (providerId === "custom" ? getLocalRunner("lmstudio") : undefined);
    if (runner && error.kind === "network_unreachable") {
      const endpoint =
        providerId === "custom"
          ? resolveRunnerEndpoint(runner, settings.customEndpoint)
          : resolveRunnerEndpoint(runner, settings.localEndpoints?.[providerId]);
      error = await refineNetworkError(error, `${endpoint}${runner.healthPath}`, runner.corsGuidance);
    }

    if (vault.isVaultUnlocked() && vault.getEntry(providerId)) {
      const status =
        error.kind === "rate_limit" ? "rate_limited" : error.kind === "invalid_key" ? "invalid" : "error";
      await vault.recordValidation(providerId, status, error.label);
    }

    return { providerId, ok: false, latencyMs: Date.now() - start, error, testedAt };
  }
}

/** Test every provider holding a key, in parallel. */
export async function testAllConfiguredProviders(
  settings: AISettings
): Promise<Record<string, ConnectionTestResult>> {
  const ids = vault.getFailoverChain();
  const results = await Promise.all(ids.map((id) => testProviderConnection(id, settings)));
  return Object.fromEntries(results.map((r) => [r.providerId, r]));
}

export interface LocalRunnerScanResult {
  runnerId: string;
  name: string;
  endpoint: string;
  detected: boolean;
  /** Running but refusing this page's requests — fixable via corsGuidance */
  corsBlocked: boolean;
  models: string[];
  latencyMs?: number;
}

/**
 * Probe every local runner on its default port.
 *
 * A "cors blocked" result is reported as a distinct outcome from "not
 * detected" because the two need opposite advice: one means "your program is
 * running, change one setting", the other means "install or start it".
 */
export async function scanLocalRunners(settings: AISettings): Promise<LocalRunnerScanResult[]> {
  const { LOCAL_RUNNERS } = await import("../config/localRunnerCatalog");

  return Promise.all(
    LOCAL_RUNNERS.map(async (spec) => {
      const endpoint = resolveRunnerEndpoint(spec, settings.localEndpoints?.[spec.id]);
      const url = runnerHealthUrl(spec, settings.localEndpoints?.[spec.id]);
      const start = Date.now();

      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(2500) });
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const data = await resp.json();
        const models: string[] =
          spec.apiStyle === "ollama-native"
            ? (data.models || []).map((m: { name: string }) => m.name)
            : (data.data || []).map((m: { id: string }) => m.id);
        return {
          runnerId: spec.id,
          name: spec.name,
          endpoint,
          detected: true,
          corsBlocked: false,
          models,
          latencyMs: Date.now() - start,
        };
      } catch {
        const { probeReachability } = await import("./aiErrors");
        const verdict = await probeReachability(url, 2000);
        return {
          runnerId: spec.id,
          name: spec.name,
          endpoint,
          detected: false,
          corsBlocked: verdict === "cors_blocked",
          models: [],
        };
      }
    })
  );
}

/** Human-readable summary line for a test result. */
export function summariseResult(result: ConnectionTestResult): string {
  if (result.ok) {
    const modelNote = result.models?.length ? `, ${result.models.length} models available` : "";
    return `Connected in ${result.latencyMs}ms${modelNote}.`;
  }
  const error = result.error;
  if (!error) return "Failed for an unknown reason.";
  return error.remedy ? `${error.message} ${error.remedy}` : error.message;
}

/** Whether a provider needs an extra field (Cloudflare's account-scoped URL). */
export function requiresCustomBaseUrl(providerId: string): boolean {
  return getCloudProvider(providerId)?.requiresCustomBaseUrl === true;
}
