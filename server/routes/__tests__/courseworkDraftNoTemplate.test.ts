/**
 * P0-20: Coursework section drafting returns the AI's text or an honest
 * failure, never template prose.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const TEST_USER_ID = "33333333-3333-4333-8333-333333333333";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "coursework.draft@example.test" };
    next();
  },
}));

vi.mock("../../utils/llm.ts", () => ({
  callOpenRouterJSON: vi.fn(),
  callOpenRouterText: vi.fn(),
  getCandidates: () => [],
  buildAuthorizedPolicy: () => ({}),
  resolveRequestAiConfig: () => ({ candidates: [], isClientConfigured: false }),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { callOpenRouterText } from "../../utils/llm.ts";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_coursework_test";

// Phrases only the old template generator wrote.
const TEMPLATE_MARKERS = [/supplementary elaboration/i, /Zappos/i, /Schein/i];

async function createProject(): Promise<string> {
  const project = {
    projectId: "proj-coursework-draft-no-template",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: { assignment_question: "Discuss group work in organisations.", assignment_type: "essay" },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await getProjectStore().save(project as any);
  return project.projectId;
}

/** What callOpenRouterText does when there is no AI: send the 426 hand-off and throw. */
function handOffToBrowser() {
  vi.mocked(callOpenRouterText).mockImplementation(async (_req: any, res: any) => {
    res.status(426).json({ requireFrontendLLM: true, challengeToken: "t", systemPrompt: "s", userPrompt: "u" });
    throw new Error("RequireFrontendLLMException");
  });
}

beforeEach(() => {
  __resetProjectStoreForTests();
  vi.clearAllMocks();
});

describe("Coursework stream-section", () => {
  it("returns the AI's text as an event stream", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockResolvedValue("Group work shapes how teams decide.");
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("Group work shapes how teams decide.");
  });

  it("when every provider is out of credit, streams a labelled offline scaffold instead of dropping the request", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockRejectedValue(new Error("This account has no remaining credit or quota with the provider."));
    const res = await request(app)
      .post(`/api/projects/${id}/assignment/stream-section`)
      .send({ sectionTitle: "2.0 Group decisions", guidance: "Explain how groups decide.", keyPoints: ["Consensus versus majority"], allocatedWords: 300 });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("offline_scaffold");
    expect(res.text).toContain("Offline scaffold");
    expect(res.text).toContain("Consensus versus majority");
    for (const marker of TEMPLATE_MARKERS) expect(res.text).not.toMatch(marker);
  });

  it("never replaces existing text with a scaffold when a revision fails", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockRejectedValue(new Error("quota exhausted"));
    const res = await request(app)
      .post(`/api/projects/${id}/assignment/stream-section`)
      .send({ sectionTitle: "Intro", revisionPrompt: "expand", existingContent: "My own words." });
    expect(res.status).toBe(502);
    expect(res.text).not.toContain("Offline scaffold");
  });

  it("without the user's AI, hands off with a 426 instead of streaming template text", async () => {
    const id = await createProject();
    handOffToBrowser();
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(426);
    expect(res.body.requireFrontendLLM).toBe(true);
    for (const re of TEMPLATE_MARKERS) expect(res.text).not.toMatch(re);
  });

  it("an empty AI answer is a 502 with no draft", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockResolvedValue("   ");
    const res = await request(app).post(`/api/projects/${id}/assignment/stream-section`).send({ sectionTitle: "Introduction", targetWordCount: 300 });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("ai_unavailable");
    expect(res.body.draft).toBeUndefined();
  });
});

describe("Coursework draft-section", () => {
  it("an empty AI answer is a 502 with no draft", async () => {
    const id = await createProject();
    vi.mocked(callOpenRouterText).mockResolvedValue("");
    const res = await request(app).post(`/api/projects/${id}/assignment/draft-section`).send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(502);
    expect(res.body.draft).toBeUndefined();
  });

  it("without the user's AI, hands off with a 426", async () => {
    const id = await createProject();
    handOffToBrowser();
    const res = await request(app).post(`/api/projects/${id}/assignment/draft-section`).send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(426);
  });
});

describe("/api/drafting/section", () => {
  it("an empty AI answer is a 502, not a template draft", async () => {
    vi.mocked(callOpenRouterText).mockResolvedValue("");
    const res = await request(app).post("/api/drafting/section").send({ sectionTitle: "Introduction", assignmentQuestion: "Discuss group work." });
    expect(res.status).toBe(502);
    expect(res.body.draft).toBeUndefined();
    expect(res.body.isFallback).toBeUndefined();
  });

  it("without the user's AI, the 426 hand-off is the only response", async () => {
    handOffToBrowser();
    const res = await request(app).post("/api/drafting/section").send({ sectionTitle: "Introduction" });
    expect(res.status).toBe(426);
    expect(res.body.requireFrontendLLM).toBe(true);
  });
});
