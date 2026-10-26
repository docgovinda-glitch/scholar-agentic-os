/**
 * Model Capability Profiling & Prompt Adaptation Engine
 *
 * Classifies models into three distinct operational capability tiers:
 * - `compact`: (1B-8B local/edge models, e.g., llama3.2:3b, phi-3, gemma-2-2b)
 * - `standard`: (Workhorse fast models, e.g., gemini-2.5-flash, gpt-4o-mini, claude-3-5-haiku)
 * - `frontier`: (State-of-the-art models, e.g., claude-3-7-sonnet, gpt-4o, o1, gemini-2.5-pro, deepseek-r1)
 *
 * Dynamically adapts prompts:
 * - For `compact` tier: compresses system instructions by ~60%, mandates flat JSON keys,
 *   and provides persona decomposition to prevent reasoning hallucinations.
 */

export type ModelTier = "compact" | "standard" | "frontier";

export interface ModelCapabilityProfile {
  tier: ModelTier;
  modelId: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsNativeJsonSchema: boolean;
  supportsReasoningBlocks: boolean;
  recommendedPersonaDecomposition: boolean;
  systemPromptCompressionRatio: number;
}

export interface AdaptedPromptPayload {
  systemPrompt: string;
  userPrompt: string;
  isCompressed: boolean;
  mandatesFlatJson: boolean;
  recommendedMicroPasses?: Array<{ persona: string; focus: string }>;
}

const COMPACT_MODEL_PATTERNS = [
  /:1b\b/i,
  /:2b\b/i,
  /:3b\b/i,
  /:7b\b/i,
  /:8b\b/i,
  /phi-?3/i,
  /phi-?4-mini/i,
  /gemma-?2-?2b/i,
  /gemma-?2-?9b/i,
  /gemma-?7b/i,
  /llama-?3\.2/i,
  /tinyllama/i,
  /smollm/i,
  /qwen2?\.5?:(?:0\.5b|1\.5b|3b|7b)/i,
  /mistral:?7b/i,
];

const FRONTIER_MODEL_PATTERNS = [
  /claude-3-7-sonnet/i,
  /claude-3\.7-sonnet/i,
  /claude-3-opus/i,
  /claude-opus/i,
  /gpt-4o(?!-mini)/i,
  /gpt-4\.5/i,
  /\bo1\b/i,
  /\bo1-preview\b/i,
  /\bo3\b/i,
  /\bo3-mini\b/i,
  /gemini-2\.5-pro/i,
  /gemini-2\.0-pro/i,
  /gemini-1\.5-pro/i,
  /deepseek-r1(?!:(?:1\.5b|7b|8b))/i,
  /deepseek-reasoner/i,
];

/**
 * Classifies model and provider into capability profile.
 */
export function getModelCapabilityProfile(
  modelId: string,
  provider: string = ""
): ModelCapabilityProfile {
  const normModel = (modelId || "").toLowerCase();
  const normProv = (provider || "").toLowerCase();

  // 1. Check Compact tier
  const isCompact = COMPACT_MODEL_PATTERNS.some((pat) => pat.test(normModel)) ||
    ((normProv === "ollama" || normProv === "local") && !normModel.includes("70b") && !normModel.includes("671b"));

  if (isCompact) {
    return {
      tier: "compact",
      modelId,
      provider,
      contextWindow: normModel.includes("llama-3.2") ? 128000 : 8192,
      maxOutputTokens: 2048,
      supportsNativeJsonSchema: false,
      supportsReasoningBlocks: normModel.includes("r1") || normModel.includes("reason"),
      recommendedPersonaDecomposition: true,
      systemPromptCompressionRatio: 0.4, // ~60% compressed
    };
  }

  // 2. Check Frontier tier
  const isFrontier = FRONTIER_MODEL_PATTERNS.some((pat) => pat.test(normModel));
  if (isFrontier) {
    return {
      tier: "frontier",
      modelId,
      provider,
      contextWindow: normModel.includes("gemini") ? 1048576 : 200000,
      maxOutputTokens: 8192,
      supportsNativeJsonSchema: true,
      supportsReasoningBlocks: normModel.includes("r1") || normModel.includes("o1") || normModel.includes("o3") || normModel.includes("sonnet"),
      recommendedPersonaDecomposition: false,
      systemPromptCompressionRatio: 1.0,
    };
  }

  // 3. Default to Standard tier
  return {
    tier: "standard",
    modelId,
    provider,
    contextWindow: normModel.includes("gemini") ? 1048576 : 128000,
    maxOutputTokens: 4096,
    supportsNativeJsonSchema: true,
    supportsReasoningBlocks: false,
    recommendedPersonaDecomposition: false,
    systemPromptCompressionRatio: 0.8,
  };
}

/**
 * Compresses system prompt for compact tier models (strips ~60% of verbosity).
 */
export function compressSystemPrompt(prompt: string): string {
  if (!prompt) return "";

  // Split into paragraphs/lines
  const lines = prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const retained: string[] = [];

  for (const line of lines) {
    // Drop decorative markdown banners and repetitive explanatory prose
    if (
      line.startsWith("===") ||
      line.startsWith("---") ||
      line.toLowerCase().includes("you are an elite") ||
      line.toLowerCase().includes("please ensure that you uphold") ||
      line.toLowerCase().includes("failure to adhere to these instructions")
    ) {
      continue;
    }

    // Keep strict directives, schema rules, and constraints
    if (
      line.startsWith("-") ||
      line.startsWith("*") ||
      line.startsWith("1.") ||
      line.startsWith("2.") ||
      line.startsWith("3.") ||
      line.startsWith("4.") ||
      line.startsWith("5.") ||
      line.includes(":") ||
      line.startsWith("{") ||
      line.startsWith("}") ||
      line.toUpperCase() === line
    ) {
      // Shorten line
      const simplified = line
        .replace(/strictly forbidden words\/phrases:\s*/i, "Forbidden: ")
        .replace(/you must output only valid json matching this schema:?/i, "Output JSON schema:")
        .replace(/eliminate mechanical transition chains\./i, "Organic transitions only.")
        .trim();
      retained.push(simplified);
    }
  }

  const compressed = retained.join("\n");
  // If compression didn't shrink sufficiently or removed too much, fallback to first 40% of original
  if (compressed.length === 0 || compressed.length > prompt.length * 0.55) {
    return prompt.slice(0, Math.floor(prompt.length * 0.4)).trim();
  }

  return compressed;
}

/**
 * Five-Referee Peer Review Micro-Pass Decomposition for Compact Models.
 */
export const PEER_REVIEW_MICRO_PASSES = [
  { persona: "Referee 1 (Methodology)", focus: "Sample size, statistical controls, and experimental validity." },
  { persona: "Referee 2 (Novelty & Contribution)", focus: "Differentiation from existing literature and unique insight." },
  { persona: "Referee 3 (Evidence Grounding)", focus: "Verification that citations and empirical numbers match claims." },
  { persona: "Referee 4 (Limitations & Flaws)", focus: "Unaddressed confounders, biases, and scope boundaries." },
  { persona: "Referee 5 (Editorial Recommendation)", focus: "Overall publishability, required revisions, and punchy verdict." },
] as const;

/**
 * Adapts system and user prompts according to model capability profile.
 */
export function adaptPromptForModel(
  systemPrompt: string,
  userPrompt: string,
  profile: ModelCapabilityProfile
): AdaptedPromptPayload {
  if (profile.tier === "frontier") {
    return {
      systemPrompt,
      userPrompt,
      isCompressed: false,
      mandatesFlatJson: false,
    };
  }

  if (profile.tier === "standard") {
    return {
      systemPrompt,
      userPrompt,
      isCompressed: false,
      mandatesFlatJson: false,
    };
  }

  // Tier is compact: apply compression and flat JSON constraint
  const compressedSystem = compressSystemPrompt(systemPrompt);

  const flatJsonNotice = "\nIMPORTANT: Output flat, single-level JSON keys only. Do not nest arrays within nested objects.";
  const adaptedSystem = `${compressedSystem}${flatJsonNotice}`.trim();

  const isMultiReferee =
    systemPrompt.toLowerCase().includes("peer review") ||
    systemPrompt.toLowerCase().includes("referee") ||
    userPrompt.toLowerCase().includes("peer review");

  return {
    systemPrompt: adaptedSystem,
    userPrompt,
    isCompressed: true,
    mandatesFlatJson: true,
    recommendedMicroPasses: isMultiReferee ? [...PEER_REVIEW_MICRO_PASSES] : undefined,
  };
}
