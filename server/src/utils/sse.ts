/**
 * Server-Sent Events plumbing, shared by every streaming route (Ask's chat
 * stream, Deep Research stages, Coursework drafting and Build, Journal
 * review). One place decides:
 *   - the headers (no caching or transforming; `X-Accel-Buffering: no` so
 *     proxies such as Render's pass events through at once), flushed with a
 *     first byte before any slow work starts;
 *   - a `: keep-alive` comment while the work is silent, so a proxy never
 *     drops an idle socket;
 *   - an abort signal that fires when the client goes away before the stream
 *     ended, so the model call stops too;
 *   - writes that are skipped once the response has ended or the socket is gone.
 * Each route keeps its own event format: `send(data)` writes a `data:` line
 * (Coursework, Deep Research), `send(data, "chunk")` a named event (Ask).
 */
import type { Response } from "express";

/** Interval of the `: keep-alive` comment while nothing else is written. */
export const SSE_HEARTBEAT_MS = 5000;

/** SSE headers, sent and flushed immediately (no buffering by proxies). */
export const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** The subset of an Express response the stream needs (lets the old llm.ts callers pass partial mocks). */
export type SseResponse = Pick<Response, "write"> &
  Partial<Pick<Response, "status" | "setHeader" | "flushHeaders" | "end" | "on" | "off" | "headersSent" | "writableEnded" | "writableFinished" | "destroyed">>;

export interface SseStream {
  /** One event: `data:` only, or with an `event:` name. Skipped once the stream is closed. */
  send(data: unknown, event?: string): void;
  /** Ends the stream (optionally after a final `data: [DONE]`). */
  close(opts?: { done?: boolean }): void;
  /** Aborted when the client goes away before the stream ended. */
  signal: AbortSignal;
}

const isOpen = (res: SseResponse) => !res.writableEnded && !res.destroyed;

/**
 * Opens the event stream on `res`: headers flushed with a first byte, a
 * heartbeat while silent, and an abort signal for a client that goes away.
 */
export function openSse(res: SseResponse, opts: { heartbeatMs?: number } = {}): SseStream {
  if (!res.headersSent) {
    res.status?.(200);
    for (const [name, value] of Object.entries(SSE_HEADERS)) res.setHeader?.(name, value);
    res.flushHeaders?.();
    // A first byte through every proxy straight away.
    res.write(": connected\n\n");
  }
  const abort = new AbortController();
  const ms = opts.heartbeatMs ?? SSE_HEARTBEAT_MS;
  const heartbeat = ms > 0 ? setInterval(() => isOpen(res) && res.write(": keep-alive\n\n"), ms) : undefined;
  // The timer never keeps the process alive on its own (a response that never closes).
  heartbeat?.unref?.();
  const stop = () => {
    if (heartbeat) clearInterval(heartbeat);
  };
  const onClose = () => {
    stop();
    if (!res.writableFinished && !res.writableEnded) abort.abort();
  };
  res.on?.("close", onClose);
  return {
    signal: abort.signal,
    send(data, event) {
      if (!isOpen(res)) return;
      res.write(`${event ? `event: ${event}\n` : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
    },
    close({ done = false } = {}) {
      stop();
      if (!isOpen(res)) return;
      if (done) res.write("data: [DONE]\n\n");
      res.end?.();
    },
  };
}
