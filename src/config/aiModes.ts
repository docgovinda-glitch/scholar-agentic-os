// AI modes redesign (2026-07-28) — single source of truth for the 5
// user-facing "AI Mode" cards shared by AISetupWizard.tsx (onboarding) and
// AIControlCenter.tsx (settings). Adding a future mode or provider should
// require only an entry here — see docs/planning/ai-modes-reconciliation.md
// for how these 5 modes map onto the internal 5-tier BYOK model in
// docs/planning/ai-gateway.md (same concept, user-facing vs. engineering
// framing — not two competing taxonomies) and for why each mode's copy says
// exactly what it says (OmniRoute's real npm package/default port, its own
// CORS story, etc. are all from real, live-verified findings, not
// assumptions — see the reconciliation doc's follow-up correction section).
//
// Follow-up correction (2026-07-28): Option 1 used to be Pollinations-
// backed "Smart AI", confirmed to only simulate success in some paths
// rather than reliably deliver, and was removed entirely. OmniRoute (a
// self-hosted router to real cloud providers, NOT a zero-install/no-account
// experience) replaces it — see the "omniroute" mode below.
//
// User-facing language rule (do not violate): never say tier, backend,
// endpoint, bare "router" to the user. Say AI Mode, Connection Method,
// Provider, "Runs on your computer", Cloud AI, Automatic AI. Exception:
// "inference" IS used deliberately in the omniroute mode's copy, to state
// plainly that AI processing happens in the cloud, not locally — omitting
// the accurate word here would recreate the same honesty gap that got the
// old Smart AI removed.

export type AIModeId = "omniroute" | "cloud" | "local" | "byok" | "partner";

export type AIModeDifficulty = "Easiest" | "Easy" | "Moderate" | "Advanced";

export type AIModeAvailability = "available" | "coming-soon";

export interface AIModeProviderOption {
  /** Matches AIProviderInfo.id / AISettings.provider in src/services/aiGateway.ts */
  id: string;
  /** User-facing label — never the raw provider id or internal tier name */
  label: string;
  /** One-line, honest description of what picking this option gets the user */
  description: string;
  /** True only for options that genuinely require zero account/signup */
  noAccountRequired?: boolean;
  /**
   * Cloud AI Providers / BYOK only: a real, verified link to that
   * provider's own API-key dashboard page (spot-checked via web search
   * against each provider's current docs, 2026-07-28 — not guessed) —
   * the "sign in" step of "select provider → sign in → API key → done".
   */
  getKeyUrl?: string;
  /**
   * Local AI only: several backend choices (LM Studio, OmniRoute, a plain
   * custom server) all resolve to the same "custom" adapter/id but differ
   * in which local port they listen on by default — this is the UI-level
   * preset (see docs/planning/ai-modes-reconciliation.md §3), not a new
   * adapter per backend.
   */
  defaultEndpoint?: string;
  /**
   * Local AI only: real, specific install/launch instructions for this
   * backend — never a generic placeholder (OmniRoute's real npm package
   * name and default port were verified live, docs/planning/
   * ai-modes-reconciliation.md §2, not assumed).
   */
  installGuidance?: string;
  installUrl?: string;
}

export interface AIMode {
  id: AIModeId;
  title: string;
  /** Internal-only cross-reference to docs/planning/ai-gateway.md's tier model — never rendered to the user */
  internalTierMapping: string;
  badge: string;
  description: string;
  difficulty: AIModeDifficulty;
  setupTime: string;
  bestFor: string;
  features: string[];
  /** Real, stated limitations — never omitted for a mode that has them */
  limitations: string[];
  ctaLabel: string;
  howItWorks: string[];
  requirements: string[];
  providers: AIModeProviderOption[];
  availability: AIModeAvailability;
  /** Only set when availability === "coming-soon"; must never name a partner without a real signed relationship */
  comingSoonNote?: string;
}

export const AI_MODES: AIMode[] = [
  {
    id: "omniroute",
    title: "Smart Gateway",
    internalTierMapping: "New concept, not in ai-gateway.md's original 5 tiers — a self-hosted router reaching cloud providers with automatic fallback",
    badge: "~5 min setup, one-time",
    description: "Install a small self-hosted gateway that automatically switches across free and paid cloud providers, so you don't manage keys for each one individually.",
    difficulty: "Moderate",
    setupTime: "About 5 minutes, once",
    bestFor: "Automatic fallback across providers without configuring each cloud account individually",
    features: [
      "Automatic fallback if one provider is down or rate-limited",
      "One local install covers many cloud providers at once",
      "No juggling separate API keys per provider in this app"
    ],
    limitations: [
      "Requires installing and running OmniRoute on your computer first — not a zero-setup option",
      "Inference still happens in the cloud, via whichever provider OmniRoute selects — this is not private or offline",
      "You may still need accounts/keys with the underlying providers, managed through OmniRoute's own dashboard, not this app"
    ],
    ctaLabel: "Set Up Smart Gateway",
    howItWorks: [
      "Install OmniRoute on your computer (npm, Docker, Electron, and other options are available) and start it.",
      "This app connects to the OmniRoute program running on your machine — but OmniRoute itself forwards each request to a real cloud AI provider and automatically falls back to another if one fails.",
      "The actual AI processing (inference) always happens in the cloud, on whichever provider OmniRoute picks — only the routing step is local."
    ],
    requirements: ["A desktop or laptop computer to run OmniRoute on", "OmniRoute installed and running (npm, Docker, or another supported method)"],
    providers: [
      {
        id: "omniroute", label: "OmniRoute", description: "Self-hosted gateway to cloud AI providers, with automatic fallback",
        defaultEndpoint: "http://localhost:20128/v1",
        installUrl: "https://www.npmjs.com/package/omniroute",
        installGuidance: "Requires Node.js. Run `npm install -g omniroute` in a terminal, then run `omniroute` to start it — its dashboard and local API both come up at localhost:20128 automatically."
      }
    ],
    availability: "available"
  },
  {
    id: "cloud",
    title: "Cloud AI Providers",
    internalTierMapping: "ai-gateway.md Tier 2 (Free-tier BYOK)",
    badge: "Recommended for regular use",
    description: "Connect your own free-tier account with a cloud AI provider. A few minutes of setup gets you a dedicated, non-shared connection.",
    difficulty: "Easy",
    setupTime: "About 5 minutes",
    bestFor: "Regular drafting work without paying for AI access",
    features: [
      "Free tier available on every provider listed below",
      "Your own dedicated request quota — not shared with other users",
      "Choose the provider that fits your workflow"
    ],
    limitations: [
      "Requires creating a free account with your chosen provider",
      "Free tiers still have their own (much higher) usage limits — set by the provider, not by us"
    ],
    ctaLabel: "Choose a Cloud AI Provider",
    howItWorks: [
      "Sign up for a free account with one of the providers below.",
      "Generate an API key on their site and paste it into this app.",
      "Your key is encrypted and stored only on your device, behind your vault passphrase — requests go straight from your browser to your chosen provider."
    ],
    requirements: ["A free account with your chosen provider", "An API key from that provider's dashboard"],
    providers: [
      { id: "openrouter", label: "OpenRouter", description: "One key, hundreds of models across many providers", getKeyUrl: "https://openrouter.ai/keys" },
      { id: "gemini", label: "Google Gemini", description: "Fast, generous free tier", getKeyUrl: "https://aistudio.google.com/app/apikey" },
      { id: "groq", label: "Groq", description: "Extremely fast responses, usable free tier", getKeyUrl: "https://console.groq.com/keys" },
      { id: "deepseek", label: "DeepSeek", description: "Strong reasoning, low-cost free tier", getKeyUrl: "https://platform.deepseek.com/api_keys" },
      { id: "together", label: "Together AI", description: "Broad open-model catalog, usable free credits", getKeyUrl: "https://api.together.xyz/settings/api-keys" }
    ],
    availability: "available"
  },
  {
    id: "local",
    title: "Local AI",
    internalTierMapping: "ai-gateway.md Tier 1 (Local router) + Tier 5a (heavy local compute) — same mechanism, one mode",
    badge: "Runs on your computer",
    description: "Run AI models on your own computer. Nothing ever leaves your machine — completely private and free, with no ongoing account.",
    difficulty: "Moderate",
    setupTime: "10-15 minutes",
    bestFor: "Full privacy, offline use, or avoiding cloud accounts entirely",
    features: [
      "Nothing you write or generate ever leaves your computer",
      "Completely free, no account of any kind",
      "Works fully offline once set up"
    ],
    limitations: [
      "Requires installing and running a separate program on your computer",
      "Response quality and speed depend on your computer's hardware",
      "Not recommended on phones or tablets — needs real desktop hardware"
    ],
    ctaLabel: "Set Up Local AI",
    howItWorks: [
      "Install one local AI program on your computer (choices below).",
      "Start it, download a model, and point this app at it — your browser talks directly to the program running on your own machine.",
      "No data ever goes to us or to any cloud provider."
    ],
    requirements: ["A desktop or laptop computer (not recommended on mobile)", "One local AI program installed and running"],
    providers: [
      {
        id: "ollama", label: "Ollama", description: "The most popular option — simplest to install and use",
        noAccountRequired: true, defaultEndpoint: "http://localhost:11434",
        installUrl: "https://ollama.com/download",
        installGuidance: "Download and install Ollama, then run `ollama pull llama3.1` in a terminal to download a model. Ollama starts a local server automatically at localhost:11434."
      },
      {
        id: "custom", label: "LM Studio", description: "Friendly desktop app with a built-in model browser",
        noAccountRequired: true, defaultEndpoint: "http://localhost:1234/v1",
        installUrl: "https://lmstudio.ai/download",
        installGuidance: "Download and install the LM Studio desktop app, download a model from its built-in browser, then start its local server (it defaults to localhost:1234)."
      },
      {
        id: "custom", label: "Custom server", description: "Any other OpenAI-compatible local server you already run",
        noAccountRequired: true,
        installGuidance: "Enter the address your server listens on below (for example, http://localhost:8000/v1)."
      }
    ],
    availability: "available"
  },
  {
    id: "byok",
    title: "Bring Your Own AI",
    internalTierMapping: "ai-gateway.md Tier 3 (Heavy BYOK)",
    badge: "Most capable",
    description: "Already have a paid AI subscription? Connect it directly for the most capable models available.",
    difficulty: "Easy",
    setupTime: "About 5 minutes",
    bestFor: "Users who already pay for OpenAI, Anthropic, or another premium provider",
    features: [
      "Access to the most capable models each provider offers",
      "You control usage and cost directly with your provider",
      "Same simple key-based setup as Cloud AI Providers"
    ],
    limitations: [
      "Requires a paid account with your chosen provider — costs are billed to you directly, not through this app"
    ],
    ctaLabel: "Connect Your Provider",
    howItWorks: [
      "Generate an API key from your existing paid provider account.",
      "Paste it into this app — it's encrypted and stored only on your device, behind your vault passphrase.",
      "Requests go straight from your browser to your provider using your key."
    ],
    requirements: ["An existing paid account with your chosen provider", "An API key from that provider's dashboard"],
    providers: [
      { id: "openai", label: "OpenAI", description: "GPT models", getKeyUrl: "https://platform.openai.com/api-keys" },
      { id: "claude", label: "Anthropic Claude", description: "Claude models", getKeyUrl: "https://console.anthropic.com/settings/keys" },
      { id: "cohere", label: "Cohere", description: "Enterprise-grade models", getKeyUrl: "https://dashboard.cohere.com/api-keys" },
      { id: "qwen", label: "Qwen (Alibaba)", description: "Multilingual, competitive pricing", getKeyUrl: "https://dashscope.console.aliyun.com/" }
    ],
    availability: "available"
  },
  {
    id: "partner",
    title: "Partner Subscription",
    internalTierMapping: "ai-gateway.md Tier 4 (Affiliate-linked subscription) — not a technical mode, a placement",
    badge: "Coming soon",
    description: "A ready-to-go AI subscription with no setup at all, offered through one of our partners.",
    difficulty: "Easiest",
    setupTime: "Not yet available",
    bestFor: "Users who want a fully managed AI subscription with zero configuration",
    features: [],
    limitations: ["Not available yet — no partner offer is live at this time"],
    ctaLabel: "Notify Me When Available",
    howItWorks: [
      "Once available, this will link to a partner's own signup page — you'd subscribe with them directly.",
      "Afterward, you'd connect using that subscription's API key through Cloud AI Providers or Bring Your Own AI, same as any other provider."
    ],
    requirements: [],
    providers: [],
    availability: "coming-soon",
    comingSoonNote: "We don't have a live partner offer yet. This card is a placeholder for a future option — it does not name or imply any specific partner because none is confirmed."
  }
];

export function getAIMode(id: AIModeId): AIMode | undefined {
  return AI_MODES.find((m) => m.id === id);
}

/**
 * Reverse lookup: given a real AISettings.provider id (e.g. "gemini",
 * "ollama", "omniroute"), find which of the 5 user-facing AI Modes it
 * belongs to — used by AIControlCenter.tsx's "Current AI Mode" status card
 * (Step 4) to show the user-facing mode name for whatever provider is
 * actually configured, never the raw provider id or internal tier name.
 * "auto"/"server" (internal routing providers, not a real user-facing
 * mode) and unrecognized providers resolve to undefined — callers should
 * handle that as "no mode selected yet", not fabricate one.
 */
export function getModeForProvider(providerId: string | undefined): AIModeId | undefined {
  if (!providerId) return undefined;
  for (const mode of AI_MODES) {
    if (mode.providers.some((p) => p.id === providerId)) return mode.id;
  }
  return undefined;
}
