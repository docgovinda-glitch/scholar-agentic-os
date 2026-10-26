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
 * 6. Provider Health & Historical Reliability (Health State Machine)
 * 7. Default Policy Ranking
 *
 * Strictly operates on the client using local credentials and runtimes without
 * requiring server round-trips to compute candidate rankings.
 */

import { getCloudProvider, CLOUD_PROVIDERS } from "../config/providerCatalog";
import { LOCAL_RUNNERS } from "../config/localRunnerCatalog";
import { probeRunner, type ProbeResult } from "./localRunnerProbe";
import { providersWithStoredKey, readProviderKey, loadUserAiSettings } from "./userAiSettings";
import {
  getCachedDiscoveredModels,
  discoverProviderModels,
  normalizeCapabilities,
  isModelBlacklisted,
  isModelQuarantined,
  isProviderAvailable,
  getProviderHealth,
  isGenerativeChatModel,
  type DiscoveredModel,
  type CandidateAvailabilityState,
} from "./modelDiscovery";
import { getDefaultModelId } from "../config/modelCatalog";
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

import type { RoutingTaskType } from "../shared/aiTypes";
export type { RoutingTaskType };

export interface TaskRequirement {
  taskType: RoutingTaskType;
  requiresStructuredOutput?: boolean;
  minContextWindow?: number;
  reasoningIntensity?: "high" | "medium" | "standard";
  toolCalling?: boolean;
  vision?: boolean;
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
  primary?: ClientRoutingCandidate;
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
    case "literatureDiscovery":
    case "reasoning":
      return {
        taskType,
        requiresStructuredOutput: true,
        minContextWindow: 8192,
        reasoningIntensity: "high",
        toolCalling: true,
      };
    case "long-context":
      return {
        taskType,
        requiresStructuredOutput: false,
        minContextWindow: 65536,
        reasoningIntensity: "medium",
      };
    case "coding":
      return {
        taskType,
        requiresStructuredOutput: false,
        minContextWindow: 8192,
        reasoningIntensity: "high",
      };
    case "multimodal":
      return {
        taskType,
        requiresStructuredOutput: false,
        minContextWindow: 8192,
        reasoningIntensity: "medium",
        vision: true,
      };
    case "simple":
    default:
      return {
        taskType,
        requiresStructuredOutput: false,
        minContextWindow: 4096,
        reasoningIntensity: "standard",
      };
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
          const validModels = probe.models.filter((m) => {
            if (isModelBlacklisted(runner.id, m)) return false;
            const caps = normalizeCapabilities(runner.id, m).capabilities;
            if (reqs.vision && !caps.includes("vision")) return false;
            if (reqs.requiresStructuredOutput && !caps.includes("structuredOutput")) return false;
            return true;
          });
          if (validModels.length === 0) continue;
          const model = validModels[0];
          let score = 50; // base score for reachable local model
          let reasoning = `Local runtime (${runner.name}) available on device.`;

          if (privacyMode === "local-only" || privacyMode === "privacy-first") {
            score += 40; // prioritize local in privacy modes
          }

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
    const userAiSettings = await loadUserAiSettings().catch(() => null);
    const configuredProviderIds = Array.from(
      new Set([
        ...providersWithStoredKey(),
        ...(userAiSettings?.provider ? [userAiSettings.provider] : []),
      ])
    );

    for (const providerId of configuredProviderIds) {
      if (disabled.has(providerId)) continue;
      // Check health state machine: skip if in auth_failure (401/403) or hard offline
      if (!isProviderAvailable(providerId)) continue;

      const key = await readProviderKey(providerId);
      if (!key) continue;

      const spec = getCloudProvider(providerId);
      if (!spec) continue;

      const tier: "free" | "byok" = spec.freeTier === "free" || spec.freeTier === "freemium" ? "free" : "byok";

      // Resolve available models: live discovered cache first, then self-heal discovery if missing, then compatibility fallback
      let cachedDiscovered = getCachedDiscoveredModels(providerId, key) || [];

      // If no cached models exist for this configured credential, synchronously discover to establish trusted candidate set
      if (cachedDiscovered.length === 0) {
        const discovery = await discoverProviderModels(providerId, key).catch(() => null);
        if (discovery && discovery.ok && discovery.models.length > 0) {
          cachedDiscovered = discovery.models;
        }
      }

      let availableModels =
        cachedDiscovered.length > 0
          ? cachedDiscovered.map((m) => m.id)
          : spec.models && spec.models.length > 0
          ? spec.models
          : [spec.defaultModel];

      // Exclude session-quarantined dead models and non-generative models
      availableModels = availableModels.filter(
        (m) => !isModelQuarantined(providerId, m) && isGenerativeChatModel(providerId, m)
      );
      if (availableModels.length === 0) continue;

      // Check user's preferred model for this provider
      const userPreferredForProvider = userAiSettings?.preferences?.[`${providerId}Model`];
      let primaryModel: string | undefined = undefined;

      if (userPreferredForProvider && availableModels.includes(userPreferredForProvider)) {
        const prefItem = cachedDiscovered.find((d) => d.id === userPreferredForProvider || d.modelId === userPreferredForProvider);
        const prefCaps = prefItem?.capabilities ?? normalizeCapabilities(providerId, userPreferredForProvider).capabilities;
        const prefCtx = prefItem?.contextWindow ?? normalizeCapabilities(providerId, userPreferredForProvider).contextWindow;

        const prefValid =
          (!reqs.requiresStructuredOutput || prefCaps.includes("structuredOutput")) &&
          (!reqs.minContextWindow || (prefCtx ?? 0) >= reqs.minContextWindow) &&
          (!reqs.vision || prefCaps.includes("vision"));

        if (prefValid) {
          primaryModel = userPreferredForProvider;
        }
      }

      if (!primaryModel) {
        // Capability-aware selection
        const matchingModels = availableModels.filter((m) => {
          const discoveredItem = cachedDiscovered.find((d) => d.id === m || d.modelId === m);
          const capabilities = discoveredItem?.capabilities ?? normalizeCapabilities(providerId, m).capabilities;
          const contextWindow = discoveredItem?.contextWindow ?? normalizeCapabilities(providerId, m).contextWindow;

          if (reqs.requiresStructuredOutput && !capabilities.includes("structuredOutput")) return false;
          if (reqs.minContextWindow && (contextWindow ?? 0) < reqs.minContextWindow) return false;
          if (reqs.vision && !capabilities.includes("vision")) return false;
          return true;
        });

        if (matchingModels.length === 0) {
          // No model on this provider satisfies mandatory task requirements; do not route to incapable model
          continue;
        }

        // Prioritize default model, high reasoning, and capability tier
        matchingModels.sort((a, b) => {
          if (a === spec.defaultModel) return -1;
          if (b === spec.defaultModel) return 1;

          const capsA = cachedDiscovered.find((d) => d.id === a || d.modelId === a)?.capabilities ?? normalizeCapabilities(providerId, a).capabilities;
          const capsB = cachedDiscovered.find((d) => d.id === b || d.modelId === b)?.capabilities ?? normalizeCapabilities(providerId, b).capabilities;

          if (reqs.reasoningIntensity === "high") {
            const hasA = capsA.includes("reasoning");
            const hasB = capsB.includes("reasoning");
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
          }

          return 0;
        });

        primaryModel = matchingModels[0];
      }

      let score = 40; // base score for cloud BYOK
      let reasoning = `${spec.name} configured with user-held API key.`;

      // Live discovered model priority invariant: VERIFIED_LIVE strictly outranks UNVERIFIED_COMPATIBILITY
      const isLive = cachedDiscovered.some(
        (d) => d.source === "live_discovery" && (d.id === primaryModel || d.modelId === primaryModel)
      );
      const candidateState: CandidateAvailabilityState = isLive ? "VERIFIED_LIVE" : "UNVERIFIED_COMPATIBILITY";
      if (candidateState === "VERIFIED_LIVE") {
        score += 50; // Verified live discovery receives high priority
      } else {
        score -= 20; // Unverified compatibility fallback receives demoted score
        reasoning += " (Unverified compatibility fallback)";
      }

      // Scoring based on task requirements & provider capabilities
      const discoveredItem = cachedDiscovered.find((d) => d.id === primaryModel || d.modelId === primaryModel);
      const capabilities = discoveredItem?.capabilities ?? normalizeCapabilities(providerId, primaryModel).capabilities;
      if (reqs.reasoningIntensity === "high" && capabilities.includes("reasoning")) {
        score += 25;
        reasoning = `${spec.name} (${primaryModel}) satisfies high reasoning requirement.`;
      }

      if (reqs.requiresStructuredOutput && capabilities.includes("structuredOutput")) {
        score += 15;
      }

      if (privacyMode === "privacy-first") {
        score -= 15;
      } else if (privacyMode === "balanced") {
        if (tier === "free") {
          score += 15;
        }
      }

      // Check provider health degradation
      const health = getProviderHealth(providerId);
      if (health.status === "degraded") {
        score -= 20;
      }

      // Primary candidate for this provider
      candidates.push({
        provider: providerId,
        model: primaryModel,
        apiKey: key,
        tier,
        label: `${spec.name}${primaryModel ? ` (${primaryModel})` : ""}`,
        reasoning,
        score,
      });

      // Secondary fallback models on the same provider (satisfying requirements)
      const secondaryCandidates = availableModels.filter((m) => {
        if (m === primaryModel) return false;
        if (isModelQuarantined(providerId, m)) return false;
        const disc = cachedDiscovered.find((d) => d.id === m || d.modelId === m);
        const caps = disc?.capabilities ?? normalizeCapabilities(providerId, m).capabilities;
        if (reqs.requiresStructuredOutput && !caps.includes("structuredOutput")) return false;
        return true;
      });

      for (const secondaryModel of secondaryCandidates.slice(0, 2)) {
        const isSecLive = cachedDiscovered.some(
          (d) => d.source === "live_discovery" && (d.id === secondaryModel || d.modelId === secondaryModel)
        );
        candidates.push({
          provider: providerId,
          model: secondaryModel,
          apiKey: key,
          tier,
          label: `${spec.name} (${secondaryModel} - Backup)`,
          reasoning: `Secondary in-provider model for ${spec.name} (${isSecLive ? "Verified Live" : "Compatibility Fallback"}).`,
          score: score - (isSecLive ? 15 : 35),
        });
      }
    }
  }

  // 3. Apply Task Specific Bindings if set in preferences
  if (prefs.taskBindings && prefs.taskBindings[taskType]) {
    const binding = prefs.taskBindings[taskType];
    const match = candidates.find((c) => c.provider === binding.providerId);
    if (match) {
      match.score += 100;
      match.reasoning = `Explicitly bound to ${match.label} in AI preferences.`;
      if (binding.modelId && !isModelBlacklisted(binding.providerId, binding.modelId)) {
        match.model = binding.modelId;
      }
    }
  }

  // 4. Apply Preferred Provider if set in preferences
  if (prefs.preferredProviderId) {
    const match = candidates.find((c) => c.provider === prefs.preferredProviderId);
    if (match) {
      match.score += 80;
      match.reasoning = `Preferred provider ${match.label} selected from AI preferences.`;
      if (prefs.preferredModelId && !isModelBlacklisted(prefs.preferredProviderId, prefs.preferredModelId)) {
        match.model = prefs.preferredModelId;
      }
    }
  }

  // 5. Apply Manual Override if actively supplied
  const activeOverride = options.manualOverride;
  if (activeOverride) {
    const isOverrideModelBlacklisted = activeOverride.modelId
      ? isModelBlacklisted(activeOverride.providerId, activeOverride.modelId)
      : false;

    const existing = candidates.find((c) => c.provider === activeOverride.providerId);
    if (existing) {
      existing.score += 500;
      existing.reasoning = `Manual model override: ${existing.label}.`;
      if (activeOverride.modelId && !isOverrideModelBlacklisted) {
        existing.model = activeOverride.modelId;
      }
    } else {
      const key = await readProviderKey(activeOverride.providerId);
      if (key && isProviderAvailable(activeOverride.providerId)) {
        const spec = getCloudProvider(activeOverride.providerId);
        const model =
          activeOverride.modelId && !isOverrideModelBlacklisted
            ? activeOverride.modelId
            : getDefaultModelId(activeOverride.providerId);

        candidates.unshift({
          provider: activeOverride.providerId,
          model,
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
    const missingDetails: string[] = [];
    if (reqs.requiresStructuredOutput) missingDetails.push("structured JSON output");
    if (reqs.minContextWindow && reqs.minContextWindow > 8192) missingDetails.push(`min ${reqs.minContextWindow} context tokens`);
    if (reqs.vision) missingDetails.push("vision / multimodal input");
    if (reqs.reasoningIntensity === "high") missingDetails.push("high-intensity reasoning");

    const reqSummary = missingDetails.length > 0 ? ` (task requires: ${missingDetails.join(", ")})` : "";

    let failReason = "";
    if (privacyMode === "local-only") {
      failReason = "No local AI runtimes (Ollama/LM Studio) are reachable on localhost. Ensure your local runner is active and CORS is configured, or adjust privacy mode.";
    } else if (providersWithStoredKey().length > 0) {
      failReason = `No connected AI model satisfies the minimum requirements for this stage${reqSummary}. All connected models either lack required capabilities or are temporarily in cooldown. Connect a compatible provider or select a different model in AI Access settings.`;
    } else {
      failReason = "No AI providers are configured or available on this device satisfying task requirements. Connect a provider in AI Access settings or start a local runner.";
    }

    return {
      ok: false,
      fallbacks: [],
      allCandidates: [],
      reasoning: failReason,
    };
  }

  const [choice, ...fallbacks] = candidates;
  return {
    ok: true,
    choice,
    primary: choice,
    fallbacks,
    allCandidates: candidates,
    reasoning: choice.reasoning,
  };
}
