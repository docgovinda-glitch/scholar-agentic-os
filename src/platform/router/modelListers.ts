/**
 * Live model listing per provider. Each lister calls the provider's documented
 * list-models endpoint with the caller's key and normalises the answer to
 * `LiveModel`. Responses are validated; unknown fields are ignored and malformed
 * entries are dropped, never guessed.
 *
 * Runs wherever the key is: the server for cloud providers (BYOK keys arrive as
 * transient request headers; Premium keys come from the vault), the browser for
 * local runners on the user's machine.
 */
import { z } from "zod";
import type { LiveModel } from "./modelCuration";
import type { ProviderId } from "./types";

export interface ListerContext {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class ModelListError extends Error {
  constructor(public provider: ProviderId, public status: number | undefined, message: string) {
    super(message);
  }
}

async function getJson(provider: ProviderId, url: string, headers: Record<string, string>, ctx: ListerContext): Promise<unknown> {
  const res = await (ctx.fetchImpl ?? fetch)(url, { headers, signal: ctx.signal ?? AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ModelListError(provider, res.status, res.status === 401 || res.status === 403 ? "The key was rejected" : `Model list failed (${res.status}): ${text.slice(0, 160)}`);
  }
  return res.json();
}

const need = (provider: ProviderId, ctx: ListerContext) => {
  if (!ctx.apiKey) throw new ModelListError(provider, undefined, "No key provided");
  return ctx.apiKey;
};

const openAiShape = z.object({
  data: z.array(z.object({
    id: z.string(),
    created: z.number().optional(),
    context_window: z.number().optional(), // Groq
    active: z.boolean().optional(), // Groq
  }).passthrough()),
});

function fromOpenAiShape(json: unknown): LiveModel[] {
  return openAiShape.parse(json).data
    .filter((m) => m.active !== false)
    .map((m) => ({ id: m.id, createdAt: m.created ? m.created * 1000 : undefined, contextWindow: m.context_window }));
}

const anthropicShape = z.object({
  data: z.array(z.object({ id: z.string(), display_name: z.string().optional(), created_at: z.string().optional() }).passthrough()),
});

const geminiShape = z.object({
  models: z.array(z.object({
    name: z.string(),
    displayName: z.string().optional(),
    inputTokenLimit: z.number().optional(),
    outputTokenLimit: z.number().optional(),
    supportedGenerationMethods: z.array(z.string()).optional(),
  }).passthrough()),
});

const mistralShape = z.object({
  data: z.array(z.object({
    id: z.string(),
    created: z.number().optional(),
    max_context_length: z.number().optional(),
    deprecation: z.string().nullable().optional(),
    capabilities: z.object({
      completion_chat: z.boolean().optional(),
      function_calling: z.boolean().optional(),
      vision: z.boolean().optional(),
    }).partial().optional(),
  }).passthrough()),
});

const ollamaShape = z.object({ models: z.array(z.object({ name: z.string(), modified_at: z.string().optional() }).passthrough()) });

type Lister = (ctx: ListerContext) => Promise<LiveModel[]>;

export const LISTERS: Partial<Record<ProviderId, Lister>> = {
  openai: async (ctx) => fromOpenAiShape(await getJson("openai", `${ctx.baseUrl ?? "https://api.openai.com/v1"}/models`, { Authorization: `Bearer ${need("openai", ctx)}` }, ctx)),
  groq: async (ctx) => fromOpenAiShape(await getJson("groq", `${ctx.baseUrl ?? "https://api.groq.com/openai/v1"}/models`, { Authorization: `Bearer ${need("groq", ctx)}` }, ctx)),
  deepseek: async (ctx) => fromOpenAiShape(await getJson("deepseek", `${ctx.baseUrl ?? "https://api.deepseek.com"}/models`, { Authorization: `Bearer ${need("deepseek", ctx)}` }, ctx)),

  anthropic: async (ctx) => {
    const json = await getJson("anthropic", `${ctx.baseUrl ?? "https://api.anthropic.com/v1"}/models?limit=100`, { "x-api-key": need("anthropic", ctx), "anthropic-version": "2023-06-01" }, ctx);
    return anthropicShape.parse(json).data.map((m) => ({ id: m.id, displayName: m.display_name, createdAt: m.created_at ? Date.parse(m.created_at) : undefined }));
  },

  google: async (ctx) => {
    const json = await getJson("google", `${ctx.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"}/models?pageSize=200`, { "x-goog-api-key": need("google", ctx) }, ctx);
    return geminiShape.parse(json).models.map((m) => ({
      id: m.name.replace(/^models\//, ""),
      displayName: m.displayName,
      contextWindow: m.inputTokenLimit,
      maxOutputTokens: m.outputTokenLimit,
      generatesText: m.supportedGenerationMethods ? m.supportedGenerationMethods.includes("generateContent") : undefined,
    }));
  },

  mistral: async (ctx) => {
    const json = await getJson("mistral", `${ctx.baseUrl ?? "https://api.mistral.ai/v1"}/models`, { Authorization: `Bearer ${need("mistral", ctx)}` }, ctx);
    return mistralShape.parse(json).data.map((m) => ({
      id: m.id,
      createdAt: m.created ? m.created * 1000 : undefined,
      contextWindow: m.max_context_length,
      deprecated: Boolean(m.deprecation),
      generatesText: m.capabilities?.completion_chat,
      supportsTools: m.capabilities?.function_calling,
      supportsVision: m.capabilities?.vision,
    }));
  },

  ollama: async (ctx) => {
    const json = await getJson("ollama", `${ctx.baseUrl ?? "http://localhost:11434"}/api/tags`, {}, ctx);
    return ollamaShape.parse(json).models.map((m) => ({ id: m.name, createdAt: m.modified_at ? Date.parse(m.modified_at) : undefined }));
  },

  custom: async (ctx) => {
    if (!ctx.baseUrl) throw new ModelListError("custom", undefined, "No endpoint address provided");
    return fromOpenAiShape(await getJson("custom", `${ctx.baseUrl.replace(/\/$/, "")}/models`, ctx.apiKey ? { Authorization: `Bearer ${ctx.apiKey}` } : {}, ctx));
  },

  lmstudio: async (ctx) => fromOpenAiShape(await getJson("lmstudio", `${ctx.baseUrl ?? "http://localhost:1234/v1"}/models`, {}, ctx)),
};

export async function listLiveModels(provider: ProviderId, ctx: ListerContext): Promise<LiveModel[]> {
  const lister = LISTERS[provider];
  if (!lister) throw new ModelListError(provider, undefined, `Listing models is not supported for ${provider}`);
  return lister(ctx);
}
