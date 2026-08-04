/**
 * Unified AI Gateway — Provider Adapter Architecture
 *
 * Routes AI requests through any configured provider behind one interface.
 *
 * 2026-07-31 rewrite — what changed and why:
 *
 *  1. The nine hand-written cloud adapters (gemini, openai, claude, deepseek,
 *     qwen, cohere, groq, together, openrouter) were ~700 lines of copy-paste
 *     that differed only in a URL and a default model. They are now generated
 *     by createCloudAdapter() from src/config/providerCatalog.ts, so the
 *     supported provider list went from 12 to 30+ without new adapter code.
 *     That duplication was not cosmetic: it is exactly how Qwen ended up with
 *     a client adapter and a streaming server branch but no non-streaming
 *     server branch, making every Qwen request fail with a misleading error.
 *
 *  2. Health checks never inspected `response.ok`. A 401 from a wrong key, a
 *     429 from a spent quota and a 400 for an unknown model all reported the
 *     same "degraded — Unexpected response" while the real message was thrown
 *     away. They now classify properly via src/services/aiErrors.ts.
 *
 *  3. Fallback caught every error identically, so an unusable key was retried
 *     forever and a malformed request burned an attempt against every saved
 *     provider. Failover is now driven by error kind and lives in
 *     src/services/providerFailover.ts.
 *
 *  4. Keys are read from the persistent encrypted vault
 *     (src/services/apiVault.ts) first, falling back to the legacy
 *     `AISettings.<provider>ApiKey` ciphertext so existing users keep working
 *     with no migration step.
 */

import { AISettings, AIProviderInfo, AIRequest, AIResponse, HealthStatus } from "../types";
import { decryptDataAsync } from "../utils/crypto";
import { getEncryptionSecret } from "./vaultPassphrase";
import {
  CLOUD_PROVIDERS,
  getCloudProvider,
  resolveBaseUrl,
  chatUrl,
  buildAuthHeaders,
  type CloudProviderSpec,
  type FreeTierKind,
} from "../config/providerCatalog";
import {
  LOCAL_RUNNERS,
  getLocalRunner,
  resolveRunnerEndpoint,
  runnerHealthUrl,
  type LocalRunnerSpec,
} from "../config/localRunnerCatalog";
import * as vault from "./apiVault";
import {
  classifyHttpError,
  classifyThrownError,
  classifyResponse,
  serverWakingError,
  type ClassifiedAIError,
} from "./aiErrors";
import { isServerAsleep, PROXY_TIMEOUT_MS } from "./serverWarmup";
import {
  executeWithFailover,
  isFailoverFailure,
  ProviderCallError,
  buildContinuationRequest,
} from "./providerFailover";

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function cleanJsonString(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

function jsonNudge(prompt: string, responseMimeType?: string): string {
  if (responseMimeType !== "application/json") return prompt;
  return (
    prompt +
    "\n\nIMPORTANT: Return strictly valid JSON only. Do not wrap it in markdown code blocks like ```json or anything else. Just the raw JSON string."
  );
}

/**
 * Resolve a provider's API key.
 *
 * The persistent vault is authoritative, but the legacy per-provider
 * ciphertext on AISettings is still honoured so that users who saved keys
 * before the vault existed are not silently logged out of their own
 * providers. Both paths swallow decryption failures and return "" — a wrong
 * passphrase, an empty field, or pre-AES-GCM ciphertext all mean the same
 * thing to callers ("no usable key"), and throwing here would break the
 * "which providers are available?" scan.
 */
async function resolveProviderKey(providerId: string, settings: AISettings): Promise<string> {
  const fromVault = vault.getApiKey(providerId);
  if (fromVault) return fromVault;

  const legacyField = `${providerId}ApiKey` as keyof AISettings;
  const cipher = (settings[legacyField] as string | undefined) || "";
  if (!cipher) return "";

  try {
    return await decryptDataAsync(cipher, getEncryptionSecret());
  } catch {
    return "";
  }
}

/** A user-supplied base URL override, vault first then legacy settings. */
function resolveProviderBaseUrl(providerId: string, settings: AISettings): string | undefined {
  const entry = vault.getEntry(providerId);
  if (entry?.baseUrl) return entry.baseUrl;
  return (settings as unknown as Record<string, unknown>)[`${providerId}BaseUrl`] as string | undefined;
}

/** The model to use, vault first, then legacy settings, then catalog default. */
function resolveProviderModel(providerId: string, settings: AISettings, fallback: string): string {
  const entry = vault.getEntry(providerId);
  if (entry?.model) return entry.model;
  const legacy = (settings as unknown as Record<string, unknown>)[`${providerId}Model`] as string | undefined;
  return legacy || fallback;
}

function resolveLocalEndpoint(spec: LocalRunnerSpec, settings: AISettings): string {
  // The three original local ids keep their dedicated settings fields so
  // existing saved configurations keep working untouched.
  const legacy: Record<string, string | undefined> = {
    ollama: settings.ollamaEndpoint,
    custom: settings.customEndpoint,
    omniroute: settings.omnirouteEndpoint,
  };
  const override = legacy[spec.id] ?? settings.localEndpoints?.[spec.id];
  return resolveRunnerEndpoint(spec, override);
}

function resolveLocalModel(spec: LocalRunnerSpec, settings: AISettings, requested?: string): string {
  if (requested) return requested;
  const legacy: Record<string, string | undefined> = {
    ollama: settings.ollamaModel,
    custom: settings.customModel,
    omniroute: settings.omnirouteModel,
  };
  return legacy[spec.id] ?? settings.localModels?.[spec.id] ?? (spec.id === "ollama" ? "llama3.1:8b" : "default");
}

// ─────────────────────────────────────────────────────────
// PROVIDER ADAPTER INTERFACE
// ─────────────────────────────────────────────────────────

export interface AIProviderAdapter {
  id: string;
  name: string;
  type: "cloud" | "local" | "proxy";
  defaultModel: string;
  availableModels: string[];
  requiresApiKey: boolean;

  generate(request: AIRequest, settings: AISettings): Promise<string>;
  healthCheck(settings: AISettings): Promise<HealthStatus>;
  getApiKey(settings: AISettings): Promise<string>;
  getEndpoint(settings: AISettings): string;
}

// ─────────────────────────────────────────────────────────
// PROVIDER REGISTRY (metadata for UI)
// ─────────────────────────────────────────────────────────

/** Catalog free-tier language mapped onto the existing UI vocabulary. */
function toPricingTier(freeTier: FreeTierKind): AIProviderInfo["pricingTier"] {
  if (freeTier === "free") return "free";
  if (freeTier === "freemium") return "freemium";
  return "paid";
}

const CLOUD_PROVIDER_INFO: AIProviderInfo[] = CLOUD_PROVIDERS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  type: "cloud" as const,
  icon: spec.icon,
  description: spec.description,
  defaultModel: spec.defaultModel,
  availableModels: spec.models,
  requiresApiKey: true,
  pricingTier: toPricingTier(spec.freeTier),
  color: spec.color,
}));

const LOCAL_PROVIDER_INFO: AIProviderInfo[] = LOCAL_RUNNERS.map((spec) => ({
  id: spec.id,
  name: spec.id === "ollama" ? "Ollama (Local)" : spec.name,
  type: "local" as const,
  icon: spec.icon,
  description: spec.description,
  defaultModel: spec.id === "ollama" ? "llama3.1:8b" : "default",
  availableModels: [],
  requiresApiKey: false,
  pricingTier: "free" as const,
  color: "#8B5CF6",
}));

/**
 * `custom` predates the local-runner catalog and is referenced by
 * src/config/aiModes.ts, by AISettings.provider's union type, and by saved
 * user configurations, so it stays as its own entry rather than being folded
 * into `lmstudio` (which shares its default port).
 */
const CUSTOM_PROVIDER_INFO: AIProviderInfo = {
  id: "custom",
  name: "Custom Server (LM Studio/OmniRoute/vLLM)",
  type: "local",
  icon: "⚙",
  description: "Connect any OpenAI-compatible local server (LM Studio, vLLM, etc.)",
  defaultModel: "default",
  availableModels: [],
  requiresApiKey: false,
  pricingTier: "free",
  color: "#8B5CF6",
};

export const AI_PROVIDERS: AIProviderInfo[] = [
  ...CLOUD_PROVIDER_INFO,
  ...LOCAL_PROVIDER_INFO,
  CUSTOM_PROVIDER_INFO,
];

// ─────────────────────────────────────────────────────────
// SERVER PROXY HELPER
// ─────────────────────────────────────────────────────────

/**
 * Call a cloud provider through this app's own /api/generate proxy.
 *
 * Retry/backoff used to live here (three attempts on 429/5xx). It has moved
 * to providerFailover.ts so there is exactly one retry policy in the app —
 * previously a failing request could be retried three times here and then
 * again once per fallback provider, turning a dead key into a 30-second hang.
 * This function now fails fast with a classified error and lets the failover
 * layer decide what that means.
 */
async function callServerProxy(
  request: AIRequest,
  provider: string,
  apiKey: string,
  settings: AISettings,
  baseUrl?: string
): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Previously unbounded, so a sleeping or wedged instance hung the call
      // with no ceiling at all. Sized in serverWarmup.ts to outlast a cold
      // start plus a genuine generation rather than to be tight.
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      body: JSON.stringify({
        provider,
        apiKey: apiKey || "",
        model: request.model || "",
        baseUrl: baseUrl || "",
        systemInstruction: request.systemInstruction,
        prompt: request.prompt,
        temperature: request.temperature,
        responseMimeType: request.responseMimeType,
        taskType: request.taskType,
        username: localStorage.getItem("phd_active_session_username") || "",
      }),
    });
  } catch (e) {
    // Ambiguous on its own: the provider may be down, or this app's own
    // instance may simply have idled out and be booting. One health probe
    // separates them, and only on the path where something already failed.
    if (await isServerAsleep()) {
      throw new ProviderCallError(provider, serverWakingError(String((e as Error)?.message ?? e)));
    }
    throw new ProviderCallError(provider, classifyThrownError(e, { url: "/api/generate" }));
  }

  if (!response.ok) {
    // Render's router answers 502/503/504 while an idled instance starts back
    // up — by status alone that is indistinguishable from a provider outage,
    // and misreading it walks the whole failover chain for nothing.
    if (
      (response.status === 502 || response.status === 503 || response.status === 504) &&
      (await isServerAsleep())
    ) {
      throw new ProviderCallError(
        provider,
        serverWakingError(`HTTP ${response.status} from /api/generate`)
      );
    }
    throw new ProviderCallError(provider, await classifyResponse(response));
  }

  const data = await response.json();
  return data.text || "";
}

export async function callServerProxyStream(
  request: AIRequest,
  provider: string,
  apiKey: string,
  settings: AISettings,
  onToken: (token: string) => void
): Promise<string> {
  const runner = getLocalRunner(provider) || (provider === "custom" ? getLocalRunner("lmstudio") : undefined);
  const isLocal = provider === "ollama" || provider === "custom" || !!getLocalRunner(provider);

  if (isLocal && runner) {
    const endpoint =
      provider === "custom"
        ? resolveRunnerEndpoint(runner, settings.customEndpoint)
        : resolveLocalEndpoint(runner, settings);
    const isOllamaStyle = runner.apiStyle === "ollama-native";
    const url = isOllamaStyle ? `${endpoint}/api/chat` : `${endpoint}/chat/completions`;
    const model = resolveLocalModel(runner, settings, request.model);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isOllamaStyle
            ? {
                model,
                messages: [
                  { role: "system", content: request.systemInstruction },
                  { role: "user", content: request.prompt },
                ],
                stream: true,
                options: { temperature: request.temperature },
              }
            : {
                model,
                messages: [
                  { role: "system", content: request.systemInstruction },
                  { role: "user", content: request.prompt },
                ],
                temperature: request.temperature,
                stream: true,
              }
        ),
      });

      if (!response.ok) throw new Error(`Local stream failed (status ${response.status})`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const cleaned = line.trim();
            if (!cleaned) continue;
            if (isOllamaStyle) {
              try {
                const json = JSON.parse(cleaned);
                const text = json.message?.content || "";
                if (text) {
                  fullText += text;
                  onToken(text);
                }
              } catch (e) {}
            } else {
              if (cleaned === "data: [DONE]") continue;
              if (cleaned.startsWith("data: ")) {
                try {
                  const json = JSON.parse(cleaned.slice(6));
                  const text = json.choices?.[0]?.delta?.content || "";
                  if (text) {
                    fullText += text;
                    onToken(text);
                  }
                } catch (e) {}
              }
            }
          }
        }
      }
      return fullText;
    } catch (e: any) {
      console.warn("Local streaming failed, falling back to non-streaming proxy:", e.message);
    }
  }

  const response = await fetch("/api/stream-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      apiKey: apiKey || "",
      model: request.model || "",
      baseUrl: resolveProviderBaseUrl(provider, settings) || "",
      systemInstruction: request.systemInstruction,
      prompt: request.prompt,
      temperature: request.temperature,
      responseMimeType: request.responseMimeType,
      taskType: request.taskType,
      username: localStorage.getItem("phd_active_session_username") || "",
    }),
  });

  if (!response.ok) {
    throw new ProviderCallError(provider, await classifyResponse(response));
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  if (reader) {
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        if (cleaned.startsWith("data: ")) {
          let payload: { error?: string; status?: number; text?: string } | null = null;
          try {
            payload = JSON.parse(cleaned.slice(6));
          } catch {
            continue;
          }
          // The server reports mid-stream provider failures as an SSE `error`
          // frame. Surfacing it as a classified throw is what lets failover
          // pick this up and continue the work elsewhere instead of returning
          // a silently truncated answer.
          if (payload?.error) {
            throw new ProviderCallError(
              provider,
              classifyHttpError(payload.status ?? 500, payload.error, null)
            );
          }
          const text = payload?.text || "";
          if (text) {
            fullText += text;
            onToken(text);
          }
        }
      }
    }
  }
  return fullText;
}

// ─────────────────────────────────────────────────────────
// ADAPTER FACTORIES
// ─────────────────────────────────────────────────────────

/**
 * Build an adapter for any cloud provider in the catalog.
 *
 * Gemini is the sole provider called directly from the browser (it is the
 * only one whose CORS policy permits it, and doing so avoids a proxy hop for
 * the most common free tier). Everything else goes through /api/generate,
 * which keeps keys off the wire to third-party origins and sidesteps
 * per-provider CORS entirely.
 */
function createCloudAdapter(spec: CloudProviderSpec): AIProviderAdapter {
  return {
    id: spec.id,
    name: spec.name,
    type: "cloud",
    defaultModel: spec.defaultModel,
    availableModels: spec.models,
    requiresApiKey: true,

    async getApiKey(settings: AISettings): Promise<string> {
      return resolveProviderKey(spec.id, settings);
    },

    getEndpoint(settings: AISettings): string {
      return resolveBaseUrl(spec, resolveProviderBaseUrl(spec.id, settings));
    },

    async generate(request: AIRequest, settings: AISettings): Promise<string> {
      const apiKey = await this.getApiKey(settings);
      const model = request.model || resolveProviderModel(spec.id, settings, spec.defaultModel);
      const baseUrlOverride = resolveProviderBaseUrl(spec.id, settings);

      // Gemini used to be special-cased here into a direct browser fetch of
      // generativelanguage.googleapis.com. That branch carried no
      // AbortSignal, while every other provider goes through callServerProxy,
      // which times out via AbortSignal.timeout(PROXY_TIMEOUT_MS). So when the
      // Gemini request stalled the promise never settled and "Test connection"
      // span forever with no verdict — the failure mode reported from the
      // setup wizard.
      //
      // It also put the user's key in a URL query string (`?key=...`) sent
      // from the page, which leaks it into browser history and any
      // intermediary that logs URLs. The server proxy already handles Gemini
      // (it is the server's default provider), so there is nothing this
      // branch bought that the shared path does not do better.
      return callServerProxy({ ...request, model }, spec.id, apiKey, settings, baseUrlOverride);
    },

    async healthCheck(settings: AISettings): Promise<HealthStatus> {
      const start = Date.now();
      const apiKey = await this.getApiKey(settings);

      if (!apiKey) {
        return {
          provider: spec.id,
          status: "unchecked",
          lastChecked: new Date().toISOString(),
          error: "No API key configured",
        };
      }

      try {
        await this.generate(
          {
            systemInstruction: "You are a test agent.",
            prompt: "Respond with exactly the word: OK",
            temperature: 0,
            taskType: "health-check",
          },
          settings
        );
        return {
          provider: spec.id,
          status: "online",
          latencyMs: Date.now() - start,
          lastChecked: new Date().toISOString(),
        };
      } catch (e) {
        // Real classification, unlike the previous blanket "degraded —
        // Unexpected response": an invalid key is reported as offline with the
        // actual reason, a rate limit as degraded (the key is fine, it is just
        // busy) so the UI does not tell users to replace a working key.
        const classified: ClassifiedAIError =
          e instanceof ProviderCallError ? e.classified : classifyThrownError(e);
        const status: HealthStatus["status"] =
          classified.kind === "rate_limit" || classified.kind === "server_error" ? "degraded" : "offline";
        return {
          provider: spec.id,
          status,
          latencyMs: Date.now() - start,
          lastChecked: new Date().toISOString(),
          error: classified.remedy ? `${classified.label}. ${classified.remedy}` : classified.label,
        };
      }
    },
  };
}

/** Build an adapter for a local runner (Ollama's own API, or OpenAI-compatible). */
function createLocalAdapter(spec: LocalRunnerSpec, overrideId?: string): AIProviderAdapter {
  const id = overrideId || spec.id;

  return {
    id,
    name: spec.name,
    type: "local",
    defaultModel: spec.apiStyle === "ollama-native" ? "llama3.1:8b" : "default",
    availableModels: [],
    requiresApiKey: false,

    async getApiKey(): Promise<string> {
      return "";
    },

    getEndpoint(settings: AISettings): string {
      return resolveLocalEndpoint({ ...spec, id }, settings);
    },

    async generate(request: AIRequest, settings: AISettings): Promise<string> {
      const endpoint = this.getEndpoint(settings);
      const model = resolveLocalModel({ ...spec, id }, settings, request.model);
      const prompt = jsonNudge(request.prompt, request.responseMimeType);
      const isOllamaStyle = spec.apiStyle === "ollama-native";
      const url = isOllamaStyle ? `${endpoint}/api/chat` : `${endpoint}/chat/completions`;

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isOllamaStyle
              ? {
                  model,
                  messages: [
                    { role: "system", content: request.systemInstruction },
                    { role: "user", content: prompt },
                  ],
                  stream: false,
                  options: { temperature: request.temperature },
                }
              : {
                  model,
                  messages: [
                    { role: "system", content: request.systemInstruction },
                    { role: "user", content: prompt },
                  ],
                  temperature: request.temperature,
                }
          ),
        });
      } catch (e) {
        throw new ProviderCallError(id, classifyThrownError(e, { url }));
      }

      if (!response.ok) {
        throw new ProviderCallError(id, await classifyResponse(response));
      }

      const data = await response.json();
      let text = isOllamaStyle ? data.message?.content || "" : data.choices?.[0]?.message?.content || "";
      if (request.responseMimeType === "application/json") text = cleanJsonString(text);
      return text.trim();
    },

    async healthCheck(settings: AISettings): Promise<HealthStatus> {
      const start = Date.now();
      const endpoint = this.getEndpoint(settings);
      const url = `${endpoint}${spec.healthPath}`;
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (!resp.ok) throw new Error(`Status ${resp.status}`);
        const data = await resp.json();
        const models: string[] =
          spec.apiStyle === "ollama-native"
            ? (data.models || []).map((m: any) => m.name)
            : (data.data || []).map((m: any) => m.id);
        return {
          provider: id,
          status: "online",
          latencyMs: Date.now() - start,
          lastChecked: new Date().toISOString(),
          availableModels: models,
        };
      } catch (e: any) {
        return {
          provider: id,
          status: "offline",
          latencyMs: Date.now() - start,
          lastChecked: new Date().toISOString(),
          error: e.message,
        };
      }
    },
  };
}

// ─────────────────────────────────────────────────────────
// ADAPTER REGISTRY
// ─────────────────────────────────────────────────────────

const ADAPTERS: Record<string, AIProviderAdapter> = {};

for (const spec of CLOUD_PROVIDERS) {
  ADAPTERS[spec.id] = createCloudAdapter(spec);
}
for (const spec of LOCAL_RUNNERS) {
  ADAPTERS[spec.id] = createLocalAdapter(spec);
}
// `custom` is LM Studio's shape under its own historical id — see
// CUSTOM_PROVIDER_INFO above for why it is preserved separately.
ADAPTERS.custom = createLocalAdapter(getLocalRunner("lmstudio")!, "custom");

// ─────────────────────────────────────────────────────────
// AUTO-MODE TASK ROUTING
// ─────────────────────────────────────────────────────────

async function resolveProvider(
  taskType: string,
  settings: AISettings
): Promise<{ provider: string; model?: string; apiKey?: string }> {
  const provider = settings.provider || "gemini";

  if (provider !== "auto") {
    const adapter = ADAPTERS[provider];
    if (adapter) {
      const apiKey = adapter.requiresApiKey ? await adapter.getApiKey(settings) : "";
      const model = resolveProviderModel(provider, settings, adapter.defaultModel);
      return { provider, model, apiKey };
    }
    return { provider, apiKey: "" };
  }

  // Auto Mode logic
  // 1. Offline → Ollama if available
  if (typeof navigator !== "undefined" && !navigator.onLine && settings.ollamaEndpoint) {
    return { provider: "ollama", model: settings.ollamaModel || "llama3.1:8b" };
  }

  // 2. Task-based routing matrix
  let targetProvider = "gemini";
  if (["grounding", "qc", "methodology", "rq-check"].includes(taskType)) {
    targetProvider = "deepseek";
  } else if (["drafting", "topic-suggest", "title-improve", "blueprint"].includes(taskType)) {
    targetProvider = "qwen";
  }

  // 3. Key availability fallback
  for (const candidate of [targetProvider, "gemini"]) {
    const adapter = ADAPTERS[candidate];
    if (!adapter) continue;
    const key = await adapter.getApiKey(settings);
    if (key) {
      return { provider: candidate, model: resolveProviderModel(candidate, settings, adapter.defaultModel), apiKey: key };
    }
  }

  // 4. Any other provider with a key in the vault
  const vaultChain = vault.getFailoverChain();
  if (vaultChain.length > 0) {
    const first = vaultChain[0];
    const adapter = ADAPTERS[first];
    if (adapter) {
      return {
        provider: first,
        model: resolveProviderModel(first, settings, adapter.defaultModel),
        apiKey: await adapter.getApiKey(settings),
      };
    }
  }

  // 5. Check if any local server is healthy (cached)
  if (settings.providerHealth?.ollama?.status === "online") {
    return { provider: "ollama", model: settings.ollamaModel || "llama3.1:8b" };
  }
  if (settings.providerHealth?.custom?.status === "online") {
    return { provider: "custom", model: settings.customModel || "default" };
  }

  // 6. Last resort: server proxy
  return { provider: "server", model: "gemini-2.5-flash", apiKey: "" };
}

/**
 * Build the ordered list of providers to try for one request.
 *
 * The primary comes first, then whatever the user ordered in the vault, then
 * the legacy `settings.fallbackOrder`. Only providers that are actually usable
 * (a key present, or no key needed) are included, so failover never wastes an
 * attempt on a provider that was never configured.
 */
async function buildCandidateChain(primary: string, settings: AISettings): Promise<string[]> {
  const ordered = [
    primary,
    ...vault.getFailoverChain(),
    ...(settings.fallbackOrder || ["ollama", "custom", "gemini"]),
  ];

  const seen = new Set<string>();
  const usable: string[] = [];

  for (const id of ordered) {
    const resolved = id === "server" ? "gemini" : id;
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const adapter = ADAPTERS[resolved];
    if (!adapter) continue;
    if (adapter.requiresApiKey && !(await adapter.getApiKey(settings))) continue;
    usable.push(resolved);
  }

  return usable;
}

const DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
  AI_PROVIDERS.map((p) => [p.id, p.name])
);

// ─────────────────────────────────────────────────────────
// AI GATEWAY — PUBLIC API
// ─────────────────────────────────────────────────────────

export interface GenerateOptions {
  /** Notified when the gateway switches provider so the UI can say so */
  onFailoverEvent?: (message: string) => void;
  signal?: AbortSignal;
}

export const AIGateway = {
  /**
   * Generate content, automatically continuing on another provider if the
   * chosen one is rate limited, out of quota, timing out, or erroring.
   */
  async generate(request: AIRequest, settings: AISettings, options?: GenerateOptions): Promise<AIResponse> {
    const startTime = Date.now();
    const { provider } = await resolveProvider(request.taskType, settings);
    const inputWords = (request.systemInstruction + "\n" + request.prompt).split(/\s+/).length;

    const candidates = await buildCandidateChain(provider, settings);

    const result = await executeWithFailover(
      async (providerId) => {
        const adapter = ADAPTERS[providerId];
        if (!adapter) throw new Error(`Unknown provider: ${providerId}`);
        const model = resolveProviderModel(providerId, settings, adapter.defaultModel);
        const text = await adapter.generate({ ...request, model }, settings);
        return { text, model };
      },
      {
        candidates,
        displayNames: DISPLAY_NAMES,
        signal: options?.signal,
        onEvent: (event) => {
          if (event.userMessage) options?.onFailoverEvent?.(event.userMessage);
        },
      }
    );

    if (isFailoverFailure(result)) {
      const error = new Error(
        result.error.remedy ? `${result.error.message} ${result.error.remedy}` : result.error.message
      );
      (error as Error & { classified?: ClassifiedAIError }).classified = result.error;
      throw error;
    }

    const outputWords = result.value.text.split(/\s+/).length;
    return {
      text: result.value.text,
      provider: result.providerId,
      model: result.value.model,
      inputWords,
      outputWords,
      latencyMs: Date.now() - startTime,
      fromFallback: result.usedFallback,
    };
  },

  /**
   * Streaming generation with failover that preserves what the user can
   * already see.
   *
   * When a stream dies partway, the text emitted so far is kept and the next
   * provider is asked to continue from exactly that point (see
   * buildContinuationRequest in providerFailover.ts) rather than starting
   * over. The caller's onToken keeps receiving tokens across the switch, so
   * from the reader's perspective the text simply pauses and resumes.
   */
  async generateStream(
    request: AIRequest,
    settings: AISettings,
    onToken: (token: string) => void,
    options?: GenerateOptions
  ): Promise<AIResponse> {
    const startTime = Date.now();
    const { provider } = await resolveProvider(request.taskType, settings);
    const inputWords = (request.systemInstruction + "\n" + request.prompt).split(/\s+/).length;
    const candidates = await buildCandidateChain(provider, settings);

    // Accumulated across providers — this is the "no work lost" state.
    let preserved = "";

    const result = await executeWithFailover(
      async (providerId) => {
        const adapter = ADAPTERS[providerId];
        const model = resolveProviderModel(providerId, settings, adapter?.defaultModel || "");
        // Anything already streamed becomes context for the replacement, so
        // it continues rather than repeating the work.
        const effectiveRequest = preserved
          ? buildContinuationRequest({ ...request, model }, preserved)
          : { ...request, model };

        const apiKey = adapter?.requiresApiKey ? await adapter.getApiKey(settings) : "";
        const chunk = await callServerProxyStream(effectiveRequest, providerId, apiKey, settings, (token) => {
          preserved += token;
          onToken(token);
        });
        return { text: preserved || chunk, model };
      },
      {
        candidates,
        displayNames: DISPLAY_NAMES,
        signal: options?.signal,
        onEvent: (event) => {
          if (event.userMessage) options?.onFailoverEvent?.(event.userMessage);
        },
      }
    );

    if (isFailoverFailure(result)) {
      // Partial output is still worth returning — throwing away a mostly
      // complete draft because the last provider failed is the exact data
      // loss this design exists to prevent.
      if (preserved.trim()) {
        return {
          text: preserved,
          provider: "partial",
          model: "unknown",
          inputWords,
          outputWords: preserved.split(/\s+/).length,
          latencyMs: Date.now() - startTime,
          fromFallback: true,
        };
      }
      const error = new Error(
        result.error.remedy ? `${result.error.message} ${result.error.remedy}` : result.error.message
      );
      (error as Error & { classified?: ClassifiedAIError }).classified = result.error;
      throw error;
    }

    const text = result.value.text;
    return {
      text,
      provider: result.providerId,
      model: result.value.model,
      inputWords,
      outputWords: text.split(/\s+/).length,
      latencyMs: Date.now() - startTime,
      fromFallback: result.usedFallback,
    };
  },

  /**
   * Attempt fallback providers when the primary fails.
   *
   * Retained for backward compatibility — generate()/generateStream() now do
   * this internally through providerFailover.ts, so new code should not call
   * this directly.
   */
  async tryFallbackChain(
    request: AIRequest,
    settings: AISettings,
    failedProvider: string
  ): Promise<{ text: string; provider: string; model: string } | null> {
    const fallbackOrder = settings.fallbackOrder || ["ollama", "custom", "gemini"];

    for (const fb of fallbackOrder) {
      if (fb === failedProvider) continue;
      const adapter = ADAPTERS[fb];
      if (!adapter) continue;
      if (adapter.requiresApiKey && !(await adapter.getApiKey(settings))) continue;

      try {
        const text = await adapter.generate(request, settings);
        return { text, provider: fb, model: resolveProviderModel(fb, settings, adapter.defaultModel) };
      } catch {
        continue;
      }
    }
    return null;
  },

  /**
   * Run health checks on all configured providers in parallel.
   *
   * Only providers the user has actually set up are contacted — with 30
   * providers in the catalog, checking every one would fire 30 requests and
   * report 28 irrelevant failures.
   */
  async healthCheckAll(settings: AISettings): Promise<Record<string, HealthStatus>> {
    const configured = new Set<string>([
      ...vault.getFailoverChain(),
      ...LOCAL_RUNNERS.map((r) => r.id),
      "custom",
    ]);
    if (settings.provider && settings.provider !== "auto") configured.add(settings.provider);

    for (const spec of CLOUD_PROVIDERS) {
      if ((settings as unknown as Record<string, unknown>)[`${spec.id}ApiKey`]) configured.add(spec.id);
    }

    const ids = [...configured].filter((id) => ADAPTERS[id]);
    const results = await Promise.allSettled(ids.map((id) => ADAPTERS[id].healthCheck(settings)));

    const healthMap: Record<string, HealthStatus> = {};
    results.forEach((result, index) => {
      const id = ids[index];
      healthMap[id] =
        result.status === "fulfilled"
          ? result.value
          : {
              provider: id,
              status: "offline",
              lastChecked: new Date().toISOString(),
              error: (result.reason as Error)?.message || "Health check failed",
            };
    });
    return healthMap;
  },

  /**
   * Run health check on a single provider.
   */
  async healthCheckProvider(providerId: string, settings: AISettings): Promise<HealthStatus> {
    const adapter = ADAPTERS[providerId];
    if (!adapter) {
      return {
        provider: providerId,
        status: "offline",
        lastChecked: new Date().toISOString(),
        error: "Unknown provider",
      };
    }
    return adapter.healthCheck(settings);
  },

  /**
   * Get list of currently available (online/configured) providers.
   */
  async getAvailableProviders(settings: AISettings): Promise<AIProviderInfo[]> {
    const checks = await Promise.all(
      AI_PROVIDERS.map(async (p) => {
        const health = settings.providerHealth?.[p.id];
        if (health?.status === "online") return true;
        if (!p.requiresApiKey) return true; // Local providers are always shown
        const adapter = ADAPTERS[p.id];
        return adapter ? !!(await adapter.getApiKey(settings)) : false;
      })
    );
    return AI_PROVIDERS.filter((_, i) => checks[i]);
  },

  /**
   * Auto-detect local AI servers running on standard ports.
   *
   * Probes every runner in the catalog, not just the original three, so a
   * user running Jan or KoboldCPP is discovered without configuring anything.
   */
  async detectLocalServers(): Promise<Record<string, HealthStatus>> {
    const results = await Promise.allSettled(
      LOCAL_RUNNERS.map(async (spec) => {
        const adapter = ADAPTERS[spec.id];
        return adapter.healthCheck({ provider: "auto" } as AISettings);
      })
    );

    const map: Record<string, HealthStatus> = {};
    LOCAL_RUNNERS.forEach((spec, i) => {
      const result = results[i];
      map[spec.id] =
        result.status === "fulfilled"
          ? result.value
          : { provider: spec.id, status: "offline", lastChecked: new Date().toISOString() };
    });
    // `custom` shares LM Studio's port; mirror the result so existing callers
    // that only look at `custom` keep working.
    map.custom = { ...map.lmstudio, provider: "custom" };
    return map;
  },

  /**
   * Fetch installed models from an Ollama server.
   */
  async getOllamaModels(endpoint?: string): Promise<string[]> {
    const url = endpoint || "http://localhost:11434";
    try {
      const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  },

  /**
   * List the models a provider's key can actually use.
   *
   * The catalog's model list is only a suggestion — providers retire and
   * rename models constantly — so the UI offers this to replace guesses with
   * the live truth for that specific account.
   */
  async discoverModels(providerId: string, settings: AISettings): Promise<string[]> {
    const spec = getCloudProvider(providerId);
    if (spec) {
      if (!spec.modelsPath) return spec.models;
      const apiKey = await resolveProviderKey(providerId, settings);
      if (!apiKey) return spec.models;
      try {
        const base = resolveBaseUrl(spec, resolveProviderBaseUrl(providerId, settings));
        const resp = await fetch(`${base}${spec.modelsPath}`, {
          headers: buildAuthHeaders(spec, apiKey),
          signal: AbortSignal.timeout(8000),
        });
        if (!resp.ok) return spec.models;
        const data = await resp.json();
        const ids: string[] = (data.data || data.models || [])
          .map((m: any) => m.id || m.name)
          .filter(Boolean);
        return ids.length ? ids.sort() : spec.models;
      } catch {
        // A CORS refusal here is expected for several providers and is not an
        // error worth surfacing — the catalog list remains perfectly usable.
        return spec.models;
      }
    }

    const runner = getLocalRunner(providerId);
    if (runner) {
      const health = await ADAPTERS[providerId]?.healthCheck(settings);
      return health?.availableModels || [];
    }
    return [];
  },

  /**
   * Get the adapter registry for external use.
   */
  getAdapter(providerId: string): AIProviderAdapter | undefined {
    return ADAPTERS[providerId];
  },

  /**
   * Get all provider info for the UI.
   */
  getAllProviders(): AIProviderInfo[] {
    return AI_PROVIDERS;
  },

  /**
   * Resolve which provider would be used for a given task type.
   */
  resolveProvider(taskType: string, settings: AISettings) {
    return resolveProvider(taskType, settings); // async — callers must await
  },
};

export default AIGateway;
