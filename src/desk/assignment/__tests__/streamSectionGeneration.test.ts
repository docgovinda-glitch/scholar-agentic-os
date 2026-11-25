/**
 * P0-20: the Coursework drafting client uses the shared AI client (so the
 * user's AI settings and the browser hand-off apply) and never writes
 * stand-in text when drafting fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authedJsonFetch = vi.fn();
const executeAgenticLLM = vi.fn();
vi.mock("../../api/client", () => ({
  authedJsonFetch: (...args: unknown[]) => authedJsonFetch(...args),
  executeAgenticLLM: (...args: unknown[]) => executeAgenticLLM(...args),
}));

import { partialTextOf, SectionDraftStoppedError, streamSectionGeneration, type InternalSectionPlan } from "../services/invisibleChunkerService";

const section = { id: "s1", title: "Introduction", targetWordCount: 300 } as unknown as InternalSectionPlan;

function sse(lines: string[]): Response {
  return new Response(lines.map((l) => `data: ${l}\n\n`).join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function run(extra: { signal?: AbortSignal; continueFrom?: string } = {}) {
  const onChunk = vi.fn();
  const onComplete = vi.fn();
  const onError = vi.fn();
  const promise = streamSectionGeneration({ projectId: "p1", section, assignmentTopic: "Group work", onChunk, onComplete, onError, ...extra });
  return { promise, onChunk, onComplete, onError };
}

/** A stream that sends `lines`, then stays open until the request is aborted. */
function openStream(lines: string[], signal: AbortSignal): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      for (const l of lines) ctl.enqueue(enc.encode(`data: ${l}\n\n`));
      signal.addEventListener("abort", () => ctl.error(new DOMException("Aborted", "AbortError")), { once: true });
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

beforeEach(() => {
  authedJsonFetch.mockReset();
  executeAgenticLLM.mockReset();
});

/** The server asking the browser to run this prompt on the user's own model. */
const handOffEvent = JSON.stringify({
  requireFrontendLLM: true,
  challengeToken: "token-1",
  systemPrompt: "You are a writer.",
  userPrompt: "Write the introduction.",
  taskType: "drafting",
});

describe("streamSectionGeneration", () => {
  it("goes through the shared AI client and returns the AI's text", async () => {
    authedJsonFetch.mockResolvedValue(sse([JSON.stringify({ chunk: "Teams " }), JSON.stringify({ chunk: "decide." }), "[DONE]"]));
    const { promise, onComplete } = run();
    await expect(promise).resolves.toBe("Teams decide.");
    expect(authedJsonFetch).toHaveBeenCalledWith("/api/projects/p1/assignment/stream-section", "POST", expect.objectContaining({ sectionTitle: "Introduction" }), expect.anything());
    expect(onComplete).toHaveBeenCalledWith("Teams decide.", { scaffold: false });
  });

  it("a failed draft is an error with the server's message, and nothing is written", async () => {
    authedJsonFetch.mockResolvedValue(new Response(JSON.stringify({ error: "Section draft could not be generated." }), { status: 502 }));
    const { promise, onChunk, onComplete, onError } = run();
    await expect(promise).rejects.toThrow("Section draft could not be generated.");
    expect(onChunk).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it("no AI connected is an error, not stand-in prose", async () => {
    authedJsonFetch.mockResolvedValue(new Response(JSON.stringify({ requireFrontendLLM: true }), { status: 426 }));
    const { promise, onComplete } = run();
    await expect(promise).rejects.toThrow(/Connect an AI provider/);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("an empty stream is an error", async () => {
    authedJsonFetch.mockResolvedValue(sse(["[DONE]"]));
    const { promise, onComplete } = run();
    await expect(promise).rejects.toThrow(/no text/);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("a network failure is an error", async () => {
    authedJsonFetch.mockRejectedValue(new Error("network down"));
    const { promise, onComplete } = run();
    await expect(promise).rejects.toThrow("network down");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows the server's replacement text when the router switches model mid-answer", async () => {
    authedJsonFetch.mockResolvedValue(sse([JSON.stringify({ chunk: "Half an ans" }), JSON.stringify({ replace: "" }), JSON.stringify({ chunk: "A whole answer." }), "[DONE]"]));
    const { promise, onChunk } = run();
    await expect(promise).resolves.toBe("A whole answer.");
    expect(onChunk.mock.calls.map((c) => c[1])).toEqual(["Half an ans", "", "A whole answer."]);
  });

  it("Stop ends the request and hands back what had arrived, without retrying", async () => {
    const ctl = new AbortController();
    authedJsonFetch.mockImplementation(async (_u: string, _m: string, _b: unknown, o: { signal: AbortSignal }) => openStream([JSON.stringify({ chunk: "Teams decide " })], o.signal));
    const { promise, onChunk, onComplete } = run({ signal: ctl.signal });
    await vi.waitFor(() => expect(onChunk).toHaveBeenCalled());
    ctl.abort();
    const err = await promise.catch((e) => e);
    expect(err).toBeInstanceOf(SectionDraftStoppedError);
    expect(err.partialText).toBe("Teams decide ");
    expect(authedJsonFetch).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("a stream that fails after text arrived keeps that text on the error and is not retried", async () => {
    authedJsonFetch.mockResolvedValue(sse([JSON.stringify({ chunk: "Teams decide " }), JSON.stringify({ error: "The section draft stopped before it finished.", recoverable: true }), "[DONE]"]));
    const { promise } = run();
    const err = await promise.catch((e) => e);
    expect(err.message).toMatch(/stopped before it finished/);
    expect(partialTextOf(err)).toBe("Teams decide ");
    expect(authedJsonFetch).toHaveBeenCalledTimes(1);
  });

  it("a mid-stream hand-off runs the prompt on the user's own model and sends the answer back", async () => {
    authedJsonFetch
      .mockResolvedValueOnce(sse([handOffEvent, "[DONE]"]))
      .mockResolvedValueOnce(sse([JSON.stringify({ fullText: "Teams decide together." }), "[DONE]"]));
    executeAgenticLLM.mockImplementation(async (_s: string, _u: string, _t: string, onChunk: (c: string) => void) => {
      onChunk("Teams decide");
      return "Teams decide";
    });

    const { promise, onChunk, onComplete } = run();
    await expect(promise).resolves.toBe("Teams decide together.");

    // The prompt the server could not run went to the user's model as sent.
    expect(executeAgenticLLM).toHaveBeenCalledWith("You are a writer.", "Write the introduction.", "reasoning", expect.any(Function), undefined);
    // Its answer came back with the signed challenge, so the server can verify it.
    expect(authedJsonFetch.mock.calls[1][2]).toMatchObject({ llmResult: "Teams decide", challengeToken: "token-1" });
    // The local model's tokens were shown while it wrote.
    expect(onChunk).toHaveBeenCalledWith("Teams decide", "Teams decide");
    expect(onComplete).toHaveBeenCalledWith("Teams decide together.", { scaffold: false });
  });

  it("a hand-off the browser cannot answer is an error, not stand-in prose", async () => {
    authedJsonFetch.mockResolvedValue(sse([handOffEvent, "[DONE]"]));
    executeAgenticLLM.mockRejectedValue(new Error("Ollama is not reachable."));
    const { promise, onComplete } = run();
    await expect(promise).rejects.toThrow("Ollama is not reachable.");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("Resume sends the text to continue from", async () => {
    authedJsonFetch.mockResolvedValue(sse([JSON.stringify({ replace: "First part.\n\n" }), JSON.stringify({ chunk: "Second part." }), JSON.stringify({ fullText: "First part.\n\nSecond part." }), "[DONE]"]));
    const { promise } = run({ continueFrom: "First part." });
    await expect(promise).resolves.toBe("First part.\n\nSecond part.");
    expect(authedJsonFetch.mock.calls[0][2]).toMatchObject({ continueFrom: "First part." });
  });
});
