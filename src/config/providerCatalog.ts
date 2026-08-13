/**
 * Cloud AI provider catalog — the single source of truth for every cloud
 * provider this app can talk to.
 *
 * Why this file exists (2026-07-31): provider knowledge used to be duplicated
 * in three places that drifted apart — `AI_PROVIDERS` (UI metadata) and the
 * hand-written `ADAPTERS` (request logic) in src/services/aiGateway.ts, plus a
 * third, independent set of hardcoded `if (aiProvider === "...")` blocks in
 * server.ts's /api/generate. That drift caused a real, user-visible bug: Qwen
 * had a client adapter and a streaming server branch but NO non-streaming
 * server branch, so every Qwen request 400'd with "Unsupported provider: qwen"
 * no matter how valid the user's key was. Adding a provider now means adding
 * ONE entry here.
 *
 * IMPORTANT — this module is imported by both the browser bundle and by
 * server.ts (bundled with esbuild for Node). It must stay free of browser
 * globals (window/navigator/localStorage), Node built-ins (fs/os/path), and
 * any import that pulls them in. Pure data and pure functions only.
 *
 * Accuracy note: every `baseUrl` below is a real, currently-documented
 * endpoint, spot-checked against each provider's own documentation rather
 * than inferred from the provider's name. `models` is a *suggestion* list,
 * not an authority — providers rotate model ids frequently, so the UI also
 * offers free-text model entry and a live "refresh models" call against
 * `modelsPath` (see discoverModelsUrl below). Never treat a stale entry here
 * as a reason a model "doesn't exist".
 */

/**
 * How a provider's HTTP API is shaped. Nearly everything is
 * "openai-compatible" (same /chat/completions request and response bodies),
 * which is exactly why one generic adapter can serve ~24 providers — the
 * three exceptions each need their own request/response mapping.
 */
export type ProviderApiStyle =
  | "openai-compatible"
  | "gemini"
  | "anthropic"
  | "cohere";

/**
 * What a new user can actually get without paying. Deliberately honest —
 * "trial-credits" is NOT the same promise as "free", and the UI renders them
 * differently so nobody signs up expecting an ongoing free tier that isn't
 * there.
 */
export type FreeTierKind = "free" | "freemium" | "trial-credits" | "paid";

export interface CloudProviderSpec {
  /** Stable id — also the AISettings key prefix and the server proxy's `provider` value */
  id: string;
  name: string;
  apiStyle: ProviderApiStyle;
  /** Origin + version prefix, no trailing slash */
  baseUrl: string;
  /** Appended to baseUrl for a chat request */
  chatPath: string;
  /** Appended to baseUrl to list models; null when the provider exposes no such endpoint */
  modelsPath: string | null;
  /**
   * @deprecated Kept for the (few) remaining direct readers, but no longer
   * the authority on what model a provider's UI should default to — use
   * config/modelCatalog.ts's getDefaultModelId() instead, which knows about
   * deprecated/current status. This field is still the last-resort fallback
   * getDefaultModelId() returns for a provider with zero catalog entries.
   */
  defaultModel: string;
  /**
   * @deprecated Suggestions only, and no longer what the AI Access UI's
   * model dropdown is built from — see config/modelCatalog.ts's
   * getModelsForProvider() for the structured, capability-aware
   * replacement. Kept here only as raw data other tooling (e.g.
   * scripts/seedAiRegistry.ts) still reads; not removed outright since
   * ~37 entries' worth of call sites would need touching for no behavior
   * change.
   */
  models: string[];
  freeTier: FreeTierKind;
  /** One honest line about what the free access actually is */
  freeTierNote: string;
  /** Real link to that provider's own API-key page */
  getKeyUrl: string;
  description: string;
  icon: string;
  color: string;
  /** Provider-specific headers merged into every request (e.g. OpenRouter attribution) */
  extraHeaders?: Record<string, string>;
  /**
   * True when baseUrl alone is not enough because it embeds a user-specific
   * value (Cloudflare needs the account id). The UI requires a custom base
   * URL for these instead of silently sending requests to a broken path.
   */
  requiresCustomBaseUrl?: boolean;
  /** Shown under the key input when requiresCustomBaseUrl is set */
  customBaseUrlHint?: string;
  /**
   * Honest one-line statement of the rate/usage ceiling, or omitted when the
   * provider publishes none. Kept separate from freeTierNote (which describes
   * what you GET) because the AI Access UI shows them as distinct facts: what
   * it costs, versus what it caps.
   */
  usageLimitsNote?: string;
  /**
   * Set false only for a provider reachable with no account at all. Every
   * cloud provider in this catalog needs one, so this defaults to true via
   * providerAccessFacts() rather than being repeated on 37 entries.
   */
  requiresRegistration?: boolean;
}

/**
 * The plain-language facts the AI Access UI shows for a provider, derived in
 * one place so every surface makes the SAME claim about cost and limits.
 *
 * The distinction that matters most here is "completely free" versus "free
 * tier": the product's rule (see FreeTierKind) is that a finite pot of trial
 * credits must never be presented as ongoing free access. Nothing in this
 * catalog is currently `freeTier: "free"` — every cloud provider wants an
 * account — so `costLabel` says "Free tier" or "Trial credits" honestly
 * rather than flattening both to "Free".
 */
export interface ProviderAccessFacts {
  costLabel: "Completely free" | "Free tier" | "Trial credits" | "Paid";
  /** True when a user can realistically use this without ever paying. */
  usableWithoutPaying: boolean;
  requiresApiKey: boolean;
  requiresRegistration: boolean;
  /** null when the provider publishes no specific cap. */
  usageLimits: string | null;
  /** The honest sentence about what the free access actually is. */
  costNote: string;
}

const COST_LABEL: Record<FreeTierKind, ProviderAccessFacts["costLabel"]> = {
  free: "Completely free",
  freemium: "Free tier",
  "trial-credits": "Trial credits",
  paid: "Paid",
};

export function providerAccessFacts(spec: CloudProviderSpec): ProviderAccessFacts {
  return {
    costLabel: COST_LABEL[spec.freeTier],
    usableWithoutPaying: spec.freeTier === "free" || spec.freeTier === "freemium",
    // Every cloud provider here authenticates with a key; local runners (see
    // localRunnerCatalog.ts) are the ones that need none, and they are not in
    // this catalog.
    requiresApiKey: true,
    requiresRegistration: spec.requiresRegistration ?? true,
    usageLimits: spec.usageLimitsNote ?? null,
    costNote: spec.freeTierNote,
  };
}

/**
 * Ordered so the most useful "I want to start now, for free" options appear
 * first in the UI — this list order IS the display order.
 */
export const CLOUD_PROVIDERS = [
  // ── Genuinely free / generous free tiers ────────────────────────────────
  {
    id: "gemini",
    name: "Google Gemini",
    apiStyle: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    chatPath: "/models",
    modelsPath: "/models",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    freeTier: "freemium",
    freeTierNote: "Free tier with a generous daily request allowance; no card required.",
    getKeyUrl: "https://aistudio.google.com/app/apikey",
    description: "Google's multimodal models — fast, with one of the most usable free tiers available.",
    icon: "✦",
    color: "#4285F4",
  },
  {
    id: "groq",
    name: "Groq",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-120b", "openai/gpt-oss-20b"],
    freeTier: "freemium",
    freeTierNote: "Free tier with per-minute and per-day request limits; no card required.",
    getKeyUrl: "https://console.groq.com/keys",
    description: "Extremely fast inference on open models — usually the quickest responses of any provider here.",
    icon: "▲",
    color: "#F55036",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.cerebras.ai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "llama-3.3-70b",
    models: ["llama-3.3-70b", "qwen-3-32b", "gpt-oss-120b", "llama3.1-8b"],
    freeTier: "freemium",
    freeTierNote: "Free tier with a large daily token allowance; context window is capped on the free plan.",
    getKeyUrl: "https://cloud.cerebras.ai/",
    description: "Wafer-scale hardware giving very high token throughput on open models.",
    icon: "◍",
    color: "#F26B3A",
  },
  // GitHub Models was listed here until it was found, by live probe on
  // 2026-07-31, to return HTTP 410 with
  // `{"code":"github_models_retirement_brownout"}` — the service is being
  // retired. The base URL was correct; the product is going away. Advertising
  // it as "free for any GitHub account" would have been untrue, so the entry
  // is removed rather than left to fail for every user who chose it.
  {
    id: "openrouter",
    name: "OpenRouter",
    apiStyle: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    // Bug fix (2026-07-31): this defaulted to openai/gpt-4o-mini, which is a
    // PAID model ($0.15/M prompt tokens). OpenRouter is listed here as a free
    // tier, so a user signing up for a free account and accepting the default
    // hit "insufficient credits" the moment they tested the connection — the
    // provider was fine, our default was not. A `:free` model is the only
    // correct default for a provider presented as free.
    //
    // OpenRouter rotates which models carry `:free` fairly often, so treat
    // these as a starting point, not a fixed list: the UI allows free-text
    // model entry and refreshes the real list from /models for the user's own
    // key. If a `:free` id here 404s, that is the rotation, not a broken key.
    defaultModel: "google/gemma-4-31b-it:free",
    models: [
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "inclusionai/ling-3.0-flash:free",
      "openai/gpt-4o-mini",
      "meta-llama/llama-3.3-70b-instruct",
      "deepseek/deepseek-chat",
    ],
    freeTier: "freemium",
    freeTierNote: "Models ending in `:free` cost nothing — the default here is one of them. Others are pay-as-you-go.",
    getKeyUrl: "https://openrouter.ai/keys",
    description: "One key, hundreds of models across many providers — the single most flexible option here.",
    icon: "◇",
    color: "#6467F2",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.mistral.ai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "mistral-small-latest",
    models: ["mistral-small-latest", "mistral-large-latest", "open-mistral-nemo", "magistral-small-latest"],
    freeTier: "freemium",
    freeTierNote: "Free experimentation tier available on their platform; paid tiers lift the limits.",
    getKeyUrl: "https://console.mistral.ai/api-keys/",
    description: "European provider with strong multilingual models and solid academic writing quality.",
    icon: "◈",
    color: "#FA520F",
  },
  {
    id: "zhipu",
    name: "Z.ai (GLM)",
    apiStyle: "openai-compatible",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    chatPath: "/chat/completions",
    modelsPath: null,
    defaultModel: "glm-4-flash",
    models: ["glm-4-flash", "glm-4-air", "glm-4-plus"],
    freeTier: "freemium",
    freeTierNote: "GLM-4-Flash is offered free; larger GLM models are paid.",
    getKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    description: "Zhipu AI's GLM family — a free fast model plus stronger paid tiers.",
    icon: "◉",
    color: "#3859FF",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    apiStyle: "openai-compatible",
    baseUrl: "https://router.huggingface.co/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct",
      "deepseek-ai/DeepSeek-V3-0324",
      "Qwen/Qwen2.5-72B-Instruct",
    ],
    freeTier: "freemium",
    freeTierNote: "Monthly included credits on a free account; usage beyond that is billed.",
    getKeyUrl: "https://huggingface.co/settings/tokens",
    description: "Routes to many inference providers behind one Hugging Face token.",
    icon: "◑",
    color: "#FFD21E",
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    apiStyle: "openai-compatible",
    baseUrl: "",
    chatPath: "/chat/completions",
    modelsPath: null,
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    models: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"],
    freeTier: "freemium",
    freeTierNote: "Free daily allowance measured in Cloudflare 'neurons'; beyond that it is billed.",
    getKeyUrl: "https://dash.cloudflare.com/profile/api-tokens",
    description: "Runs open models on Cloudflare's edge network — needs your account ID in the address.",
    icon: "☁",
    color: "#F6821F",
    requiresCustomBaseUrl: true,
    customBaseUrlHint:
      "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1 — replace YOUR_ACCOUNT_ID with the ID shown on your Cloudflare dashboard.",
  },

  // ── Trial credits (real, but finite — not an ongoing free tier) ─────────
  {
    id: "together",
    name: "Together AI",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.together.xyz/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    models: [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      "Qwen/Qwen2.5-7B-Instruct-Turbo",
      "deepseek-ai/DeepSeek-V3",
    ],
    freeTier: "trial-credits",
    freeTierNote: "Starter credits on signup, then pay-as-you-go.",
    getKeyUrl: "https://api.together.xyz/settings/api-keys",
    description: "Broad catalog of open models with competitive throughput.",
    icon: "◐",
    color: "#0F6FFF",
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    models: [
      "accounts/fireworks/models/llama-v3p3-70b-instruct",
      "accounts/fireworks/models/deepseek-v3",
      "accounts/fireworks/models/qwen2p5-72b-instruct",
    ],
    freeTier: "trial-credits",
    freeTierNote: "Signup credits, then pay-as-you-go.",
    getKeyUrl: "https://fireworks.ai/account/api-keys",
    description: "Fast serving of open models with a large catalog.",
    icon: "◆",
    color: "#7C3AED",
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.deepinfra.com/v1/openai",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    models: ["meta-llama/Llama-3.3-70B-Instruct", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    freeTier: "trial-credits",
    freeTierNote: "Signup credits, then low per-token pricing.",
    getKeyUrl: "https://deepinfra.com/dash/api_keys",
    description: "Low-cost hosting for a wide range of open models.",
    icon: "◒",
    color: "#3B82F6",
  },
  {
    id: "novita",
    name: "Novita AI",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.novita.ai/v3/openai",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    models: ["meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-v3", "qwen/qwen-2.5-72b-instruct"],
    freeTier: "trial-credits",
    freeTierNote: "Signup credits, then pay-as-you-go.",
    getKeyUrl: "https://novita.ai/settings/key-management",
    description: "Open-model inference with a generous starter allowance.",
    icon: "◓",
    color: "#22C55E",
  },
  {
    id: "hyperbolic",
    name: "Hyperbolic",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.hyperbolic.xyz/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    models: ["meta-llama/Llama-3.3-70B-Instruct", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    freeTier: "trial-credits",
    freeTierNote: "Free starting credits, then pay-as-you-go.",
    getKeyUrl: "https://app.hyperbolic.xyz/settings",
    description: "Open-model inference at low cost, aimed at researchers.",
    icon: "◔",
    color: "#14B8A6",
  },
  {
    id: "nebius",
    name: "Nebius AI Studio",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.studio.nebius.com/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    models: ["meta-llama/Llama-3.3-70B-Instruct", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    freeTier: "trial-credits",
    freeTierNote: "Free credits on signup, then pay-as-you-go.",
    getKeyUrl: "https://studio.nebius.com/settings/api-keys",
    description: "European inference platform hosting open models.",
    icon: "◕",
    color: "#1E40AF",
  },
  {
    id: "sambanova",
    name: "SambaNova",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.sambanova.ai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "Meta-Llama-3.3-70B-Instruct",
    models: ["Meta-Llama-3.3-70B-Instruct", "DeepSeek-R1-Distill-Llama-70B", "Meta-Llama-3.1-8B-Instruct"],
    freeTier: "trial-credits",
    freeTierNote: "Free developer tier with rate limits.",
    getKeyUrl: "https://cloud.sambanova.ai/apis",
    description: "Custom silicon delivering high throughput on large open models.",
    icon: "◖",
    color: "#EE7623",
  },
  {
    id: "chutes",
    name: "Chutes AI",
    apiStyle: "openai-compatible",
    baseUrl: "https://llm.chutes.ai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "deepseek-ai/DeepSeek-V3-0324",
    models: ["deepseek-ai/DeepSeek-V3-0324", "Qwen/Qwen3-235B-A22B"],
    freeTier: "trial-credits",
    freeTierNote: "Small free allowance on signup; heavier use is paid.",
    getKeyUrl: "https://chutes.ai/app/api",
    description: "Decentralised serving of very large open models.",
    icon: "◗",
    color: "#A855F7",
  },
  {
    id: "ai21",
    name: "AI21 Labs",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.ai21.com/studio/v1",
    chatPath: "/chat/completions",
    modelsPath: null,
    defaultModel: "jamba-mini",
    models: ["jamba-mini", "jamba-large"],
    freeTier: "trial-credits",
    freeTierNote: "Trial credits on signup, then pay-as-you-go.",
    getKeyUrl: "https://studio.ai21.com/account/api-key",
    description: "Jamba models built for very long documents — useful for whole-thesis context.",
    icon: "◙",
    color: "#E4383C",
  },
  {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.moonshot.ai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "moonshot-v1-32k",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2-0711-preview"],
    freeTier: "trial-credits",
    freeTierNote: "Trial credits on signup, then pay-as-you-go.",
    getKeyUrl: "https://platform.moonshot.ai/console/api-keys",
    description: "Long-context models that handle large source documents well.",
    icon: "☾",
    color: "#111827",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.x.ai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "grok-3-mini",
    models: ["grok-3-mini", "grok-3", "grok-2-1212"],
    freeTier: "trial-credits",
    freeTierNote: "Promotional credits have been offered periodically; otherwise pay-as-you-go.",
    getKeyUrl: "https://console.x.ai/",
    description: "xAI's Grok models via an OpenAI-compatible endpoint.",
    icon: "✕",
    color: "#000000",
  },

  // ── Primarily paid (listed because users may already hold a key) ────────
  {
    id: "deepseek",
    name: "DeepSeek",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    freeTier: "paid",
    freeTierNote: "No ongoing free tier, but per-token pricing is among the lowest available.",
    getKeyUrl: "https://platform.deepseek.com/api_keys",
    description: "Very strong reasoning at a very low price — excellent value for heavy drafting.",
    icon: "◆",
    color: "#5B6AFF",
  },
  {
    id: "qwen",
    name: "Qwen (Alibaba)",
    apiStyle: "openai-compatible",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    chatPath: "/chat/completions",
    modelsPath: null,
    defaultModel: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo", "qwen-max"],
    freeTier: "freemium",
    freeTierNote: "DashScope grants a free token quota per model on signup.",
    getKeyUrl: "https://dashscope.console.aliyun.com/apiKey",
    description: "Alibaba's multilingual models — notably strong outside English.",
    icon: "◇",
    color: "#FF6A13",
  },
  {
    id: "openai",
    name: "OpenAI",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
    freeTier: "paid",
    freeTierNote: "No free tier — requires a funded account.",
    getKeyUrl: "https://platform.openai.com/api-keys",
    description: "GPT models with consistently strong reasoning and writing.",
    icon: "◉",
    color: "#10A37F",
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    apiStyle: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    chatPath: "/messages",
    modelsPath: "/models",
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-opus-4-20250514"],
    freeTier: "paid",
    freeTierNote: "No free API tier — requires a funded account.",
    getKeyUrl: "https://console.anthropic.com/settings/keys",
    description: "Careful, nuanced writing — particularly well suited to academic prose.",
    icon: "◈",
    color: "#D4A574",
  },
  {
    id: "cohere",
    name: "Cohere",
    apiStyle: "cohere",
    baseUrl: "https://api.cohere.ai/v1",
    chatPath: "/chat",
    modelsPath: "/models",
    defaultModel: "command-r-plus",
    models: ["command-r-plus", "command-r", "command-a-03-2025"],
    freeTier: "freemium",
    freeTierNote: "Trial keys are free but rate-limited and not for production use.",
    getKeyUrl: "https://dashboard.cohere.com/api-keys",
    description: "Enterprise models tuned for retrieval and grounded summarisation.",
    icon: "◎",
    color: "#39594D",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.perplexity.ai",
    chatPath: "/chat/completions",
    modelsPath: null,
    defaultModel: "sonar",
    models: ["sonar", "sonar-pro", "sonar-reasoning"],
    freeTier: "paid",
    freeTierNote: "Pro subscribers receive monthly API credits; otherwise pay-as-you-go.",
    getKeyUrl: "https://www.perplexity.ai/settings/api",
    description: "Answers grounded in live web search — useful for checking recent literature.",
    icon: "◭",
    color: "#20808D",
  },

  // ── Added 2026-08-12, to widen the free/free-tier choice ────────────────
  //
  // Every entry below had its `${baseUrl}${modelsPath}` probed live before
  // being added: a 200 or 401 proves the endpoint exists and authenticates,
  // which is the same bar the rest of this file is held to. Three candidates
  // were REJECTED by that probe rather than added on the strength of a
  // remembered URL — Targon returned HTTP 410 (retiring, exactly the way
  // GitHub Models did above), and Kluster.ai and Lambda were unreachable.
  // A provider that fails the probe is left out, never guessed at.
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    apiStyle: "openai-compatible",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta/llama-3.3-70b-instruct",
    models: ["meta/llama-3.3-70b-instruct", "deepseek-ai/deepseek-r1", "qwen/qwen2.5-72b-instruct"],
    freeTier: "freemium",
    freeTierNote: "Free API credits for developer accounts on build.nvidia.com; no card required to start.",
    usageLimitsNote: "Credits are consumed per request; rate limits apply on the free developer tier.",
    getKeyUrl: "https://build.nvidia.com/",
    description: "NVIDIA's hosted open models — a large catalogue with a genuinely free developer allowance.",
    icon: "◈",
    color: "#76B900",
  },
  {
    id: "scaleway",
    name: "Scaleway",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.scaleway.ai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "llama-3.3-70b-instruct",
    models: ["llama-3.3-70b-instruct", "qwen2.5-coder-32b-instruct", "mistral-nemo-instruct-2407"],
    freeTier: "freemium",
    freeTierNote: "Free tier on Scaleway's Generative APIs with published per-minute token limits.",
    usageLimitsNote: "Requests and tokens are capped per minute on the free tier.",
    getKeyUrl: "https://console.scaleway.com/iam/api-keys",
    description: "European cloud provider serving open models from EU data centres.",
    icon: "◧",
    color: "#4F0599",
  },
  {
    id: "nscale",
    name: "Nscale",
    apiStyle: "openai-compatible",
    baseUrl: "https://inference.api.nscale.com/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-Coder-32B-Instruct", "deepseek-ai/DeepSeek-R1"],
    freeTier: "trial-credits",
    freeTierNote: "Free credits on signup, then pay-as-you-go per token.",
    getKeyUrl: "https://console.nscale.com/",
    description: "Sustainable-compute provider hosting open models at low per-token cost.",
    icon: "◨",
    color: "#0EA5E9",
  },
  {
    id: "inferencenet",
    name: "Inference.net",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.inference.net/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/llama-3.3-70b-instruct/fp-8",
    models: ["meta-llama/llama-3.3-70b-instruct/fp-8", "deepseek/deepseek-r1/fp-8"],
    freeTier: "freemium",
    freeTierNote: "Free allowance on signup; usage beyond it is billed per token.",
    getKeyUrl: "https://inference.net/",
    description: "Low-cost serverless inference for open models.",
    icon: "◩",
    color: "#2563EB",
  },
  {
    id: "arliai",
    name: "Arli AI",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.arliai.com/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "Meta-Llama-3.1-8B-Instruct",
    models: ["Meta-Llama-3.1-8B-Instruct", "Mistral-Nemo-12B-Instruct-2407"],
    freeTier: "freemium",
    freeTierNote: "Free plan with a limited number of parallel requests; paid plans lift the cap.",
    usageLimitsNote: "Free plan restricts concurrent requests and model size.",
    getKeyUrl: "https://www.arliai.com/",
    description: "Unlimited-token subscription service for open models, with a usable free plan.",
    icon: "◪",
    color: "#8B5CF6",
  },
  {
    id: "upstage",
    name: "Upstage (Solar)",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.upstage.ai/v1/solar",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "solar-pro2",
    models: ["solar-pro2", "solar-mini"],
    freeTier: "trial-credits",
    freeTierNote: "Free trial credits on signup, then pay-as-you-go.",
    getKeyUrl: "https://console.upstage.ai/api-keys",
    description: "Korean provider whose Solar models are strong on document understanding.",
    icon: "☀",
    color: "#8B5CF6",
  },
  {
    id: "stepfun",
    name: "StepFun",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.stepfun.com/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "step-1-8k",
    models: ["step-1-8k", "step-1-32k", "step-2-16k"],
    freeTier: "trial-credits",
    freeTierNote: "Trial credits on signup, then pay-as-you-go.",
    getKeyUrl: "https://platform.stepfun.com/",
    description: "Chinese provider with long-context and multimodal Step models.",
    icon: "◫",
    color: "#0891B2",
  },
  {
    id: "hunyuan",
    name: "Tencent Hunyuan",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "hunyuan-turbos-latest",
    models: ["hunyuan-turbos-latest", "hunyuan-large", "hunyuan-standard"],
    freeTier: "freemium",
    freeTierNote: "Several Hunyuan models are offered free of charge; the larger ones are billed.",
    getKeyUrl: "https://console.cloud.tencent.com/hunyuan/api-key",
    description: "Tencent's Hunyuan family via an OpenAI-compatible endpoint.",
    icon: "◬",
    color: "#1E6FFF",
  },
  {
    id: "baseten",
    name: "Baseten",
    apiStyle: "openai-compatible",
    baseUrl: "https://inference.baseten.co/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "deepseek-ai/DeepSeek-V3-0324",
    models: ["deepseek-ai/DeepSeek-V3-0324", "meta-llama/Llama-4-Maverick-17B-128E-Instruct"],
    freeTier: "trial-credits",
    freeTierNote: "Free credits on signup, then pay-as-you-go.",
    getKeyUrl: "https://app.baseten.co/settings/api_keys",
    description: "Model-serving platform with a fast dedicated inference endpoint.",
    icon: "◭",
    color: "#7C3AED",
  },
  {
    id: "vercelgateway",
    name: "Vercel AI Gateway",
    apiStyle: "openai-compatible",
    baseUrl: "https://ai-gateway.vercel.sh/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "openai/gpt-4o-mini",
    models: ["openai/gpt-4o-mini", "anthropic/claude-3-5-haiku", "google/gemini-2.0-flash"],
    freeTier: "trial-credits",
    freeTierNote: "Free credits for Vercel accounts, then billed per token at provider rates.",
    getKeyUrl: "https://vercel.com/dashboard/ai-gateway",
    description: "One key routing to many providers, with automatic failover between them.",
    icon: "▲",
    color: "#000000",
  },
  {
    id: "minimax",
    name: "MiniMax",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.minimaxi.com/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "MiniMax-Text-01",
    models: ["MiniMax-Text-01", "abab6.5s-chat"],
    freeTier: "trial-credits",
    freeTierNote: "Trial credits on signup, then pay-as-you-go.",
    getKeyUrl: "https://www.minimaxi.com/",
    description: "Very long context windows — useful for whole-document work.",
    icon: "◮",
    color: "#F43F5E",
  },
  {
    id: "featherless",
    name: "Featherless AI",
    apiStyle: "openai-compatible",
    baseUrl: "https://api.featherless.ai/v1",
    chatPath: "/chat/completions",
    modelsPath: "/models",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    models: ["meta-llama/Meta-Llama-3.1-8B-Instruct", "mistralai/Mistral-Nemo-Instruct-2407"],
    freeTier: "paid",
    freeTierNote: "Flat monthly subscription rather than per-token billing; no free tier.",
    getKeyUrl: "https://featherless.ai/account/api-keys",
    description: "Subscription access to a very large catalogue of Hugging Face models.",
    icon: "◯",
    color: "#0D9488",
  },
] as const satisfies CloudProviderSpec[];

/** Providers that are NOT reachable via the same-origin server proxy and must
 *  be called directly from the browser. Kept as an explicit list because each
 *  one needs a matching CSP `connect-src` entry in server.ts — adding a
 *  provider here without updating the CSP silently breaks it in production. */
export const DIRECT_BROWSER_CALL_ORIGINS: string[] = [
  "https://generativelanguage.googleapis.com",
];

const PROVIDER_BY_ID: Record<string, CloudProviderSpec> = Object.fromEntries(
  CLOUD_PROVIDERS.map((p) => [p.id, p])
);

export function getCloudProvider(id: string): CloudProviderSpec | undefined {
  return PROVIDER_BY_ID[id];
}

export function isCloudProvider(id: string): boolean {
  return id in PROVIDER_BY_ID;
}

/** Providers that speak the OpenAI chat-completions dialect — the ones a
 *  single generic adapter can serve without any per-provider code. */
export function getOpenAICompatibleProviders(): CloudProviderSpec[] {
  return CLOUD_PROVIDERS.filter((p) => p.apiStyle === "openai-compatible");
}

/** Free-first ordering for the UI's "recommended" section. */
export function getFreeAccessProviders(): CloudProviderSpec[] {
  // Typed explicitly as CloudProviderSpec (not the narrower literal union
  // CLOUD_PROVIDERS' `as const` infers from today's data) so this still
  // compiles correctly if a future entry ever uses freeTier: "free" — none
  // do today, per this file's header comment, but the check should stay
  // correct rather than only working by the accident of current data.
  return CLOUD_PROVIDERS.filter((p: CloudProviderSpec) => p.freeTier === "free" || p.freeTier === "freemium");
}

/**
 * The base URL actually used for a request. `override` lets a user point a
 * provider at a proxy, a regional endpoint, or (for Cloudflare) supply the
 * account-scoped address the catalog cannot know in advance.
 */
export function resolveBaseUrl(spec: CloudProviderSpec, override?: string): string {
  const raw = (override || spec.baseUrl || "").trim();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function chatUrl(spec: CloudProviderSpec, override?: string): string {
  return `${resolveBaseUrl(spec, override)}${spec.chatPath}`;
}

export function discoverModelsUrl(spec: CloudProviderSpec, override?: string): string | null {
  if (!spec.modelsPath) return null;
  return `${resolveBaseUrl(spec, override)}${spec.modelsPath}`;
}

/**
 * Auth headers for a provider. Anthropic uses `x-api-key` plus a required
 * version header rather than `Authorization: Bearer` — getting this wrong is
 * a classic silent 401, so it lives in one place.
 */
export function buildAuthHeaders(spec: CloudProviderSpec, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(spec.extraHeaders || {}),
  };
  if (!apiKey) return headers;

  if (spec.apiStyle === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/** The AISettings field holding this provider's encrypted key, e.g. "groqApiKey". */
export function apiKeyField(providerId: string): string {
  return `${providerId}ApiKey`;
}

/** The AISettings field holding this provider's selected model, e.g. "groqModel". */
export function modelField(providerId: string): string {
  return `${providerId}Model`;
}

/** The AISettings field holding a user-supplied base URL override. */
export function baseUrlField(providerId: string): string {
  return `${providerId}BaseUrl`;
}
