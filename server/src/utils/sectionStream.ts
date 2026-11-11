/**
 * Server-Sent Events plumbing for Coursework section drafting (`/stream-section`).
 *
 * The stream opens before the model call so a slow provider never leaves the
 * socket silent (proxies drop silent sockets, which the browser reports as
 * "TypeError: Failed to fetch"); a comment heartbeat keeps it alive, and once
 * open, failures are sent as `{ error, recoverable: true }` events.
 */
import type { Response } from "express";
import {
  AI_PROVIDER_REQUIRED_MESSAGE,
  BrowserAiRequiredError,
  InvalidLlmChallengeError,
  LOCAL_MODEL_UNREACHABLE_MESSAGE,
  LocalModelUnreachableError,
  NoClientAiProviderError,
  UnusableAiResponseError,
} from "../ai/aiRouteErrors.ts";

/** Interval of the `: keep-alive` comment while the model is still answering. */
export const SSE_HEARTBEAT_MS = 5000;

/** SSE headers, sent and flushed immediately (no buffering by proxies). */
export const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function openSseStream(res: Response): void {
  res.status(200);
  for (const [name, value] of Object.entries(SSE_HEADERS)) res.setHeader(name, value);
  res.flushHeaders?.();
  // A first byte through every proxy straight away.
  res.write(": connected\n\n");
}

/**
 * Cut text into chunks of `wordsPerChunk` words, keeping every whitespace run
 * exactly as written, so blank lines between paragraphs survive streaming.
 * `chunks.join("") === text`.
 */
export function chunkPreservingWhitespace(text: string, wordsPerChunk = 5): string[] {
  if (!text) return [];
  const tokens = text.split(/(\s+)/);
  const chunks: string[] = [];
  let current = "";
  let words = 0;
  for (const token of tokens) {
    if (!token) continue;
    const isWord = !/^\s+$/.test(token);
    if (isWord && words >= wordsPerChunk) {
      chunks.push(current);
      current = "";
      words = 0;
    }
    current += token;
    if (isWord) words += 1;
  }
  if (current) chunks.push(current);
  return chunks;
}

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
