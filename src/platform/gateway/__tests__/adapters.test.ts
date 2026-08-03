import { describe, it, expect, vi, afterEach } from "vitest";
import { getAdapter, AdapterHttpError } from "../adapters";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

/** Builds a Response-like object whose body streams SSE `data:` lines. */
function sseResponse(lines: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      }
      controller.close();
    },
  });
  return { ok: true, body: stream } as unknown as Response;
}

describe("platform/gateway/adapters: Gemini", () => {
  it("sends the request to the generateContent endpoint with the key as a query param, not a header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "hello from gemini" }] } }] }),
    });
    global.fetch = fetchMock;

    const adapter = getAdapter("gemini")!;
    const result = await adapter.complete({
      provider: "gemini",
      apiKey: "AIza-test",
      taskClass: "drafting",
      userPrompt: "say hi",
      segments: [],
    });

    expect(result.text).toBe("hello from gemini");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(":generateContent");
    expect(url).toContain("key=AIza-test");
    expect(init.headers).not.toHaveProperty("Authorization");
  });

  it("streams deltas via onChunk and returns the concatenated text", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      sseResponse([
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hel" }] } }] }),
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "lo" }] } }] }),
      ])
    );

    const adapter = getAdapter("gemini")!;
    const chunks: string[] = [];
    const result = await adapter.stream!(
      { provider: "gemini", apiKey: "k", taskClass: "drafting", userPrompt: "hi", segments: [] },
      (delta) => chunks.push(delta)
    );

    expect(chunks).toEqual(["Hel", "lo"]);
    expect(result.text).toBe("Hello");
  });

  it("throws AdapterHttpError with the status preserved on a failed request", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "quota exceeded",
    });

    const adapter = getAdapter("gemini")!;
    await expect(
      adapter.complete({ provider: "gemini", apiKey: "k", taskClass: "drafting", userPrompt: "hi", segments: [] })
    ).rejects.toMatchObject({ status: 429 } as Partial<AdapterHttpError>);
  });
});

describe("platform/gateway/adapters: Cohere", () => {
  it("maps systemPrompt to preamble and trims the response text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "  trimmed response  " }),
    });
    global.fetch = fetchMock;

    const adapter = getAdapter("cohere")!;
    const result = await adapter.complete({
      provider: "cohere",
      apiKey: "co-test",
      taskClass: "drafting",
      systemPrompt: "Be concise.",
      userPrompt: "hi",
      segments: [],
    });

    expect(result.text).toBe("trimmed response");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.preamble).toBe("Be concise.");
    expect(body.message).toBe("hi");
  });

  it("has no stream() — the gateway falls back to complete() for this provider", () => {
    const adapter = getAdapter("cohere")!;
    expect(adapter.stream).toBeUndefined();
  });
});

describe("platform/gateway/adapters: getAdapter", () => {
  it("returns undefined for an unknown provider id", () => {
    expect(getAdapter("not-a-real-provider")).toBeUndefined();
  });
});
