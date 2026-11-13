/**
 * One AI endpoint for every feature: POST /api/ai/run streams router events
 * (SSE), GET /api/ai/models returns the curated model list for the user's keys.
 *
 * Chain per request: the user's own keys in their order → their local model
 * (handed to the browser).
 *
 * Keys: BYOK keys arrive per request in the `x-ai-keyring` header (base64url
 * JSON). They live in memory for that request only: never stored, logged or
 * returned. 
 *
 * A base URL the user names is screened (`aiEndpointGuard`): https only, public
 * addresses only, connection pinned. A blocked endpoint is skipped with a reason.
 */
import { createHash, randomUUID } from "node:crypto";
import type express from "express";
import { z } from "zod";
import { requireAuth } from "../src/middleware/auth.ts";
import { serverCanReachLocalModels } from "../src/ai/serverLocalAccess.ts";
import { route, type RouterOptions } from "../../src/platform/router/router.ts";
import { pipeToSse } from "../../src/platform/router/sseBridge.ts";
import { CircuitBreaker, MemoryBreakerStore } from "../../src/platform/router/circuitBreaker.ts";
import { assignBadges, curateModels, type MeasuredSpeed } from "../../src/platform/router/modelCuration.ts";
import { listLiveModels, ModelListError } from "../../src/platform/router/modelListers.ts";
import type { Candidate, ProviderId, RouteRequest, RouterEvent } from "../../src/platform/router/types.ts";
import { AiEndpointBlockedError, createAiFetch, screenCandidates, serverAdapters } from "../src/ai/aiEndpointGuard.ts";

const PROVIDERS = ["openai", "anthropic", "google", "groq", "deepseek", "mistral", "ollama", "lmstudio", "webllm", "custom"] as const;
const LOCAL = new Set<ProviderId>(["ollama", "lmstudio", "webllm"]);

const keyringEntry = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(4096).optional(),
  baseUrl: z.string().url().max(500).optional(),
  contextWindow: z.number().int().positive().max(10_000_000).optional(),
  maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
  label: z.string().max(120).optional(),
});
export type KeyringEntry = z.infer<typeof keyringEntry>;

export function parseKeyring(header: unknown): KeyringEntry[] {
  if (typeof header !== "string" || !header) return [];
  try {
    const json = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    return z.array(keyringEntry).max(8).parse(json);
  } catch {
    throw new KeyringError();
  }
}
export class KeyringError extends Error {
  constructor() { super("The AI key header could not be read. Re-save your AI settings."); }
}

const contentPart = z.union([
  z.object({ type: z.literal("text"), text: z.string().max(400_000) }),
  z.object({ type: z.literal("image"), mediaType: z.string().regex(/^image\/(png|jpeg|webp|gif)$/), data: z.string().max(8_000_000) }),
]);
const runBody = z.object({
  task: z.enum(["reasoning", "drafting", "coding", "fast", "vision", "long-context"]),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([z.string().max(400_000), z.array(contentPart).max(20)]),
    toolCallId: z.string().max(200).optional(),
  })).min(1).max(200),
  tools: z.array(z.object({ name: z.string().max(64), description: z.string().max(2000), parameters: z.record(z.string(), z.unknown()) })).max(32).optional(),
  desiredOutputTokens: z.number().int().positive().max(200_000).default(4096),
  minOutputTokens: z.number().int().positive().max(200_000).default(256),
  temperature: z.number().min(0).max(2).optional(),
});

export interface AiRunDeps {
  adapters?: RouterOptions["adapters"];
  breaker?: CircuitBreaker;
  routerOptions?: Partial<RouterOptions>;
  listModels?: typeof listLiveModels;
}

// Conservative defaults when the client did not send the model's limits.
const DEFAULT_CONTEXT = 32_000;
const DEFAULT_MAX_OUT = 4_096;

export function keyringToCandidates(entries: KeyringEntry[]): Candidate[] {
  return entries.map((e) => ({
    id: `${LOCAL.has(e.provider) ? "local" : "byok"}:${e.provider}:${e.model}`,
    lane: LOCAL.has(e.provider) ? "local" : "byok",
    provider: e.provider,
    model: e.model,
    label: e.label ?? `${e.model}${LOCAL.has(e.provider) ? " on your device" : " · your key"}`,
    contextWindow: e.contextWindow ?? DEFAULT_CONTEXT,
    maxOutputTokens: e.maxOutputTokens ?? DEFAULT_MAX_OUT,
    // A local runner runs where it is reachable: on this server in development
    // or a self-hosted install (ALLOW_SERVER_LOCAL_AI), otherwise in the browser.
    runsIn: LOCAL.has(e.provider) && !(e.provider !== "webllm" && serverCanReachLocalModels()) ? "browser" : "server",
    credential: LOCAL.has(e.provider) ? (e.baseUrl ? { baseUrl: e.baseUrl } : undefined) : { apiKey: e.apiKey, baseUrl: e.baseUrl },
  }));
}

/** Speeds measured from real requests, feeding the "Fastest" badge. */
const speedSamples = new Map<string, number[]>();
function recordSpeed(modelKey: string, tps: number) {
  const s = speedSamples.get(modelKey) ?? [];
  s.push(tps);
  if (s.length > 200) s.shift();
  speedSamples.set(modelKey, s);
}
export function measuredSpeeds(): MeasuredSpeed[] {
  return [...speedSamples].map(([modelKey, s]) => {
    const sorted = [...s].sort((a, b) => a - b);
    return { modelKey, p50TokensPerSecond: sorted[Math.floor(sorted.length / 2)], samples: s.length };
  });
}

const modelCache = new Map<string, { at: number; models: unknown }>();
const MODEL_CACHE_MS = 6 * 60 * 60_000;

export function registerAiRunRoutes(app: express.Express, deps: AiRunDeps = {}): void {
  const aiFetch = createAiFetch();
  const adapters = deps.adapters ?? serverAdapters();
  const breaker = deps.breaker ?? new CircuitBreaker(new MemoryBreakerStore());
  const listModels = deps.listModels ?? listLiveModels;

  app.post("/api/ai/run", requireAuth, async (req, res) => {
    const userId = (req as express.Request & { user?: { id: string } }).user?.id;
    if (!userId) { res.status(401).json({ error: "Sign in to use AI." }); return; }

    const parsed = runBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid AI request", issues: parsed.error.issues.slice(0, 5) }); return; }
    let keyring: KeyringEntry[];
    try { keyring = parseKeyring(req.headers["x-ai-keyring"]); } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }

    const body = parsed.data;
    const screened = await screenCandidates(keyringToCandidates(keyring));
    const own = screened.kept;
    const chain = [...own.filter((c) => c.lane === "byok"), ...own.filter((c) => c.lane === "local")];

    if (chain.length === 0 && screened.blocked.length) {
      res.status(400).json({ error: screened.blocked.map((b) => `${b.label}: ${b.reason}`).join("; "), code: "ai_endpoint_blocked" });
      return;
    }
    if (chain.length === 0) {
      res.status(400).json({
        error: "No AI is connected. Add your own AI key or a local model in AI Access.",
        code: "ai_provider_required",
      });
      return;
    }

    const request: RouteRequest = {
      requestId: randomUUID(),
      task: body.task,
      messages: body.messages,
      tools: body.tools,
      desiredOutputTokens: body.desiredOutputTokens,
      minOutputTokens: Math.min(body.minOutputTokens, body.desiredOutputTokens),
      temperature: body.temperature,
    };
    const byId = new Map(chain.map((c) => [c.id, c]));

    await pipeToSse(req, res, async function* (signal): AsyncGenerator<RouterEvent> {
      for (const b of screened.blocked) {
        yield { type: "candidate_skipped", candidateId: `blocked:${b.label}`, label: b.label, reason: "endpoint_blocked", detail: b.reason };
      }
      for await (const ev of route(request, chain, signal, { site: "server", adapters, breaker, ...deps.routerOptions })) {
        if (ev.type === "metrics") {
          const c = byId.get(ev.candidateId);
          if (c && ev.outputTokens > 50) recordSpeed(`${c.provider}:${c.model}`, ev.tokensPerSecond);
        }
        yield ev;
      }
    });
  });

  app.get("/api/ai/models", requireAuth, async (req, res) => {
    let keyring: KeyringEntry[];
    try { keyring = parseKeyring(req.headers["x-ai-keyring"]); } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
    const speeds = measuredSpeeds();
    const results = await Promise.all(
      keyring.filter((k) => !LOCAL.has(k.provider)).map(async (k) => {
        const cacheKey = createHash("sha256").update(`${k.provider}\0${k.baseUrl ?? ""}\0${k.apiKey ?? ""}`).digest("hex");
        const hit = modelCache.get(cacheKey);
        if (hit && Date.now() - hit.at < MODEL_CACHE_MS) return { provider: k.provider, models: hit.models };
        try {
          const live = await listModels(k.provider, { apiKey: k.apiKey, baseUrl: k.baseUrl, fetchImpl: aiFetch });
          const models = assignBadges(curateModels(k.provider, live), speeds);
          modelCache.set(cacheKey, { at: Date.now(), models });
          return { provider: k.provider, models };
        } catch (e) {
          return { provider: k.provider, models: [], error: e instanceof ModelListError || e instanceof AiEndpointBlockedError ? e.message : "Could not reach the provider" };
        }
      })
    );
    res.json({ providers: results, measuredAt: new Date().toISOString() });
  });
}
