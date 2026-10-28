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
import { LOCAL_RUNNERS } from "../config/localRunnerCatalog";

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

export type RawModelMetadata = Record<string, unknown>;

/* -------------------------------------------------------------------------
 * Generative Chat Model Verification Predicate
 * ---------------------------------------------------------------------- */

/**
 * Strict predicate to ensure only true generative chat/completion models are
 * discovered and routed for LLM generation tasks.
 *
 * Filters out:
 * - Safety / moderation / prompt injection classifiers (prompt-guard, safeguard, etc.)
 * - Audio, speech-to-text, and TTS models (whisper, orpheus, tts, etc.)
 * - Text embedding and reranking models (embedding, embed, bge, rerank, etc.)
 * - Image / video diffusion models (dall-e, stable-diffusion, imagen, flux, etc.)
 */
export function isGenerativeChatModel(
  providerId: string,
  modelId: string,
  rawMeta?: unknown
): boolean {
  if (!modelId) return false;
  const idLower = modelId.toLowerCase().trim();
  const meta = (rawMeta && typeof rawMeta === "object" ? rawMeta : {}) as Record<string, any>;

  // 1. Metadata-based classification if provided by provider API
  const metaType = String(meta.type || meta.task || meta.pipeline_tag || "").toLowerCase();
  if (metaType) {
    if (
      metaType.includes("classification") ||
      metaType.includes("audio") ||
      metaType.includes("embedding") ||
      metaType.includes("tts") ||
      metaType.includes("translation") ||
      metaType.includes("image")
    ) {
      if (!metaType.includes("chat") && !metaType.includes("text-generation") && !metaType.includes("instruct")) {
        return false;
      }
    }
  }

  // 2. Safety / Moderation / Prompt-Guard Classifiers
  if (
    idLower.includes("prompt-guard") ||
    idLower.includes("prompt_guard") ||
    idLower.includes("safeguard") ||
    idLower.includes("safe-guard") ||
    idLower.includes("llama-guard") ||
    idLower.includes("guard-3") ||
    idLower.includes("guard-2") ||
    idLower.includes("moderation") ||
    idLower.includes("shield") ||
    idLower.includes("classifier") ||
    idLower.includes("safety-") ||
    idLower.includes("safety_")
  ) {
    return false;
  }

  // 3. Audio / Speech-to-Text / TTS / Voice
  if (
    idLower.includes("whisper") ||
    idLower.includes("orpheus") ||
    idLower.includes("tts") ||
    idLower.includes("speech") ||
    idLower.includes("voice") ||
    idLower.includes("audio") ||
    idLower.includes("transcribe") ||
    idLower.includes("transcription") ||
    idLower.includes("elevenlabs")
  ) {
    return false;
  }

  // 4. Embeddings & Rerankers
  if (
    idLower.includes("embedding") ||
    idLower.includes("embed") ||
    idLower.includes("rerank") ||
    idLower.includes("bge-") ||
    idLower.includes("bge_") ||
    idLower.includes("cross-encoder") ||
    idLower.includes("colbert")
  ) {
    return false;
  }

  // 5. Image & Video Generation
  if (
    idLower.includes("dall-e") ||
    idLower.includes("stable-diffusion") ||
    idLower.includes("imagen") ||
    idLower.includes("flux") ||
    idLower.includes("midjourney") ||
    idLower.includes("video-generate")
  ) {
    return false;
  }

  return true;
}

/* -------------------------------------------------------------------------
 * Model Capability Normalization
 * ---------------------------------------------------------------------- */
export function normalizeCapabilities(
  providerId: string,
  modelId: string,
  rawMeta?: unknown
): { capabilities: NormalizedCapability[]; contextWindow?: number } {
  // Non-generative models have 0 capabilities for research agent tasks
  if (!isGenerativeChatModel(providerId, modelId, rawMeta)) {
    return { capabilities: [], contextWindow: 0 };
  }

  const meta = (rawMeta && typeof rawMeta === "object" ? rawMeta : {}) as Record<string, any>;

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
      meta?.supportsStructuredOutput === true
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
    meta?.supportsStructuredOutput === true ||
    meta?.supports_structured_output === true ||
    meta?.supports_json === true ||
    meta?.features?.structured_output === true ||
    (Array.isArray(meta?.supportedGenerationMethods) && meta.supportedGenerationMethods.includes("generateContent"))
  ) {
    caps.add("structuredOutput");
  }

  // Vision / Multimodal modality validation from live metadata
  const modalityStr = String(
    meta?.architecture?.modality ||
    meta?.modalities?.join?.(",") ||
    meta?.input_modalities?.join?.(",") ||
    meta?.inputModalities?.join?.(",") ||
    ""
  ).toLowerCase();
  if (modalityStr.includes("image") || modalityStr.includes("multimodal") || modalityStr.includes("vision")) {
    caps.add("vision");
  }

  // Context window from explicit provider metadata
  const explicitCtx =
    meta?.context_window ||
    meta?.context_length ||
    meta?.inputTokenLimit ||
    meta?.max_context_length ||
    meta?.contextWindow;
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
  rawMeta?: unknown
): { ok: boolean; missingCapabilities: NormalizedCapability[]; contextWindow?: number } {
  const { capabilities, contextWindow } = normalizeCapabilities(providerId, modelId, rawMeta);
  const missing = requiredCapabilities.filter((req) => !capabilities.includes(req));
  return {
    ok: missing.length === 0,
    missingCapabilities: missing,
    contextWindow,
  };
}

export type CandidateAvailabilityState =
  | "VERIFIED_LIVE"
  | "UNVERIFIED_COMPATIBILITY"
  | "QUARANTINED"
  | "UNAVAILABLE";

/* -------------------------------------------------------------------------
 * Session & Runtime Model Quarantine
 * ---------------------------------------------------------------------- */
export interface QuarantinedModelRecord {
  providerId: string;
  modelId: string;
  reason: string;
  quarantinedAt: number;
  expiresAt: number;
}

const quarantinedModels = new Map<string, QuarantinedModelRecord>();
const blacklistedModels = new Map<string, { reason: string; timestamp: number }>();

/**
 * Quarantines a model for a bounded duration (default: 60 minutes) to prevent
 * retry loops or dead-model re-selection during an active session.
 */
export function quarantineModel(
  providerId: string,
  modelId: string,
  reason: string = "model_decommissioned_or_unavailable",
  ttlMs: number = 60 * 60 * 1000
): void {
  const cleanModel = modelId.toLowerCase().replace(/^models\//, "");
  const key = `${providerId.toLowerCase()}:${cleanModel}`;
  const now = Date.now();
  quarantinedModels.set(key, {
    providerId: providerId.toLowerCase(),
    modelId: cleanModel,
    reason,
    quarantinedAt: now,
    expiresAt: now + ttlMs,
  });
  blacklistedModels.set(key, { reason, timestamp: now });
}

export function isModelQuarantined(providerId: string, modelId: string): boolean {
  const cleanModel = modelId.toLowerCase().replace(/^models\//, "");
  const key = `${providerId.toLowerCase()}:${cleanModel}`;
  const record = quarantinedModels.get(key);
  if (!record) {
    return blacklistedModels.has(key);
  }
  if (Date.now() >= record.expiresAt) {
    quarantinedModels.delete(key);
    blacklistedModels.delete(key);
    return false;
  }
  return true;
}

export function clearQuarantineForModel(providerId: string, modelId: string): void {
  const cleanModel = modelId.toLowerCase().replace(/^models\//, "");
  const key = `${providerId.toLowerCase()}:${cleanModel}`;
  quarantinedModels.delete(key);
  blacklistedModels.delete(key);
}

export function clearAllQuarantinedModels(): void {
  quarantinedModels.clear();
  blacklistedModels.clear();
}

export function blacklistModel(providerId: string, modelId: string, reason: string = "model_not_found"): void {
  quarantineModel(providerId, modelId, reason);
}

export function isModelBlacklisted(providerId: string, modelId: string): boolean {
  return isModelQuarantined(providerId, modelId);
}

export function clearModelBlacklist(): void {
  clearAllQuarantinedModels();
}

export function getBlacklistedModels(): Array<{ providerId: string; modelId: string; reason: string }> {
  return Array.from(quarantinedModels.entries()).map(([k, v]) => {
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
  rawMeta?: unknown
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
    if (typeof localStorage === "undefined") return null;
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

    // Filter out blacklisted models and non-generative models from cached output
    return parsed.models
      .filter(
        (m) =>
          !isModelBlacklisted(providerId, m.id || m.modelId || "") &&
          isGenerativeChatModel(providerId, m.id || m.modelId || "", m)
      )
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
    if (typeof localStorage === "undefined") return;
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

const inFlightDiscovery = new Map<
  string,
  Promise<{ ok: boolean; models: DiscoveredModel[]; source: "live_discovery" | "compatibility_fallback"; error?: string }>
>();

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
  const localRunner = !spec ? LOCAL_RUNNERS.find((r) => r.id === providerId) : undefined;
  if (!spec && !localRunner) {
    return { ok: false, models: [], source: "compatibility_fallback", error: `Unknown provider "${providerId}".` };
  }

  // 1. Check cache first unless forceRefresh
  if (!forceRefresh) {
    const cached = getCachedDiscoveredModels(providerId, apiKey);
    if (cached && cached.length > 0) {
      return { ok: true, models: cached, source: "live_discovery" };
    }
  }

  // 2. Single-flight deduplication: return in-flight promise if another caller is already fetching
  const inFlightKey = `${providerId.toLowerCase()}:${computeKeyFingerprint(apiKey)}`;
  if (!forceRefresh && inFlightDiscovery.has(inFlightKey)) {
    return inFlightDiscovery.get(inFlightKey)!;
  }

  const executionPromise = (async () => {
    const url = spec
      ? discoverModelsUrl(spec, baseUrlOverride)
      : (baseUrlOverride?.includes("/api/") || baseUrlOverride?.includes("/v1/")
          ? baseUrlOverride
          : `${baseUrlOverride || localRunner!.defaultEndpoint}${localRunner!.healthPath}`);
    if (!url) {
      // Provider does not publish discovery endpoint (e.g. Cloudflare custom or local runner)
      const fallback = spec ? getCompatibilityFallbacks(spec) : [];
      return { ok: true, models: fallback, source: "compatibility_fallback" as const };
    }

    const fullUrl = spec?.apiStyle === "gemini" ? `${url}?key=${encodeURIComponent(apiKey)}` : url;
    const headers = spec?.apiStyle === "gemini" ? {} : spec ? buildAuthHeaders(spec, apiKey) : {};

    // Guard against unmocked outbound network requests with synthetic test keys
    const isFetchMocked = Boolean((globalThis.fetch as { mock?: unknown } | undefined)?.mock);
    if (!isFetchMocked && (apiKey.includes("mock") || apiKey.includes("test") || apiKey.includes("dummy"))) {
      const fallback = spec ? getCompatibilityFallbacks(spec) : [];
      return { ok: true, models: fallback, source: "compatibility_fallback" as const };
    }

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
            source: "compatibility_fallback" as const,
            error: "API key was rejected by the provider.",
          };
        }
        // Non-auth error: return compatibility fallback safely
        recordProviderFailure(providerId, `http_${response.status}`);
        const fallback = spec ? getCompatibilityFallbacks(spec) : [];
        return { ok: true, models: fallback, source: "compatibility_fallback" as const };
      }

      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const discoveredList: DiscoveredModel[] = [];
      const verifiedAt = new Date().toISOString();

      if (spec?.apiStyle === "gemini") {
        const rawList = Array.isArray(data?.models) ? (data.models as RawModelMetadata[]) : [];
        for (const item of rawList) {
          const name = String(item?.name || "").replace(/^models\//, "");
          const methods = Array.isArray(item?.supportedGenerationMethods) ? item.supportedGenerationMethods : [];
          if (!name) continue;
          if (methods.length > 0 && !methods.includes("generateContent")) continue;
          if (!isGenerativeChatModel(providerId, name, item)) continue;

          const { capabilities, contextWindow } = normalizeCapabilities(providerId, name, item);
          discoveredList.push({
            id: name,
            providerId,
            displayName: String(item?.displayName || name),
            capabilities,
            contextWindow,
            inputModalities: ["text", "image", "document"],
            source: "live_discovery",
            verifiedAt,
          });
        }
      } else {
        // OpenAI-compatible, Anthropic standard format, and Ollama tags
        const rawList = Array.isArray(data?.data)
          ? (data.data as Array<RawModelMetadata | string>)
          : Array.isArray(data?.models)
          ? (data.models as Array<RawModelMetadata | string>)
          : [];
        for (const item of rawList) {
          const itemMeta = typeof item === "object" && item !== null ? item : undefined;
          const id = typeof item === "string" ? item : (itemMeta?.id || itemMeta?.name || itemMeta?.model);
          if (!id || typeof id !== "string") continue;
          if (!isGenerativeChatModel(providerId, id, itemMeta)) continue;

          const { capabilities, contextWindow } = normalizeCapabilities(providerId, id, itemMeta);
          discoveredList.push({
            id,
            providerId,
            displayName: String(itemMeta?.displayName || itemMeta?.name || id),
            capabilities,
            contextWindow,
            source: "live_discovery",
            verifiedAt,
          });
        }
      }

      if (discoveredList.length > 0) {
        // Clear quarantine for models verified active by provider
        for (const m of discoveredList) {
          clearQuarantineForModel(providerId, m.id);
        }
        setCachedDiscoveredModels(providerId, apiKey, discoveredList, "live_discovery");
        recordProviderSuccess(providerId);
        return { ok: true, models: discoveredList, source: "live_discovery" as const };
      }

      // No models parsed -> fallback
      const fallback = spec ? getCompatibilityFallbacks(spec) : [];
      return { ok: true, models: fallback, source: "compatibility_fallback" as const };
    } catch (err) {
      // If direct browser request failed (e.g. CORS on third-party API) and not a localhost runner, try server proxy
      if (typeof window !== "undefined" && !fullUrl.startsWith("http://localhost") && !fullUrl.startsWith("http://127.0.0.1")) {
        try {
          const proxyRes = await fetch("/api/ai-access/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ providerId, apiKey, baseUrl: baseUrlOverride }),
          });
          if (proxyRes.ok) {
            const proxyData = await proxyRes.json();
            if (proxyData && proxyData.ok && Array.isArray(proxyData.models) && proxyData.models.length > 0) {
              setCachedDiscoveredModels(providerId, apiKey, proxyData.models, "live_discovery");
              recordProviderSuccess(providerId);
              return proxyData;
            }
          }
        } catch {
          // Ignore and continue to fallback
        }
      }

      const isAbort = err instanceof Error && err.name === "AbortError";
      recordProviderFailure(providerId, isAbort ? "timeout" : "network_or_cors");
      const fallback = spec ? getCompatibilityFallbacks(spec) : [];
      return { ok: true, models: fallback, source: "compatibility_fallback" as const };
    } finally {
      clearTimeout(timer);
      inFlightDiscovery.delete(inFlightKey);
    }
  })();

  inFlightDiscovery.set(inFlightKey, executionPromise);
  return executionPromise;
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
