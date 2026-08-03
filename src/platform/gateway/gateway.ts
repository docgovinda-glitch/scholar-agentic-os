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
import { getAdapter } from "./adapters";
import { GatewayDenied, type CompletionRequest, type CompletionResult } from "./types";

export { GatewayDenied } from "./types";
export type { CompletionRequest, CompletionResult } from "./types";

function estimateTokens(text: string): number {
  // Deliberately crude (chars/4) — good enough for budget display, not billing.
  return Math.ceil(text.length / 4);
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
  const evaluation = evaluate(
    {
      provider: req.provider,
      taskClass: req.taskClass,
      scopeId: req.scopeId,
      segments: req.segments,
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
  const effectiveUserPrompt =
    evaluation.decision === "redact"
      ? evaluation.preview.map((s) => `${s.label}: ${s.text}`).join("\n\n")
      : req.userPrompt;

  const adapter = getAdapter(req.provider);
  if (!adapter) {
    throw new Error(
      `No gateway adapter for provider "${req.provider}". ` +
        `See docs/01-product/13-MODULE-SPECIFICATIONS.md §8.1 for the migration gap.`
    );
  }

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
