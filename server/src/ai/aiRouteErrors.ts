import type { Response } from "express";

/** Thrown when a request carries no usable client AI provider (BYOK key or local runner). */
export class NoClientAiProviderError extends Error {
  constructor() {
    super(
      "Client-Owned AI Routing Required: No active transient AI credentials detected in request headers (x-ai-provider, x-ai-api-key, or local base URL). Server-side fallback keys are strictly prohibited."
    );
    this.name = "NoClientAiProviderError";
  }
}

/**
 * The user's AI is a model on their own computer, and this feature runs on
 * Scholar Core's server, which cannot reach it.
 */
export class LocalModelUnreachableError extends Error {
  constructor() {
    super("The selected AI is a local model on the user's computer, which the server cannot reach.");
    this.name = "LocalModelUnreachableError";
  }
}

/** The AI answered, but not in a shape the feature can use. */
export class UnusableAiResponseError extends Error {
  constructor(what: string) {
    super(`The AI provider returned no usable ${what}.`);
    this.name = "UnusableAiResponseError";
  }
}

export const LOCAL_MODEL_UNREACHABLE_MESSAGE =
  "This feature runs on Scholar Core's server, which can't reach a model running on your computer. Add a cloud AI key in AI Access to use it.";

export const AI_PROVIDER_REQUIRED_MESSAGE =
  "Connect an AI provider (your own key or a local model) in AI Access to run this.";

/**
 * Answers an AI feature that could not produce a real result. Never substitutes
 * template or heuristic output: the user sees that nothing was generated.
 * 400 ai_provider_required: no provider configured.
 * 400 ai_local_model_unreachable: the user's AI is a local model the server can't reach.
 * 502 ai_unavailable: the provider failed or returned something unusable.
 */
export function sendAiFailure(res: Response, err: unknown, feature: string): void {
  if (err instanceof LocalModelUnreachableError) {
    res.status(400).json({ error: LOCAL_MODEL_UNREACHABLE_MESSAGE, code: "ai_local_model_unreachable" });
    return;
  }
  if (err instanceof NoClientAiProviderError) {
    res.status(400).json({ error: AI_PROVIDER_REQUIRED_MESSAGE, code: "ai_provider_required" });
    return;
  }
  console.warn(`[${feature}] AI request failed:`, err instanceof Error ? err.message : err);
  res.status(502).json({
    error: `${feature} could not be generated: the AI provider failed or returned an unusable answer. Nothing was produced. Try again.`,
    code: "ai_unavailable",
  });
}
