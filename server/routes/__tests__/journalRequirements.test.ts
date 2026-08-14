// Gate G1 (Requirements) and PUT .../journal-requirements — the one place
// in this suite that's deliberately OT-10-specific, since it's testing
// Journal Article's own G1 semantics (target journal + captured venue
// requirements), not the generic Atlas/Conductor engine other files in
// this directory exercise across many types as neutral fixtures.

import { describe, it, expect, beforeEach, vi } from "vitest";

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
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

beforeEach(() => {
  __resetProjectStoreForTests();
  __resetRateLimitStore();
  __setEnabledOutputTypesForTests(["OT-10"]);
});

async function createJournalArticle(): Promise<string> {
  const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
  expect(res.status).toBe(201);
  return res.body.projectId;
}

function findGate(gates: Array<{ gate: string }>, id: string) {
  return gates.find((g) => g.gate === id);
}

/** G1's entry prerequisite (domain/project/gates.ts's GATE_ENTRY_REQUIRES) is G0 signed off, not just ready — reaching G1 "ready" in a test needs this first. */
async function signOffG0(projectId: string): Promise<void> {
  const res = await request(app).post(`/api/projects/${projectId}/gates/G0/signoff`).send({ actor: TEST_USER_ID });
  expect(res.status).toBe(200);
}

const FULL_REQUIREMENTS = {
  journalName: "Water Research",
  wordLimit: { min: 3000, max: 8000 },
  citationStyle: "vancouver",
  requiredDeclarations: ["funding", "conflicts_of_interest", "ethics_approval", "data_availability"],
  articleType: "original_research",
};

describe("G1 exit criteria on creation", () => {
  it("starts with outstanding blocking criteria: target journal unresolved, requirements not yet captured", async () => {
    const projectId = await createJournalArticle();
    const res = await request(app).get(`/api/projects/${projectId}`);
    const g1 = findGate(res.body.gates, "G1");
    expect(g1.status).not.toBe("ready");
    expect(g1.outstandingBlocking.length).toBeGreaterThanOrEqual(2);
    expect(res.body.hasJournalRequirements).toBe(false);
  });
});

describe("PATCH .../intake resolving target_journal", () => {
  it("clears the 'target journal decided' G1 criterion, but G1 isn't ready until requirements are captured too", async () => {
    const projectId = await createJournalArticle();
    const before = await request(app).get(`/api/projects/${projectId}`);
    const outstandingBefore = findGate(before.body.gates, "G1").outstandingBlocking.length;

    const res = await request(app)
      .patch(`/api/projects/${projectId}/intake`)
      .send({ answers: { target_journal: "Water Research" } });

    const g1 = findGate(res.body.gates, "G1");
    expect(g1.outstandingBlocking.length).toBe(outstandingBefore - 1);
    expect(g1.status).not.toBe("ready");
  });
});

describe("PUT /api/projects/:id/journal-requirements", () => {
  it("captures requirements, stamps source/capturedAt/capturedBy, and reaches G1 ready once target_journal is also resolved", async () => {
    const projectId = await createJournalArticle();
    await request(app).patch(`/api/projects/${projectId}/intake`).send({ answers: { target_journal: "Water Research" } });
    await signOffG0(projectId);

    const res = await request(app).put(`/api/projects/${projectId}/journal-requirements`).send(FULL_REQUIREMENTS);
    expect(res.status).toBe(200);
    expect(res.body.journalRequirements).toMatchObject({
      journalName: "Water Research",
      source: "manual",
      citationStyle: "vancouver",
    });
    expect(res.body.journalRequirements.capturedBy).toBe(TEST_USER_ID);
    expect(typeof res.body.journalRequirements.capturedAt).toBe("string");

    const g1 = findGate(res.body.gates, "G1");
    expect(g1.status).toBe("ready");

    const fetched = await request(app).get(`/api/projects/${projectId}`);
    expect(fetched.body.hasJournalRequirements).toBe(true);
  });

  it("does not reach G1 ready without a citation style, even with everything else present", async () => {
    const projectId = await createJournalArticle();
    await request(app).patch(`/api/projects/${projectId}/intake`).send({ answers: { target_journal: "Water Research" } });

    const { citationStyle: _citationStyle, ...withoutCitationStyle } = FULL_REQUIREMENTS;
    const res = await request(app).put(`/api/projects/${projectId}/journal-requirements`).send(withoutCitationStyle);

    expect(res.status).toBe(200);
    const g1 = findGate(res.body.gates, "G1");
    expect(g1.status).not.toBe("ready");
    expect(g1.outstandingBlocking.some((d: string) => d.toLowerCase().includes("citation style"))).toBe(true);
  });

  it("400s on a malformed payload", async () => {
    const projectId = await createJournalArticle();
    const res = await request(app).put(`/api/projects/${projectId}/journal-requirements`).send({ journalName: "" });
    expect(res.status).toBe(400);
  });

  it("404s for a project that doesn't exist (loadOwnedProject 404s 'not mine' the same way, deliberately indistinguishable)", async () => {
    const res = await request(app).put(`/api/projects/proj-does-not-exist/journal-requirements`).send(FULL_REQUIREMENTS);
    expect(res.status).toBe(404);
  });

  it("409s once G1 is already signed off — invalidate first", async () => {
    const projectId = await createJournalArticle();
    await request(app).patch(`/api/projects/${projectId}/intake`).send({ answers: { target_journal: "Water Research" } });
    await signOffG0(projectId);
    await request(app).put(`/api/projects/${projectId}/journal-requirements`).send(FULL_REQUIREMENTS);

    const signOff = await request(app).post(`/api/projects/${projectId}/gates/G1/signoff`).send({ actor: TEST_USER_ID });
    expect(signOff.status).toBe(200);

    const res = await request(app).put(`/api/projects/${projectId}/journal-requirements`).send(FULL_REQUIREMENTS);
    expect(res.status).toBe(409);
  });
});
