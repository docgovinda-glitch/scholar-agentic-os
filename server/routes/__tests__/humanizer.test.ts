import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function createProject(): Promise<string> {
  const store = getProjectStore();
  const project = {
    projectId: "proj-humanizer-test",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-07",
    answers: {
      working_title: "Autonomous Agent Architecture Calibration",
    },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await store.save(project as any);
  return project.projectId;
}

describe("Humanizer Project Router (/api/projects/:id/humanizer)", () => {
  it("POST /analyze rejects empty or missing text with 400", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .post(`/api/projects/${projectId}/humanizer/analyze`)
      .send({ text: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing or invalid text");
  });

  it("POST /analyze detects AI markers and calculates burstiness", async () => {
    const projectId = await createProject();
    const syntheticText =
      "Moreover, it is crucial to remember that autonomous agents play a pivotal role in the multifaceted landscape of modern computer science. Furthermore, delving into this technology seamlessly integrates various paradigms.";

    const res = await request(app)
      .post(`/api/projects/${projectId}/humanizer/analyze`)
      .send({ text: syntheticText });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.wordCount).toBeGreaterThan(20);
    expect(res.body.detectedMarkers.length).toBeGreaterThan(2);
    expect(res.body.aiProbability).toBeGreaterThan(40);
  });

  it("POST /humanize transforms synthetic clichés into publication-grade prose", async () => {
    const projectId = await createProject();
    const rawText =
      "Moreover, the system plays a pivotal role in the multifaceted landscape. Furthermore, delving into the results proves that our model seamlessly integrates all data.";

    const res = await request(app)
      .post(`/api/projects/${projectId}/humanizer/humanize`)
      .send({
        text: rawText,
        register: "Empirical Natural Sciences",
        persona: "Senior Academic Researcher",
        burstinessLevel: "high_dynamic",
        hedgingLevel: "strict_caution",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.humanizedText).not.toContain("Moreover,");
    expect(res.body.humanizedText).not.toContain("multifaceted landscape");
    expect(res.body.humanizedText).not.toContain("delving into");
    expect(res.body.improvements.length).toBeGreaterThan(0);
    expect(res.body.registerApplied).toBe("Empirical Natural Sciences");
  });

  it("GET / retrieves saved humanizer state after humanize", async () => {
    const projectId = await createProject();
    const rawText = "Moreover, we delve into the dataset to prove that performance improves.";

    await request(app)
      .post(`/api/projects/${projectId}/humanizer/humanize`)
      .send({
        text: rawText,
        register: "Quantitative & Computational Sciences",
      });

    const getRes = await request(app).get(`/api/projects/${projectId}/humanizer`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data).toBeDefined();
    expect(getRes.body.data.sourceText).toBe(rawText);
  });

  it("POST /humanize fails with 422 when server AI is unavailable and algorithmic fallback makes zero changes", async () => {
    const projectId = await createProject();
    // A clean narrative sentence without any of the hardcoded academic clichés
    const narrativeText = "The mountain stood quietly in the morning mist.";

    const res = await request(app)
      .post(`/api/projects/${projectId}/humanizer/humanize`)
      .send({
        text: narrativeText,
        register: "General Nonfiction",
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("No stylometric rewrite could be produced");
    expect(res.body.code).toBeDefined();
  });
});
