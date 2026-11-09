/**
 * Runs the server's existing AI call sites (llm.ts, scholarBrain, route-level
 * calls) through the unified router, so every workspace step, the assistant
 * and Ask Scholar share one chain, one failover policy and one way of telling
 * the user what happened.
 *
 * - Chain per request: Premium resources (entitled, within quota) → the
 *   user's keys from `x-ai-keyring` (or the legacy single-provider x-ai-*
 *   headers) → their local model.
 * - A provider failure moves to the next candidate with a visible event; it
 *   never silently hands the request to the browser. The browser hand-off
 *   (426) happens only when the next candidate really is a local model.
 * - Every routing event of the request is collected; `aiRouteDecorator`
 *   attaches a summary as `aiRoute` to the JSON response, and streaming
 *   callers forward the events live.
 */
import type { NextFunction, Request, Response } from "express";
import { route } from "../../../src/platform/router/router.ts";
import { CircuitBreaker, MemoryBreakerStore } from "../../../src/platform/router/circuitBreaker.ts";
import type { Candidate, ProviderAdapter, ProviderId, RouteRequest, RouterEvent, TaskClass } from "../../../src/platform/router/types.ts";
import { keyringToCandidates, parseKeyring, type KeyringEntry, type PremiumPort } from "../../routes/aiRun.ts";
import { resolveRouterTarget } from "../../../src/platform/router/providerMap.ts";
import { expandKeyring, quarantineModel } from "./liveModels.ts";
import { accountKeyring } from "./accountAi.ts";
import { screenCandidates, serverAdapters } from "./aiEndpointGuard.ts";
import { LocalModelUnreachableError, NoClientAiProviderError } from "./aiRouteErrors.ts";

const ROUTER_TASK: Record<string, TaskClass> = {
  reasoning: "reasoning", drafting: "drafting", "long-context": "long-context", coding: "coding",
  fast: "fast", extraction: "fast", chat: "fast", classification: "fast", vision: "vision",
};
/** Maps the task names used across the server to the router's task classes. */
export const toRouterTask = (taskType: string | undefined): TaskClass => ROUTER_TASK[taskType ?? ""] ?? "reasoning";

/** What a JSON response tells the UI about how its AI step was answered. */
export interface AiRouteSummary {
  answeredBy?: { label: string; lane: Candidate["lane"] };
  notices: Array<{ kind: "fallback" | "retry" | "skipped" | "limit"; text: string }>;
  usage?: { inputTokens: number; outputTokens: number };
}

export class RouterExhaustedError extends Error {
  constructor(message: string, public code: "exhausted" | "context_overflow" | "non_retryable") { super(message); this.name = "RouterExhaustedError"; }
}
export class RouterHandoffError extends Error {
  constructor(public label: string) { super(`Continue on the user's device with ${label}`); this.name = "RouterHandoffError"; }
}
export class NoAiConnectedError extends Error {
  constructor() { super("No AI is connected. Add your own AI key or a local model in AI Access."); this.name = "NoAiConnectedError"; }
}

interface BridgeDeps { adapters: Partial<Record<ProviderId, ProviderAdapter>>; breaker: CircuitBreaker; premium?: PremiumPort }
let deps: BridgeDeps = { adapters: serverAdapters(), breaker: new CircuitBreaker(new MemoryBreakerStore()) };
export function configureRouterBridge(next: Partial<BridgeDeps>): void { deps = { ...deps, ...next }; }

/**
 * The user's AI connections for this request: the keyring, with the legacy
 * single-provider headers (the user's primary choice) first when the keyring
 * does not already hold that provider and model.
 */
export function keyringFromRequest(req: { headers?: Request["headers"] }): KeyringEntry[] {
  const headers = req.headers ?? {};
  const ring = parseKeyring(headers["x-ai-keyring"]);
  const legacy = legacyEntry(headers);
  if (!legacy) return ring;
  // "auto" stands for whatever model the provider lists live, so any entry for the same connection covers it.
  if (ring.some((e) => (e.via ?? e.provider) === (legacy.via ?? legacy.provider) && (legacy.model === "auto" || e.model === legacy.model))) return ring;
  return [legacy, ...ring].slice(0, 8);
}

function legacyEntry(headers: Request["headers"]): KeyringEntry | undefined {
  const h = (n: string) => {
    const v = headers[n];
    if (typeof v !== "string" || !v) return undefined;
    const clean = v.replace(/[^\x20-\x7E]/g, "").trim();
    return clean || undefined;
  };
  const named = h("x-ai-provider")?.toLowerCase();
  if (!named) return undefined;
  // A local runner may arrive without a model: the browser picks one on hand-off.
  const rawModel = h("x-ai-model")?.split(/\s*(?:—|–|\u2014|\u2013)\s*/)[0]?.trim();
  const model = rawModel && !/\s/.test(rawModel) ? rawModel : "auto";
  if (named === "ollama" || named === "lmstudio") return { provider: named, model, baseUrl: h("x-ai-base-url") };
  // Any catalog provider (all 37) resolves to its wire protocol and endpoint; no model name is assumed:
  // a missing one is chosen from the provider's live list.
  const target = resolveRouterTarget(named, h("x-ai-base-url"));
  if (!target.ok) return undefined;
  return { provider: target.target.provider, via: target.target.via, model, apiKey: h("x-ai-api-key"), baseUrl: target.target.baseUrl, label: undefined };
}

type Scoped = Request & { user?: { id: string }; aiRoute?: AiRouteSummary };

/**
 * Every connection this request can use: the ones this device sent (headers),
 * then the person's account connections they do not already cover. A device
 * that has not synced its keys yet therefore still works on its first request.
 */
export async function requestKeyring(req: Scoped): Promise<KeyringEntry[]> {
  const sent = keyringFromRequest(req);
  const fromAccount = await accountKeyring(req.user?.id);
  const have = new Set(sent.map((e) => e.via ?? e.provider));
  return [...sent, ...fromAccount.filter((e) => !have.has(e.via ?? e.provider))].slice(0, 8);
}

function summarise(target: AiRouteSummary, ev: RouterEvent) {
  if (ev.type === "fallback") target.notices.push({ kind: "fallback", text: `Switched from ${ev.fromLabel} to ${ev.toLabel}: ${ev.message}${ev.httpStatus ? ` (HTTP ${ev.httpStatus})` : ""}` });
  if (ev.type === "retry") target.notices.push({ kind: "retry", text: `Retried after ${Math.round(ev.waitMs / 100) / 10}s: ${ev.message}` });
  if (ev.type === "candidate_skipped") target.notices.push({ kind: "skipped", text: `Skipped ${ev.label}: ${ev.detail}` });
  if (ev.type === "limit_warning") target.notices.push({ kind: "limit", text: `Input used ${Math.round(ev.usedRatio * 100)}% of the model's context; the answer was limited to ${ev.outputClampedTo} tokens` });
  if (ev.type === "done") {
    target.answeredBy = { label: ev.label, lane: ev.lane };
    target.usage = { inputTokens: (target.usage?.inputTokens ?? 0) + ev.usage.inputTokens, outputTokens: (target.usage?.outputTokens ?? 0) + ev.usage.outputTokens };
  }
}

export interface RoutedCall {
  task: TaskClass;
  systemPrompt?: string;
  userPrompt: string;
  maxOutputTokens?: number;
  /** Ask the model to continue when cut off at its output limit. Default: yes when no `maxOutputTokens` was given. */
  continueOnLength?: boolean;
  temperature?: number;
  /** Images sent with the user prompt (base64, no data: prefix). */
  images?: Array<{ mediaType: string; data: string }>;
  /** Forward live events (streaming endpoints). */
  onEvent?: (ev: RouterEvent) => void;
  signal?: AbortSignal;
}

/** The chain for this request and task. Throws NoAiConnectedError when it is empty. */
export async function chainFor(req: Scoped, task: TaskClass): Promise<Candidate[]> {
  // Each connection becomes its live model plus up to two live alternates; a retired or missing model is replaced here.
  const expanded = await expandKeyring(await requestKeyring(req), task);
  for (const n of expanded.notices) (req.aiRoute ??= { notices: [] }).notices.push(n);
  const offered = keyringToCandidates(expanded.entries);
  const { kept: own, blocked } = await screenCandidates(offered);
  for (const b of blocked) (req.aiRoute ??= { notices: [] }).notices.push({ kind: "skipped", text: `Skipped ${b.label}: ${b.reason}` });
  const premium = deps.premium && req.user?.id ? (await deps.premium.candidates(req.user.id, task).catch(() => ({ candidates: [] as Candidate[] }))).candidates : [];
  const chain = [...premium, ...own.filter((c) => c.lane === "byok"), ...own.filter((c) => c.lane === "local")];
  if (!chain.length && blocked.length) {
    throw new RouterExhaustedError(blocked.map((b) => `${b.label}: ${b.reason}`).join("; "), "non_retryable");
  }
  if (!chain.length && expanded.notices.length) {
    throw new RouterExhaustedError(expanded.notices.map((n) => n.text).join(" "), "non_retryable");
  }
  if (!chain.length) throw new NoAiConnectedError();
  return chain;
}

/**
 * Output allowance when the caller states none. Providers bill what is generated, not what is allowed,
 * so a roomy limit costs nothing for a short answer, while a too-small one cuts a long draft (or a
 * reasoning model's thinking) off. Quick tasks get a small limit so a runaway answer stays cheap.
 */
export const DEFAULT_OUTPUT_BY_TASK: Record<TaskClass, number> = {
  fast: 4_096, vision: 8_192, coding: 32_768, drafting: 32_768, reasoning: 32_768, "long-context": 32_768,
};
const MAX_CONTINUATIONS = 2;
const CONTINUE_PROMPT = "Your last answer was cut off at the length limit. Continue exactly where it stopped: no preamble, no repetition of what you already wrote.";

/**
 * Runs one prompt through the router and returns the text. When the answer is cut off at the model's
 * output limit (and the caller did not ask for a short one), the model is asked to continue, up to twice,
 * so a long section or report arrives whole instead of ending mid-sentence.
 */
export async function routedText(req: Request, call: RoutedCall): Promise<string> {
  const scoped = req as Scoped;
  scoped.aiRoute ??= { notices: [] };
  const images = call.images?.filter((i) => i.data) ?? [];
  const task: TaskClass = images.length ? "vision" : call.task;
  const chain = await chainFor(scoped, task);
  const userContent: RouteRequest["messages"][number]["content"] = images.length
    ? [{ type: "text", text: call.userPrompt }, ...images.map((i) => ({ type: "image" as const, mediaType: i.mediaType, data: i.data }))]
    : call.userPrompt;
  const desired = call.maxOutputTokens ?? DEFAULT_OUTPUT_BY_TASK[task];
  const mayContinue = call.continueOnLength ?? call.maxOutputTokens === undefined;
  const byId = new Map(chain.map((c) => [c.id, c]));
  const base: RouteRequest["messages"] = [...(call.systemPrompt ? [{ role: "system" as const, content: call.systemPrompt }] : []), { role: "user" as const, content: userContent }];

  const once = async (messages: RouteRequest["messages"]): Promise<{ text: string; finishReason: string }> => {
    const request: RouteRequest = {
      requestId: crypto.randomUUID(),
      task,
      messages,
      desiredOutputTokens: desired,
      minOutputTokens: Math.min(512, desired),
      temperature: call.temperature,
    };
    let text = "";
    for await (const ev of route(request, chain, call.signal ?? new AbortController().signal, { site: "server", adapters: deps.adapters, breaker: deps.breaker, onCandidateFailure: (c, f) => { if (f.kind === "model_unavailable") quarantineModel(c); } })) {
      summarise(scoped.aiRoute!, ev);
      call.onEvent?.(ev);
      if (ev.type === "token") text += ev.text;
      if (ev.type === "fallback" && ev.partialOutputDiscarded) text = "";
      if (ev.type === "done") {
        const c = byId.get(ev.candidateId);
        if (c?.lane === "premium" && deps.premium && scoped.user?.id) await deps.premium.charge(scoped.user.id, c, ev.usage, request.requestId).catch(() => false);
        // The router already treats an empty stream as a failure; this is the last line of defence.
        if (!text.trim()) throw new RouterExhaustedError("The AI returned an empty answer.", "exhausted");
        return { text, finishReason: ev.finishReason };
      }
      if (ev.type === "handoff") throw new RouterHandoffError(ev.label);
      if (ev.type === "error") throw new RouterExhaustedError(ev.message, ev.code);
      if (ev.type === "cancelled") throw new RouterExhaustedError("Cancelled", "non_retryable");
    }
    throw new RouterExhaustedError("The AI stream ended without an answer.", "exhausted");
  };

  let { text, finishReason } = await once(base);
  for (let i = 0; mayContinue && i < MAX_CONTINUATIONS && finishReason === "length"; i++) {
    const next = await once([...base, { role: "assistant", content: text }, { role: "user", content: CONTINUE_PROMPT }]).catch(() => undefined);
    if (!next) break; // keep what was written rather than lose it
    text += next.text;
    finishReason = next.finishReason;
  }
  return text;
}

/** Adds `aiRoute` to JSON responses of AI routes that ran through the router. */
export function aiRouteDecorator(req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = (body: unknown) => {
    const summary = (req as Scoped).aiRoute;
    if (summary && (summary.answeredBy || summary.notices.length) && body && typeof body === "object" && !Array.isArray(body) && !("aiRoute" in body)) {
      return json({ ...(body as Record<string, unknown>), aiRoute: summary });
    }
    return json(body);
  };
  next();
}

/**
 * `routedText` for routes that run only on the server: errors come back as the
 * classes `sendAiFailure` already answers (400 ai_provider_required, 400
 * ai_local_model_unreachable, 502 ai_unavailable).
 */
export async function routedCompletion(req: Request, call: RoutedCall): Promise<string> {
  try {
    return await routedText(req, call);
  } catch (err) {
    if (err instanceof NoAiConnectedError) throw new NoClientAiProviderError();
    if (err instanceof RouterHandoffError) throw new LocalModelUnreachableError();
    throw err;
  }
}

/**
 * Where this request's AI would run, without calling it: "server" (Premium or
 * a cloud key), "browser" (the first choice is the user's local model) or
 * "none". Lets a route hand off before doing expensive retrieval.
 */
export async function aiAvailability(req: Request, task: TaskClass): Promise<"server" | "browser" | "none"> {
  try {
    const chain = await chainFor(req as Scoped, task);
    return chain[0]?.runsIn === "browser" ? "browser" : "server";
  } catch (err) {
    if (err instanceof NoAiConnectedError) return "none";
    throw err;
  }
}

/** The label of the model that answered this request, for response metadata. */
export const answeredByLabel = (req: Request): string => (req as Scoped).aiRoute?.answeredBy?.label ?? "router";
