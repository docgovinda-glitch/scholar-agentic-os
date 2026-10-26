/**
 * platform/gateway — the mandatory-Warden completion entry point.
 *
 * Every server-side caller that wants a model completion calls
 * `complete()` here. There is no other sanctioned path: `getAdapter()` is
 * not exported from the package root, so a caller cannot skip evaluation by
 * importing the adapter directly (see __tests__/noBypass.test.ts).
 */

import { evaluate, recordConsent, type EgressPolicy } from "../warden/warden";
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
import { getCloudProvider } from "../../config/providerCatalog";

export { GatewayDenied } from "./types";
export type { CompletionRequest, CompletionResult, CandidateProvider } from "./types";

function estimateTokens(text: string): number {
  // Deliberately crude (chars/4) — good enough for budget display, not billing.
  return Math.ceil(text.length / 4);
}

interface ResolvedPrompts {
  effectiveUserPrompt: string;
  effectiveSystemPrompt?: string;
}

/**
 * Warden-evaluate a request and resolve the prompt(s) actually sent downstream.
 * Evaluates req.systemPrompt AND req.userPrompt in addition to req.segments,
 * applying Warden redactions to both before passing to model adapters.
 * Shared by complete() and stream() so the two never drift on policy handling.
 */
function evaluateAndResolvePrompts(
  req: CompletionRequest,
  policy: EgressPolicy
): ResolvedPrompts {
  const segments: { label: string; text: string; redact?: boolean }[] = [];

  // Always evaluate req.systemPrompt AND req.userPrompt in addition to req.segments
  if (req.systemPrompt !== undefined && req.systemPrompt !== null) {
    segments.push({ label: "systemPrompt", text: req.systemPrompt });
  }

  segments.push({ label: "userPrompt", text: req.userPrompt });

  if (req.segments && req.segments.length > 0) {
    for (const seg of req.segments) {
      const alreadyPresent = segments.some(
        (s) => s.label === seg.label && s.text === seg.text
      );
      if (!alreadyPresent) {
        segments.push(seg);
      }
    }
  }

  const evaluation = evaluate(
    {
      provider: req.provider,
      taskClass: req.taskClass,
      scopeId: req.scopeId,
      segments,
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

  if (evaluation.decision === "redact") {
    const sysSeg = evaluation.preview.find((s) => s.label === "systemPrompt");
    const userSeg = evaluation.preview.find((s) => s.label === "userPrompt");

    const nonSysSegments = evaluation.preview.filter((s) => s.label !== "systemPrompt");
    const effectiveUserPrompt =
      req.segments && req.segments.length > 0
        ? nonSysSegments.map((s) => `${s.label}: ${s.text}`).join("\n\n")
        : (userSeg ? userSeg.text : req.userPrompt);

    const effectiveSystemPrompt = sysSeg
      ? sysSeg.text
      : (req.systemPrompt !== undefined ? "[redacted by privacy policy]" : undefined);

    return {
      effectiveUserPrompt,
      effectiveSystemPrompt,
    };
  }

  return {
    effectiveUserPrompt: req.userPrompt,
    effectiveSystemPrompt: req.systemPrompt,
  };
}

function resolveAdapter(providerId: string) {
  const adapter = getAdapter(providerId);
  if (!adapter) {
    throw new Error(
      `No gateway adapter for provider "${providerId}". ` +
        `See docs/AI-SYSTEM.md for supported providers.`
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
  const { effectiveUserPrompt, effectiveSystemPrompt } = evaluateAndResolvePrompts(req, policy);
  const adapter = resolveAdapter(req.provider);

  const start = Date.now();
  const resolvedReq = {
    ...req,
    userPrompt: effectiveUserPrompt,
    systemPrompt: effectiveSystemPrompt,
  };
  const { text, model } = await adapter.complete(resolvedReq);
  const latencyMs = Date.now() - start;

  return {
    text,
    provider: req.provider,
    model,
    inputTokensEstimate: estimateTokens(effectiveUserPrompt + (effectiveSystemPrompt ?? "")),
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
  const { effectiveUserPrompt, effectiveSystemPrompt } = evaluateAndResolvePrompts(req, policy);
  const adapter = resolveAdapter(req.provider);
  const resolvedReq = {
    ...req,
    userPrompt: effectiveUserPrompt,
    systemPrompt: effectiveSystemPrompt,
  };

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
    inputTokensEstimate: estimateTokens(effectiveUserPrompt + (effectiveSystemPrompt ?? "")),
    outputTokensEstimate: estimateTokens(text),
    latencyMs,
  };
}

export interface CompleteWithFailoverOptions
  extends Omit<FailoverOptions, "candidates" | "displayNames"> {
  candidates: CandidateProvider[];
  displayNames?: Record<string, string>;
}

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

function getCandidateKey(c: CandidateProvider, index: number): string {
  return `${c.provider}::${c.model || "default"}::${index}`;
}

function buildCandidateMaps(candidates: CandidateProvider[]) {
  const byKey = new Map<string, CandidateProvider>();
  const keys: string[] = [];
  const displayNames: Record<string, string> = {};

  candidates.forEach((c, index) => {
    const key = getCandidateKey(c, index);
    byKey.set(key, c);
    keys.push(key);
    const spec = getCloudProvider(c.provider);
    const name = spec?.name || c.provider;
    displayNames[key] = c.model ? `${name} (${c.model})` : name;
  });

  return { byKey, keys, displayNames };
}

/**
 * Complete against the first candidate provider that succeeds, in order,
 * with retry/backoff/cooldown handled by services/providerFailover.ts.
 */
export async function completeWithFailover(
  req: Omit<CompletionRequest, "provider" | "apiKey" | "model">,
  options: CompleteWithFailoverOptions,
  policy: EgressPolicy = defaultPolicy()
): Promise<FailoverResult<CompletionResult>> {
  const { byKey, keys, displayNames } = buildCandidateMaps(options.candidates);

  return executeWithFailover(
    async (candidateKey) => {
      const candidate = byKey.get(candidateKey);
      if (!candidate) {
        throw new Error(`completeWithFailover: no candidate configured for key "${candidateKey}".`);
      }
      try {
        return await complete(
          { ...req, provider: candidate.provider, apiKey: candidate.apiKey, model: candidate.model },
          policy
        );
      } catch (err) {
        throw toProviderCallError(candidate.provider, err);
      }
    },
    {
      ...options,
      candidates: keys,
      displayNames: { ...displayNames, ...(options.displayNames || {}) },
    }
  );
}

/**
 * Stream against the first candidate provider that succeeds.
 */
export async function streamWithFailover(
  req: Omit<CompletionRequest, "provider" | "apiKey" | "model">,
  onChunk: (delta: string) => void,
  options: CompleteWithFailoverOptions,
  policy: EgressPolicy = defaultPolicy()
): Promise<FailoverResult<CompletionResult>> {
  const { byKey, keys, displayNames } = buildCandidateMaps(options.candidates);

  return executeWithFailover(
    async (candidateKey) => {
      const candidate = byKey.get(candidateKey);
      if (!candidate) {
        throw new Error(`streamWithFailover: no candidate configured for key "${candidateKey}".`);
      }
      try {
        return await stream(
          { ...req, provider: candidate.provider, apiKey: candidate.apiKey, model: candidate.model },
          onChunk,
          policy
        );
      } catch (err) {
        throw toProviderCallError(candidate.provider, err);
      }
    },
    {
      ...options,
      candidates: keys,
      displayNames: { ...displayNames, ...(options.displayNames || {}) },
    }
  );
}
