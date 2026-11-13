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
import { getCloudProvider } from "../../src/config/providerCatalog.ts";
import { serverCanReachLocalModels } from "../src/ai/serverLocalAccess.ts";
import { route, type RouterOptions } from "../../src/platform/router/router.ts";
import { pipeToSse } from "../../src/platform/router/sseBridge.ts";
import { CircuitBreaker, MemoryBreakerStore } from "../../src/platform/router/circuitBreaker.ts";
import { assignBadges, curateModels, type MeasuredSpeed } from "../../src/platform/router/modelCuration.ts";
import { listLiveModels, ModelListError } from "../../src/platform/router/modelListers.ts";
import type { Candidate, ProviderId, RouteRequest, RouterEvent } from "../../src/platform/router/types.ts";
import { AiEndpointBlockedError, createAiFetch, screenCandidates, serverAdapters } from "../src/ai/aiEndpointGuard.ts";
import { entryFromCatalog, expandKeyring, liveModelsFor, quarantineModel } from "../src/ai/liveModels.ts";
import { recommendModels } from "../../src/platform/router/modelRecommendation.ts";

const PROVIDERS = ["openai", "anthropic", "google", "groq", "deepseek", "mistral", "ollama", "lmstudio", "webllm", "custom"] as const;
const LOCAL = new Set<ProviderId>(["ollama", "lmstudio", "webllm"]);

const keyringEntry = z.object({
  provider: z.enum(PROVIDERS),
  /** The catalog provider this connection is (e.g. "openrouter"); `provider` is only its wire protocol. */
  via: z.string().regex(/^[a-z0-9_-]{1,40}$/).optional(),
  /** A model id, or "auto" to use the best model the provider lists live. */
  model: z.string().min(1).max(200),
  apiKey: z.string().min(1).max(4096).optional(),
  baseUrl: z.string().url().max(500).optional(),
  contextWindow: z.number().int().positive().max(10_000_000).optional(),
  maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
  label: z.string().max(120).optional(),
  /** Which of the provider's keys this is (1 = main), so a backup key has its own id and circuit. */
  slot: z.number().int().min(1).max(9).optional(),
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
/** For a model whose real limit is unknown: accepted by nearly every current model, and room for a reasoning model to think and still answer. */
const DEFAULT_MAX_OUT = 8_192;

export function keyringToCandidates(entries: KeyringEntry[]): Candidate[] {
  return entries.map((e) => ({
    id: `${LOCAL.has(e.provider) ? "local" : "byok"}:${e.via ?? e.provider}:${e.model}${e.slot && e.slot > 1 ? `#${e.slot}` : ""}`,
    lane: LOCAL.has(e.provider) ? "local" : "byok",
    provider: e.provider,
    // A backup key is its own group: when one key runs out, the next key of the same provider still gets its turn.
    group: `${e.via ?? e.provider}${e.slot && e.slot > 1 ? `#${e.slot}` : ""}`,
    model: e.model,
    label: e.label ?? `${e.model}${LOCAL.has(e.provider) ? " on your device" : e.via ? ` · ${getCloudProvider(e.via)?.name ?? e.via} key` : " · your key"}`,
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
    const expanded = await expandKeyring(keyring, body.task);
    const screened = await screenCandidates(keyringToCandidates(expanded.entries));
    const own = screened.kept;
    const chain = [...own.filter((c) => c.lane === "byok"), ...own.filter((c) => c.lane === "local")];

    if (chain.length === 0 && screened.blocked.length) {
      res.status(400).json({ error: screened.blocked.map((b) => `${b.label}: ${b.reason}`).join("; "), code: "ai_endpoint_blocked" });
      return;
    }
    if (chain.length === 0 && expanded.notices.length) {
      res.status(400).json({ error: expanded.notices.map((n) => n.text).join(" "), code: "ai_model_required" });
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
      for (const n of expanded.notices) {
        yield { type: "candidate_skipped", candidateId: `notice:${n.text.slice(0, 40)}`, label: "AI connection", reason: "no_credential", detail: n.text };
      }
      const onCandidateFailure = (c: Candidate, f: { kind: string }) => { if (f.kind === "model_unavailable") quarantineModel(c); };
      for await (const ev of route(request, chain, signal, { site: "server", adapters, breaker, onCandidateFailure, ...deps.routerOptions })) {
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
      keyring.filter((k, i) => !LOCAL.has(k.provider) && keyring.findIndex((o) => (o.via ?? o.provider) === (k.via ?? k.provider) && o.baseUrl === k.baseUrl) === i).map(async (k) => {
        const group = k.via ?? k.provider;
        const cacheKey = createHash("sha256").update(`${k.provider}\0${group}\0${k.baseUrl ?? ""}\0${k.apiKey ?? ""}`).digest("hex");
        const hit = modelCache.get(cacheKey);
        if (hit && Date.now() - hit.at < MODEL_CACHE_MS) return { provider: group, ...(hit.models as object) };
        const list = deps.listModels ? await deps.listModels(k.provider, { apiKey: k.apiKey, baseUrl: k.baseUrl, fetchImpl: aiFetch }).then((models) => ({ ok: true as const, models }), (e: unknown) => ({ ok: false as const, unsupported: false, error: e instanceof ModelListError || e instanceof AiEndpointBlockedError ? e.message : "Could not reach the provider" })) : await liveModelsFor(k);
        if (!list.ok) return { provider: group, models: [], error: list.error, unsupported: list.unsupported };
        const models = assignBadges(curateModels(group, list.models), speeds);
        const rec = recommendModels(group, list.models);
        const payload = { models, recommended: rec.recommended, options: rec.options, totalListed: rec.totalListed };
        modelCache.set(cacheKey, { at: Date.now(), models: payload });
        return { provider: group, ...payload };
      })
    );
    res.json({ providers: results, measuredAt: new Date().toISOString() });
  });

  /**
   * POST /api/ai/verify: proves a connection works end to end, then recommends a model.
   * Body: { providerId (catalog id), model?, baseUrl? }; the key arrives as x-ai-api-key (never in the body).
   *   1. fetch the provider's live model list (or say it publishes none);
   *   2. choose the model: the one asked for if still listed, else the recommendation;
   *   3. send one tiny real request through the same adapters Ask Scholar uses, trying the
   *      next best live model if that one fails, so the reported model is one that answered.
   */
  const verifyHits = new Map<string, number[]>();
  app.post("/api/ai/verify", requireAuth, async (req, res) => {
    const userId = (req as express.Request & { user?: { id: string } }).user?.id ?? "anon";
    const recent = (verifyHits.get(userId) ?? []).filter((t) => Date.now() - t < 60_000);
    if (recent.length >= 10) { res.status(429).json({ ok: false, error: "Too many checks. Wait a minute and try again." }); return; }
    verifyHits.set(userId, [...recent, Date.now()]);

    const body = (req.body ?? {}) as { providerId?: unknown; model?: unknown; baseUrl?: unknown };
    const apiKey = typeof req.headers["x-ai-api-key"] === "string" ? req.headers["x-ai-api-key"].replace(/[^\x21-\x7E]/g, "").trim() : "";
    if (typeof body.providerId !== "string" || !apiKey) { res.status(400).json({ ok: false, error: "A provider and an API key are required." }); return; }
    const made = entryFromCatalog(body.providerId, { apiKey, model: typeof body.model === "string" ? body.model : undefined, baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined });
    if (!made.ok) { res.status(400).json({ ok: false, error: made.reason }); return; }
    const entry = made.entry;
    const screened = await screenCandidates(keyringToCandidates([entry]));
    if (!screened.kept.length) { res.status(400).json({ ok: false, error: screened.blocked.map((b) => b.reason).join("; ") || "This endpoint can't be used." }); return; }

    const list = await liveModelsFor(entry, true);
    const rec = list.ok ? recommendModels(entry.via ?? entry.provider, list.models) : null;
    const asked = entry.model !== "auto" ? entry.model : undefined;
    const askedListed = Boolean(asked && list.ok && list.models.some((m) => m.id === asked));
    // Order to try: what the user asked for (if listed or if the provider cannot say), then the live options.
    const order = [
      ...(asked && (askedListed || !list.ok) ? [asked] : []),
      ...(rec?.options.map((o) => o.id) ?? []),
    ].filter((id, i, a) => a.indexOf(id) === i).slice(0, 4);
    if (!order.length) {
      const unsupported = !list.ok && list.unsupported;
      // A list that failed for another reason (rejected key, provider down) is that reason, not "pick a model".
      res.json({ ok: false, listed: list.ok, unsupported, needsModel: list.ok || unsupported, error: list.ok ? "None of the models listed can be used for text." : list.error });
      return;
    }

    const byId = new Map(list.ok ? list.models.map((m) => [m.id, m]) : []);
    let lastError = "";
    for (const model of order) {
      const m = byId.get(model);
      const [cand] = keyringToCandidates([{ ...entry, model, contextWindow: m?.contextWindow, maxOutputTokens: m?.maxOutputTokens ? Math.min(m.maxOutputTokens, 32_768) : undefined }]);
      const started = Date.now();
      let text = "";
      let failed: string | undefined;
      let failedKind = "";
      for await (const ev of route({ requestId: randomUUID(), task: "fast", messages: [{ role: "user", content: "Reply with the single word: ready" }], desiredOutputTokens: 1024, minOutputTokens: 16 }, [cand], new AbortController().signal, { site: "server", adapters, breaker: new CircuitBreaker(new MemoryBreakerStore()), retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, maxWaitMs: 0 }, timeouts: { firstTokenMs: 20_000, idleMs: 15_000 }, maxTotalMs: 25_000, onCandidateFailure: (_c, f) => { failedKind = f.kind; failed = f.message; } })) {
        if (ev.type === "token") text += ev.text;
      }
      if (text.trim() && !failed) {
        res.json({
          ok: true,
          listed: list.ok,
          tested: { model, latencyMs: Date.now() - started },
          recommended: rec?.options.find((o) => o.id === model) ?? rec?.recommended ?? null,
          options: rec?.options ?? [],
          totalListed: rec?.totalListed ?? 0,
          note: asked && !order.includes(asked) ? `${asked} is not listed by the provider any more.` : model !== (asked ?? model) ? `${asked} did not answer, so ${model} was tested instead.` : undefined,
        });
        return;
      }
      lastError = failed ?? "The model returned no answer.";
      // Account-wide problems fail every model the same way: stop and say which.
      if (failedKind === "auth") { res.json({ ok: false, listed: list.ok, error: `The provider rejected this key (${lastError}).` }); return; }
      if (failedKind === "quota") { res.json({ ok: false, listed: list.ok, error: `The key is valid but the account has no credit or quota left (${lastError}).`, options: rec?.options ?? [] }); return; }
    }
    res.json({ ok: false, listed: list.ok, error: `The key was accepted but no model answered a test request. Last error: ${lastError}`, options: rec?.options ?? [] });
  });
}
