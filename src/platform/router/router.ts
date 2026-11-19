import type { AdapterChunk, AttemptTrace, Candidate, Failure, ProviderAdapter, ProviderId, RouteRequest, RouterEvent, Usage } from "./types";
import { CircuitBreaker } from "./circuitBreaker";
import { classify, countsAgainstProvider, EmptyOutputError, TimeoutError } from "./errors";
import { TtlOutputCaps, type OutputCapStore } from "./outputCaps";
import { estimateTokens, preflight, type TokenCounter } from "./tokenBudget";

export interface RouterOptions {
  /** Where this router runs. Candidates for the other site are handed off, never skipped silently. */
  site: "server" | "browser";
  adapters: Partial<Record<ProviderId, ProviderAdapter>>;
  breaker: CircuitBreaker;
  /**
   * Which circuits a candidate belongs to. `model` opens for model-level trouble (5xx, timeouts, rate limits);
   * `connection` opens for account-wide trouble (spent credit, rejected key) and so skips every model of that
   * connection at once, on this request and the next. Default: the candidate id and its group. A server shared by
   * many people must include the credential in both, so one person's spent key never pauses another's.
   */
  /** Where learned output ceilings are kept between requests (default: this request only). */
  outputCaps?: OutputCapStore;
  breakerKeys?: (c: Candidate) => { model: string; connection: string };
  countTokens?: TokenCounter;
  retry?: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; maxWaitMs: number };
  timeouts?: { firstTokenMs: number; idleMs: number };
  metricsEveryMs?: number;
  limitWarnAt?: number;
  onFallbackTriggered?: (e: Extract<RouterEvent, { type: "fallback" }>) => void;
  onTokenApproachingLimit?: (e: Extract<RouterEvent, { type: "limit_warning" }>) => void;
  /** Called for every failed attempt, e.g. to quarantine a model the provider retired. */
  onCandidateFailure?: (c: Candidate, f: Failure) => void;
  /** Stop trying new candidates after this long, so a long chain cannot hang a request. */
  maxTotalMs?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

const DEFAULT_RETRY = { maxAttempts: 2, baseDelayMs: 800, maxDelayMs: 8_000, maxWaitMs: 20_000 };
const DEFAULT_TIMEOUTS = { firstTokenMs: 25_000, idleMs: 20_000 };
const DEFAULT_MAX_TOTAL_MS = 150_000;

/**
 * Failures that say the whole connection is unusable (same key, same account),
 * so its other models are skipped. Per-model problems (rate limit, retired
 * model, empty answer, context size, 5xx) move to the next model instead:
 * providers meter and fail per model far more often than per account.
 */
const CONNECTION_WIDE = new Set<Failure["kind"]>(["quota", "auth", "network"]);
/** The subset whose circuit is the connection's, not the model's: deterministic until a person acts or a window resets. */
const CONNECTION_CIRCUIT = new Set<Failure["kind"]>(["quota", "auth"]);

const defaultBreakerKeys = (c: Candidate) => ({ model: c.id, connection: `conn:${c.group ?? c.id}` });

const WAIT_TEXT = (ms: number) => (ms >= 90_000 ? `${Math.ceil(ms / 60_000)} min` : `${Math.ceil(ms / 1000)}s`);
const PAUSE_TEXT: Partial<Record<Failure["kind"], string>> = {
  quota: "Out of quota or credits",
  auth: "Key was rejected",
  rate_limit: "Rate limited",
};

export const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const t = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Re-yields an adapter stream, failing if the first token or any later token takes too long. */
async function* guarded(src: AsyncIterable<AdapterChunk>, firstMs: number, idleMs: number, ctl: AbortController): AsyncGenerator<AdapterChunk> {
  const it = src[Symbol.asyncIterator]();
  let first = true;
  try {
    while (true) {
      const limit = first ? firstMs : idleMs;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const e = new TimeoutError(first ? "first_token" : "idle", limit);
          ctl.abort(e); // stop the upstream request: no token spend after a timeout
          reject(e);
        }, limit);
      });
      let step: IteratorResult<AdapterChunk>;
      try {
        step = await Promise.race([it.next(), timeout]);
      } finally {
        clearTimeout(timer);
      }
      if (step.done) return;
      if (step.value.type === "text" || step.value.type === "tool_call") first = false;
      yield step.value;
    }
  } finally {
    await it.return?.();
  }
}

/**
 * Routes one request across a candidate chain and yields every state change.
 * Guarantees: no candidate change without a `fallback` (or `candidate_skipped`/`handoff`)
 * event first; no request is sent that preflight says cannot fit; aborting the
 * signal stops the upstream call and ends with `cancelled`.
 */
export async function* route(req: RouteRequest, chain: Candidate[], signal: AbortSignal, opts: RouterOptions): AsyncGenerator<RouterEvent> {
  const retry = opts.retry ?? DEFAULT_RETRY;
  const timeouts = opts.timeouts ?? DEFAULT_TIMEOUTS;
  const count = opts.countTokens ?? estimateTokens;
  const sleep = opts.sleep ?? abortableSleep;
  const now = opts.now ?? Date.now;
  const metricsEvery = opts.metricsEveryMs ?? 500;
  const trace: AttemptTrace[] = [];
  const startedAtAll = now();
  const maxTotal = opts.maxTotalMs ?? DEFAULT_MAX_TOTAL_MS;
  const deadGroups = new Set<string>();
  /** Output ceilings a connection said its balance can afford, so its other models (and later requests) start there instead of failing first. */
  const caps = opts.outputCaps ?? new TtlOutputCaps();

  yield { type: "route_start", requestId: req.requestId, chain: chain.map(({ id, label, lane }) => ({ id, label, lane })) };

  let pending: { from: Candidate; failure: Failure; partial: boolean } | undefined;
  let lastFailure: Failure | undefined;
  let skippedForContext = 0;

  for (const c of chain) {
    if (signal.aborted) { yield { type: "cancelled", outputTokensSoFar: 0 }; return; }
    if (now() - startedAtAll > maxTotal) {
      yield { type: "error", code: "exhausted", message: `No model answered within ${Math.round(maxTotal / 1000)}s.${lastFailure ? ` Last error: ${lastFailure.message}` : ""}`, trace };
      return;
    }
    // Same connection already failed account-wide (credit, key, network): its other models would fail the same way.
    if (c.group && deadGroups.has(c.group)) {
      trace.push({ candidateId: c.id, attempt: 0, startedAt: now(), durationMs: 0, outcome: "skipped" });
      continue;
    }

    if (c.runsIn !== opts.site) {
      // The server cannot reach the user's machine: the browser continues the chain from here.
      yield { type: "handoff", to: c.id, label: c.label, reason: pending ? `${pending.from.label} failed: ${pending.failure.message}` : "Runs on your device", ...(pending?.partial ? { partialOutputDiscarded: true } : {}) };
      return;
    }
    if (c.lane === "byok" && !c.credential?.apiKey) {
      yield { type: "candidate_skipped", candidateId: c.id, label: c.label, reason: "no_credential", detail: "No key available for this provider" };
      continue;
    }
    const adapter = opts.adapters[c.provider];
    if (!adapter) {
      yield { type: "candidate_skipped", candidateId: c.id, label: c.label, reason: "no_credential", detail: `No adapter for ${c.provider}` };
      continue;
    }
    const keys = (opts.breakerKeys ?? defaultBreakerKeys)(c);
    const connGate = await opts.breaker.acquire(keys.connection);
    const gate = connGate.allowed ? await opts.breaker.acquire(keys.model) : connGate;
    if (!gate.allowed) {
      if (connGate.allowed) await opts.breaker.release(keys.connection); // the connection probe went unused
      const why = gate.reason ? PAUSE_TEXT[gate.reason] : undefined;
      yield { type: "candidate_skipped", candidateId: c.id, label: c.label, reason: "circuit_open", detail: `${why ?? "Paused after repeated failures"}; retrying in ${WAIT_TEXT(gate.retryInMs)}` };
      trace.push({ candidateId: c.id, attempt: 0, startedAt: now(), durationMs: 0, outcome: "skipped" });
      // The whole connection is paused: its other models would be too.
      if (!connGate.allowed && c.group) deadGroups.add(c.group);
      continue;
    }
    const pf = preflight(req, c, count, opts.limitWarnAt);
    if (!pf.fits) {
      await Promise.all([opts.breaker.release(keys.connection), opts.breaker.release(keys.model)]);
      skippedForContext++;
      yield { type: "candidate_skipped", candidateId: c.id, label: c.label, reason: "context_too_small", detail: `Prompt ≈${pf.promptTokens} tokens leaves ${pf.outputBudget} for the answer (needs ${req.minOutputTokens}) in a ${c.contextWindow}-token window` };
      continue;
    }

    if (pending) {
      const e = { type: "fallback" as const, from: pending.from.id, fromLabel: pending.from.label, to: c.id, toLabel: c.label, reason: pending.failure.kind, httpStatus: pending.failure.httpStatus, message: pending.failure.message, partialOutputDiscarded: pending.partial };
      opts.onFallbackTriggered?.(e);
      yield e;
      pending = undefined;
    }
    if (pf.warn) {
      const e = { type: "limit_warning" as const, candidateId: c.id, promptTokens: pf.promptTokens, contextWindow: c.contextWindow, usedRatio: pf.usedRatio, outputClampedTo: pf.outputBudget };
      opts.onTokenApproachingLimit?.(e);
      yield e;
    }

    let failure: Failure | undefined;
    let streamed = false;
    let outputBudget = Math.min(pf.outputBudget, caps.get(keys.connection) ?? Infinity);
    let reducedForBalance = false;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
      yield { type: "attempt_start", candidateId: c.id, label: c.label, lane: c.lane, attempt, maxOutputTokens: outputBudget };
      const ctl = new AbortController();
      const relay = () => ctl.abort(signal.reason);
      signal.addEventListener("abort", relay, { once: true });
      const started = now();
      let firstTokenAt = 0;
      let lastMetrics = 0;
      let outChars = 0;
      let usage: Usage | undefined;
      let finishReason = "stop";
      try {
        for await (const ch of guarded(adapter.stream(c, req, outputBudget, ctl.signal), timeouts.firstTokenMs, timeouts.idleMs, ctl)) {
          if (ch.type === "text") {
            if (!firstTokenAt) firstTokenAt = now();
            streamed = true;
            outChars += ch.text.length;
            yield { type: "token", text: ch.text };
          } else if (ch.type === "tool_call") {
            streamed = true;
            yield { type: "tool_call", id: ch.id, name: ch.name, argumentsJson: ch.argumentsJson };
          } else if (ch.type === "usage") {
            usage = { inputTokens: ch.inputTokens, outputTokens: ch.outputTokens, source: "provider" };
          } else {
            finishReason = ch.reason;
          }
          const t = now();
          if (firstTokenAt && t - lastMetrics >= metricsEvery) {
            lastMetrics = t;
            const outTok = Math.round(outChars / 4);
            yield { type: "metrics", candidateId: c.id, ttftMs: firstTokenAt - started, tokensPerSecond: outTok / Math.max(0.001, (t - firstTokenAt) / 1000), outputTokens: outTok };
          }
        }
        // A clean stream with nothing in it is a failed attempt, not an answer.
        if (!streamed) throw new EmptyOutputError(finishReason);
        await Promise.all([opts.breaker.success(keys.model), opts.breaker.success(keys.connection)]);
        trace.push({ candidateId: c.id, attempt, startedAt: started, durationMs: now() - started, outcome: "success" });
        yield { type: "done", candidateId: c.id, label: c.label, lane: c.lane, finishReason, trace,
          usage: usage ?? { inputTokens: pf.promptTokens, outputTokens: Math.round(outChars / 4), source: "estimate" } };
        return;
      } catch (err) {
        failure = classify(ctl.signal.reason instanceof TimeoutError ? ctl.signal.reason : err, signal);
        trace.push({ candidateId: c.id, attempt, startedAt: started, durationMs: now() - started, outcome: failure.kind, httpStatus: failure.httpStatus });
        if (failure.kind === "aborted") {
          await Promise.all([opts.breaker.release(keys.connection), opts.breaker.release(keys.model)]);
          yield { type: "cancelled", candidateId: c.id, outputTokensSoFar: Math.round(outChars / 4) };
          return;
        }
        // The balance cannot reserve the answer ceiling we asked for, but it is not empty: ask for what it can afford
        // and try again on the same model. This says nothing bad about the key, so no circuit opens and no model is skipped.
        if (failure.affordableTokens !== undefined && !streamed && !reducedForBalance) {
          const cap = Math.floor(failure.affordableTokens * 0.9); // the provider prices the ceiling with some slack
          if (cap >= req.minOutputTokens && cap < outputBudget) {
            reducedForBalance = true;
            outputBudget = cap;
            caps.set(keys.connection, cap);
            await Promise.all([opts.breaker.release(keys.connection), opts.breaker.release(keys.model)]);
            yield { type: "retry", candidateId: c.id, attempt, maxAttempts: retry.maxAttempts, waitMs: 0, reason: failure.kind, message: `Your balance covers about ${failure.affordableTokens.toLocaleString("en")} output tokens; retrying with a smaller limit` };
            attempt--; // a smaller request is not one of the failed attempts
            continue;
          }
        }
        opts.onCandidateFailure?.(c, failure);
        if (CONNECTION_WIDE.has(failure.kind) && c.group) deadGroups.add(c.group);
        const info = { kind: failure.kind, retryAfterMs: failure.retryAfterMs, daily: failure.daily };
        if (countsAgainstProvider(failure.kind)) {
          // Spent credit / rejected key opens the connection's circuit at once; everything else is the model's.
          const own = CONNECTION_CIRCUIT.has(failure.kind) ? keys.connection : keys.model;
          const other = own === keys.model ? keys.connection : keys.model;
          await Promise.all([opts.breaker.failure(own, info), opts.breaker.release(other)]);
        } else {
          // A bad request, empty answer or retired model says nothing about the provider's health: free a half-open probe.
          await Promise.all([opts.breaker.release(keys.connection), opts.breaker.release(keys.model)]);
        }
        if (!failure.fallbackWorthy) { yield { type: "error", code: "non_retryable", message: failure.message, trace }; return; }
        // Never retry silently after tokens reached the user: move on and say the partial output was dropped.
        if (!failure.retryable || streamed || attempt === retry.maxAttempts) break;
        const backoff = Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
        const waitMs = Math.round(failure.retryAfterMs ?? backoff);
        if (waitMs > retry.maxWaitMs) break; // a long wait is worse than a visible switch
        yield { type: "retry", candidateId: c.id, attempt: attempt + 1, maxAttempts: retry.maxAttempts, waitMs, reason: failure.kind, message: failure.message };
        try { await sleep(waitMs, signal); } catch { yield { type: "cancelled", candidateId: c.id, outputTokensSoFar: 0 }; return; }
      } finally {
        signal.removeEventListener("abort", relay);
      }
    }
    lastFailure = failure;
    pending = failure ? { from: c, failure, partial: streamed } : undefined;
  }

  if (skippedForContext === chain.length) {
    yield { type: "error", code: "context_overflow", message: "The input is too long for every available model. Shorten it or attach fewer sources.", trace };
  } else {
    const kinds = trace.filter((t) => t.outcome !== "success" && t.outcome !== "skipped").map((t) => t.outcome);
    const allOutOfQuota = kinds.length > 0 && kinds.every((k) => k === "quota");
    const tooPoor = lastFailure?.affordableTokens;
    const message = allOutOfQuota && tooPoor
      ? `Your balance only covers about ${tooPoor.toLocaleString("en")} output tokens, too few for this request (it needs at least ${req.minOutputTokens.toLocaleString("en")}). Add credit with your provider or connect another AI in AI Access.`
      : allOutOfQuota
      ? chain.length === 1
        ? `Your ${chain[0].label} has run out of quota or credits. Add another key or provider in AI Access to keep going.`
        : "Every connected AI has run out of quota or credits. Add another key or provider in AI Access, or try again after your limits reset."
      : lastFailure
        ? `All connected AI models failed. Last error: ${lastFailure.message}`
        : "No connected AI model was available for this request.";
    yield { type: "error", code: "exhausted", message, trace };
  }
}
