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
import { getDefaultModelId } from "../config/modelCatalog";

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
      const endpoint = prefs[`${providerId}Endpoint`] || localRunner.defaultEndpoint;
      const model = prefs[`${providerId}Model`] || prefs.model || "";
      const isConfigured = Boolean(endpoint);
      const config: ClientAiRuntimeConfig = {
        provider: providerId,
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
    const key = await readProviderKey(providerId);
    const customBaseUrl = prefs[`${providerId}BaseUrl`];
    const preferredModel = prefs[`${providerId}Model`] || prefs.model;

    if (key) {
      const discovered = getCachedDiscoveredModels(providerId, key) || [];
      const activeModel = preferredModel || discovered[0]?.id || (cloudSpec ? getDefaultModelId(cloudSpec.id) : "");
      const config: ClientAiRuntimeConfig = {
        provider: providerId,
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
      const altKey = await readProviderKey(altProviderId);
      if (altKey) {
        const spec = getCloudProvider(altProviderId);
        const altDiscovered = getCachedDiscoveredModels(altProviderId, altKey) || [];
        const altModel = prefs[`${altProviderId}Model`] || altDiscovered[0]?.id || (spec ? getDefaultModelId(spec.id) : "");
        const config: ClientAiRuntimeConfig = {
          provider: altProviderId,
          providerName: spec?.name || altProviderId,
          modelId: altModel,
          apiKey: altKey,
          baseUrl: prefs[`${altProviderId}BaseUrl`] || undefined,
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
