/**
 * Tests for the anonymization endpoints: POST .../anonymization/propose,
 * GET .../anonymization, POST .../anonymization/apply. Mirrors
 * coherenceCheck.test.ts's shape for the propose (BYOK + Premium) half;
 * apply is deterministic (no model call), tested directly.
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
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { __resetSessionPoliciesForTests } from "../../../src/app/studio/sessionPolicyStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;

beforeEach(() => {
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
  return {
    id: "doc-1",
    title: "A Paper",
    blocks: [
      { id: "acknowledgements", kind: "paragraph", text: "We thank Dr. Jane Smith for her support." },
      { id: "introduction", kind: "paragraph", text: "Our previous work established the baseline." },
    ],
  };
}

function proposalsResponse(proposals: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ proposals }) } }] }) } as Response;
}

const ACK_PROPOSAL = {
  blockId: "acknowledgements",
  category: "acknowledgement",
  originalText: "Dr. Jane Smith",
  replacementText: "[name removed for review]",
  reason: "Names a specific person, revealing author identity.",
};

describe("POST /api/projects/:id/anonymization/propose", () => {
  it("400s when no document has been submitted yet", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/anonymization/propose`).send({ provider: "openai", apiKey: "sk-test" });
    expect(res.status).toBe(400);
  });

  it("proposes and persists an anonymization report via BYOK", async () => {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument() });
    await grantConsent(projectId, "openai");

    global.fetch = vi.fn().mockResolvedValue(proposalsResponse([ACK_PROPOSAL]));
    const res = await request(app).post(`/api/projects/${projectId}/anonymization/propose`).send({ provider: "openai", apiKey: "sk-test" });

    expect(res.status).toBe(200);
    expect(res.body.anonymizationReport.proposals).toHaveLength(1);
    expect(res.body.anonymizationReport.proposals[0].category).toBe("acknowledgement");

    const fetched = await request(app).get(`/api/projects/${projectId}/anonymization`);
    expect(fetched.body.report.proposals).toHaveLength(1);
    expect(fetched.body.anonymizedDocument).toBeNull();
  });

  it("GET returns nulls before any propose has run", async () => {
    const projectId = await createProject();
    const res = await request(app).get(`/api/projects/${projectId}/anonymization`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ report: null, anonymizedDocument: null });
  });

});

describe("POST /api/projects/:id/anonymization/apply", () => {
  async function projectWithProposal(): Promise<string> {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument() });
    await grantConsent(projectId, "openai");
    global.fetch = vi.fn().mockResolvedValue(proposalsResponse([ACK_PROPOSAL]));
    await request(app).post(`/api/projects/${projectId}/anonymization/propose`).send({ provider: "openai", apiKey: "sk-test" });
    return projectId;
  }

  it("400s when there is no anonymization report to apply from", async () => {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument() });
    const res = await request(app).post(`/api/projects/${projectId}/anonymization/apply`).send({ acceptedIndexes: [0] });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed acceptedIndexes", async () => {
    const projectId = await projectWithProposal();
    const outOfRange = await request(app).post(`/api/projects/${projectId}/anonymization/apply`).send({ acceptedIndexes: [5] });
    expect(outOfRange.status).toBe(400);
    const notAnArray = await request(app).post(`/api/projects/${projectId}/anonymization/apply`).send({ acceptedIndexes: "0" });
    expect(notAnArray.status).toBe(400);
  });

  it("applies the accepted proposal onto a NEW anonymizedDocument, leaving the source document untouched", async () => {
    const projectId = await projectWithProposal();
    const res = await request(app).post(`/api/projects/${projectId}/anonymization/apply`).send({ acceptedIndexes: [0] });
    expect(res.status).toBe(200);
    const ackBlock = res.body.anonymizedDocument.blocks.find((b: { id: string }) => b.id === "acknowledgements");
    expect(ackBlock.text).toBe("We thank [name removed for review] for her support.");

    const sourceDoc = await request(app).get(`/api/projects/${projectId}/document`);
    expect(sourceDoc.body.blocks.find((b: { id: string }) => b.id === "acknowledgements").text).toContain("Dr. Jane Smith");

    const fetched = await request(app).get(`/api/projects/${projectId}/anonymization`);
    expect(fetched.body.anonymizedDocument).toBeDefined();
  });

  it("409s when the proposed text is no longer present in the document (source changed since the proposal was made)", async () => {
    const projectId = await projectWithProposal();
    await request(app)
      .put(`/api/projects/${projectId}/document`)
      .send({ document: { ...otTenDocument(), blocks: [{ id: "acknowledgements", kind: "paragraph", text: "Completely rewritten, no names here." }] } });

    const res = await request(app).post(`/api/projects/${projectId}/anonymization/apply`).send({ acceptedIndexes: [0] });
    expect(res.status).toBe(409);
  });
});
