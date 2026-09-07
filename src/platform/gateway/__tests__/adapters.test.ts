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

  it("sets responseMimeType when responseFormat is json", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
    });
    global.fetch = fetchMock;

    const adapter = getAdapter("gemini")!;
    await adapter.complete({
      provider: "gemini",
      apiKey: "k",
      taskClass: "drafting",
      userPrompt: "hi",
      responseFormat: "json",
      segments: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
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

  it("performs controlled fallback to next verified model on 404 model-not-found", async () => {
    const fetchMock = vi
      .fn()
      // First call fails with 404 (model not found)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "models/invalid-model is not found",
      })
      // Fallback call succeeds with 200
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "response from fallback model" }] } }],
        }),
      });
    global.fetch = fetchMock;

    const adapter = getAdapter("gemini")!;
    const result = await adapter.complete({
      provider: "gemini",
      model: "invalid-model",
      apiKey: "test-key",
      taskClass: "drafting",
      userPrompt: "test prompt",
      segments: [],
    });

    expect(result.text).toBe("response from fallback model");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("/models/invalid-model:generateContent");
    expect(fetchMock.mock.calls[1][0]).toContain("/models/gemini-2.5-flash:generateContent");
  });

  it("does NOT fall back on 401 or 403 authentication errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "API key not valid",
    });
    global.fetch = fetchMock;

    const adapter = getAdapter("gemini")!;
    await expect(
      adapter.complete({
        provider: "gemini",
        model: "gemini-2.5-flash",
        apiKey: "bad-key",
        taskClass: "drafting",
        userPrompt: "test prompt",
        segments: [],
      })
    ).rejects.toMatchObject({ status: 401 } as Partial<AdapterHttpError>);

    // Strictly 1 call — no inappropriate model hopping on auth failure
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

describe("platform/gateway/adapters: OpenAI-compatible", () => {
  it("sets response_format to json_object when responseFormat is json", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "{}" } }] }),
    });
    global.fetch = fetchMock;

    const adapter = getAdapter("openai")!;
    await adapter.complete({
      provider: "openai",
      apiKey: "k",
      taskClass: "drafting",
      userPrompt: "hi",
      responseFormat: "json",
      segments: [],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: "json_object" });
  });
});

describe("platform/gateway/adapters: getAdapter", () => {
  it("returns undefined for an unknown provider id", () => {
    expect(getAdapter("not-a-real-provider")).toBeUndefined();
  });
});

describe("platform/gateway/adapters: local runners", () => {
  it("Ollama — sends the native /api/chat shape, with no auth header at all", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { role: "assistant", content: "hello from ollama" } }),
    });
    global.fetch = fetchMock;

    const adapter = getAdapter("ollama")!;
    const result = await adapter.complete({
      provider: "ollama",
      apiKey: "",
      taskClass: "drafting",
      systemPrompt: "Be concise.",
      userPrompt: "say hi",
      model: "llama3.1:8b",
      segments: [],
    });

    expect(result.text).toBe("hello from ollama");
    expect(result.model).toBe("llama3.1:8b");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init.headers).not.toHaveProperty("Authorization");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("llama3.1:8b");
    expect(body.messages).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "say hi" },
    ]);
    expect(body.stream).toBe(false);
  });

  it("Ollama — throws AdapterHttpError with the status preserved on a failed request", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "model not loaded" });

    const adapter = getAdapter("ollama")!;
    await expect(
      adapter.complete({ provider: "ollama", apiKey: "", taskClass: "drafting", userPrompt: "hi", model: "llama3.1:8b", segments: [] })
    ).rejects.toMatchObject({ status: 500 } as Partial<AdapterHttpError>);
  });

  it("Ollama — refuses to guess a model when none was discovered/specified", async () => {
    global.fetch = vi.fn();
    const adapter = getAdapter("ollama")!;
    await expect(
      adapter.complete({ provider: "ollama", apiKey: "", taskClass: "drafting", userPrompt: "hi", segments: [] })
    ).rejects.toThrow(/no model specified/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Ollama — translates a timeout into a clear message rather than a raw AbortError", async () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    global.fetch = vi.fn().mockRejectedValue(abortError);

    const adapter = getAdapter("ollama")!;
    await expect(
      adapter.complete({ provider: "ollama", apiKey: "", taskClass: "drafting", userPrompt: "hi", model: "llama3.1:8b", segments: [] })
    ).rejects.toThrow(/did not respond within/i);
  });

  it("LM Studio (openai-compatible local) — sends the OpenAI chat shape to its own localhost port, no auth header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hello from lm studio" } }] }),
    });
    global.fetch = fetchMock;

    const adapter = getAdapter("lmstudio")!;
    const result = await adapter.complete({
      provider: "lmstudio",
      apiKey: "",
      taskClass: "drafting",
      userPrompt: "hi",
      model: "qwen2.5-7b",
      segments: [],
    });

    expect(result.text).toBe("hello from lm studio");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:1234/v1/chat/completions");
    expect(init.headers).not.toHaveProperty("Authorization");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("qwen2.5-7b");
  });

  it("every catalogued local runner id resolves to an adapter", async () => {
    const { LOCAL_RUNNERS } = await import("../../../config/localRunnerCatalog");
    for (const runner of LOCAL_RUNNERS) {
      expect(getAdapter(runner.id), `getAdapter("${runner.id}")`).toBeDefined();
    }
  });

  it("neither local adapter implements stream() — Studio's refine() never calls it, so nothing untested is shipped", () => {
    expect(getAdapter("ollama")!.stream).toBeUndefined();
    expect(getAdapter("lmstudio")!.stream).toBeUndefined();
  });
});
