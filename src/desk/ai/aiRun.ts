/**
 * Client entry point for every AI call: POST /api/ai/run, then yield the
 * router's events as they stream. When the server hands off to a local model
 * (it cannot reach the user's machine), the same chain continues here in the
 * browser, so the caller sees one uninterrupted event stream.
 */
import { authHeaders } from "../api/authHeaders";
import { route } from "../../platform/router/router";
import { CircuitBreaker, MemoryBreakerStore } from "../../platform/router/circuitBreaker";
import { ollamaAdapter, openAiCompatibleAdapter, sseEvents } from "../../platform/router/adapters";
import { isRemoteHttpsEndpoint } from "../../platform/router/baseUrl";
import type { Candidate, ChatMessage, RouteRequest, RouterEvent, TaskClass, ToolSpec } from "../../platform/router/types";
import { aiRequestParts, encodeKeyring, type KeyringEntry } from "./keyring";

export interface AiRunInput {
  task: TaskClass;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  desiredOutputTokens?: number;
  minOutputTokens?: number;
  temperature?: number;
}

export class AiRunError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) { super(message); }
}

const localBreaker = new CircuitBreaker(new MemoryBreakerStore());

/**
 * The local runners this chain continues with after a hand-off. Every catalog runner is either
 * `ollama` (its own API) or `lmstudio` (any OpenAI-compatible runner: Jan, vLLM, llama.cpp, ...);
 * `via` carries the runner's id so the candidate ids match the server's (`keyringToCandidates`).
 * A runner behind a public https address was already tried by the server: the browser's CSP only
 * allows loopback runners, so it is not offered again here.
 */
export function localCandidates(keyring: KeyringEntry[], fromId: string): Candidate[] {
  const local = keyring
    .filter((k) => (k.provider === "ollama" || k.provider === "lmstudio") && !isRemoteHttpsEndpoint(k.baseUrl))
    .map<Candidate>((k) => ({
      id: `local:${k.via ?? k.provider}:${k.model}`, group: k.via ?? k.provider, lane: "local", provider: k.provider, model: k.model,
      label: k.label ?? `${k.model} on your device`, contextWindow: k.contextWindow ?? 8_192, maxOutputTokens: k.maxOutputTokens ?? 2_048,
      runsIn: "browser", credential: k.baseUrl ? { baseUrl: k.baseUrl } : undefined,
    }));
  const start = local.findIndex((c) => c.id === fromId);
  return start >= 0 ? local.slice(start) : local;
}

export interface RunDeps { fetchImpl?: typeof fetch; keyring?: KeyringEntry[]; headers?: () => Promise<Record<string, string>> }

export async function* runAi(input: AiRunInput, signal: AbortSignal, deps: RunDeps = {}): AsyncGenerator<RouterEvent> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const parts = deps.keyring ? undefined : await aiRequestParts();
  const keyring = deps.keyring ?? parts!.ring;
  // Only the routing choice rides along with a keyring the caller supplied; the keyring header is built below.
  const { "x-ai-keyring": _ring, ...routing } = parts?.headers ?? {};
  const body = { desiredOutputTokens: 4096, minOutputTokens: 256, preferLane: "auto", ...input };
  const res = await fetchImpl("/api/ai/run", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(await (deps.headers ?? authHeaders)()), ...(keyring.length ? { "x-ai-keyring": encodeKeyring(keyring) } : {}), ...routing },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new AiRunError(res.status, j?.code, j?.error ?? `AI request failed (${res.status})`);
  }

  let handoff: Extract<RouterEvent, { type: "handoff" }> | undefined;
  for await (const { data } of sseEvents(res.body)) {
    const ev = JSON.parse(data) as RouterEvent;
    yield ev;
    if (ev.type === "handoff") handoff = ev;
  }
  if (!handoff) return;

  const chain = localCandidates(keyring, handoff.to);
  const request: RouteRequest = { requestId: crypto.randomUUID(), task: body.task, messages: body.messages, tools: body.tools, desiredOutputTokens: body.desiredOutputTokens, minOutputTokens: Math.min(body.minOutputTokens, body.desiredOutputTokens), temperature: body.temperature };
  yield* route(request, chain, signal, {
    site: "browser",
    adapters: { ollama: ollamaAdapter(fetchImpl), lmstudio: openAiCompatibleAdapter(fetchImpl) },
    breaker: localBreaker,
  });
}

/** Convenience: run and return the final text, forwarding every event. */
export async function runAiText(input: AiRunInput, signal: AbortSignal, onEvent?: (e: RouterEvent) => void, deps?: RunDeps): Promise<string> {
  let text = "";
  for await (const ev of runAi(input, signal, deps)) {
    onEvent?.(ev);
    if (ev.type === "token") text += ev.text;
    if ((ev.type === "fallback" || ev.type === "handoff") && ev.partialOutputDiscarded) text = "";
    if (ev.type === "error") throw new AiRunError(502, ev.code, ev.message);
    if (ev.type === "cancelled") throw new AiRunError(499, "cancelled", "Cancelled");
  }
  return text;
}
