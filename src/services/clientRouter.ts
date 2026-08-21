/**
 * Client-Side Policy-Driven AI Router
 *
 * Implements the policy-driven, capability-aware, user-preference-first
 * candidate evaluator and ranking system for the Client AI Resource Pool.
 *
 * Evaluation Priority Hierarchy:
 * 1. Explicit User Selection (Manual Model Override / Specific Task Binding)
 * 2. Task / Capability Requirements (Structured JSON, Min Context, Reasoning Tier)
 * 3. User Privacy Mode (local-only, privacy-first, balanced, cloud-allowed)
 * 4. Provider Capability Match (modality, token limit, schema fidelity)
 * 5. Availability & Quota Status (active, rate-limited, cooling down)
 * 6. Provider Health & Historical Reliability
 * 7. Default Policy Ranking
 *
 * Strictly operates on the client using local credentials and runtimes without
 * requiring server round-trips to compute candidate rankings.
 */

import { getCloudProvider, CLOUD_PROVIDERS } from "../config/providerCatalog";
import { LOCAL_RUNNERS } from "../config/localRunnerCatalog";
import { probeRunner, type ProbeResult } from "./localRunnerProbe";
import { providersWithStoredKey, readProviderKey } from "./userAiSettings";
import type { CandidateProvider } from "../platform/gateway/types";

export type PrivacyMode = "local-only" | "privacy-first" | "balanced" | "cloud-allowed";

export interface UserAiPreferences {
  preferredProviderId?: string;
  preferredModelId?: string;
  taskBindings?: Record<string, { providerId: string; modelId?: string }>;
  privacyMode: PrivacyMode;
  disabledProviders?: string[];
}

const PREFERENCES_STORAGE_KEY = "scholar-user-ai-preferences";

export const DEFAULT_USER_AI_PREFERENCES: UserAiPreferences = {
  privacyMode: "balanced",
};

export function getUserAiPreferences(): UserAiPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_AI_PREFERENCES };
    return { ...DEFAULT_USER_AI_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_USER_AI_PREFERENCES };
  }
}

export function setUserAiPreferences(prefs: Partial<UserAiPreferences>): void {
  try {
    const current = getUserAiPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable or restricted
  }
}

export type RoutingTaskType = "simple" | "multimodal" | "reasoning" | "coding" | "long-context";

export interface TaskRequirement {
  taskType: RoutingTaskType;
  requiresStructuredOutput?: boolean;
  minContextWindow?: number;
  reasoningIntensity?: "high" | "medium" | "standard";
}

export interface ClientRoutingCandidate extends CandidateProvider {
  tier: "local" | "free" | "byok";
  label: string;
  reasoning: string;
  score: number;
}

export interface ClientRoutingDecision {
  ok: boolean;
  choice?: ClientRoutingCandidate;
  fallbacks: ClientRoutingCandidate[];
  allCandidates: ClientRoutingCandidate[];
  reasoning: string;
}

export interface ClientRoutingOptions {
  manualOverride?: { providerId: string; modelId?: string } | null;
  privacyPreferenceOverride?: PrivacyMode;
  customRequirements?: Partial<TaskRequirement>;
}

/**
 * Task requirements by task type.
 */
export function getTaskRequirements(taskType: RoutingTaskType): TaskRequirement {
  switch (taskType) {
    case "reasoning":
      return { taskType, requiresStructuredOutput: true, minContextWindow: 8192, reasoningIntensity: "high" };
    case "long-context":
      return { taskType, requiresStructuredOutput: false, minContextWindow: 65536, reasoningIntensity: "medium" };
    case "coding":
      return { taskType, requiresStructuredOutput: false, minContextWindow: 8192, reasoningIntensity: "high" };
    case "multimodal":
      return { taskType, requiresStructuredOutput: false, minContextWindow: 8192, reasoningIntensity: "medium" };
    case "simple":
    default:
      return { taskType, requiresStructuredOutput: false, minContextWindow: 4096, reasoningIntensity: "standard" };
  }
}

/**
 * Discovers and ranks all available candidates in the user's Client AI Resource Pool.
 */
export async function resolveClientCandidates(
  taskType: RoutingTaskType,
  options: ClientRoutingOptions = {}
): Promise<ClientRoutingDecision> {
  const prefs = getUserAiPreferences();
  const privacyMode = options.privacyPreferenceOverride || prefs.privacyMode || "balanced";
  const reqs = { ...getTaskRequirements(taskType), ...options.customRequirements };
  const disabled = new Set(prefs.disabledProviders || []);

  const candidates: ClientRoutingCandidate[] = [];

  // 1. Discover active Local Runtimes (localhost)
  if (privacyMode !== "cloud-allowed") {
    for (const runner of LOCAL_RUNNERS) {
      if (disabled.has(runner.id)) continue;
      try {
        const probe = await probeRunner(runner);
        if (probe.reachable && probe.models.length > 0) {
          const model = probe.models[0];
          let score = 50; // base score for reachable local model
          let reasoning = `Local runtime (${runner.name}) available on device.`;

          if (privacyMode === "local-only" || privacyMode === "privacy-first") {
            score += 40; // prioritize local in privacy modes
          }

          // Penalize if task exceeds typical local context (unless specific large model detected)
          if (reqs.minContextWindow && reqs.minContextWindow > 32768) {
            score -= 20;
            reasoning += " (Task requires large context window; local performance may vary)";
          }

          candidates.push({
            provider: runner.id,
            model,
            apiKey: "local-no-credential-required",
            tier: "local",
            label: `${runner.name} (${model})`,
            reasoning,
            score,
          });
        }
      } catch {
        // Probe failed or runner offline
      }
    }
  }

  // 2. Discover configured Cloud Providers (Free & Paid BYOK)
  if (privacyMode !== "local-only") {
    const configuredProviderIds = providersWithStoredKey();

    for (const providerId of configuredProviderIds) {
      if (disabled.has(providerId)) continue;
      const key = await readProviderKey(providerId);
      if (!key) continue;

      const spec = getCloudProvider(providerId);
      if (!spec) continue;

      const tier: "free" | "byok" = spec.freeTier === "free" || spec.freeTier === "freemium" ? "free" : "byok";
      const model = spec.models?.[0] || undefined;

      let score = 40; // base score for cloud BYOK
      let reasoning = `${spec.name} configured with user-held API key.`;

      // Scoring based on task requirements
      if (reqs.reasoningIntensity === "high") {
        if (["anthropic", "openai", "deepseek", "gemini", "groq"].includes(providerId)) {
          score += 25;
          reasoning = `${spec.name} offers high reasoning capability for this task.`;
        }
      }

      if (reqs.minContextWindow && reqs.minContextWindow > 32768) {
        if (["gemini", "anthropic", "openai"].includes(providerId)) {
          score += 30;
          reasoning = `${spec.name} satisfies the large context window requirement.`;
        }
      }

      if (privacyMode === "privacy-first") {
        score -= 15; // lower than local in privacy-first mode, but still available as fallback
      } else if (privacyMode === "balanced") {
        if (tier === "free") {
          score += 15; // favor free tier over paid BYOK in balanced mode
        }
      }

      candidates.push({
        provider: providerId,
        model,
        apiKey: key,
        tier,
        label: `${spec.name}${model ? ` (${model})` : ""}`,
        reasoning,
        score,
      });
    }
  }

  // 3. Apply Task Specific Bindings if set in preferences
  if (prefs.taskBindings && prefs.taskBindings[taskType]) {
    const binding = prefs.taskBindings[taskType];
    const match = candidates.find((c) => c.provider === binding.providerId);
    if (match) {
      match.score += 100;
      match.reasoning = `Explicitly bound to ${match.label} in AI preferences.`;
      if (binding.modelId) match.model = binding.modelId;
    }
  }

  // 4. Apply Preferred Provider if set in preferences
  if (prefs.preferredProviderId) {
    const match = candidates.find((c) => c.provider === prefs.preferredProviderId);
    if (match) {
      match.score += 80;
      match.reasoning = `Preferred provider ${match.label} selected from AI preferences.`;
      if (prefs.preferredModelId) match.model = prefs.preferredModelId;
    }
  }

  // 5. Apply Manual Override if actively supplied
  const activeOverride = options.manualOverride;
  if (activeOverride) {
    const existing = candidates.find((c) => c.provider === activeOverride.providerId);
    if (existing) {
      existing.score += 500;
      existing.reasoning = `Manual model override: ${existing.label}.`;
      if (activeOverride.modelId) existing.model = activeOverride.modelId;
    } else {
      const key = await readProviderKey(activeOverride.providerId);
      if (key) {
        const spec = getCloudProvider(activeOverride.providerId);
        candidates.unshift({
          provider: activeOverride.providerId,
          model: activeOverride.modelId || spec?.models?.[0],
          apiKey: key,
          tier: spec?.freeTier === "free" ? "free" : "byok",
          label: spec ? `${spec.name} (Manual)` : activeOverride.providerId,
          reasoning: `Manual override active for ${activeOverride.providerId}.`,
          score: 1000,
        });
      }
    }
  }

  // Sort descending by final score
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      ok: false,
      fallbacks: [],
      allCandidates: [],
      reasoning:
        privacyMode === "local-only"
          ? "No local AI runtimes (Ollama/LM Studio) are reachable on localhost. Ensure your local runner is active and CORS is configured, or adjust privacy mode."
          : "No AI providers are configured or reachable on this device. Connect a provider in AI Access settings or start a local runner.",
    };
  }

  const [choice, ...fallbacks] = candidates;
  return {
    ok: true,
    choice,
    fallbacks,
    allCandidates: candidates,
    reasoning: choice.reasoning,
  };
}
