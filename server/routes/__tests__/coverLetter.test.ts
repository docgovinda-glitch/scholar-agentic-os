/**
 * Tests for POST/GET /api/projects/:id/cover-letter — single-call cover
 * letter generation (BYOK + Premium), mirroring coherenceCheck.test.ts's
 * shape for the same dual-path pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { AI_HEADERS, useFetchBackedAi } from "../../test/aiTestKit.ts";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { __resetSessionPoliciesForTests } from "../../../src/app/studio/sessionPolicyStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;

beforeEach(() => {
  useFetchBackedAi();
  __resetProjectStoreForTests();
  __resetSessionPoliciesForTests();
  __resetRateLimitStore();
  __setEnabledOutputTypesForTests(["OT-10"]);
});
afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function createProject(): Promise<string> {
  const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
  return res.body.projectId;
}

async function grantConsent(projectId: string, provider: string) {
  await request(app).post("/api/studio/consent").send({ sessionId: `manuscript:${projectId}`, provider });
}

function otTenDocument() {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  return {
    id: "doc-1",
    title: "A Paper",
    blocks: [
      { id: "abstract", kind: "paragraph", text: words(200) },
      { id: "introduction", kind: "paragraph", text: words(300) },
    ],
  };
}

function letterResponse(text: string) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) } as Response;
}

describe("POST /api/projects/:id/cover-letter", () => {
  it("400s when no document has been submitted yet", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/cover-letter`).set(AI_HEADERS).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no document/i);
  });

  it("400s when no journal requirements have been captured yet", async () => {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument() });
    const res = await request(app).post(`/api/projects/${projectId}/cover-letter`).set(AI_HEADERS).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/journal requirements/i);
  });

  it("generates and persists a cover letter via BYOK", async () => {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument() });
    await request(app).put(`/api/projects/${projectId}/journal-requirements`).send({ journalName: "Water Research", citationStyle: "vancouver", requiredDeclarations: [] });

    global.fetch = vi.fn().mockResolvedValue(letterResponse("Dear Editor,\n\nWe submit our manuscript for your consideration.\n\nSincerely,"));
    const res = await request(app).post(`/api/projects/${projectId}/cover-letter`).set(AI_HEADERS).send({});

    expect(res.status).toBe(200);
    expect(res.body.coverLetter.text).toContain("Dear Editor");
    expect(res.body.coverLetter.journalName).toBe("Water Research");

    const fetched = await request(app).get(`/api/projects/${projectId}/cover-letter`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.text).toContain("Dear Editor");
  });

  it("regenerating overwrites the previous cover letter rather than keeping a history", async () => {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument() });
    await request(app).put(`/api/projects/${projectId}/journal-requirements`).send({ journalName: "Water Research", citationStyle: "vancouver", requiredDeclarations: [] });

    global.fetch = vi.fn().mockResolvedValue(letterResponse("First draft of the letter."));
    await request(app).post(`/api/projects/${projectId}/cover-letter`).set(AI_HEADERS).send({});

    global.fetch = vi.fn().mockResolvedValue(letterResponse("Second, revised letter."));
    const res = await request(app).post(`/api/projects/${projectId}/cover-letter`).set(AI_HEADERS).send({});
    expect(res.body.coverLetter.text).toBe("Second, revised letter.");
  });

  it("404s GET before any cover letter has been generated", async () => {
    const projectId = await createProject();
    const res = await request(app).get(`/api/projects/${projectId}/cover-letter`);
    expect(res.status).toBe(404);
  });

});
