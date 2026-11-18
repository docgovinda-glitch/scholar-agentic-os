/**
 * Coursework AI routes wait on the model for a long time. They must save only
 * the answer keys they produced, so what the student saved meanwhile is kept
 * (they used to upsert the whole record they loaded before the AI call).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const TEST_USER_ID = "55555555-5555-4555-8555-555555555555";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "patch.tester@university.ac.uk" };
    next();
  },
}));
const routedCompletion = vi.fn();
vi.mock("../../src/ai/routerBridge.ts", async (orig) => ({
  ...(await orig<typeof import("../../src/ai/routerBridge.ts")>()),
  routedCompletion: (...a: unknown[]) => routedCompletion(...a),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { applyAnswersPatch } from "../../../src/services/store/types.ts";
import { changedAnswers } from "../project/assignment/helpers.ts";

const BRIEF =
  "BSc Business. Write a 1,500-word essay evaluating how a UK supermarket uses loyalty schemes to retain customers. Use Harvard referencing.";
const ID = "proj-patch-1";

async function seed(extra: Record<string, unknown> = {}) {
  await getProjectStore().save({
    projectId: ID,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: { assignment_brief: BRIEF, word_limit: "1500", ...extra },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
}

beforeEach(() => {
  __resetProjectStoreForTests();
  routedCompletion.mockReset();
});

describe("answer patches", () => {
  it("applyAnswersPatch sets keys, removes null keys and ignores undefined", () => {
    expect(applyAnswersPatch({ a: "1", b: "2", c: "3" } as any, { a: "x", b: null, c: undefined, d: "4" })).toEqual({ a: "x", c: "3", d: "4" });
  });

  it("changedAnswers lists only changed and removed keys", () => {
    expect(changedAnswers({ a: "1", b: { x: 1 }, c: "3" }, { a: "1", b: { x: 2 }, d: "4" })).toEqual({ b: { x: 2 }, c: null, d: "4" });
  });

  it("patchAnswers merges into the stored record and keeps other keys", async () => {
    await seed({ keep: "me" });
    const out = await getProjectStore().patchAnswers(ID, { assignment_thesis: "T", word_limit: null });
    expect(out?.answers).toMatchObject({ keep: "me", assignment_thesis: "T" });
    expect((await getProjectStore().get(ID))!.answers.word_limit).toBeUndefined();
  });

  it("a student's save made while the AI runs survives the route's save", async () => {
    await seed();
    routedCompletion.mockImplementation(async () => {
      // The student edits a setting while the model is thinking.
      await getProjectStore().patchAnswers(ID, { citation_style: "apa7", assignment_current_phase: "understand" });
      return JSON.stringify({
        task: "A 1,500-word essay on supermarket loyalty schemes.",
        requirements: [],
        constraints: {},
        criteria: [],
        missing: [],
      });
    });
    const res = await request(app).post(`/api/projects/${ID}/assignment/agent/extract`).send({});
    expect(res.status).toBe(200);
    const a = (await getProjectStore().get(ID))!.answers;
    expect(a.assignment_extraction).toBeTruthy();
    expect(a.citation_style).toBe("apa7");
    expect(a.assignment_current_phase).toBe("understand");
  });
});

describe("AI calls stop when the client goes away", () => {
  it("passes an abort signal that fires when the connection closes", async () => {
    await seed();
    let signal: AbortSignal | undefined;
    routedCompletion.mockImplementation(async (_req: unknown, call: { signal?: AbortSignal }) => {
      signal = call.signal;
      await new Promise<void>((resolve) => call.signal?.addEventListener("abort", () => resolve(), { once: true }));
      throw new Error("aborted");
    });
    const server = app.listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      const ctl = new AbortController();
      const pending = fetch(`http://127.0.0.1:${port}/api/projects/${ID}/assignment/agent/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: ctl.signal,
      }).catch(() => undefined);
      await vi.waitFor(() => expect(signal).toBeDefined());
      ctl.abort();
      await pending;
      await vi.waitFor(() => expect(signal?.aborted).toBe(true), { timeout: 2000 });
      // Nothing was saved for a request nobody is waiting for.
      expect((await getProjectStore().get(ID))!.answers.assignment_extraction).toBeUndefined();
    } finally {
      server.close();
    }
  });
});
