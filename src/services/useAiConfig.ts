/**
 * Unified Client AI Configuration Service & React Hook
 *
 * Implements the Strict Client-Owned BYOK / Local AI Architecture:
 * - Reads user's active provider, modelId, apiKey, and baseUrl from client storage.
 * - Platform never sponsors or provides server-managed keys.
 * - Broadcasts configuration updates via CustomEvents so all workspaces update in real-time.
 */

import { useState, useEffect, useCallback } from "react";
import { loadUserAiSettings, readProviderKey, providersWithStoredKey, type UserAiSettings } from "./userAiSettings";
import { getCloudProvider } from "../config/providerCatalog";
import { LOCAL_RUNNERS } from "../config/localRunnerCatalog";
import { getCachedDiscoveredModels } from "./modelDiscovery";
import { getDefaultModelId, MODEL_CATALOG } from "../config/modelCatalog";

/**
 * Strips any non-ISO-8859-1 / non-printable ASCII characters so a header value
 * never causes `window.fetch` to throw `String contains non ISO-8859-1 code point`.
 */
export function sanitizeHeaderAscii(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  return value.replace(/[^\x20-\x7E]/g, "").trim();
}

/**
 * Cleans a user-entered API key: strips accidental "Bearer " prefixes, smart quotes,
 * zero-width spaces, or non-ASCII characters, and rejects masked bullet strings (••••).
 */
export function sanitizeClientApiKey(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";
  const hadBullets = /[\u2022\u25CF\u2217]/.test(raw);
  const cleaned = raw
    .replace(/^\s*bearer\s+/i, "")
    .replace(/["'“”‘’]/g, "")
    .replace(/[^\x21-\x7E]/g, "")
    .trim();
  if (hadBullets && cleaned.length < 12) return "";
  return cleaned;
}

/**
 * Cleans a stored or user-entered model ID: strips UI badge suffixes (e.g. " — unverified",
 * " (Live Discovered)"), maps human display names back to catalog model IDs, and ensures
 * pure printable ASCII with no spaces.
 */
export function sanitizeClientModelId(
  providerId: string,
  rawModel: string | null | undefined,
  fallbackModel?: string
): string {
  const defaultId = fallbackModel || (providerId ? getDefaultModelId(providerId) : "");
  if (!rawModel || typeof rawModel !== "string") return sanitizeHeaderAscii(defaultId);

  const stripped = rawModel
    .split(/\s*(?:—|–|\u2014|\u2013|\u00B7)\s*/)[0]
    .replace(/\s*\((?:Live Discovered|deprecated|preview|unverified)\)\s*$/i, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();

  if (!stripped) return sanitizeHeaderAscii(defaultId);

  // If the stored value is a human displayName (e.g. "Gemini 2.5 Flash"), map it to its catalog modelId
  const catalogMatch = MODEL_CATALOG.find(
    (m) =>
      (m.providerId === providerId || !providerId) &&
      (m.modelId.toLowerCase() === stripped.toLowerCase() ||
        m.displayName.toLowerCase() === stripped.toLowerCase())
  );
  if (catalogMatch) return catalogMatch.modelId;

  // API model IDs do not contain spaces; if spaces remain, fall back to the provider default
  if (/\s/.test(stripped)) {
    return sanitizeHeaderAscii(defaultId);
  }

  return stripped;
}

export interface ClientAiRuntimeConfig {
  provider: string;
  providerName: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  isConfigured: boolean;
  isLocal: boolean;
  tier: "byok" | "local" | "none";
}

let cachedRuntimeConfig: ClientAiRuntimeConfig | null = null;
let lastFetchTime = 0;

/**
 * Resolves the user's active client AI runtime configuration.
 * Results are cached for 3 seconds to avoid redundant decryption round-trips.
 */
export async function getClientAiRuntimeConfig(forceFresh = false): Promise<ClientAiRuntimeConfig> {
  const now = Date.now();
  if (!forceFresh && cachedRuntimeConfig && now - lastFetchTime < 3000) {
    return cachedRuntimeConfig;
  }

  try {
    const settings: UserAiSettings = await loadUserAiSettings();
    const providerId = settings.provider || "gemini";
    const prefs = settings.preferences || {};

    // 1. Check if configured as a local runner
    const localRunner = LOCAL_RUNNERS.find((r) => r.id === providerId);
    if (localRunner) {
      const endpoint = sanitizeHeaderAscii(prefs[`${providerId}Endpoint`] || localRunner.defaultEndpoint);
      const model = sanitizeHeaderAscii(prefs[`${providerId}Model`] || prefs.model || "");
      const isConfigured = Boolean(endpoint);
      const config: ClientAiRuntimeConfig = {
        provider: sanitizeHeaderAscii(providerId),
        providerName: localRunner.name,
        modelId: model || "default",
        baseUrl: endpoint,
        apiKey: "local-no-credential-required",
        isConfigured,
        isLocal: true,
        tier: "local",
      };
      cachedRuntimeConfig = config;
      lastFetchTime = now;
      return config;
    }

    // 2. Cloud provider check
    const cloudSpec = getCloudProvider(providerId);
    const rawKey = await readProviderKey(providerId);
    const key = sanitizeClientApiKey(rawKey);
    const customBaseUrl = sanitizeHeaderAscii(prefs[`${providerId}BaseUrl`] || prefs[`${providerId}Endpoint`]);
    const preferredModel = prefs[`${providerId}Model`] || prefs.model;

    if (key) {
      const discovered = getCachedDiscoveredModels(providerId, key) || [];
      const fallbackModel = discovered[0]?.id || (cloudSpec ? getDefaultModelId(cloudSpec.id) : "");
      const activeModel = sanitizeClientModelId(providerId, preferredModel, fallbackModel);
      const config: ClientAiRuntimeConfig = {
        provider: sanitizeHeaderAscii(providerId),
        providerName: cloudSpec?.name || providerId,
        modelId: activeModel,
        apiKey: key,
        baseUrl: customBaseUrl || undefined,
        isConfigured: true,
        isLocal: false,
        tier: "byok",
      };
      cachedRuntimeConfig = config;
      lastFetchTime = now;
      return config;
    }

    // 3. Fallback: check if any other provider has a stored key on this device
    const stored = providersWithStoredKey();
    for (const altProviderId of stored) {
      const rawAltKey = await readProviderKey(altProviderId);
      const altKey = sanitizeClientApiKey(rawAltKey);
      if (altKey) {
        const spec = getCloudProvider(altProviderId);
        const altDiscovered = getCachedDiscoveredModels(altProviderId, altKey) || [];
        const altFallback = altDiscovered[0]?.id || (spec ? getDefaultModelId(spec.id) : "");
        const altModel = sanitizeClientModelId(altProviderId, prefs[`${altProviderId}Model`], altFallback);
        const altBaseUrl = sanitizeHeaderAscii(prefs[`${altProviderId}BaseUrl`] || prefs[`${altProviderId}Endpoint`]);
        const config: ClientAiRuntimeConfig = {
          provider: sanitizeHeaderAscii(altProviderId),
          providerName: spec?.name || altProviderId,
          modelId: altModel,
          apiKey: altKey,
          baseUrl: altBaseUrl || undefined,
          isConfigured: true,
          isLocal: false,
          tier: "byok",
        };
        cachedRuntimeConfig = config;
        lastFetchTime = now;
        return config;
      }
    }

    // 4. Deterministic offline mode (zero keys or local runners)
    const config: ClientAiRuntimeConfig = {
      provider: "",
      providerName: "",
      modelId: "",
      isConfigured: false,
      isLocal: false,
      tier: "none",
    };
    cachedRuntimeConfig = config;
    lastFetchTime = now;
    return config;
  } catch {
    const fallback: ClientAiRuntimeConfig = {
      provider: "",
      providerName: "",
      modelId: "",
      isConfigured: false,
      isLocal: false,
      tier: "none",
    };
    cachedRuntimeConfig = fallback;
    lastFetchTime = now;
    return fallback;
  }
}

/**
 * Invalidates cached runtime configuration and notifies all active workspace subscribers.
 */
export function invalidateClientAiRuntimeConfig(): void {
  cachedRuntimeConfig = null;
  lastFetchTime = 0;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("scholar:ai-config-changed"));
  }
}

/**
 * React hook for consuming and observing active AI configuration in workspace UI headers and panels.
 */
export function useAiConfig(): {
  config: ClientAiRuntimeConfig;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [config, setConfig] = useState<ClientAiRuntimeConfig>(() => cachedRuntimeConfig || {
    provider: "",
    providerName: "",
    modelId: "",
    isConfigured: false,
    isLocal: false,
    tier: "none",
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const fresh = await getClientAiRuntimeConfig(true);
    setConfig(fresh);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const handleUpdate = () => {
      void refresh();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("scholar:ai-config-changed", handleUpdate);
      window.addEventListener("storage", handleUpdate);
      return () => {
        window.removeEventListener("scholar:ai-config-changed", handleUpdate);
        window.removeEventListener("storage", handleUpdate);
      };
    }
  }, [refresh]);

  return { config, loading, refresh };
}
