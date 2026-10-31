import type { RouterEvent } from "./types";

/** Minimal shapes so this compiles without framework types; Express req/res satisfy them. */
type SseRequest = unknown;
interface SseResponse {
  writeHead(status: number, headers: Record<string, string>): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?(): void;
  on(event: "close", fn: () => void): void;
  readonly writableFinished?: boolean;
}

/**
 * Streams router events as SSE. One `event:` per router event type, a heartbeat
 * every 15 s so proxies don't cut idle streams, and a closed connection aborts
 * the upstream model call (no token spend after the user leaves or cancels).
 */
export async function pipeToSse(req: SseRequest, res: SseResponse, run: (signal: AbortSignal) => AsyncGenerator<RouterEvent>): Promise<void> {
  const ctl = new AbortController();
  // The *response* closing before we finished means the client went away.
  // (A request emits "close" as soon as its body is read, so it can't be used.)
  res.on("close", () => { if (!res.writableFinished) ctl.abort(new Error("client closed")); });
  void req;
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
  let id = 0;
  try {
    for await (const ev of run(ctl.signal)) {
      res.write(`id: ${++id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    }
  } catch (err) {
    // A router bug must still reach the user as an error, never as a stream that just stops.
    const message = err instanceof Error ? err.message : "Unexpected router failure";
    res.write(`event: error\ndata: ${JSON.stringify({ type: "error", code: "non_retryable", message, trace: [] })}\n\n`);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}
