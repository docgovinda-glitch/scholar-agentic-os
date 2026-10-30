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

/** What the browser needs to run a prompt on the user's local model (426 body). */
export interface BrowserAiPayload {
  challengeToken: string;
  systemPrompt: string;
  userPrompt: string;
  taskType: string;
}

/**
 * The user's AI is a local model only their browser can reach. The route hands
 * the exact prompt to the browser (426), which runs it and sends the result back
 * with the signed challenge token.
 */
export class BrowserAiRequiredError extends Error {
  readonly payload: BrowserAiPayload;
  constructor(payload: BrowserAiPayload) {
    super("This request runs on the user's browser-local AI.");
    this.name = "BrowserAiRequiredError";
    this.payload = payload;
  }
}

/** A browser-run result came back without a valid challenge for this user and prompt. */
export class InvalidLlmChallengeError extends Error {
  readonly status = 403;
  constructor() {
    super("Invalid or unsigned LLM challenge token");
    this.name = "InvalidLlmChallengeError";
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
 * 426 requireFrontendLLM: the route opted into running the prompt on the user's browser-local AI.
 * 403 ai_challenge_invalid: a browser result came back without a valid challenge.
 * 502 ai_unavailable: the provider failed or returned something unusable.
 */
export function sendAiFailure(res: Response, err: unknown, feature: string): void {
  if (res.headersSent) return;
  if (err instanceof BrowserAiRequiredError) {
    res.status(426).json({ requireFrontendLLM: true, ...err.payload });
    return;
  }
  if (err instanceof InvalidLlmChallengeError) {
    res.status(403).json({ error: err.message, code: "ai_challenge_invalid" });
    return;
  }
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
