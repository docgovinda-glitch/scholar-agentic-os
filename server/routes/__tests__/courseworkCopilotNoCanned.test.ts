/**
 * The Coursework Copilot answers with the student's AI or reports that it
 * could not: no keyword-triggered canned advice is ever sent as the AI's reply.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const TEST_USER_ID = "44444444-4444-4444-8444-444444444444";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "coursework.copilot@example.test" };
    next();
  },
}));

vi.mock("../../utils/llm.ts", () => ({
  callOpenRouterJSON: vi.fn(),
  callOpenRouterText: vi.fn(),
  handOffBeforeStream: vi.fn(async () => false),
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

const ID = "proj-coursework-copilot";
async function createProject() {
  await getProjectStore().save({
    projectId: ID,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: { assignment_question: "Discuss monetary policy transmission.", word_count: 1000 },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
}

describe("Coursework copilot-chat", () => {
  beforeEach(async () => {
    __resetProjectStoreForTests();
    vi.mocked(callOpenRouterText).mockReset();
    await createProject();
  });

  it("returns the AI's reply", async () => {
    vi.mocked(callOpenRouterText).mockResolvedValue("Start from the transmission channels the brief names.");
    const res = await request(app).post(`/api/projects/${ID}/assignment/copilot-chat`).send({ phase: "understand", message: "What do the marking criteria mean?" });
    expect(res.status).toBe(200);
    expect(res.body.response).toContain("transmission channels");
  });

  it("reports a failure instead of canned advice when the AI does not answer", async () => {
    vi.mocked(callOpenRouterText).mockRejectedValue(new Error("provider down"));
    const res = await request(app).post(`/api/projects/${ID}/assignment/copilot-chat`).send({ phase: "understand", message: "What do the marking criteria mean?" });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("ai_unavailable");
    expect(JSON.stringify(res.body)).not.toMatch(/First Class|Rubric Alignment|70%/);
  });

  it("hands off to the browser AI with a 426 when no server model is connected", async () => {
    vi.mocked(callOpenRouterText).mockImplementation(async (_req: any, res: any) => {
      res.status(426).json({ requireFrontendLLM: true, challengeToken: "t", systemPrompt: "s", userPrompt: "u" });
      throw new Error("RequireFrontendLLMException");
    });
    const res = await request(app).post(`/api/projects/${ID}/assignment/copilot-chat`).send({ phase: "sources", message: "Recommend literature" });
    expect(res.status).toBe(426);
    expect(res.body.requireFrontendLLM).toBe(true);
  });
});
