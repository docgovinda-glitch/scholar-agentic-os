import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { openSse, SSE_HEADERS, SSE_HEARTBEAT_MS } from "../sse";

function fakeRes() {
  const calls: string[] = [];
  const headers: Record<string, string> = {};
  const ee = new EventEmitter();
  const res = {
    headersSent: false,
    writableEnded: false,
    writableFinished: false,
    destroyed: false,
    status: vi.fn(() => res),
    setHeader: (k: string, v: string) => {
      headers[k] = v;
      calls.push(`header:${k}`);
    },
    flushHeaders: () => calls.push("flush"),
    write: (s: string) => {
      calls.push(`write:${s}`);
      return true;
    },
    end: () => {
      res.writableEnded = true;
      res.writableFinished = true;
      calls.push("end");
      ee.emit("close");
    },
    on: (e: string, f: () => void) => ee.on(e, f),
  };
  return { res, calls, headers, ee };
}

afterEach(() => vi.useRealTimers());

describe("shared SSE plumbing", () => {
  it("sets the headers and flushes a first byte before any work", () => {
    const { res, calls, headers } = fakeRes();
    openSse(res as never);
    expect(headers).toEqual(SSE_HEADERS);
    expect(headers["Cache-Control"]).toBe("no-cache, no-transform");
    expect(headers["X-Accel-Buffering"]).toBe("no");
    expect(calls.indexOf("flush")).toBeGreaterThan(calls.lastIndexOf("header:X-Accel-Buffering"));
    expect(calls.at(-1)).toBe("write:: connected\n\n");
  });

  it("writes data-only and named events, a heartbeat while silent, and nothing after close", () => {
    vi.useFakeTimers();
    const { res, calls } = fakeRes();
    const sse = openSse(res as never);
    sse.send({ chunk: "a" });
    sse.send({ token: "b" }, "chunk");
    vi.advanceTimersByTime(SSE_HEARTBEAT_MS);
    expect(calls).toContain('write:data: {"chunk":"a"}\n\n');
    expect(calls).toContain('write:event: chunk\ndata: {"token":"b"}\n\n');
    expect(calls).toContain("write:: keep-alive\n\n");
    sse.close({ done: true });
    expect(calls.slice(-2)).toEqual(["write:data: [DONE]\n\n", "end"]);
    sse.send({ late: true });
    vi.advanceTimersByTime(SSE_HEARTBEAT_MS * 2);
    expect(calls.at(-1)).toBe("end");
    // A normal end is not a client going away.
    expect(sse.signal.aborted).toBe(false);
  });

  it("aborts when the client goes away first", () => {
    const { res, ee } = fakeRes();
    const sse = openSse(res as never);
    ee.emit("close");
    expect(sse.signal.aborted).toBe(true);
  });
});
