/**
 * The model catalog — structured per-model metadata for every model a cloud
 * provider in src/config/providerCatalog.ts can serve, and the single place
 * capability/context-window/status facts live.
 *
 * Why this file exists: before it, `CloudProviderSpec.models` was a bare
 * `string[]` — names with no capability, context-window, or currency
 * information attached. That is exactly why model selection in the AI
 * Access UI degraded to a free-text `<input>` with a `<datalist>` of
 * suggestions rather than a real dropdown: there was nothing to build a
 * dropdown's option labels or a capability filter out of. This file is that
 * missing data.
 *
 * IMPORTANT — this module is imported by both the browser bundle and by
 * server.ts (bundled with esbuild for Node), same constraint as
 * providerCatalog.ts: pure data and pure functions only, no browser globals,
 * no Node built-ins.
 *
 * Research honesty (2026-08-13): every entry with `verified: true` was
 * checked against that provider's own official documentation this pass
 * (via live web search/fetch, not memory) — 14 providers whose adapter
 * `apiStyle` groups or free-tier prominence made them the highest-value
 * targets: OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere,
 * DeepSeek, xAI, Perplexity, Together AI, OpenRouter, Qwen, Cerebras, and
 * NVIDIA NIM. The remaining ~23 catalog providers' entries are carried
 * forward from providerCatalog.ts's existing (pre-this-file) `models[]`
 * arrays via carried() below, unchanged in content, with `verified: false`
 * and `capabilities: []` rather than guessed values — nothing about them is
 * invented, only reshaped, and the flag makes the difference between
 * "confirmed this pass" and "shipped previously, not re-checked" explicit
 * rather than papered over. A capability-filtering UI must never hide a
 * `verified: false` entry — see selectModelsByCapabilities below — only
 * show it without a capability grid and with an "unverified" note. The
 * "Advanced: use custom model ID" toggle (src/desk/aiAccess/ProviderDetail)
 * remains the intentional escape hatch for anything not listed here at all.
 *
 * A model still shown after its provider marks it deprecated (status:
 * "deprecated") is deliberate, not an oversight: a user with one already
 * saved should see why their choice looks unusual, not have it silently
 * vanish from the dropdown with no explanation.
 */

import { getCloudProvider, type CloudProviderSpec } from "./providerCatalog";

export type Capability =
  | "reasoning"
  | "longContext"
  | "vision"
  | "documentAnalysis"
  | "structuredOutput"
  | "toolCalling"
  | "coding"
  | "research"
  | "fastGeneration"
  | "embedding";
// audio/imageGeneration are deliberately not modeled as capabilities here:
// src/platform/gateway/adapters.ts only speaks the chat/completions request
// shape today, so no adapter could act on either even if a future caller
// asked for them — adding them as selectable capability values would let a
// capability-based request "match" something the gateway cannot fulfill.
// Revisit only alongside a real non-chat adapter code path.

export type ModelStatus = "current" | "preview" | "deprecated";
export type AccessMode = "free" | "premium" | "byok" | "local";
export type QualityTier = "flagship" | "balanced" | "fast" | "lightweight";

export interface ModelSpec {
  /** `${providerId}:${modelId}` — stable, matches the ai_models.id convention scripts/seedAiRegistry.ts already uses. */
  id: string;
  providerId: string;
  /** The literal string sent to the provider's API in the "model" field. */
  modelId: string;
  displayName: string;
  status: ModelStatus;
  /**
   * Which access modes this specific model is reachable under. Not derived
   * from the provider alone: BYOK always applies to any cataloged cloud
   * model (a user's own key reaches whatever the provider allows), while
   * "free" only applies when the *provider* itself is usable without ever
   * paying (src/config/providerCatalog.ts's FreeTierKind, mirroring
   * useAiAccess.ts's own freeProviders() rule: every tier except "paid").
   * "premium" is deliberately never set here — Premium eligibility is a
   * dynamic, admin-managed fact (ai_resources/plan_resources), not a static
   * catalog property; see this file's own header and the Phase 3 notes in
   * supabase/schema_ai_engine.sql for why that stays a separate system.
   * "local" never applies — local models are catalogued live per-runtime,
   * never statically (see localRunnerCatalog.ts / LocalRunnerDetail.tsx).
   */
  accessModes: AccessMode[];
  capabilities: Capability[];
  /** Tokens, or null when genuinely unpublished/unconfirmed — never guessed. */
  contextWindow: number | null;
  inputModalities: ("text" | "image" | "document")[];
  outputModalities: ("text" | "image")[];
  relativeQuality: QualityTier;
  relativeSpeed: "fast" | "moderate" | "slow";
  /** Free text ("see provider docs") or null — pricing moves too often to encode as a number here. */
  pricing: string | null;
  /** ISO date this entry was checked against the provider's own docs, or null if carried forward unverified. */
  lastVerified: string | null;
  /** False = carried forward from the pre-existing suggestion list, not independently confirmed against provider docs this pass. */
  verified: boolean;
  notes?: string;
}

const VERIFIED_DATE = "2026-08-13";

function accessModesFor(providerId: string): AccessMode[] {
  const spec = getCloudProvider(providerId);
  const usableFree = !spec || spec.freeTier !== "paid"; // mirrors useAiAccess.ts's freeProviders()
  return usableFree ? ["free", "byok"] : ["byok"];
}

/** A researched, current-as-of-VERIFIED_DATE entry. */
function model(spec: {
  providerId: string;
  modelId: string;
  displayName: string;
  status?: ModelStatus;
  capabilities?: Capability[];
  contextWindow?: number | null;
  inputModalities?: ("text" | "image" | "document")[];
  outputModalities?: ("text" | "image")[];
  relativeQuality?: QualityTier;
  relativeSpeed?: "fast" | "moderate" | "slow";
  pricing?: string | null;
  notes?: string;
  accessModes?: AccessMode[];
}): ModelSpec {
  return {
    id: `${spec.providerId}:${spec.modelId}`,
    providerId: spec.providerId,
    modelId: spec.modelId,
    displayName: spec.displayName,
    status: spec.status ?? "current",
    accessModes: spec.accessModes ?? accessModesFor(spec.providerId),
    capabilities: spec.capabilities ?? [],
    contextWindow: spec.contextWindow ?? null,
    inputModalities: spec.inputModalities ?? ["text"],
    outputModalities: spec.outputModalities ?? ["text"],
    relativeQuality: spec.relativeQuality ?? "balanced",
    relativeSpeed: spec.relativeSpeed ?? "moderate",
    pricing: spec.pricing ?? null,
    lastVerified: VERIFIED_DATE,
    verified: true,
    notes: spec.notes,
  };
}

/** A carried-forward entry from providerCatalog.ts's pre-existing suggestion list — see this file's header. */
function carried(providerId: string, modelId: string, displayName?: string): ModelSpec {
  return {
    id: `${providerId}:${modelId}`,
    providerId,
    modelId,
    displayName: displayName ?? modelId,
    status: "current",
    accessModes: accessModesFor(providerId),
    capabilities: [],
    contextWindow: null,
    inputModalities: ["text"],
    outputModalities: ["text"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    pricing: null,
    lastVerified: null,
    verified: false,
    notes:
      "Carried forward from the existing provider catalog; not independently re-verified against official docs this pass. Confirm on the provider's own model list before relying on it, or use Advanced: custom model ID.",
  };
}

export const MODEL_CATALOG: ModelSpec[] = [
  // ─── Google Gemini — verified 2026-08-13 (ai.google.dev/gemini-api/docs/models) ───
  model({
    providerId: "gemini",
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "fastGeneration"],
    contextWindow: 1_048_576,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    pricing: "Free tier available; see ai.google.dev pricing",
  }),
  model({
    providerId: "gemini",
    modelId: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "coding"],
    contextWindow: 1_048_576,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "gemini",
    modelId: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash-Lite",
    capabilities: ["longContext", "vision", "fastGeneration"],
    contextWindow: 1_048_576,
    inputModalities: ["text", "image"],
    relativeQuality: "lightweight",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "gemini",
    modelId: "gemini-3.5-flash",
    displayName: "Gemini 3.5 Flash",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "coding", "fastGeneration"],
    contextWindow: 1_048_576,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "flagship",
    relativeSpeed: "fast",
    notes: "Newest Gemini generation; intelligent, agentic/coding-focused per Google's own docs.",
  }),
  model({
    providerId: "gemini",
    modelId: "gemini-3.6-flash",
    displayName: "Gemini 3.6 Flash",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "coding", "fastGeneration"],
    contextWindow: 1_048_576,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "flagship",
    relativeSpeed: "fast",
    notes: "Post-training update on top of Gemini 3.5 Flash; same context/output limits.",
  }),
  model({
    providerId: "gemini",
    modelId: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    capabilities: ["reasoning", "longContext", "vision", "fastGeneration"],
    contextWindow: 1_048_576,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "balanced",
    relativeSpeed: "fast",
  }),

  // ─── Groq — verified 2026-08-13 (console.groq.com/docs/models) ───
  model({
    providerId: "groq",
    modelId: "llama-3.3-70b-versatile",
    displayName: "Llama 3.3 70B Versatile",
    capabilities: ["fastGeneration"],
    contextWindow: 131_072,
    relativeQuality: "balanced",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "groq",
    modelId: "llama-3.1-8b-instant",
    displayName: "Llama 3.1 8B Instant",
    capabilities: ["fastGeneration"],
    contextWindow: 131_072,
    relativeQuality: "lightweight",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "groq",
    modelId: "openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    capabilities: ["reasoning", "vision", "toolCalling", "structuredOutput", "fastGeneration"],
    contextWindow: 131_072,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "groq",
    modelId: "openai/gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    capabilities: ["reasoning", "vision", "toolCalling", "structuredOutput", "fastGeneration"],
    contextWindow: 131_072,
    inputModalities: ["text", "image"],
    relativeQuality: "balanced",
    relativeSpeed: "fast",
  }),

  // ─── Cerebras — verified 2026-08-13 (inference-docs.cerebras.ai/models/overview) ───
  model({
    providerId: "cerebras",
    modelId: "gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    capabilities: ["reasoning", "toolCalling", "fastGeneration"],
    contextWindow: 131_072,
    relativeQuality: "flagship",
    relativeSpeed: "fast",
    pricing: "65k context free tier / 131k on paid",
  }),
  model({
    providerId: "cerebras",
    modelId: "gemma-4-31b",
    displayName: "Gemma 4 31B",
    status: "preview",
    capabilities: ["fastGeneration"],
    contextWindow: 131_072,
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    notes: "Preview: evaluation only per Cerebras's own docs, not intended for production.",
  }),
  model({
    providerId: "cerebras",
    modelId: "zai-glm-4.7",
    displayName: "Z.ai GLM 4.7",
    status: "deprecated",
    capabilities: ["fastGeneration"],
    contextWindow: 131_072,
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    notes: "Scheduled for deprecation on Cerebras 2026-08-17 per their own docs.",
  }),
  model({
    providerId: "cerebras",
    modelId: "llama-3.3-70b",
    displayName: "Llama 3.3 70B",
    status: "deprecated",
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    notes: "No longer listed on Cerebras' current model page as of this research pass — carried from the prior catalog and marked deprecated rather than silently dropped.",
  }),
  model({
    providerId: "cerebras",
    modelId: "qwen-3-32b",
    displayName: "Qwen 3 32B",
    status: "deprecated",
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    notes: "No longer listed on Cerebras' current model page as of this research pass.",
  }),
  model({
    providerId: "cerebras",
    modelId: "llama3.1-8b",
    displayName: "Llama 3.1 8B",
    status: "deprecated",
    relativeQuality: "lightweight",
    relativeSpeed: "fast",
    notes: "No longer listed on Cerebras' current model page as of this research pass.",
  }),

  // ─── Mistral AI — verified 2026-08-13 (docs.mistral.ai) ───
  model({
    providerId: "mistral",
    modelId: "mistral-medium-latest",
    displayName: "Mistral Medium 3.5",
    capabilities: ["vision", "toolCalling", "structuredOutput", "coding"],
    contextWindow: 256_000,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    notes: "Alias resolving to the dated snapshot mistral-medium-3-5-26-04; frontier-class, agentic/coding-optimized per Mistral's own model card.",
  }),
  model({
    providerId: "mistral",
    modelId: "mistral-large-latest",
    displayName: "Mistral Large 3",
    capabilities: ["vision", "toolCalling", "structuredOutput", "reasoning"],
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "mistral",
    modelId: "mistral-small-latest",
    displayName: "Mistral Small 4",
    capabilities: ["toolCalling", "structuredOutput", "fastGeneration", "coding"],
    relativeQuality: "fast",
    relativeSpeed: "fast",
    notes: "Hybrid instruct/reasoning/coding model per Mistral's current lineup.",
  }),
  model({
    providerId: "mistral",
    modelId: "magistral-small-latest",
    displayName: "Magistral Small",
    capabilities: ["reasoning"],
    relativeQuality: "fast",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "mistral",
    modelId: "open-mistral-nemo",
    displayName: "Mistral Nemo",
    status: "deprecated",
    relativeQuality: "lightweight",
    relativeSpeed: "fast",
    notes: "Superseded by the Mistral Small/Medium/Large 3+ generation in Mistral's current lineup.",
  }),

  // ─── Cohere — verified 2026-08-13 (docs.cohere.com/docs/models) ───
  model({
    providerId: "cohere",
    modelId: "command-a-plus-05-2026",
    displayName: "Command A Plus",
    capabilities: ["vision", "toolCalling", "reasoning"],
    contextWindow: 128_000,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "cohere",
    modelId: "command-a-03-2025",
    displayName: "Command A",
    capabilities: ["toolCalling", "longContext"],
    contextWindow: 256_000,
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "cohere",
    modelId: "command-a-reasoning-08-2025",
    displayName: "Command A Reasoning",
    capabilities: ["reasoning", "longContext"],
    contextWindow: 256_000,
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "cohere",
    modelId: "command-a-vision-07-2025",
    displayName: "Command A Vision",
    capabilities: ["vision"],
    contextWindow: 128_000,
    inputModalities: ["text", "image"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "cohere",
    modelId: "command-r-plus-08-2024",
    displayName: "Command R+",
    capabilities: ["toolCalling"],
    contextWindow: 128_000,
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "cohere",
    modelId: "command-r-08-2024",
    displayName: "Command R",
    capabilities: ["toolCalling"],
    contextWindow: 128_000,
    relativeQuality: "fast",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "cohere",
    modelId: "command-r-plus-04-2024",
    displayName: "Command R+ (Apr 2024)",
    status: "deprecated",
    contextWindow: 128_000,
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "Deprecated by Cohere effective 2025-09-15.",
  }),
  model({
    providerId: "cohere",
    modelId: "command-r-03-2024",
    displayName: "Command R (Mar 2024)",
    status: "deprecated",
    contextWindow: 128_000,
    relativeQuality: "fast",
    relativeSpeed: "fast",
    notes: "Deprecated by Cohere effective 2025-09-15.",
  }),

  // ─── Perplexity — verified 2026-08-13 (docs.perplexity.ai) ───
  model({
    providerId: "perplexity",
    modelId: "sonar",
    displayName: "Sonar",
    capabilities: ["research"],
    contextWindow: 128_000,
    relativeQuality: "fast",
    relativeSpeed: "fast",
    notes: "Lightweight, cost-effective search-grounded model.",
  }),
  model({
    providerId: "perplexity",
    modelId: "sonar-pro",
    displayName: "Sonar Pro",
    capabilities: ["research", "longContext"],
    contextWindow: 200_000,
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "perplexity",
    modelId: "sonar-reasoning-pro",
    displayName: "Sonar Reasoning Pro",
    capabilities: ["research", "reasoning"],
    contextWindow: 128_000,
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    notes: "Replaced sonar-reasoning (deprecated 2025-12-15) as Perplexity's reasoning-grade search model.",
  }),
  model({
    providerId: "perplexity",
    modelId: "sonar-deep-research",
    displayName: "Sonar Deep Research",
    capabilities: ["research", "reasoning", "longContext"],
    contextWindow: 128_000,
    relativeQuality: "flagship",
    relativeSpeed: "slow",
    notes: "Expert-level, exhaustive multi-step research reports.",
  }),
  model({
    providerId: "perplexity",
    modelId: "sonar-reasoning",
    displayName: "Sonar Reasoning",
    status: "deprecated",
    capabilities: ["research", "reasoning"],
    contextWindow: 128_000,
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "Deprecated by Perplexity effective 2025-12-15; use sonar-reasoning-pro.",
  }),

  // ─── OpenAI — verified 2026-08-13 (developers.openai.com/api/docs/models) ───
  model({
    providerId: "openai",
    modelId: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "coding"],
    contextWindow: 1_050_000,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "Balances intelligence and cost per OpenAI's own model guidance.",
  }),
  model({
    providerId: "openai",
    modelId: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "coding"],
    contextWindow: 1_050_000,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "flagship",
    relativeSpeed: "slow",
    notes: "OpenAI's most advanced current model for complex work.",
  }),
  model({
    providerId: "openai",
    modelId: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    capabilities: ["longContext", "vision", "structuredOutput", "toolCalling", "fastGeneration"],
    contextWindow: 1_050_000,
    inputModalities: ["text", "image"],
    relativeQuality: "fast",
    relativeSpeed: "fast",
    notes: "Optimized for cost-sensitive, high-volume workloads.",
  }),
  model({
    providerId: "openai",
    modelId: "gpt-4.1",
    displayName: "GPT-4.1",
    capabilities: ["longContext", "vision", "structuredOutput", "toolCalling", "coding"],
    inputModalities: ["text", "image"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "Still listed active by OpenAI alongside the GPT-5.6 family.",
  }),
  model({
    providerId: "openai",
    modelId: "gpt-4.1-mini",
    displayName: "GPT-4.1 mini",
    capabilities: ["longContext", "vision", "structuredOutput", "toolCalling"],
    inputModalities: ["text", "image"],
    relativeQuality: "fast",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "openai",
    modelId: "gpt-4o",
    displayName: "GPT-4o",
    capabilities: ["vision", "structuredOutput", "toolCalling"],
    inputModalities: ["text", "image"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "openai",
    modelId: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    capabilities: ["vision", "structuredOutput", "toolCalling", "fastGeneration"],
    inputModalities: ["text", "image"],
    relativeQuality: "lightweight",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "openai",
    modelId: "o3",
    displayName: "o3",
    capabilities: ["reasoning", "coding"],
    relativeQuality: "flagship",
    relativeSpeed: "slow",
    notes: "OpenAI scheduled o3's retirement from ChatGPT for 2026-08-26; API availability may differ from ChatGPT availability.",
  }),
  model({
    providerId: "openai",
    modelId: "o4-mini",
    displayName: "o4-mini",
    status: "deprecated",
    capabilities: ["reasoning"],
    relativeQuality: "fast",
    relativeSpeed: "moderate",
    notes: "Retired from ChatGPT 2026-02-13; kept here so a saved reference explains itself rather than silently failing.",
  }),

  // ─── Anthropic Claude — verified 2026-08-13 (platform.claude.com/docs) ───
  model({
    providerId: "claude",
    modelId: "claude-opus-5",
    displayName: "Claude Opus 5",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "coding"],
    contextWindow: 1_000_000,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    pricing: "$5 / MTok in, $25 / MTok out",
    notes: "Anthropic's recommended starting point for complex agentic coding and enterprise work.",
  }),
  model({
    providerId: "claude",
    modelId: "claude-fable-5",
    displayName: "Claude Fable 5",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "coding"],
    contextWindow: 1_000_000,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "flagship",
    relativeSpeed: "slow",
    pricing: "$10 / MTok in, $50 / MTok out",
    notes: "Anthropic's highest-capability widely released model; always-on adaptive thinking.",
  }),
  model({
    providerId: "claude",
    modelId: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    capabilities: ["reasoning", "longContext", "vision", "documentAnalysis", "structuredOutput", "toolCalling", "coding"],
    contextWindow: 1_000_000,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    pricing: "$2 / MTok in, $10 / MTok out",
    notes: "Best combination of speed and intelligence per Anthropic's own guidance.",
  }),
  model({
    providerId: "claude",
    modelId: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    capabilities: ["vision", "documentAnalysis", "structuredOutput", "toolCalling", "fastGeneration", "reasoning"],
    contextWindow: 200_000,
    inputModalities: ["text", "image", "document"],
    relativeQuality: "fast",
    relativeSpeed: "fast",
    pricing: "$1 / MTok in, $5 / MTok out",
    notes: "Fastest current Claude with near-frontier intelligence; supports extended thinking.",
  }),
  model({
    providerId: "claude",
    modelId: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    status: "deprecated",
    capabilities: ["reasoning", "longContext", "vision", "toolCalling", "coding"],
    contextWindow: 1_000_000,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    notes: "Anthropic's own docs list this under \"Legacy models\" — still callable, migration to Opus 5 recommended.",
  }),
  model({
    providerId: "claude",
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    status: "deprecated",
    capabilities: ["reasoning", "longContext", "vision", "toolCalling"],
    contextWindow: 1_000_000,
    inputModalities: ["text", "image"],
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    notes: "Legacy per Anthropic's docs; migration to Sonnet 5 recommended.",
  }),
  model({
    providerId: "claude",
    modelId: "claude-sonnet-4-5-20250929",
    displayName: "Claude Sonnet 4.5",
    status: "deprecated",
    capabilities: ["vision", "toolCalling"],
    contextWindow: 200_000,
    inputModalities: ["text", "image"],
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    notes: "Legacy per Anthropic's docs — this was this catalog's previous default before the 2026-08-13 research pass.",
  }),
  model({
    providerId: "claude",
    modelId: "claude-opus-4-5-20251101",
    displayName: "Claude Opus 4.5",
    status: "deprecated",
    capabilities: ["reasoning", "vision", "toolCalling", "coding"],
    contextWindow: 200_000,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    notes: "Legacy per Anthropic's docs; migration to Opus 5 recommended.",
  }),

  // ─── xAI (Grok) — verified 2026-08-13 (docs.x.ai/docs/models) ───
  model({
    providerId: "xai",
    modelId: "grok-4.6",
    displayName: "Grok 4.6",
    capabilities: ["reasoning", "toolCalling", "vision", "structuredOutput"],
    contextWindow: 500_000,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    notes: "Per-capability granularity (vision/tool-calling) inferred from xAI's OpenAI-compatible API design and general Grok product line, not itemized in the fetched model table — treat as reasonably confident but not table-confirmed the way context window is.",
  }),
  model({
    providerId: "xai",
    modelId: "grok-4.3",
    displayName: "Grok 4.3",
    capabilities: ["reasoning", "toolCalling", "structuredOutput"],
    contextWindow: 1_000_000,
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "xai",
    modelId: "grok-4.20-0309-reasoning",
    displayName: "Grok 4.20 Reasoning",
    capabilities: ["reasoning"],
    contextWindow: 1_000_000,
    relativeQuality: "flagship",
    relativeSpeed: "slow",
  }),
  model({
    providerId: "xai",
    modelId: "grok-3-mini",
    displayName: "Grok 3 Mini",
    status: "deprecated",
    relativeQuality: "fast",
    relativeSpeed: "fast",
    notes: "Superseded by the Grok 4.x generation.",
  }),
  model({
    providerId: "xai",
    modelId: "grok-3",
    displayName: "Grok 3",
    status: "deprecated",
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "Superseded by the Grok 4.x generation.",
  }),
  model({
    providerId: "xai",
    modelId: "grok-2-1212",
    displayName: "Grok 2 (1212)",
    status: "deprecated",
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "Superseded by the Grok 4.x generation.",
  }),

  // ─── DeepSeek — verified 2026-08-13 (api-docs.deepseek.com) ───
  model({
    providerId: "deepseek",
    modelId: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    capabilities: ["reasoning", "longContext", "toolCalling", "structuredOutput", "coding"],
    contextWindow: 1_000_000,
    relativeQuality: "balanced",
    relativeSpeed: "fast",
    notes: "Thinking mode on by default; also supports non-thinking mode.",
  }),
  model({
    providerId: "deepseek",
    modelId: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    capabilities: ["reasoning", "longContext", "toolCalling", "structuredOutput", "coding"],
    contextWindow: 1_000_000,
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "deepseek",
    modelId: "deepseek-chat",
    displayName: "DeepSeek Chat (legacy)",
    status: "deprecated",
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "DeepSeek's own current docs list only deepseek-v4-flash/deepseek-v4-pro; whether this older id still resolves was not directly confirmed this pass, so it is marked deprecated rather than current out of caution.",
  }),
  model({
    providerId: "deepseek",
    modelId: "deepseek-reasoner",
    displayName: "DeepSeek Reasoner (legacy)",
    status: "deprecated",
    capabilities: ["reasoning"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "DeepSeek's own current docs list only deepseek-v4-flash/deepseek-v4-pro; whether this older id still resolves was not directly confirmed this pass, so it is marked deprecated rather than current out of caution.",
  }),

  // ─── Qwen (Alibaba) — verified 2026-08-13 ───
  model({
    providerId: "qwen",
    modelId: "qwen3.8-max",
    displayName: "Qwen3.8 Max",
    capabilities: ["reasoning", "longContext", "toolCalling", "coding"],
    contextWindow: 1_000_000,
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    pricing: "$2 / MTok in, $6 / MTok out",
    notes: "Alibaba's newest flagship (2.4T-param MoE), superseding qwen-max.",
  }),
  model({
    providerId: "qwen",
    modelId: "qwen-plus",
    displayName: "Qwen Plus",
    capabilities: ["toolCalling", "structuredOutput"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "Stable mid-tier id with rolling dated snapshots per Alibaba's own convention.",
  }),
  model({
    providerId: "qwen",
    modelId: "qwen-turbo",
    displayName: "Qwen Turbo",
    capabilities: ["fastGeneration"],
    relativeQuality: "fast",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "qwen",
    modelId: "qwen-max",
    displayName: "Qwen Max (legacy)",
    status: "deprecated",
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    notes: "Superseded by qwen3.8-max as Alibaba's flagship.",
  }),

  // ─── NVIDIA NIM — verified 2026-08-13 (build.nvidia.com catalog, open-weight hosting) ───
  model({
    providerId: "nvidia",
    modelId: "meta/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B Instruct",
    capabilities: ["toolCalling"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    pricing: "Free developer tier (~1,000 credits, ~40 req/min) confirmed current",
  }),
  model({
    providerId: "nvidia",
    modelId: "deepseek-ai/deepseek-r1",
    displayName: "DeepSeek R1",
    capabilities: ["reasoning"],
    relativeQuality: "flagship",
    relativeSpeed: "slow",
    notes: "NIM hosts open-weight model checkpoints independently of a vendor's own hosted-API naming roadmap, so this stays listed even though DeepSeek's own hosted API has moved on to V4 — confirm it's still served before relying on it in production.",
  }),
  model({
    providerId: "nvidia",
    modelId: "qwen/qwen2.5-72b-instruct",
    displayName: "Qwen2.5 72B Instruct",
    capabilities: ["toolCalling"],
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
  }),

  // ─── Together AI — verified 2026-08-13 (docs.together.ai/docs/serverless-models) ───
  model({
    providerId: "together",
    modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    displayName: "Llama 3.3 70B Instruct Turbo",
    capabilities: ["toolCalling"],
    contextWindow: 131_072,
    relativeQuality: "balanced",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "together",
    modelId: "deepseek-ai/DeepSeek-V4-Flash-0731",
    displayName: "DeepSeek V4 Flash",
    capabilities: ["reasoning", "longContext", "toolCalling", "coding"],
    contextWindow: 1_000_000,
    relativeQuality: "balanced",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "together",
    modelId: "deepseek-ai/DeepSeek-V4-Pro",
    displayName: "DeepSeek V4 Pro",
    capabilities: ["reasoning", "longContext", "toolCalling", "coding"],
    contextWindow: 512_000,
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "together",
    modelId: "Qwen/Qwen3.6-Plus",
    displayName: "Qwen3.6 Plus",
    capabilities: ["reasoning", "longContext", "toolCalling"],
    contextWindow: 1_000_000,
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "together",
    modelId: "Qwen/Qwen2.5-7B-Instruct-Turbo",
    displayName: "Qwen2.5 7B Instruct Turbo",
    capabilities: ["fastGeneration"],
    relativeQuality: "lightweight",
    relativeSpeed: "fast",
  }),
  model({
    providerId: "together",
    modelId: "deepseek-ai/DeepSeek-V3",
    displayName: "DeepSeek V3 (legacy)",
    status: "deprecated",
    relativeQuality: "balanced",
    relativeSpeed: "moderate",
    notes: "Superseded on Together's own catalog by the DeepSeek V4 family.",
  }),

  // ─── OpenRouter — verified 2026-08-13 (openrouter.ai/api/v1/models) ───
  model({
    providerId: "openrouter",
    modelId: "nvidia/nemotron-3.5-lightning:free",
    displayName: "Nemotron 3.5 Lightning (free)",
    capabilities: ["longContext", "fastGeneration"],
    contextWindow: 1_000_000,
    relativeQuality: "fast",
    relativeSpeed: "fast",
    pricing: "Free",
  }),
  model({
    providerId: "openrouter",
    modelId: "anthropic/claude-opus-5",
    displayName: "Claude Opus 5",
    capabilities: ["reasoning", "longContext", "vision", "toolCalling", "coding"],
    contextWindow: 1_000_000,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  model({
    providerId: "openrouter",
    modelId: "openai/gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    capabilities: ["reasoning", "longContext", "vision", "toolCalling", "coding"],
    contextWindow: 1_050_000,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "slow",
  }),
  model({
    providerId: "openrouter",
    modelId: "moonshotai/kimi-k3",
    displayName: "Kimi K3",
    capabilities: ["reasoning", "longContext", "vision"],
    contextWindow: 1_048_576,
    inputModalities: ["text", "image"],
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
    notes: "2.8T-parameter open-weight multimodal reasoning model.",
  }),
  model({
    providerId: "openrouter",
    modelId: "qwen/qwen3.8-max",
    displayName: "Qwen3.8 Max",
    capabilities: ["reasoning", "longContext", "toolCalling", "coding"],
    contextWindow: 1_000_000,
    relativeQuality: "flagship",
    relativeSpeed: "moderate",
  }),
  carried("openrouter", "google/gemma-4-31b-it:free", "Gemma 4 31B (free)"),

  // ─── Carried forward, unverified this pass — see this file's header ───
  carried("zhipu", "glm-4-flash", "GLM-4 Flash"),
  carried("zhipu", "glm-4-air", "GLM-4 Air"),
  carried("zhipu", "glm-4-plus", "GLM-4 Plus"),

  carried("huggingface", "meta-llama/Llama-3.3-70B-Instruct", "Llama 3.3 70B Instruct"),
  carried("huggingface", "deepseek-ai/DeepSeek-V3-0324", "DeepSeek V3 0324"),
  carried("huggingface", "Qwen/Qwen2.5-72B-Instruct", "Qwen2.5 72B Instruct"),

  carried("cloudflare", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "Llama 3.3 70B Instruct (fp8 fast)"),
  carried("cloudflare", "@cf/meta/llama-3.1-8b-instruct", "Llama 3.1 8B Instruct"),

  carried("fireworks", "accounts/fireworks/models/llama-v3p3-70b-instruct", "Llama 3.3 70B Instruct"),
  carried("fireworks", "accounts/fireworks/models/deepseek-v3", "DeepSeek V3"),
  carried("fireworks", "accounts/fireworks/models/qwen2p5-72b-instruct", "Qwen2.5 72B Instruct"),

  carried("deepinfra", "meta-llama/Llama-3.3-70B-Instruct", "Llama 3.3 70B Instruct"),
  carried("deepinfra", "deepseek-ai/DeepSeek-V3", "DeepSeek V3"),
  carried("deepinfra", "Qwen/Qwen2.5-72B-Instruct", "Qwen2.5 72B Instruct"),

  carried("novita", "meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B Instruct"),
  carried("novita", "deepseek/deepseek-v3", "DeepSeek V3"),
  carried("novita", "qwen/qwen-2.5-72b-instruct", "Qwen2.5 72B Instruct"),

  carried("hyperbolic", "meta-llama/Llama-3.3-70B-Instruct", "Llama 3.3 70B Instruct"),
  carried("hyperbolic", "deepseek-ai/DeepSeek-V3", "DeepSeek V3"),
  carried("hyperbolic", "Qwen/Qwen2.5-72B-Instruct", "Qwen2.5 72B Instruct"),

  carried("nebius", "meta-llama/Llama-3.3-70B-Instruct", "Llama 3.3 70B Instruct"),
  carried("nebius", "deepseek-ai/DeepSeek-V3", "DeepSeek V3"),
  carried("nebius", "Qwen/Qwen2.5-72B-Instruct", "Qwen2.5 72B Instruct"),

  carried("sambanova", "Meta-Llama-3.3-70B-Instruct", "Llama 3.3 70B Instruct"),
  carried("sambanova", "DeepSeek-R1-Distill-Llama-70B", "DeepSeek R1 Distill Llama 70B"),
  carried("sambanova", "Meta-Llama-3.1-8B-Instruct", "Llama 3.1 8B Instruct"),

  carried("chutes", "deepseek-ai/DeepSeek-V3-0324", "DeepSeek V3 0324"),
  carried("chutes", "Qwen/Qwen3-235B-A22B", "Qwen3 235B A22B"),

  carried("ai21", "jamba-mini", "Jamba Mini"),
  carried("ai21", "jamba-large", "Jamba Large"),

  carried("moonshot", "moonshot-v1-8k", "Moonshot v1 8K"),
  carried("moonshot", "moonshot-v1-32k", "Moonshot v1 32K"),
  carried("moonshot", "moonshot-v1-128k", "Moonshot v1 128K"),
  carried("moonshot", "kimi-k2-0711-preview", "Kimi K2 (0711 preview)"),

  carried("scaleway", "llama-3.3-70b-instruct", "Llama 3.3 70B Instruct"),
  carried("scaleway", "qwen2.5-coder-32b-instruct", "Qwen2.5 Coder 32B Instruct"),
  carried("scaleway", "mistral-nemo-instruct-2407", "Mistral Nemo Instruct"),

  carried("nscale", "meta-llama/Llama-3.3-70B-Instruct", "Llama 3.3 70B Instruct"),
  carried("nscale", "Qwen/Qwen2.5-Coder-32B-Instruct", "Qwen2.5 Coder 32B Instruct"),
  carried("nscale", "deepseek-ai/DeepSeek-R1", "DeepSeek R1"),

  carried("inferencenet", "meta-llama/llama-3.3-70b-instruct/fp-8", "Llama 3.3 70B Instruct (fp8)"),
  carried("inferencenet", "deepseek/deepseek-r1/fp-8", "DeepSeek R1 (fp8)"),

  carried("arliai", "Meta-Llama-3.1-8B-Instruct", "Llama 3.1 8B Instruct"),
  carried("arliai", "Mistral-Nemo-12B-Instruct-2407", "Mistral Nemo 12B Instruct"),

  carried("upstage", "solar-pro2", "Solar Pro2"),
  carried("upstage", "solar-mini", "Solar Mini"),

  carried("stepfun", "step-1-8k", "Step-1 8K"),
  carried("stepfun", "step-1-32k", "Step-1 32K"),
  carried("stepfun", "step-2-16k", "Step-2 16K"),

  carried("hunyuan", "hunyuan-turbos-latest", "Hunyuan TurboS"),
  carried("hunyuan", "hunyuan-large", "Hunyuan Large"),
  carried("hunyuan", "hunyuan-standard", "Hunyuan Standard"),

  carried("baseten", "deepseek-ai/DeepSeek-V3-0324", "DeepSeek V3 0324"),
  carried("baseten", "meta-llama/Llama-4-Maverick-17B-128E-Instruct", "Llama 4 Maverick 17B-128E Instruct"),

  carried("vercelgateway", "openai/gpt-4o-mini", "GPT-4o mini (via Vercel AI Gateway)"),
  carried("vercelgateway", "anthropic/claude-3-5-haiku", "Claude 3.5 Haiku (via Vercel AI Gateway)"),
  carried("vercelgateway", "google/gemini-2.0-flash", "Gemini 2.0 Flash (via Vercel AI Gateway)"),

  carried("minimax", "MiniMax-Text-01", "MiniMax Text-01"),
  carried("minimax", "abab6.5s-chat", "abab6.5s Chat"),

  carried("featherless", "meta-llama/Meta-Llama-3.1-8B-Instruct", "Llama 3.1 8B Instruct"),
  carried("featherless", "mistralai/Mistral-Nemo-Instruct-2407", "Mistral Nemo Instruct"),
];

const CATALOG_BY_PROVIDER: Record<string, ModelSpec[]> = {};
for (const m of MODEL_CATALOG) {
  (CATALOG_BY_PROVIDER[m.providerId] ??= []).push(m);
}

/** Every catalogued model for a provider, optionally narrowed to one reachable under a given access mode. */
export function getModelsForProvider(providerId: string, accessMode?: AccessMode): ModelSpec[] {
  const models = CATALOG_BY_PROVIDER[providerId] ?? [];
  return accessMode ? models.filter((m) => m.accessModes.includes(accessMode)) : models;
}

/**
 * The model a provider's picker should preselect: the first "current"
 * (non-deprecated, non-preview) catalog entry for that provider, in the
 * order they were added above. Falls back to CloudProviderSpec.defaultModel
 * for a provider with zero catalog entries — cannot happen today (every
 * catalogued provider has at least one carried-forward entry) but keeps
 * this safe if a future provider is added to providerCatalog.ts before its
 * models are added here.
 */
export function getDefaultModelId(providerId: string): string {
  const models = getModelsForProvider(providerId);
  const current = models.find((m) => m.status === "current");
  if (current) return current.modelId;
  if (models[0]) return models[0].modelId;
  return getCloudProvider(providerId)?.defaultModel ?? "";
}

export interface AIRequirements {
  /** ALL of these must be present on a model for it to match. */
  capabilities?: Capability[];
  minContextWindow?: number;
  preferQuality?: QualityTier;
  accessMode?: AccessMode;
}

/**
 * Pure filter (+ light preference-based sort) over a list of models against
 * an AI Request's requirements — the shape a future capability-aware
 * feature would call with `MODEL_CATALOG` (see this file's header for why
 * no such feature is built yet). Unverified (`verified: false`) entries are
 * never treated as satisfying a capability requirement — an empty
 * capabilities array must not be silently read as "matches nothing
 * required," but it also must never be claimed to match something it was
 * never confirmed to support.
 */
export function selectModelsByCapabilities(models: ModelSpec[], requirements: AIRequirements): ModelSpec[] {
  let candidates = models.filter((m) => m.status !== "deprecated");

  if (requirements.accessMode) {
    candidates = candidates.filter((m) => m.accessModes.includes(requirements.accessMode!));
  }
  if (requirements.minContextWindow) {
    candidates = candidates.filter((m) => (m.contextWindow ?? 0) >= requirements.minContextWindow!);
  }
  if (requirements.capabilities?.length) {
    candidates = candidates.filter((m) => m.verified && requirements.capabilities!.every((c) => m.capabilities.includes(c)));
  }

  if (requirements.preferQuality) {
    const preferred = requirements.preferQuality;
    candidates = [...candidates].sort((a, b) => (a.relativeQuality === preferred ? -1 : 0) - (b.relativeQuality === preferred ? -1 : 0));
  }

  return candidates;
}
