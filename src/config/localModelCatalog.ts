/**
 * Local model catalog and hardware-matched recommendations.
 *
 * Sizes below are for Q4_K_M quantisation — the 4-bit format that is the
 * practical default for local use, and the one Ollama serves unless another
 * tag is requested. They are real on-disk download sizes, not estimates from
 * a formula, because being wrong here means telling somebody with 8 GB of RAM
 * to download a model that will thrash their machine.
 *
 * `minMemoryGb` is deliberately larger than `downloadSizeGb`: weights are not
 * the only thing resident. The KV cache for the context window, the runner
 * itself, and the operating system all need headroom, and a model that only
 * just fits will swap and become unusably slow. The margin is ~1.5 GB for
 * small models and grows with size.
 *
 * Pure data and pure functions only — see providerCatalog.ts's header for why.
 */

export type ModelStrength = "drafting" | "reasoning" | "summarising" | "multilingual" | "fast";

export interface LocalModelSpec {
  id: string;
  name: string;
  /** Parameter count in billions */
  paramsB: number;
  quantization: string;
  /** On-disk size of the quantised weights, GB */
  downloadSizeGb: number;
  /** Memory needed to run it without swapping, GB */
  minMemoryGb: number;
  /** Tag to pull with Ollama, e.g. `ollama pull llama3.2:3b` */
  ollamaTag: string;
  contextTokens: number;
  strengths: ModelStrength[];
  /** Honest one-line statement of what this model is actually good for here */
  academicFit: string;
  license: string;
}

export const LOCAL_MODELS: LocalModelSpec[] = [
  {
    id: "llama3.2-1b",
    name: "Llama 3.2 1B",
    paramsB: 1,
    quantization: "Q4_K_M",
    downloadSizeGb: 0.8,
    minMemoryGb: 2.5,
    ollamaTag: "llama3.2:1b",
    contextTokens: 128000,
    strengths: ["fast"],
    academicFit: "Rewording and tidying sentences only — not capable of drafting original academic argument.",
    license: "Llama 3.2 Community License",
  },
  {
    id: "llama3.2-3b",
    name: "Llama 3.2 3B",
    paramsB: 3,
    quantization: "Q4_K_M",
    downloadSizeGb: 2.0,
    minMemoryGb: 4,
    ollamaTag: "llama3.2:3b",
    contextTokens: 128000,
    strengths: ["fast", "summarising"],
    academicFit: "Summarising a paper and cleaning up prose. Too small for reliable methodology or analysis work.",
    license: "Llama 3.2 Community License",
  },
  {
    id: "qwen2.5-3b",
    name: "Qwen 2.5 3B",
    paramsB: 3,
    quantization: "Q4_K_M",
    downloadSizeGb: 1.9,
    minMemoryGb: 4,
    ollamaTag: "qwen2.5:3b",
    contextTokens: 32768,
    strengths: ["fast", "multilingual"],
    academicFit: "The best small option for work in languages other than English.",
    license: "Qwen Research License",
  },
  {
    id: "phi4-mini",
    name: "Phi-4 Mini",
    paramsB: 3.8,
    quantization: "Q4_K_M",
    downloadSizeGb: 2.5,
    minMemoryGb: 5,
    ollamaTag: "phi4-mini",
    contextTokens: 128000,
    strengths: ["reasoning", "fast"],
    academicFit: "Punches above its size on structured reasoning — a good choice on a constrained laptop.",
    license: "MIT",
  },
  {
    id: "mistral-7b",
    name: "Mistral 7B",
    paramsB: 7,
    quantization: "Q4_K_M",
    downloadSizeGb: 4.1,
    minMemoryGb: 6.5,
    ollamaTag: "mistral:7b",
    contextTokens: 32768,
    strengths: ["drafting", "fast"],
    academicFit: "Solid general drafting with a light memory footprint.",
    license: "Apache 2.0",
  },
  {
    id: "llama3.1-8b",
    name: "Llama 3.1 8B",
    paramsB: 8,
    quantization: "Q4_K_M",
    downloadSizeGb: 4.7,
    minMemoryGb: 7,
    ollamaTag: "llama3.1:8b",
    contextTokens: 128000,
    strengths: ["drafting", "summarising"],
    academicFit: "The usual starting point — competent literature summarising and first-draft section writing.",
    license: "Llama 3.1 Community License",
  },
  {
    id: "qwen2.5-7b",
    name: "Qwen 2.5 7B",
    paramsB: 7,
    quantization: "Q4_K_M",
    downloadSizeGb: 4.7,
    minMemoryGb: 7,
    ollamaTag: "qwen2.5:7b",
    contextTokens: 32768,
    strengths: ["drafting", "multilingual"],
    academicFit: "Strong multilingual drafting; the better pick if you write in more than one language.",
    license: "Apache 2.0",
  },
  {
    id: "deepseek-r1-8b",
    name: "DeepSeek-R1 8B (distilled)",
    paramsB: 8,
    quantization: "Q4_K_M",
    downloadSizeGb: 4.9,
    minMemoryGb: 7.5,
    ollamaTag: "deepseek-r1:8b",
    contextTokens: 128000,
    strengths: ["reasoning"],
    academicFit: "Shows its reasoning step by step — useful for checking a methodology or an argument's logic.",
    license: "MIT",
  },
  {
    id: "gemma2-9b",
    name: "Gemma 2 9B",
    paramsB: 9,
    quantization: "Q4_K_M",
    downloadSizeGb: 5.4,
    minMemoryGb: 8,
    ollamaTag: "gemma2:9b",
    contextTokens: 8192,
    strengths: ["drafting", "summarising"],
    academicFit: "Careful, measured prose. Short context window limits whole-chapter work.",
    license: "Gemma Terms of Use",
  },
  {
    id: "phi4-14b",
    name: "Phi-4 14B",
    paramsB: 14,
    quantization: "Q4_K_M",
    downloadSizeGb: 9.1,
    minMemoryGb: 12,
    ollamaTag: "phi4",
    contextTokens: 16384,
    strengths: ["reasoning", "drafting"],
    academicFit: "Excellent structured reasoning for its size — good for methodology and analysis sections.",
    license: "MIT",
  },
  {
    id: "qwen2.5-14b",
    name: "Qwen 2.5 14B",
    paramsB: 14,
    quantization: "Q4_K_M",
    downloadSizeGb: 9.0,
    minMemoryGb: 12,
    ollamaTag: "qwen2.5:14b",
    contextTokens: 32768,
    strengths: ["drafting", "multilingual", "reasoning"],
    academicFit: "A genuine all-rounder at this size — the sweet spot on a 16 GB machine.",
    license: "Apache 2.0",
  },
  {
    id: "deepseek-r1-14b",
    name: "DeepSeek-R1 14B (distilled)",
    paramsB: 14,
    quantization: "Q4_K_M",
    downloadSizeGb: 9.0,
    minMemoryGb: 12,
    ollamaTag: "deepseek-r1:14b",
    contextTokens: 128000,
    strengths: ["reasoning"],
    academicFit: "The strongest local option for critiquing arguments and checking analytical validity.",
    license: "MIT",
  },
  {
    id: "gemma2-27b",
    name: "Gemma 2 27B",
    paramsB: 27,
    quantization: "Q4_K_M",
    downloadSizeGb: 16.0,
    minMemoryGb: 20,
    ollamaTag: "gemma2:27b",
    contextTokens: 8192,
    strengths: ["drafting", "summarising"],
    academicFit: "High-quality academic prose. The short context window is the main constraint.",
    license: "Gemma Terms of Use",
  },
  {
    id: "qwen2.5-32b",
    name: "Qwen 2.5 32B",
    paramsB: 32,
    quantization: "Q4_K_M",
    downloadSizeGb: 20.0,
    minMemoryGb: 24,
    ollamaTag: "qwen2.5:32b",
    contextTokens: 32768,
    strengths: ["drafting", "reasoning", "multilingual"],
    academicFit: "Approaches mid-tier cloud quality while never leaving your machine.",
    license: "Apache 2.0",
  },
  {
    id: "deepseek-r1-32b",
    name: "DeepSeek-R1 32B (distilled)",
    paramsB: 32,
    quantization: "Q4_K_M",
    downloadSizeGb: 20.0,
    minMemoryGb: 24,
    ollamaTag: "deepseek-r1:32b",
    contextTokens: 128000,
    strengths: ["reasoning"],
    academicFit: "Deep, explicit reasoning over long documents — strong for whole-thesis critique.",
    license: "MIT",
  },
  {
    id: "llama3.3-70b",
    name: "Llama 3.3 70B",
    paramsB: 70,
    quantization: "Q4_K_M",
    downloadSizeGb: 43.0,
    minMemoryGb: 48,
    ollamaTag: "llama3.3:70b",
    contextTokens: 128000,
    strengths: ["drafting", "reasoning", "summarising"],
    academicFit: "The best writing quality available locally; genuinely comparable to paid cloud models.",
    license: "Llama 3.3 Community License",
  },
];

export interface ModelRecommendation {
  model: LocalModelSpec;
  /** 0-100 suitability for this machine */
  score: number;
  fit: "comfortable" | "tight" | "too-large";
  /** Why this model is or is not being suggested */
  rationale: string;
}

/**
 * Rank models against a machine's usable memory.
 *
 * "Comfortable" means at least 1.35x the model's floor, which leaves room for
 * a real context window rather than only the weights. "Tight" means it will
 * load and run but with a small context and noticeable slowdown — surfaced
 * rather than hidden, because a model that technically fits but crawls is a
 * worse experience than being told to pick the size down.
 */
export function recommendLocalModels(
  usableMemoryGb: number | null,
  opts?: { preferred?: ModelStrength; limit?: number }
): ModelRecommendation[] {
  if (usableMemoryGb === null) return [];

  const preferred = opts?.preferred;
  const limit = opts?.limit ?? 5;

  const scored: ModelRecommendation[] = LOCAL_MODELS.map((model) => {
    const headroom = usableMemoryGb / model.minMemoryGb;

    let fit: ModelRecommendation["fit"];
    let base: number;
    if (headroom >= 1.35) {
      fit = "comfortable";
      // Favour the largest model that still sits comfortably: capability
      // rises with parameters, so among comfortable options bigger wins.
      base = 70 + Math.min(25, model.paramsB / 3);
    } else if (headroom >= 1.0) {
      fit = "tight";
      base = 45;
    } else {
      fit = "too-large";
      base = 0;
    }

    if (preferred && model.strengths.includes(preferred)) base += 8;

    const rationale =
      fit === "too-large"
        ? `Needs about ${model.minMemoryGb} GB — more than the ~${usableMemoryGb} GB available.`
        : fit === "tight"
          ? `Fits within ~${usableMemoryGb} GB but with little headroom; expect a small context window and slower replies.`
          : `Runs comfortably in ~${usableMemoryGb} GB (needs about ${model.minMemoryGb} GB).`;

    return { model, score: Math.min(100, Math.round(base)), fit, rationale };
  });

  return scored
    .filter((r) => r.fit !== "too-large")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function getLocalModel(id: string): LocalModelSpec | undefined {
  return LOCAL_MODELS.find((m) => m.id === id);
}
