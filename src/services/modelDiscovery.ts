/**
 * Dynamic AI Model Discovery & Health System
 *
 * Implements:
 * 1. Live account-level model discovery via provider endpoints.
 * 2. Secure, non-secret client metadata caching (no API keys in cache).
 * 3. Conservative, multi-layer capability normalization.
 * 4. Runtime session blacklisting for dead/retired models (prevents retry storms).
 * 5. Distinct provider-health state machine (separating model-unavailable from provider-unavailable).
 */

import {
  getCloudProvider,
  discoverModelsUrl,
  buildAuthHeaders,
  type CloudProviderSpec,
} from "../config/providerCatalog";

export type NormalizedCapability =
  | "reasoning"
  | "structuredOutput"
  | "toolCalling"
  | "vision"
  | "longContext"
  | "fastGeneration"
  | "documentAnalysis"
  | "coding";

export interface DiscoveredModel {
  id: string;
  modelId?: string;
  providerId: string;
  displayName: string;
  capabilities: NormalizedCapability[];
  contextWindow?: number;
  inputModalities?: ("text" | "image" | "document" | "audio")[];
  source: "live_discovery" | "compatibility_fallback";
  verifiedAt: string;
}

export interface CachedDiscoveryResult {
  providerId: string;
  accountFingerprint: string;
  timestamp: number;
  models: DiscoveredModel[];
  source: "live_discovery" | "compatibility_fallback";
}

const DISCOVERY_CACHE_PREFIX = "scholar_discovered_models:";
const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL

/* -------------------------------------------------------------------------
 * Helper: Fingerprint non-secret hash of key
 * ---------------------------------------------------------------------- */
function computeKeyFingerprint(key: string): string {
  if (!key) return "anonymous";
  // Blind deterministic hash for non-secret cache indexing - 0 key characters exposed
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) + key.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

/* -------------------------------------------------------------------------
 * Model Capability Normalization
 * ---------------------------------------------------------------------- */
export function normalizeCapabilities(
  providerId: string,
  modelId: string,
  rawMeta?: any
): { capabilities: NormalizedCapability[]; contextWindow?: number } {
  const caps = new Set<NormalizedCapability>();
  const idLower = modelId.toLowerCase();
  let contextWindow = 128_000;

  // 1. Provider-level baseline capabilities
  if (providerId === "gemini") {
    caps.add("structuredOutput");
    caps.add("vision");
    caps.add("documentAnalysis");
    caps.add("longContext");
    contextWindow = 1_000_000;

    if (idLower.includes("flash")) {
      caps.add("fastGeneration");
      caps.add("reasoning");
    }
    if (idLower.includes("pro") || idLower.includes("thinking") || idLower.includes("exp")) {
      caps.add("reasoning");
      caps.add("coding");
    }
  } else if (providerId === "groq") {
    caps.add("fastGeneration");
    contextWindow = 131_072;

    if (
      idLower.includes("llama") ||
      idLower.includes("gpt-oss") ||
      idLower.includes("mixtral") ||
      idLower.includes("qwen") ||
      idLower.includes("deepseek") ||
      rawMeta?.supportsStructuredOutput === true
    ) {
      caps.add("structuredOutput");
      caps.add("toolCalling");
    }

    if (
      idLower.includes("70b") ||
      idLower.includes("120b") ||
      idLower.includes("r1") ||
      idLower.includes("reason")
    ) {
      caps.add("reasoning");
      caps.add("coding");
    }
  } else if (providerId === "claude" || providerId === "anthropic") {
    caps.add("structuredOutput");
    caps.add("toolCalling");
    caps.add("vision");
    caps.add("documentAnalysis");
    caps.add("longContext");
    caps.add("reasoning");
    contextWindow = 200_000;

    if (idLower.includes("haiku")) {
      caps.add("fastGeneration");
    }
    if (idLower.includes("sonnet") || idLower.includes("opus")) {
      caps.add("coding");
    }
  } else if (providerId === "openai") {
    caps.add("structuredOutput");
    caps.add("toolCalling");
    caps.add("reasoning");
    contextWindow = 128_000;

    if (idLower.includes("mini") || idLower.includes("nano")) {
      caps.add("fastGeneration");
    }
    if (idLower.includes("o1") || idLower.includes("o3") || idLower.includes("gpt-4o")) {
      caps.add("coding");
      caps.add("vision");
    }
  } else if (providerId === "openrouter") {
    caps.add("structuredOutput");
    if (idLower.includes("free") || idLower.includes("flash")) {
      caps.add("fastGeneration");
    }
    if (idLower.includes("r1") || idLower.includes("reason") || idLower.includes("70b")) {
      caps.add("reasoning");
    }
  } else if (providerId === "mistral") {
    caps.add("structuredOutput");
    caps.add("toolCalling");
    caps.add("reasoning");
    if (idLower.includes("small") || idLower.includes("nemo")) {
      caps.add("fastGeneration");
    }
    if (idLower.includes("large") || idLower.includes("codestral")) {
      caps.add("coding");
    }
  } else if (providerId === "xai") {
    caps.add("structuredOutput");
    caps.add("toolCalling");
    caps.add("reasoning");
    caps.add("vision");
    contextWindow = 131_072;
  } else if (providerId === "cerebras") {
    caps.add("fastGeneration");
    caps.add("structuredOutput");
    if (idLower.includes("70b")) {
      caps.add("reasoning");
    }
  } else if (providerId === "together" || providerId === "fireworks" || providerId === "deepseek") {
    caps.add("structuredOutput");
    caps.add("toolCalling");
    caps.add("reasoning");
    contextWindow = 131_072;
    if (idLower.includes("70b") || idLower.includes("v3") || idLower.includes("r1")) {
      caps.add("coding");
      caps.add("longContext");
    }
  } else {
    // Generic open model defaults
    caps.add("fastGeneration");
    if (idLower.includes("instruct") || idLower.includes("chat") || idLower.includes("llama") || idLower.includes("qwen")) {
      caps.add("reasoning");
      caps.add("structuredOutput");
    }
  }

  // 2. Defensive metadata overrides if provided by live provider discovery payload
  if (
    rawMeta?.supportsStructuredOutput === true ||
    rawMeta?.supports_structured_output === true ||
    rawMeta?.supports_json === true ||
    rawMeta?.features?.structured_output === true ||
    (Array.isArray(rawMeta?.supportedGenerationMethods) && rawMeta.supportedGenerationMethods.includes("generateContent"))
  ) {
    caps.add("structuredOutput");
  }

  // Vision / Multimodal modality validation from live metadata
  const modalityStr = String(
    rawMeta?.architecture?.modality ||
    rawMeta?.modalities?.join?.(",") ||
    rawMeta?.input_modalities?.join?.(",") ||
    ""
  ).toLowerCase();
  if (modalityStr.includes("image") || modalityStr.includes("multimodal") || modalityStr.includes("vision")) {
    caps.add("vision");
  }

  // Context window from explicit provider metadata
  const explicitCtx =
    rawMeta?.context_window ||
    rawMeta?.context_length ||
    rawMeta?.inputTokenLimit ||
    rawMeta?.max_context_length;
  if (typeof explicitCtx === "number" && explicitCtx > 0) {
    contextWindow = explicitCtx;
  }

  if (contextWindow >= 100_000) {
    caps.add("longContext");
  }

  return { capabilities: Array.from(caps), contextWindow };
}

/**
 * Defensive runtime capability validation: ensures a model strictly qualifies
 * before dispatching demanding agentic tasks.
 */
export function validateModelCapabilityRuntime(
  providerId: string,
  modelId: string,
  requiredCapabilities: NormalizedCapability[],
  rawMeta?: any
): { ok: boolean; missingCapabilities: NormalizedCapability[]; contextWindow?: number } {
  const { capabilities, contextWindow } = normalizeCapabilities(providerId, modelId, rawMeta);
  const missing = requiredCapabilities.filter((req) => !capabilities.includes(req));
  return {
    ok: missing.length === 0,
    missingCapabilities: missing,
    contextWindow,
  };
}

/* -------------------------------------------------------------------------
 * Session Dead-Model Blacklist
 * ---------------------------------------------------------------------- */
const blacklistedModels = new Map<string, { reason: string; timestamp: number }>();

export function blacklistModel(providerId: string, modelId: string, reason: string = "model_not_found"): void {
  const cleanModel = modelId.toLowerCase().replace(/^models\//, "");
  const key = `${providerId.toLowerCase()}:${cleanModel}`;
  blacklistedModels.set(key, { reason, timestamp: Date.now() });
}

export function isModelBlacklisted(providerId: string, modelId: string): boolean {
  const cleanModel = modelId.toLowerCase().replace(/^models\//, "");
  const key = `${providerId.toLowerCase()}:${cleanModel}`;
  return blacklistedModels.has(key);
}

export function clearModelBlacklist(): void {
  blacklistedModels.clear();
}

export function getBlacklistedModels(): Array<{ providerId: string; modelId: string; reason: string }> {
  return Array.from(blacklistedModels.entries()).map(([k, v]) => {
    const [providerId, modelId] = k.split(":");
    return { providerId, modelId, reason: v.reason };
  });
}

/* -------------------------------------------------------------------------
 * Provider-Health State Machine
 * ---------------------------------------------------------------------- */
export type ProviderHealthStatus =
  | "healthy"
  | "degraded"
  | "cooldown"
  | "auth_failure"
  | "auth_failed"
  | "rate_limited"
  | "outage"
  | "offline";

export interface ProviderHealthState {
  status: ProviderHealthStatus;
  lastFailureTime?: number;
  cooldownUntil?: number;
  errorKind?: string;
  errorMessage?: string;
  consecutiveFailures: number;
}

const providerHealthMap = new Map<string, ProviderHealthState>();

export function recordProviderFailure(
  providerId: string,
  errorKind: string | number,
  retryAfterOrMessage?: number | string,
  messageOrRetryAfter?: string | number
): void {
  const retryAfterMsOrSeconds =
    typeof retryAfterOrMessage === "number"
      ? retryAfterOrMessage
      : typeof messageOrRetryAfter === "number"
      ? messageOrRetryAfter
      : undefined;

  const message =
    typeof retryAfterOrMessage === "string"
      ? retryAfterOrMessage
      : typeof messageOrRetryAfter === "string"
      ? messageOrRetryAfter
      : undefined;

  const id = providerId.toLowerCase();
  const current = providerHealthMap.get(id) || { status: "healthy", consecutiveFailures: 0 };
  const failures = current.consecutiveFailures + 1;
  const now = Date.now();

  let status: ProviderHealthStatus = "degraded";
  let cooldownUntil = 0;

  const isAuth =
    errorKind === "invalid_key" ||
    errorKind === "unauthorized" ||
    errorKind === 401 ||
    errorKind === 403 ||
    errorKind === "401" ||
    errorKind === "403" ||
    errorKind === "auth_failed";

  const isRateLimit =
    errorKind === "rate_limit" ||
    errorKind === "rate_limited" ||
    errorKind === 429 ||
    errorKind === "429";

  const isOutage =
    errorKind === "outage" ||
    errorKind === "service_unavailable" ||
    errorKind === "server_error" ||
    errorKind === 500 ||
    errorKind === 502 ||
    errorKind === 503 ||
    errorKind === 504 ||
    errorKind === "500" ||
    errorKind === "503";

  if (isAuth) {
    status = "auth_failed";
    cooldownUntil = now + 60 * 60 * 1000; // 1 hr
  } else if (isRateLimit) {
    status = "rate_limited";
    const retryMs =
      retryAfterMsOrSeconds && retryAfterMsOrSeconds > 0
        ? retryAfterMsOrSeconds < 1000
          ? retryAfterMsOrSeconds * 1000
          : retryAfterMsOrSeconds
        : Math.min(60_000, 1000 * Math.pow(2, failures));
    cooldownUntil = now + retryMs;
  } else if (isOutage) {
    status = "outage";
    cooldownUntil = now + Math.min(60_000, 5000 * failures);
  } else if (errorKind === "cors_blocked") {
    status = "offline";
    cooldownUntil = now + 10 * 60 * 1000;
  } else {
    status = failures >= 3 ? "offline" : "degraded";
    cooldownUntil = now + Math.min(30_000, 1000 * failures);
  }

  providerHealthMap.set(id, {
    status,
    lastFailureTime: now,
    cooldownUntil,
    errorKind: String(errorKind),
    errorMessage: message,
    consecutiveFailures: failures,
  });
}

export function recordProviderSuccess(providerId: string): void {
  const id = providerId.toLowerCase();
  providerHealthMap.set(id, {
    status: "healthy",
    consecutiveFailures: 0,
    cooldownUntil: undefined,
  });
}

export function getProviderHealth(providerId: string): ProviderHealthState {
  const id = providerId.toLowerCase();
  const state = providerHealthMap.get(id);
  if (!state) return { status: "healthy", consecutiveFailures: 0 };

  if (state.cooldownUntil && Date.now() >= state.cooldownUntil) {
    return { ...state, status: "healthy", cooldownUntil: undefined };
  }
  return state;
}

export function isProviderAvailable(providerId: string): boolean {
  const health = getProviderHealth(providerId);
  if (health.cooldownUntil && Date.now() < health.cooldownUntil) {
    return false;
  }
  return health.status === "healthy" || health.status === "degraded";
}

export function clearAllProviderHealth(): void {
  providerHealthMap.clear();
}

export const clearProviderHealth = clearAllProviderHealth;

export function normalizeDiscoveredCapabilities(
  providerId: string,
  modelId: string,
  rawMeta?: any
): NormalizedCapability[] {
  return normalizeCapabilities(providerId, modelId, rawMeta).capabilities;
}

/* -------------------------------------------------------------------------
 * Discovery Cache Management (Non-sensitive metadata only)
 * ---------------------------------------------------------------------- */
export function getCachedDiscoveredModels(
  providerId: string,
  apiKey?: string
): DiscoveredModel[] | null {
  try {
    const key = `${DISCOVERY_CACHE_PREFIX}${providerId.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedDiscoveryResult;
    if (!parsed || !Array.isArray(parsed.models)) return null;

    // Check account fingerprint match if key provided
    if (apiKey && parsed.accountFingerprint !== computeKeyFingerprint(apiKey)) {
      return null;
    }

    // Check freshness
    if (Date.now() - parsed.timestamp > DISCOVERY_TTL_MS) {
      return null;
    }

    // Filter out blacklisted models from cached output
    return parsed.models
      .filter((m) => !isModelBlacklisted(providerId, m.id || m.modelId || ""))
      .map((m) => ({ ...m, modelId: m.modelId || m.id }));
  } catch {
    return null;
  }
}

export function setCachedDiscoveredModels(
  providerId: string,
  apiKey: string,
  models: DiscoveredModel[],
  source: "live_discovery" | "compatibility_fallback" = "live_discovery"
): void {
  try {
    const key = `${DISCOVERY_CACHE_PREFIX}${providerId.toLowerCase()}`;
    const mapped = models.map((m) => ({
      ...m,
      id: m.id || m.modelId || "",
      modelId: m.modelId || m.id || "",
    }));
    const payload: CachedDiscoveryResult = {
      providerId: providerId.toLowerCase(),
      accountFingerprint: computeKeyFingerprint(apiKey),
      timestamp: Date.now(),
      models: mapped,
      source,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // LocalStorage full or blocked in private mode
  }
}

export const cacheDiscoveredModels = setCachedDiscoveredModels;

/* -------------------------------------------------------------------------
 * Live Account Discovery
 * ---------------------------------------------------------------------- */
export async function discoverProviderModels(
  providerId: string,
  apiKey: string,
  baseUrlOverrideOrOptions?: string | { baseUrl?: string; forceRefresh?: boolean },
  forceRefreshOption: boolean = false
): Promise<{ ok: boolean; models: DiscoveredModel[]; source: "live_discovery" | "compatibility_fallback"; error?: string }> {
  let baseUrlOverride: string | undefined;
  let forceRefresh = forceRefreshOption;

  if (typeof baseUrlOverrideOrOptions === "object" && baseUrlOverrideOrOptions !== null) {
    baseUrlOverride = baseUrlOverrideOrOptions.baseUrl;
    forceRefresh = baseUrlOverrideOrOptions.forceRefresh ?? false;
  } else if (typeof baseUrlOverrideOrOptions === "string") {
    baseUrlOverride = baseUrlOverrideOrOptions;
  }

  const spec = getCloudProvider(providerId);
  if (!spec) {
    return { ok: false, models: [], source: "compatibility_fallback", error: `Unknown provider "${providerId}".` };
  }

  // 1. Check cache first unless forceRefresh
  if (!forceRefresh) {
    const cached = getCachedDiscoveredModels(providerId, apiKey);
    if (cached && cached.length > 0) {
      return { ok: true, models: cached, source: "live_discovery" };
    }
  }

  const url = discoverModelsUrl(spec, baseUrlOverride);
  if (!url) {
    // Provider does not publish discovery endpoint (e.g. Cloudflare custom or local runner)
    const fallback = getCompatibilityFallbacks(spec);
    return { ok: true, models: fallback, source: "compatibility_fallback" };
  }

  const fullUrl = spec.apiStyle === "gemini" ? `${url}?key=${encodeURIComponent(apiKey)}` : url;
  const headers = spec.apiStyle === "gemini" ? {} : buildAuthHeaders(spec, apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(fullUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        recordProviderFailure(providerId, "invalid_key", undefined, "Authentication rejected");
        return {
          ok: false,
          models: [],
          source: "compatibility_fallback",
          error: "API key was rejected by the provider.",
        };
      }
      // Non-auth error: return compatibility fallback safely
      recordProviderFailure(providerId, `http_${response.status}`);
      const fallback = getCompatibilityFallbacks(spec);
      return { ok: true, models: fallback, source: "compatibility_fallback" };
    }

    const data = (await response.json().catch(() => null)) as any;
    const discoveredList: DiscoveredModel[] = [];
    const verifiedAt = new Date().toISOString();

    if (spec.apiStyle === "gemini") {
      const rawList = Array.isArray(data?.models) ? data.models : [];
      for (const item of rawList) {
        const name = (item?.name || "").replace(/^models\//, "");
        const methods = Array.isArray(item?.supportedGenerationMethods) ? item.supportedGenerationMethods : [];
        if (!name) continue;
        if (methods.length > 0 && !methods.includes("generateContent")) continue;

        const { capabilities, contextWindow } = normalizeCapabilities(providerId, name, item);
        discoveredList.push({
          id: name,
          providerId,
          displayName: item?.displayName || name,
          capabilities,
          contextWindow,
          inputModalities: ["text", "image", "document"],
          source: "live_discovery",
          verifiedAt,
        });
      }
    } else {
      // OpenAI-compatible & Anthropic standard format
      const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
      for (const item of rawList) {
        const id = typeof item === "string" ? item : item?.id;
        if (!id || typeof id !== "string") continue;

        const { capabilities, contextWindow } = normalizeCapabilities(providerId, id, item);
        discoveredList.push({
          id,
          providerId,
          displayName: item?.name || id,
          capabilities,
          contextWindow,
          source: "live_discovery",
          verifiedAt,
        });
      }
    }

    if (discoveredList.length > 0) {
      // Cache successful discovery
      setCachedDiscoveredModels(providerId, apiKey, discoveredList, "live_discovery");
      recordProviderSuccess(providerId);
      return { ok: true, models: discoveredList, source: "live_discovery" };
    }

    // No models parsed -> fallback
    const fallback = getCompatibilityFallbacks(spec);
    return { ok: true, models: fallback, source: "compatibility_fallback" };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    recordProviderFailure(providerId, isAbort ? "timeout" : "network_or_cors");
    const fallback = getCompatibilityFallbacks(spec);
    return { ok: true, models: fallback, source: "compatibility_fallback" };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------
 * Officially Versioned Compatibility Fallback (Safety Net Only)
 * ---------------------------------------------------------------------- */
export function getCompatibilityFallbacks(spec: CloudProviderSpec): DiscoveredModel[] {
  const verifiedAt = "2026-09-15";
  const rawModels = spec.models && spec.models.length > 0 ? spec.models : [spec.defaultModel];

  return rawModels
    .filter((m) => !isModelBlacklisted(spec.id, m))
    .map((modelId) => {
      const { capabilities, contextWindow } = normalizeCapabilities(spec.id, modelId);
      return {
        id: modelId,
        providerId: spec.id,
        displayName: modelId,
        capabilities,
        contextWindow,
        source: "compatibility_fallback",
        verifiedAt,
      };
    });
}
