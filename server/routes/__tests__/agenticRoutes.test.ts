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
import { signLlmChallenge } from "../../utils/llm.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;

function makeChallengeToken(): string {
  return signLlmChallenge({
    userId: TEST_USER_ID,
    routeId: "test",
    promptHash: "*",
    expiresAt: Date.now() + 60000,
  });
}

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
    projectId: "proj-agentic-test",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-10",
    answers: {
      working_title: "Quantum Cryptography Advancements",
      research_area: "Quantum Information",
      core_problem: "Post-quantum key exchange vulnerability",
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

describe("Agentic Routes & Relational Table Persistence", () => {
  it("rejects unsigned LLM override requests with HTTP 403", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .post(`/api/projects/${projectId}/agentic/peer-review`)
      .send({
        llmResult: JSON.stringify({ data: [] }),
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Invalid or unsigned LLM challenge token" });
  });

  it("the retired whole-manuscript routes (/draft, /draft-preview, /manuscript) are gone", async () => {
    const projectId = await createProject();
    for (const [method, path] of [["post", "draft"], ["post", "draft-preview"], ["get", "manuscript"], ["put", "manuscript"]] as const) {
      const res = await request(app)[method](`/api/projects/${projectId}/agentic/${path}`).send({});
      expect(res.status).toBe(404);
    }
  });

  it("POST /peer-review inserts into peer_review_critiques with strict lens validation", async () => {
    const projectId = await createProject();

    const fetchCalls: { url: string; body: any }[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      fetchCalls.push({ url: url.toString(), body });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/agentic/peer-review`)
      .send({
        challengeToken: makeChallengeToken(),
        llmResult: JSON.stringify({
          data: [
            {
              lens: "Methodological Rigor",
              feedback: "Sample size for decoherence tests needs expansion.",
              severity: "Moderate",
            },
            {
              // Test lens fallback when lens key is missing
              category: "Evidence Synthesis",
              feedback: "Missing comparative analysis with lattice-based schemes.",
              severity: "Major",
            },
            {
              // Test missing lens & category fallback to default academic lens
              feedback: "Proof of theorem 3 lacks boundary conditions.",
              severity: "Critical",
            },
          ],
        }),
      });

    expect(res.status).toBe(200);

    const critiqueInserts = fetchCalls.filter((c) => c.url.includes("peer_review_critiques"));
    expect(critiqueInserts.length).toBe(3);

    // Item 1: standard lens
    expect(critiqueInserts[0].body).toMatchObject({
      project_id: projectId,
      lens: "Methodological Rigor",
      feedback: "Sample size for decoherence tests needs expansion.",
      severity: "Moderate",
    });

    // Item 2: resolved from category
    expect(critiqueInserts[1].body).toMatchObject({
      project_id: projectId,
      lens: "Evidence Synthesis",
      feedback: "Missing comparative analysis with lattice-based schemes.",
      severity: "Major",
    });

    // Item 3: default academic lens fallback (never null/undefined)
    expect(critiqueInserts[2].body).toMatchObject({
      project_id: projectId,
      lens: "Methodological Rigor",
      feedback: "Proof of theorem 3 lacks boundary conditions.",
      severity: "Critical",
    });
  });
  it("POST /allocate-budget caps the target and leaves the other saved answers untouched", async () => {
    const projectId = await createProject();
    const store = getProjectStore();
    await store.patchAnswers(projectId, { manuscript_markdown: "Saved by the studio." });

    const res = await request(app).post(`/api/projects/${projectId}/agentic/allocate-budget`).send({ targetTotalWords: 9_999_999 });
    expect(res.status).toBe(200);

    const saved = await store.get(projectId);
    expect(saved?.answers["target_word_count"]).toBe("100000");
    expect(saved?.answers["manuscript_markdown"]).toBe("Saved by the studio.");
  });

  it("POST /allocate-budget uses the default for a missing or non-numeric target", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/agentic/allocate-budget`).send({ targetTotalWords: "lots" });
    expect(res.status).toBe(200);
    expect((await getProjectStore().get(projectId))?.answers["target_word_count"]).toBe("6000");
  });

  it("POST /copilot-chat rejects a message that is not text", async () => {
    const projectId = await createProject();
    for (const message of [undefined, "   ", { text: "hi" }, 42]) {
      const res = await request(app).post(`/api/projects/${projectId}/agentic/copilot-chat`).send({ stage: "drafting", message });
      expect(res.status).toBe(400);
    }
  });
});
