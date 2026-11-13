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
import { getCloudProvider } from "../../config/providerCatalog";
import type { LiveModel } from "./modelCuration";
import type { ProviderId } from "./types";

export interface ListerContext {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class ModelListError extends Error {
  constructor(public provider: ProviderId, public status: number | undefined, message: string, /** The provider publishes no model list at all (not a failure of this key). */ public unsupported = false) {
    super(message);
  }
}

async function getJson(provider: ProviderId, url: string, headers: Record<string, string>, ctx: ListerContext): Promise<unknown> {
  const res = await (ctx.fetchImpl ?? fetch)(url, { headers, signal: ctx.signal ?? AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ModelListError(provider, res.status, res.status === 401 || res.status === 403 ? "The key was rejected" : `Model list failed (${res.status}): ${text.slice(0, 160)}`);
  }
  // A model list is small; a huge body is not one (and must not be read into memory).
  const text = await res.text();
  if (text.length > MAX_LIST_BYTES) throw new ModelListError(provider, res.status, "The provider's model list was too large to read.");
  try { return JSON.parse(text); } catch { throw new ModelListError(provider, res.status, "The provider's model list was not valid JSON."); }
}

const MAX_LIST_BYTES = 4_000_000;
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
  openAiShape.parse(json); // a body that is not a model list is an error, not an empty list
  return parseLooseModelList(json);
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const has = (v: unknown, x: string) => Array.isArray(v) && v.some((e) => String(e).toLowerCase() === x);

/**
 * Reads the model list of any OpenAI-style endpoint. Providers disagree on the
 * envelope (`data`, `models`, a bare array) and on field names, so each field
 * is read from the names providers actually use and dropped when absent.
 * Entries without a string id are discarded, never guessed.
 */
export function parseLooseModelList(json: unknown): LiveModel[] {
  const root = rec(json);
  const list: unknown[] = Array.isArray(json) ? json : Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : [];
  const out: LiveModel[] = [];
  for (const item of list) {
    const m = rec(item);
    const id = typeof item === "string" ? item : [m.id, m.name, m.model].find((v): v is string => typeof v === "string" && v.length > 0);
    if (!id) continue;
    if (m.active === false) continue;
    const arch = rec(m.architecture);
    const top = rec(m.top_provider);
    const created = num(m.created);
    const createdAt = created ? (created < 1e12 ? created * 1000 : created) : typeof m.created_at === "string" ? Date.parse(m.created_at) || undefined : undefined;
    let generatesText: boolean | undefined;
    if (Array.isArray(arch.output_modalities)) generatesText = has(arch.output_modalities, "text");
    else if (Array.isArray(m.endpoints)) generatesText = has(m.endpoints, "chat");
    else if (typeof m.type === "string") generatesText = /^(chat|language|text|llm|completion)/i.test(m.type);
    out.push({
      id,
      displayName: typeof m.display_name === "string" ? m.display_name : typeof m.displayName === "string" ? m.displayName : undefined,
      createdAt: createdAt && Number.isFinite(createdAt) ? createdAt : undefined,
      contextWindow: num(m.context_length) ?? num(m.context_window) ?? num(m.max_context_length) ?? num(m.contextLength) ?? num(m.max_model_len) ?? num(top.context_length),
      maxOutputTokens: num(m.max_completion_tokens) ?? num(m.max_output_tokens) ?? num(top.max_completion_tokens),
      deprecated: m.deprecated === true || m.is_deprecated === true || (typeof m.deprecation === "string" && m.deprecation.length > 0) ? true : undefined,
      generatesText,
      supportsVision: Array.isArray(arch.input_modalities) ? has(arch.input_modalities, "image") : undefined,
    });
  }
  return out;
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

/** The connection a list is for: the router provider plus the catalog id it came from. */
export interface ListTarget { provider: ProviderId; via?: string; baseUrl?: string }

/**
 * Live models for any catalog provider: the six native listers where they
 * exist, otherwise the catalog's own `modelsPath`. A provider that publishes no
 * list (e.g. Qwen, Perplexity) throws an `unsupported` error so callers can ask
 * the user for a model name instead of inventing one.
 */
export async function listModelsFor(target: ListTarget, ctx: ListerContext): Promise<LiveModel[]> {
  const via = target.via ?? target.provider;
  const baseUrl = target.baseUrl ?? ctx.baseUrl;
  if (target.provider !== "custom" && LISTERS[target.provider]) return LISTERS[target.provider]!({ ...ctx, baseUrl });
  if (via === "cohere") {
    return parseLooseModelList(await getJson("custom", `${(baseUrl && !baseUrl.includes("/compatibility") ? baseUrl : "https://api.cohere.com/v1").replace(/\/$/, "")}/models?page_size=100&endpoint=chat`, { Authorization: `Bearer ${need("custom", ctx)}` }, ctx));
  }
  const spec = getCloudProvider(via);
  if (!spec) return LISTERS.custom!({ ...ctx, baseUrl });
  if (!spec.modelsPath) throw new ModelListError("custom", undefined, `${spec.name} does not publish a model list. Enter a model name from its documentation.`, true);
  const base = (baseUrl ?? spec.baseUrl).replace(/\/$/, "");
  const headers: Record<string, string> = { Authorization: `Bearer ${need("custom", ctx)}`, ...(spec.extraHeaders ?? {}) };
  return parseLooseModelList(await getJson("custom", `${base}${spec.modelsPath}`, headers, ctx));
}

export async function listLiveModels(provider: ProviderId, ctx: ListerContext): Promise<LiveModel[]> {
  const lister = LISTERS[provider];
  if (!lister) throw new ModelListError(provider, undefined, `Listing models is not supported for ${provider}`);
  return lister(ctx);
}
