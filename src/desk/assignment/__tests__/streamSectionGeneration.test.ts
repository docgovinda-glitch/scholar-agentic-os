/**
 * P0-20: the Coursework drafting client uses the shared AI client (so the
 * user's AI settings and the browser hand-off apply) and never writes
 * stand-in text when drafting fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const authedJsonFetch = vi.fn();
vi.mock("../../api/client", () => ({ authedJsonFetch: (...args: unknown[]) => authedJsonFetch(...args) }));

import { streamSectionGeneration, type InternalSectionPlan } from "../services/invisibleChunkerService";

const section = { id: "s1", title: "Introduction", targetWordCount: 300 } as unknown as InternalSectionPlan;

function sse(lines: string[]): Response {
  return new Response(lines.map((l) => `data: ${l}\n\n`).join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function run() {
  const onChunk = vi.fn();
  const onComplete = vi.fn();
  const onError = vi.fn();
  const promise = streamSectionGeneration({ projectId: "p1", section, assignmentTopic: "Group work", onChunk, onComplete, onError });
  return { promise, onChunk, onComplete, onError };
}

beforeEach(() => {
  authedJsonFetch.mockReset();
});

describe("streamSectionGeneration", () => {
  it("goes through the shared AI client and returns the AI's text", async () => {
    authedJsonFetch.mockResolvedValue(sse([JSON.stringify({ chunk: "Teams " }), JSON.stringify({ chunk: "decide." }), "[DONE]"]));
    const { promise, onComplete } = run();
    await expect(promise).resolves.toBe("Teams decide.");
    expect(authedJsonFetch).toHaveBeenCalledWith("/api/projects/p1/assignment/stream-section", "POST", expect.objectContaining({ sectionTitle: "Introduction" }));
    expect(onComplete).toHaveBeenCalledWith("Teams decide.");
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
});
