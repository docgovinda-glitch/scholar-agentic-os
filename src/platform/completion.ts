/**
 * The one way application code asks a model for text.
 *
 * App modules (manuscript, review, studio, ...) never name a provider or hold a
 * key. They receive a `Completer` from whoever runs them: the server builds one
 * over the request's AI Access connections (server/src/ai/routerBridge.ts) and
 * the browser builds one over /api/ai/run (src/desk/ai/aiRun.ts). Provider
 * choice, key rotation and fallback all happen behind it, in src/platform/router.
 */

export type CompletionTask =
  | "drafting" | "refinement" | "chat" | "summarisation" | "verification"
  | "rule_extraction" | "discovery" | "embedding" | "classification";

export interface CompletionCall {
  taskClass: CompletionTask;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  /** Asks for JSON where the provider supports it. */
  responseFormat?: "json";
  signal?: AbortSignal;
}

export interface CompletionOutcome {
  text: string;
  /** Who answered, for "AI used" displays. */
  provider: string;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

export type Completer = (call: CompletionCall) => Promise<CompletionOutcome>;

/**
 * An error that ends the whole operation instead of counting as one failed
 * step: no AI connected, or the call must continue in the browser. Multi-call
 * modules (coherence passes, review lenses) rethrow it rather than record it.
 */
export class CompletionInterrupted extends Error {}
