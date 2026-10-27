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
      .post(`/api/projects/${projectId}/agent/vault-sources`)
      .send({
        llmResult: JSON.stringify({ data: [] }),
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Invalid or unsigned LLM challenge token" });
  });

  it("POST /vault-sources inserts discovered sources into project_sources (NOT peer_review_critiques)", async () => {
    const projectId = await createProject();

    const fetchCalls: { url: string; body: any }[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      fetchCalls.push({ url: url.toString(), body });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/agent/vault-sources`)
      .send({
        challengeToken: makeChallengeToken(),
        llmResult: JSON.stringify({
          data: [
            {
              id: "source-1",
              title: "Quantum Key Distribution Protocols",
              author: "Alice Smith",
              year: 2024,
              relevance_score: 95,
              type: "PDF Document",
            },
          ],
        }),
      });

    expect(res.status).toBe(200);

    // Verify Supabase was called for project_sources, NOT peer_review_critiques
    const supabaseCalls = fetchCalls.filter((c) => c.url.includes("supabase.co"));
    expect(supabaseCalls.length).toBeGreaterThan(0);
    const sourceInsert = supabaseCalls.find((c) => c.url.includes("project_sources"));
    expect(sourceInsert).toBeDefined();
    expect(sourceInsert?.body).toMatchObject({
      project_id: projectId,
      title: "Quantum Key Distribution Protocols",
      source_type: "vault",
      relevance_score: 95,
    });

    // CRITICAL: Ensure peer_review_critiques was NEVER called with vault sources
    const critiqueInsert = supabaseCalls.find((c) => c.url.includes("peer_review_critiques"));
    expect(critiqueInsert).toBeUndefined();
  });

  it("POST /evidence-extraction inserts into project_evidence (NOT manuscript_sections)", async () => {
    const projectId = await createProject();

    const fetchCalls: { url: string; body: any }[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      fetchCalls.push({ url: url.toString(), body });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/agent/evidence-extraction`)
      .send({
        challengeToken: makeChallengeToken(),
        llmResult: JSON.stringify({
          data: [
            {
              id: "ev-1",
              quote: "Photon loss rate was bounded below 0.05%",
              source: "Smith 2024",
              claim_type: "Empirical Support",
              strength: "Strong",
              tags: ["quantum", "loss-rate"],
            },
          ],
        }),
      });

    expect(res.status).toBe(200);

    const supabaseCalls = fetchCalls.filter((c) => c.url.includes("supabase.co"));
    const evidenceInsert = supabaseCalls.find((c) => c.url.includes("project_evidence"));
    expect(evidenceInsert).toBeDefined();
    expect(evidenceInsert?.body).toMatchObject({
      project_id: projectId,
      quote: "Photon loss rate was bounded below 0.05%",
      claim_type: "Empirical Support",
      strength: "Strong",
    });

    // CRITICAL: Ensure manuscript_sections was NOT targeted for evidence
    const sectionInsert = supabaseCalls.find((c) => c.url.includes("manuscript_sections"));
    expect(sectionInsert).toBeUndefined();
  });

  it("POST /draft snapshots manuscript_versions and inserts into manuscript_sections", async () => {
    const projectId = await createProject();

    const fetchCalls: { url: string; body: any }[] = [];
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      fetchCalls.push({ url: url.toString(), body });
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const res = await request(app)
      .post(`/api/projects/${projectId}/agent/draft`)
      .send({
        challengeToken: makeChallengeToken(),
        llmResult: JSON.stringify({
          data: [
            {
              section: "Introduction",
              status: "Drafted",
              length: 1200,
              content: "Quantum communication represents...",
            },
          ],
        }),
      });

    expect(res.status).toBe(200);

    const supabaseCalls = fetchCalls.filter((c) => c.url.includes("supabase.co"));
    const sectionInsert = supabaseCalls.find((c) => c.url.includes("manuscript_sections") && c.body);
    expect(sectionInsert).toBeDefined();
    expect(sectionInsert?.body).toMatchObject({
      project_id: projectId,
      section_name: "Introduction",
      content: "Quantum communication represents...",
      status: "Drafted",
    });
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
      .post(`/api/projects/${projectId}/agent/peer-review`)
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
});
