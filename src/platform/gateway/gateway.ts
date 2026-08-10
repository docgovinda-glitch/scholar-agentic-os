/**
 * platform/gateway — the mandatory-Warden completion entry point.
 *
 * Every server-side caller that wants a model completion calls
 * `complete()` here. There is no other sanctioned path: `getAdapter()` is
 * not exported from the package root, so a caller cannot skip evaluation by
 * importing the adapter directly (see __tests__/noBypass.test.ts).
 */

import { evaluate, type EgressPolicy } from "../warden/warden";
import { defaultPolicy } from "../warden/policy";
import { getAdapter, AdapterHttpError } from "./adapters";
import { GatewayDenied, type CompletionRequest, type CompletionResult, type CandidateProvider } from "./types";
import { classifyHttpError, classifyThrownError } from "../../services/aiErrors";
import {
  executeWithFailover,
  ProviderCallError,
  type FailoverOptions,
  type FailoverResult,
} from "../../services/providerFailover";

export { GatewayDenied } from "./types";
export type { CompletionRequest, CompletionResult, CandidateProvider } from "./types";

function estimateTokens(text: string): number {
  // Deliberately crude (chars/4) — good enough for budget display, not billing.
  return Math.ceil(text.length / 4);
}

/**
 * Warden-evaluate a request and resolve the prompt actually sent downstream.
 * Shared by complete() and stream() so the two never drift on policy
 * handling. Throws GatewayDenied on "deny"/"ask" — see complete()'s doc
 * comment for what callers are responsible for.
 */
function evaluateAndResolvePrompt(req: CompletionRequest, policy: EgressPolicy): string {
  const evaluation = evaluate(
    {
      provider: req.provider,
      taskClass: req.taskClass,
      scopeId: req.scopeId,
      segments: req.segments,
      local: req.local,
    },
    policy
  );

  if (evaluation.decision === "deny") {
    throw new GatewayDenied(evaluation.reason, false);
  }
  if (evaluation.decision === "ask") {
    throw new GatewayDenied(evaluation.reason, true);
  }
  // "allow" or "redact" both proceed; redact already minimised evaluation.preview,
  // so the outbound prompt is rebuilt from the (possibly redacted) preview segments,
  // never from req.segments directly — this is what makes redaction real rather than cosmetic.
  return evaluation.decision === "redact"
    ? evaluation.preview.map((s) => `${s.label}: ${s.text}`).join("\n\n")
    : req.userPrompt;
}

function resolveAdapter(providerId: string) {
  const adapter = getAdapter(providerId);
  if (!adapter) {
    throw new Error(
      `No gateway adapter for provider "${providerId}". ` +
        `See docs/01-product/13-MODULE-SPECIFICATIONS.md §8.1 for the migration gap.`
    );
  }
  return adapter;
}

/**
 * Complete a request. Throws GatewayDenied if the Warden refuses (either a
 * hard "deny", e.g. restricted content, or an unresolved "ask" — the caller
 * is responsible for obtaining consent via warden.recordConsent() and
 * retrying, never for working around the denial).
 */
export async function complete(
  req: CompletionRequest,
  policy: EgressPolicy = defaultPolicy()
): Promise<CompletionResult> {
  const effectiveUserPrompt = evaluateAndResolvePrompt(req, policy);
  const adapter = resolveAdapter(req.provider);

  const start = Date.now();
  const { text, model } = await adapter.complete({ ...req, userPrompt: effectiveUserPrompt });
  const latencyMs = Date.now() - start;

  return {
    text,
    provider: req.provider,
    model,
    inputTokensEstimate: estimateTokens(effectiveUserPrompt + (req.systemPrompt ?? "")),
    outputTokensEstimate: estimateTokens(text),
    latencyMs,
  };
}

/**
 * Stream a request. Same Warden gating as complete(); the only difference is
 * delivery. A provider whose adapter has no stream() implementation (today:
 * Cohere — see adapters.ts's module comment) falls back to complete() and
 * delivers the whole result as a single onChunk call, so callers can always
 * use stream() uniformly rather than branching on provider capability.
 */
export async function stream(
  req: CompletionRequest,
  onChunk: (delta: string) => void,
  policy: EgressPolicy = defaultPolicy()
): Promise<CompletionResult> {
  const effectiveUserPrompt = evaluateAndResolvePrompt(req, policy);
  const adapter = resolveAdapter(req.provider);
  const resolvedReq = { ...req, userPrompt: effectiveUserPrompt };

  const start = Date.now();
  const { text, model } = adapter.stream
    ? await adapter.stream(resolvedReq, onChunk)
    : await adapter.complete(resolvedReq).then((result) => {
        onChunk(result.text);
        return result;
      });
  const latencyMs = Date.now() - start;

  return {
    text,
    provider: req.provider,
    model,
    inputTokensEstimate: estimateTokens(effectiveUserPrompt + (req.systemPrompt ?? "")),
    outputTokensEstimate: estimateTokens(text),
    latencyMs,
  };
}

export interface CompleteWithFailoverOptions
  extends Omit<FailoverOptions, "candidates" | "displayNames"> {
  candidates: CandidateProvider[];
}

/**
 * Turns whatever a single-candidate call (complete()/stream()) threw into
 * the failover orchestrator's vocabulary. Shared by completeWithFailover()
 * and streamWithFailover() so the two never drift on this translation.
 *
 * A GatewayDenied is translated rather than thrown directly: never worth
 * retrying the SAME provider (consent/policy does not change between two
 * calls a second apart), but whether it's worth trying the NEXT provider
 * depends on which kind of denial it was. A hard "deny" (e.g. restricted
 * content) is provider-independent — every provider will refuse it
 * identically — so failover would just burn attempts. An "ask" is
 * per-provider consent, so a different provider that already has consent
 * recorded genuinely might succeed where this one didn't.
 */
function toProviderCallError(providerId: string, err: unknown): ProviderCallError {
  if (err instanceof GatewayDenied) {
    return new ProviderCallError(providerId, {
      kind: "bad_request",
      label: err.requiresConsent ? "Consent required" : "Denied by policy",
      message: err.message,
      remedy: err.requiresConsent
        ? "Record consent for this provider via warden.recordConsent(), then retry."
        : null,
      retryable: false,
      failoverWorthwhile: err.requiresConsent,
    });
  }
  if (err instanceof AdapterHttpError) {
    return new ProviderCallError(providerId, classifyHttpError(err.status, err.detail));
  }
  return new ProviderCallError(providerId, classifyThrownError(err));
}

/**
 * Complete against the first candidate provider that succeeds, in order,
 * with retry/backoff/cooldown handled by services/providerFailover.ts. Each
 * candidate still goes through the full Warden gate individually — see
 * toProviderCallError()'s doc comment for why a deny/ask is handled
 * differently.
 */
export async function completeWithFailover(
  req: Omit<CompletionRequest, "provider" | "apiKey" | "model">,
  options: CompleteWithFailoverOptions,
  policy: EgressPolicy = defaultPolicy()
): Promise<FailoverResult<CompletionResult>> {
  const byProvider = new Map(options.candidates.map((c) => [c.provider, c]));

  return executeWithFailover(
    async (providerId) => {
      const candidate = byProvider.get(providerId);
      if (!candidate) {
        throw new Error(`completeWithFailover: no candidate configured for provider "${providerId}".`);
      }
      try {
        return await complete(
          { ...req, provider: providerId, apiKey: candidate.apiKey, model: candidate.model },
          policy
        );
      } catch (err) {
        throw toProviderCallError(providerId, err);
      }
    },
    {
      ...options,
      candidates: options.candidates.map((c) => c.provider),
    }
  );
}

/**
 * Stream against the first candidate provider that succeeds. Same
 * failover/backoff/cooldown machinery as completeWithFailover(), but only
 * ever retries or switches provider BEFORE any chunk has been delivered to
 * `onChunk` — every adapter's stream() validates the HTTP response before
 * it starts parsing SSE lines, so a failure that lands here always means
 * nothing was written yet. A failure genuinely mid-stream (the connection
 * drops after chunks were already delivered) is not retried transparently:
 * doing so would either duplicate already-delivered text or require the
 * continuation-prompt machinery in services/providerFailover.ts's
 * buildContinuationRequest(), which is designed for a client visibly
 * resuming a stream, not a server-side retry-from-scratch. That failure
 * simply propagates as this call's failure, same as the legacy proxy this
 * migrates (server/routes/ai.ts's /api/stream-generate never retried once
 * response chunks had started flowing either).
 */
export async function streamWithFailover(
  req: Omit<CompletionRequest, "provider" | "apiKey" | "model">,
  onChunk: (delta: string) => void,
  options: CompleteWithFailoverOptions,
  policy: EgressPolicy = defaultPolicy()
): Promise<FailoverResult<CompletionResult>> {
  const byProvider = new Map(options.candidates.map((c) => [c.provider, c]));

  return executeWithFailover(
    async (providerId) => {
      const candidate = byProvider.get(providerId);
      if (!candidate) {
        throw new Error(`streamWithFailover: no candidate configured for provider "${providerId}".`);
      }
      try {
        return await stream(
          { ...req, provider: providerId, apiKey: candidate.apiKey, model: candidate.model },
          onChunk,
          policy
        );
      } catch (err) {
        throw toProviderCallError(providerId, err);
      }
    },
    {
      ...options,
      candidates: options.candidates.map((c) => c.provider),
    }
  );
}
