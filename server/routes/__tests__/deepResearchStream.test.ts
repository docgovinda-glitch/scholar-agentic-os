/**
 * Deep Research over SSE: stage events flow as they happen, and a failure
 * after the stream opened is an `{ type: "error" }` event with the reason,
 * never a dropped socket or a JSON body on a stream.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "88888888-8888-4888-8888-888888888888", email: "deep.tester@university.ac.uk" };
    next();
  },
}));
vi.mock("../../src/ai/routerBridge.ts", async (orig) => ({
  ...(await orig<typeof import("../../src/ai/routerBridge.ts")>()),
  aiAvailability: async () => "server",
}));
const executeDeepResearch = vi.fn();
vi.mock("../../src/research/deepResearchEngine.ts", async (orig) => ({
  ...(await orig<typeof import("../../src/research/deepResearchEngine.ts")>()),
  executeDeepResearch: (...a: unknown[]) => executeDeepResearch(...a),
}));

import express from "express";
import request from "supertest";
import { registerAIRoutes } from "../ai.ts";

function app() {
  const a = express();
  a.use(express.json());
  registerAIRoutes(a);
  return a;
}
const events = (body: string) =>
  body
    .split("\n\n")
    .filter((l) => l.startsWith("data: {"))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);

describe("Deep Research stream", () => {
  it("streams stages, then an error event when the research fails mid-way", async () => {
    executeDeepResearch.mockImplementation(async (_p: string, _llm: unknown, onStage?: (s: string, st: string) => void) => {
      onStage?.("running", "search");
      throw new Error("All connected AI models failed. Last error: 500");
    });
    const res = await request(app()).post("/api/ai/agent").set("Accept", "text/event-stream").send({ prompt: "Effects of loyalty schemes on retention", mode: "deep-research" });
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["x-accel-buffering"]).toBe("no");
    const ev = events(res.text);
    expect(ev[0]).toMatchObject({ type: "stage", status: "running", stage: "search" });
    expect(ev.at(-1)).toMatchObject({ type: "error" });
    expect(String(ev.at(-1)!.message)).toMatch(/All connected AI models failed/);
  });

  it("streams the live activity feed and the report's words, then the finished report", async () => {
    executeDeepResearch.mockReset();
    executeDeepResearch.mockImplementation(async (_p: string, _llm: unknown, _onStage: unknown, _f: unknown, _i: unknown, _v: unknown, _s: unknown, options: {
      onActivity?: (a: { kind: string; text: string }) => void;
      onReportToken?: (t: string) => void;
      onReportReset?: () => void;
    }) => {
      options.onActivity?.({ kind: "search", text: "loyalty schemes retention" });
      options.onActivity?.({ kind: "read", text: "Loyalty and churn · Journal of Retailing" });
      options.onReportToken?.("Loyalty ");
      options.onReportReset?.();
      options.onReportToken?.("Loyalty schemes raise retention [1].");
      return {
        topic: "t", plan: [], researchPlan: { topic: "t", objectives: [], subQuestions: [] }, stages: [], evidence: [],
        consensusClaims: [], divergentClaims: [], synthesizedReport: "Loyalty schemes raise retention [1].",
        allCitations: [{ title: "Loyalty and churn", url: "https://example.org/a", snippet: "", domain: "example.org", sourceType: "scholarly", claimPassages: [{ claim: "Loyalty schemes raise retention", key: "k", passage: "Members stayed longer." }] }],
        followUps: [], completedAt: "2026-11-27T00:00:00Z",
      };
    });
    const res = await request(app()).post("/api/ai/agent").set("Accept", "text/event-stream").send({ prompt: "Effects of loyalty schemes on retention", mode: "deep-research" });
    const ev = events(res.text);
    expect(ev.map((e) => e.type)).toEqual(["activity", "activity", "token", "reset", "token", "complete"]);
    expect(ev[0]).toMatchObject({ kind: "search", text: "loyalty schemes retention" });
    const payload = ev.at(-1)!.payload as { citations: Array<{ claimPassages?: unknown[] }> };
    expect(payload.citations[0].claimPassages).toHaveLength(1);
  });

  it("passes the researcher's excluded sources to the engine, trimmed and capped", async () => {
    executeDeepResearch.mockReset();
    executeDeepResearch.mockImplementation(async () => {
      throw new Error("stop");
    });
    await request(app())
      .post("/api/ai/agent")
      .set("Accept", "text/event-stream")
      .send({
        prompt: "Compare Wendt and Mearsheimer",
        mode: "deep-research",
        excludedSources: [{ title: " Offensive Realism Revisited ", doi: "10.1017/b2" }, { nothing: true }, "junk", null],
      });
    const options = executeDeepResearch.mock.calls.at(-1)![7] as { excludedSources: unknown[] };
    expect(options.excludedSources).toEqual([{ title: "Offensive Realism Revisited", doi: "10.1017/b2", url: undefined }]);
  });
});
