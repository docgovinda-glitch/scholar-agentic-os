/**
 * Client-Side AI Provider Key Verifier
 *
 * Verifies user BYOK API keys directly from the browser without ever
 * sending credentials to the Scholar backend server.
 *
 * Handles three distinct provider realities:
 * 1. Direct browser fetch succeeds (e.g. Gemini, OpenRouter, Groq).
 * 2. Provider API rejects key (401/403) -> returns definitive error.
 * 3. Browser CORS preflight blocked (e.g. OpenAI, Anthropic without dangerous flag) ->
 *    gracefully returns ok: true with deferred verification flag so the user
 *    can save their key locally and have it verified during first task execution.
 */

import { getCloudProvider, discoverModelsUrl, buildAuthHeaders } from "../config/providerCatalog";

export interface ClientVerifyResult {
  ok: boolean;
  modelsDetected?: number;
  error?: string;
  deferred?: boolean;
  note?: string;
}

export async function clientVerifyProviderKey(
  providerId: string,
  apiKey: string,
  baseUrlOverride?: string
): Promise<ClientVerifyResult> {
  const spec = getCloudProvider(providerId);
  if (!spec) {
    return { ok: false, error: `Unknown provider "${providerId}".` };
  }

  const url = discoverModelsUrl(spec, baseUrlOverride);
  if (!url) {
    // Provider does not publish a live models endpoint (e.g. custom base URL or static catalog)
    return { ok: true, deferred: true };
  }

  const fullUrl = spec.apiStyle === "gemini" ? `${url}?key=${encodeURIComponent(apiKey)}` : url;
  const headers = spec.apiStyle === "gemini" ? {} : buildAuthHeaders(spec, apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(fullUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: "That key was rejected by the provider (invalid API key or unauthorized)." };
      }
      return { ok: false, error: `The provider returned an error (${response.status}).` };
    }

    const data = (await response.json().catch(() => null)) as { data?: unknown[]; models?: unknown[] } | null;
    const modelsDetected = Array.isArray(data?.data)
      ? data.data.length
      : Array.isArray(data?.models)
      ? data.models.length
      : undefined;

    return { ok: true, modelsDetected };
  } catch (err) {
    // A fetch error in the browser indicates either a network drop, timeout, or a CORS block.
    // In keeping with the client-only credential boundary, we do NOT fall back to a server proxy.
    // Instead, we allow the key to be saved locally and verified on first use.
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      ok: true,
      deferred: true,
      note: isAbort
        ? "Provider connection timed out. Key saved locally on your device."
        : "Direct browser verification is unavailable for this provider (CORS policy). Key saved locally and will be verified upon first use.",
    };
  } finally {
    clearTimeout(timer);
  }
}
