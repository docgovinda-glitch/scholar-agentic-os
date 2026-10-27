/**
 * Unified AI Task Types & Model Capability Profiler
 *
 * Bridges client routing, server routing, and platform warden task classifications:
 * 1. Unifies TaskClass, RoutingTaskType, and TaskType.
 * 2. Provides deterministic mapping from any task moniker to Warden's TaskClass.
 * 3. Classifies candidate models into capability profiles ("compact" | "standard" | "frontier")
 *    so prompts and RAG contexts can scale gracefully when running on small local models.
 */

export type TaskClass =
  | "drafting"
  | "refinement"
  | "chat"
  | "summarisation"
  | "verification"
  | "rule_extraction"
  | "discovery"
  | "embedding"
  | "classification";

export type RoutingTaskType =
  | "simple"
  | "multimodal"
  | "reasoning"
  | "coding"
  | "long-context"
  | "literatureDiscovery";

export type TaskType =
  | RoutingTaskType
  | TaskClass
  | "deep-research"
  | "agentic";

export type ModelCapabilityProfile = "compact" | "standard" | "frontier";

export interface ModelProfileMetrics {
  profile: ModelCapabilityProfile;
  recommendedMaxTokens: number;
  recommendedRagChunkBudget: number;
  supportsStreaming: boolean;
}

/**
 * Maps any high-level routing or workflow task name into Warden's canonical TaskClass.
 */
export function mapTaskTypeToTaskClass(taskType: string = "reasoning"): TaskClass {
  const norm = (taskType || "").toLowerCase().trim();

  // Direct TaskClass matches
  const validTaskClasses: ReadonlySet<string> = new Set([
    "drafting",
    "refinement",
    "chat",
    "summarisation",
    "verification",
    "rule_extraction",
    "discovery",
    "embedding",
    "classification",
  ]);

  if (validTaskClasses.has(norm)) {
    return norm as TaskClass;
  }

  // RoutingTaskType and alias mappings
  switch (norm) {
    case "simple":
    case "chat":
      return "chat";
    case "reasoning":
    case "deep-research":
    case "agentic":
      return "drafting";
    case "coding":
      return "refinement";
    case "extraction":
    case "extract":
      return "rule_extraction";
    case "long-context":
      return "discovery";
    case "literaturediscovery":
      return "discovery";
    case "multimodal":
      return "chat";
    default:
      return "drafting";
  }
}

/**
 * Classifies model IDs into "compact" (edge/small local), "standard" (balanced),
 * or "frontier" (high-parameter reasoning/flagship).
 */
export function getModelCapabilityProfile(modelId: string = ""): ModelCapabilityProfile {
  const norm = (modelId || "").toLowerCase();

  // Frontier flagships
  if (
    norm.includes("opus") ||
    norm.includes("claude-3-5") ||
    norm.includes("claude-3-7") ||
    (norm.includes("gpt-4o") && !norm.includes("mini")) ||
    norm.includes("gpt-4-turbo") ||
    norm.includes("o1") ||
    norm.includes("o3") ||
    norm.includes("deepseek-r1") ||
    norm.includes("gemini-1.5-pro") ||
    norm.includes("gemini-2.0-pro") ||
    norm.includes("70b") ||
    norm.includes("405b")
  ) {
    return "frontier";
  }

  // Compact / small local runners
  if (
    norm.includes("flash-8b") ||
    norm.includes("nano") ||
    norm.includes("micro") ||
    norm.includes("phi") ||
    norm.includes("8b") ||
    norm.includes("7b") ||
    norm.includes("3b") ||
    norm.includes("1b") ||
    norm.includes("0.5b") ||
    norm.includes("gemma:2b") ||
    norm.includes("gemma-2b") ||
    norm.includes("qwen:1.5b") ||
    norm.includes("qwen2.5:0.5b") ||
    norm.includes("qwen2.5:1.5b") ||
    norm.includes("llama3.2:1b") ||
    norm.includes("llama3.2:3b")
  ) {
    return "compact";
  }

  // Standard balanced models (haiku, sonnet, flash, gpt-4o-mini, 8b models, etc.)
  return "standard";
}

/**
 * Returns sensible context budgets for the model's capability profile.
 */
export function getModelProfileMetrics(modelId: string): ModelProfileMetrics {
  const profile = getModelCapabilityProfile(modelId);

  switch (profile) {
    case "compact":
      return {
        profile,
        recommendedMaxTokens: 2048,
        recommendedRagChunkBudget: 1200,
        supportsStreaming: true,
      };
    case "frontier":
      return {
        profile,
        recommendedMaxTokens: 8192,
        recommendedRagChunkBudget: 6000,
        supportsStreaming: true,
      };
    case "standard":
    default:
      return {
        profile,
        recommendedMaxTokens: 4096,
        recommendedRagChunkBudget: 3000,
        supportsStreaming: true,
      };
  }
}
