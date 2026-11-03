/**
 * The coursework outline is written by the student's AI from the brief, and
 * revised on request without losing written text. With no AI, the starter
 * outline is used and marked as such; the analysis never invents marking
 * criteria the brief does not state.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

export const TEST_USER_ID = "33333333-3333-4333-8333-333333333333";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "outline.tester@university.ac.uk" };
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

const BRIEF =
  "MSc Marketing. Write a 2,500-word report evaluating how a UK retailer of your choice uses social media to build customer engagement. Use Harvard referencing.";
const AI = JSON.stringify({
  thesis: "Social media mainly serves customer service.",
  sections: [
    { title: "Introduction", subsections: [{ title: "Purpose of the report", words: 250 }] },
    { title: "Engagement on social media", subsections: [{ title: "Channels and content", words: 900 }, { title: "Engagement evaluated", words: 900 }] },
    { title: "Recommendations", subsections: [{ title: "What should change", words: 450 }] },
  ],
});

async function project(extra: Record<string, unknown> = {}) {
  const p = {
    projectId: "proj-outline-1",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: { assignment_question: BRIEF, assignment_brief_text: BRIEF, assignment_type: "report", word_count: 2500, targetWordCount: 2500, citation_style: "harvard", ...extra },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;
  await getProjectStore().save(p);
  return p.projectId as string;
}

beforeEach(() => {
  __resetProjectStoreForTests();
  routedCompletion.mockReset();
});

describe("coursework outline by the student's AI", () => {
  it("builds the outline from the whole brief and saves it", async () => {
    routedCompletion.mockResolvedValue(AI);
    const id = await project();
    const res = await request(app).post(`/api/projects/${id}/assignment/outline`).send({});
    expect(res.status).toBe(200);
    expect(res.body.structure.source).toBe("ai");
    expect(res.body.structure.headings.map((h: any) => h.title)).toEqual(["Introduction", "Engagement on social media", "Recommendations"]);
    const words = res.body.structure.headings.flatMap((h: any) => h.subheadings).reduce((a: number, s: any) => a + s.targetWordCount, 0);
    expect(words).toBe(2500);
    const prompt = routedCompletion.mock.calls[0][1].userPrompt as string;
    expect(prompt).toMatch(/UK retailer/);
    expect(prompt).toMatch(/SUBJECT AREA: Business/);
    const saved = await getProjectStore().get(id);
    expect(JSON.parse(String(saved!.answers.assignment_structure)).source).toBe("ai");
  });

  it("revises on request and keeps text already written", async () => {
    routedCompletion.mockResolvedValue(AI);
    const id = await project({
      assignment_internal_sections: JSON.stringify([
        { id: "w1", title: "2.1 Channels and content", draftContent: "Tesco posts daily.", currentWordCount: 3, targetWordCount: 500 },
        { id: "w2", title: "3.1 Pricing", draftContent: "Prices matter.", currentWordCount: 2, targetWordCount: 300 },
      ]),
    });
    const res = await request(app).post(`/api/projects/${id}/assignment/outline`).send({ instruction: "add a section on ethics" });
    expect(res.status).toBe(200);
    expect(routedCompletion.mock.calls[0][1].userPrompt).toMatch(/The student asks: add a section on ethics/);
    const subs = res.body.structure.headings.flatMap((h: any) => h.subheadings);
    expect(subs.find((s: any) => s.id === "w1").draftContent).toBe("Tesco posts daily.");
    expect(subs.find((s: any) => s.id === "w2").draftContent).toBe("Prices matter.");
  });

  it("refuses without a brief, and reports an unusable AI answer without saving", async () => {
    const empty = await project({ assignment_question: "", assignment_brief_text: "" });
    expect((await request(app).post(`/api/projects/${empty}/assignment/outline`).send({})).status).toBe(400);
    __resetProjectStoreForTests();
    routedCompletion.mockResolvedValue("I cannot help with that.");
    const id = await project();
    const res = await request(app).post(`/api/projects/${id}/assignment/outline`).send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await getProjectStore().get(id))!.answers.assignment_structure).toBeUndefined();
  });

  it("analysis marks a starter outline when no AI answers, and invents no marking criteria", async () => {
    routedCompletion.mockRejectedValue(new Error("No AI providers are configured"));
    const id = await project();
    const res = await request(app).post(`/api/projects/${id}/assignment/analyze`).send({ briefText: BRIEF, question: BRIEF, targetWordCount: 2500, assignmentType: "report" });
    expect(res.status).toBe(200);
    expect(res.body.outlineSource).toBe("starter");
    expect(res.body.outlineNote).toMatch(/starter outline/);
    expect(JSON.stringify(res.body)).not.toMatch(/First Class \(70%\+\)|Upper Second \(60–69%\)/);
  });
});
