/**
 * Deep Research streams its stages; a failure after the stream opened arrives
 * as an `{ type: "error" }` event and is reported, never read as a broken
 * JSON body.
 */
import { describe, it, expect, vi } from "vitest";

const authedFetch = vi.fn();
vi.mock("../client", () => ({ authedFetch: (...a: unknown[]) => authedFetch(...a), authedJsonFetch: vi.fn() }));

import { executeAgenticQuery } from "../agenticApi";

const sse = (events: object[]) =>
  new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "Content-Type": "text/event-stream" } });

describe("Deep Research stream", () => {
  it("reports each stage and returns the final payload", async () => {
    authedFetch.mockResolvedValue(sse([{ type: "stage", status: "running", stage: "search" }, { type: "complete", payload: { ok: true, text: "Report." } }]));
    const stages: unknown[] = [];
    const out = await executeAgenticQuery({ prompt: "q", mode: "deep-research", onStageUpdate: (s: unknown) => stages.push(s) } as never);
    expect(out).toMatchObject({ ok: true, text: "Report." });
    expect(stages).toEqual([{ status: "running", stage: "search" }]);
  });

  it("throws the server's message when the stream ends with an error event", async () => {
    authedFetch.mockResolvedValue(sse([{ type: "stage", status: "running", stage: "search" }, { type: "error", message: "Deep research stopped: All connected AI models failed." }]));
    await expect(executeAgenticQuery({ prompt: "q", mode: "deep-research", onStageUpdate: () => {} } as never)).rejects.toThrow(/All connected AI models failed/);
  });

  it("says the research stopped when the stream ends without a result", async () => {
    authedFetch.mockResolvedValue(sse([{ type: "stage", status: "running", stage: "search" }]));
    await expect(executeAgenticQuery({ prompt: "q", mode: "deep-research", onStageUpdate: () => {} } as never)).rejects.toThrow(/stopped before it finished/);
  });
});
