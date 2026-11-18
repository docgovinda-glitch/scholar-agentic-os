import { describe, it, expect } from "vitest";
import { readSse, type SseMessage } from "../sseReader";

/** A body delivered in the given pieces (events may be split anywhere). */
function body(pieces: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const p of pieces) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

async function read(pieces: string[]): Promise<SseMessage[]> {
  const out: SseMessage[] = [];
  await readSse(body(pieces), (m) => {
    out.push(m);
  });
  return out;
}

describe("readSse", () => {
  it("reads data-only and named events, split across chunks, ignoring keep-alive comments", async () => {
    const out = await read([": connected\n\ndata: {\"ch", "unk\":\"a\"}\n\n: keep-alive\n\nevent: chunk\ndata: {\"token\":\"b\"}\n", "\ndata: [DONE]\n\n"]);
    expect(out).toEqual([
      { data: { chunk: "a" }, json: true, raw: '{"chunk":"a"}' },
      { event: "chunk", data: { token: "b" }, json: true, raw: '{"token":"b"}' },
      { data: "[DONE]", json: false, raw: "[DONE]" },
    ]);
  });

  it("applies an event name to its own event only", async () => {
    const out = await read(["event: status\ndata: {\"m\":1}\n\ndata: {\"m\":2}\n\n"]);
    expect(out.map((m) => m.event)).toEqual(["status", undefined]);
  });

  it("joins multi-line data, handles CRLF, and delivers a last event with no blank line after it", async () => {
    const out = await read(["data: line one\r\ndata: line two\r\n\r\n", "data: {\"last\":true}"]);
    expect(out[0].raw).toBe("line one\nline two");
    expect(out[1].data).toEqual({ last: true });
  });

  it("throws a failed read to the caller", async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode("data: {\"a\":1}\n\n"));
        c.error(new DOMException("Aborted", "AbortError"));
      },
    });
    const seen: unknown[] = [];
    await expect(readSse(failing, (m) => void seen.push(m.data))).rejects.toThrow(/Aborted/);
  });
});
