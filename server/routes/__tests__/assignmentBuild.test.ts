/**
 * POST /assignment/build: one server job reads the brief and plans it (Extract,
 * then Understand with the outline), reports progress as events, saves each
 * result as it is ready, and does not run again for an unchanged brief.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const TEST_USER_ID = "66666666-6666-4666-8666-666666666666";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "build.tester@university.ac.uk" };
    next();
  },
}));
const routedCompletion = vi.fn();
const aiAvailability = vi.fn(async () => "server");
vi.mock("../../src/ai/routerBridge.ts", async (orig) => ({
  ...(await orig<typeof import("../../src/ai/routerBridge.ts")>()),
  routedCompletion: (...a: unknown[]) => routedCompletion(...a),
  aiAvailability: (...a: unknown[]) => aiAvailability(...(a as [])),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";

const BRIEF =
  "BSc Business. Q1. Evaluate how loyalty schemes shape customer retention in UK supermarkets. [40 Marks] Q2. Recommend how one supermarket should redesign its scheme. [60 Marks] Write 1,500 words. Use Harvard referencing.";
const ID = "proj-build-1";

const EXTRACTION = {
  task: "A 1,500-word report on loyalty schemes.",
  requirements: [{ text: "Use Harvard referencing", quote: "Use Harvard referencing", kind: "referencing" }],
  constraints: { wordCount: 1500, citationStyle: "Harvard" },
  criteria: [],
  questions: [{ text: "Evaluate how loyalty schemes shape customer retention", quote: "Evaluate how loyalty schemes shape customer retention in UK supermarkets" }],
  missing: [],
};
const UNDERSTANDING = {
  discipline: "Business",
  assignmentType: "report",
  produce: "A report that evaluates schemes and recommends a redesign.",
  approach: "Evidence on retention, then a recommendation.",
  structure: "Two parts, one per question.",
  criteria: [],
  knowledgeGaps: [],
  searchQueries: ["loyalty schemes retention"],
  thesisDirection: "Loyalty schemes may retain customers through personalisation.",
  blockers: [],
};
const OUTLINE = {
  thesisOptions: [{ statement: "Personalised rewards, not points, drive retention in UK grocery loyalty schemes.", angle: "Personalisation" }],
  sections: [
    { title: "How loyalty schemes retain shoppers", questionRef: "Q1", purpose: "Answer Q1.", subsections: [{ title: "Evidence on retention", words: 600 }] },
    { title: "Redesigning the scheme", questionRef: "Q2", purpose: "Answer Q2.", subsections: [{ title: "Recommendations", words: 900 }] },
  ],
};

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
const saved = async () => (await getProjectStore().get(ID))!.answers as Record<string, unknown>;
const events = (body: string) =>
  body
    .split("\n\n")
    .filter((l) => l.startsWith("data: {"))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);

function aiAnswersInOrder() {
  routedCompletion
    .mockResolvedValueOnce(JSON.stringify(EXTRACTION))
    .mockResolvedValueOnce(JSON.stringify(UNDERSTANDING))
    .mockResolvedValueOnce(JSON.stringify(OUTLINE));
}

beforeEach(() => {
  __resetProjectStoreForTests();
  routedCompletion.mockReset();
  aiAvailability.mockReset();
  aiAvailability.mockResolvedValue("server");
});

describe("POST /assignment/build", () => {
  it("reads the brief, plans it and writes the outline in three AI calls, reporting each step", async () => {
    await seed();
    aiAnswersInOrder();
    const res = await request(app).post(`/api/projects/${ID}/assignment/build`).send({});
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    const ev = events(res.text);
    expect(ev.map((e) => (e.done ? "done" : `${e.step}:${e.status}`))).toEqual([
      "extract:running",
      "extract:done",
      "understand:running",
      "understand:done",
      "done",
    ]);
    expect(routedCompletion).toHaveBeenCalledTimes(3);
    const a = await saved();
    expect(a.assignment_extraction).toBeTruthy();
    expect(a.assignment_understanding).toBeTruthy();
    const structure = JSON.parse(String(a.assignment_structure));
    expect(structure.headings.map((h: { title: string }) => h.title)).toEqual(["How loyalty schemes retain shoppers", "Redesigning the scheme"]);
    expect(structure.thesisOptions[0].statement).toMatch(/Personalised rewards/);
    expect(a.assignment_thesis).toMatch(/Personalised rewards/);
    expect(JSON.parse(String(a.assignment_build))).toMatchObject({ state: "done" });
    // The outline prompt carries the brief's questions and marks as guidance.
    expect(routedCompletion.mock.calls[2][1].userPrompt).toMatch(/Q2: .*\(60 marks\)/);
  });

  it("does not call the AI again for an unchanged brief, unless forced", async () => {
    await seed();
    aiAnswersInOrder();
    await request(app).post(`/api/projects/${ID}/assignment/build`).send({});
    routedCompletion.mockClear();
    const again = await request(app).post(`/api/projects/${ID}/assignment/build`).send({});
    expect(events(again.text).at(-1)).toMatchObject({ done: true, cached: true });
    expect(routedCompletion).not.toHaveBeenCalled();

    aiAnswersInOrder();
    await request(app).post(`/api/projects/${ID}/assignment/build`).send({ force: true });
    expect(routedCompletion).toHaveBeenCalledTimes(3);
  });

  it("keeps the student's own thesis", async () => {
    await seed({ assignment_thesis: "My own thesis about loyalty." });
    aiAnswersInOrder();
    await request(app).post(`/api/projects/${ID}/assignment/build`).send({});
    expect((await saved()).assignment_thesis).toBe("My own thesis about loyalty.");
  });

  it("reports a failed step, saves what finished, and marks the build failed", async () => {
    await seed();
    routedCompletion.mockResolvedValueOnce(JSON.stringify(EXTRACTION)).mockRejectedValueOnce(new Error("All connected AI models failed. Last error: 500"));
    const res = await request(app).post(`/api/projects/${ID}/assignment/build`).send({});
    const last = events(res.text).at(-1)!;
    expect(last).toMatchObject({ step: "understand", recoverable: true });
    expect(String(last.error)).toMatch(/All connected AI models failed/);
    const a = await saved();
    expect(a.assignment_extraction).toBeTruthy();
    expect(a.assignment_structure).toBeUndefined();
    expect(JSON.parse(String(a.assignment_build))).toMatchObject({ state: "failed", step: "understand" });
  });

  it("refuses a second build while one runs", async () => {
    await seed();
    let release!: () => void;
    routedCompletion.mockImplementationOnce(() => new Promise((r) => (release = () => r(JSON.stringify(EXTRACTION)))));
    routedCompletion.mockResolvedValueOnce(JSON.stringify(UNDERSTANDING)).mockResolvedValueOnce(JSON.stringify(OUTLINE));
    const first = request(app).post(`/api/projects/${ID}/assignment/build`).send({}).then((r) => r);
    await vi.waitFor(() => expect(routedCompletion).toHaveBeenCalledTimes(1));
    const second = await request(app).post(`/api/projects/${ID}/assignment/build`).send({});
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("build_running");
    release();
    expect((await first).status).toBe(200);
  });

  it("says when no AI is connected, before streaming", async () => {
    await seed();
    aiAvailability.mockResolvedValue("none");
    const res = await request(app).post(`/api/projects/${ID}/assignment/build`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ai_provider_required");
  });
});
