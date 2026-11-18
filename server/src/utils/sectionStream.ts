/**
 * Coursework section drafting (`/stream-section`): its event format and the
 * messages a student reads when a stream fails. The stream plumbing (headers,
 * heartbeat, abort on close) is the shared `./sse.ts`.
 *
 * Events (`data: {...}`): `chunk` (model tokens, appended as they arrive),
 * `replace` (set the shown text, e.g. when the router switched model and
 * dropped a partial answer), `fullText` (the final, cleaned text), `fallback`,
 * `error`; then `[DONE]`.
 */
import {
  AI_PROVIDER_REQUIRED_MESSAGE,
  BrowserAiRequiredError,
  InvalidLlmChallengeError,
  LOCAL_MODEL_UNREACHABLE_MESSAGE,
  LocalModelUnreachableError,
  NoClientAiProviderError,
  UnusableAiResponseError,
} from "../ai/aiRouteErrors.ts";

/** How many paragraphs a section of this length should have (2-4). */
export function paragraphRange(targetWords: number): string {
  if (targetWords <= 180) return "2";
  if (targetWords <= 300) return "2-3";
  return "3-4";
}

/** What the student reads when a stream fails after it opened. */
export function streamErrorMessage(err: unknown, handedOff = false): string {
  if (handedOff || err instanceof BrowserAiRequiredError) {
    return "Your connected cloud models could not answer and the next model in your chain runs in the browser. Choose a cloud model in AI Access or open the app where your local model runs, then try again.";
  }
  if (err instanceof InvalidLlmChallengeError) return "The AI request could not be verified. Try again.";
  if (err instanceof LocalModelUnreachableError) return LOCAL_MODEL_UNREACHABLE_MESSAGE;
  if (err instanceof NoClientAiProviderError) return AI_PROVIDER_REQUIRED_MESSAGE;
  if (err instanceof UnusableAiResponseError) return "The AI returned an empty answer for this section. Nothing was written. Try again.";
  return "The section draft stopped before it finished. Nothing was overwritten. Try again.";
}
