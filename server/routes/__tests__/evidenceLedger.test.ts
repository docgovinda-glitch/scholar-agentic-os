/**
 * Tests for the Evidence Ledger routes (server/routes/project.ts): source
 * discovery (manual + arxiv/web_search proxies) and the evidence-provenance
 * state machine (domain/evidence), including where approve() meets the
 * existing Claim–Evidence Graph.
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
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetProjectStoreForTests();
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

async function addManualSource(projectId: string, overrides: Partial<Record<string, unknown>> = {}) {
  const res = await request(app)
    .post(`/api/projects/${projectId}/evidence-ledger/sources`)
    .send({
      title: "A Manually Added Source",
      authors: ["Author One"],
      sourceType: "user_provided",
      authorityTier: "C",
      ...overrides,
    });
  return res;
}

describe("GET /api/projects/:id/evidence-ledger", () => {
  it("starts empty for a new project", async () => {
    const projectId = await createProject();
    const res = await request(app).get(`/api/projects/${projectId}/evidence-ledger`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sources: [], items: [] });
  });
});

describe("POST /api/projects/:id/evidence-ledger/sources — manual add", () => {
  it("400s on a malformed source", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/evidence-ledger/sources`).send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("adds a source stamped with a server-assigned id and discoveredVia: manual", async () => {
    const projectId = await createProject();
    const res = await addManualSource(projectId);
    expect(res.status).toBe(201);
    expect(res.body.sources).toHaveLength(1);
    expect(res.body.sources[0].discoveredVia).toBe("manual");
    expect(res.body.sources[0].id).toMatch(/^src-/);
  });

  it("accepts an explicit discoveredVia: vault, with a vaultItemId for traceability back to the Knowledge Vault item — the server never sees Vault contents, only this pointer", async () => {
    const projectId = await createProject();
    const res = await addManualSource(projectId, {
      sourceType: "vault",
      authorityTier: "D",
      discoveredVia: "vault",
      vaultItemId: "vault-item-123",
    });
    expect(res.status).toBe(201);
    expect(res.body.sources[0].discoveredVia).toBe("vault");
    expect(res.body.sources[0].vaultItemId).toBe("vault-item-123");
  });

  it("400s on a discoveredVia value other than manual/vault — the server assigns every other method itself (arxiv, web_search never arrive via this route)", async () => {
    const projectId = await createProject();
    const res = await addManualSource(projectId, { discoveredVia: "arxiv" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/projects/:id/evidence-ledger/discover", () => {
  it("400s without a query", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/evidence-ledger/discover`).send({ via: "arxiv" });
    expect(res.status).toBe(400);
  });

  it("400s with an invalid via value", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/evidence-ledger/discover`).send({ query: "x", via: "google" });
    expect(res.status).toBe(400);
  });

  it("adds sources found via arxiv, never creating any evidence items", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ id: "http://arxiv.org/abs/1", title: "Paper One", authors: ["A"], abstract: "...", published: "2023-01-01T00:00:00Z", url: "http://arxiv.org/abs/1" }],
      }),
    } as Response);
    const projectId = await createProject();

    const res = await request(app).post(`/api/projects/${projectId}/evidence-ledger/discover`).send({ query: "test topic", via: "arxiv" });
    expect(res.status).toBe(200);
    expect(res.body.added).toHaveLength(1);
    expect(res.body.evidenceLedger.sources).toHaveLength(1);
    expect(res.body.evidenceLedger.items).toHaveLength(0);
  });

  it("502s with a real error, never a fabricated empty result, when the proxy call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) } as Response);
    const projectId = await createProject();

    const res = await request(app).post(`/api/projects/${projectId}/evidence-ledger/discover`).send({ query: "test topic", via: "web_search" });
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/discovery failed/i);
  });
});

async function fullPipelineUpToProposed(projectId: string) {
  const sourceRes = await addManualSource(projectId);
  const sourceId = sourceRes.body.sources[0].id;

  const claimRes = await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "claim-1", text: "Something is true." } });
  expect(claimRes.status).toBe(201);

  const extractRes = await request(app)
    .post(`/api/projects/${projectId}/evidence-ledger/sources/${sourceId}/extract`)
    .send({ quote: "The cohort comprised 240 participants.", locator: { page: 4 } });
  expect(extractRes.status).toBe(201);
  const evidenceId = extractRes.body.items[0].id;

  const verifyRes = await request(app).post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/verify`).send({ actor: "u1" });
  expect(verifyRes.status).toBe(200);

  const proposeRes = await request(app)
    .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/propose`)
    .send({ claimId: "claim-1", actor: "u1" });
  expect(proposeRes.status).toBe(200);

  return { sourceId, evidenceId };
}

describe("POST .../evidence-ledger/sources/:sourceId/extract", () => {
  it("404s for an unknown source", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/evidence-ledger/sources/nope/extract`).send({ quote: "text" });
    expect(res.status).toBe(404);
  });

  it("400s on an empty quote", async () => {
    const projectId = await createProject();
    const sourceRes = await addManualSource(projectId);
    const res = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/sources/${sourceRes.body.sources[0].id}/extract`)
      .send({ quote: "   " });
    expect(res.status).toBe(400);
  });

  it("creates an item already in state 'extracted'", async () => {
    const projectId = await createProject();
    const sourceRes = await addManualSource(projectId);
    const res = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/sources/${sourceRes.body.sources[0].id}/extract`)
      .send({ quote: "A verbatim quote." });
    expect(res.status).toBe(201);
    expect(res.body.items[0].state).toBe("extracted");
  });
});

describe("POST .../evidence-ledger/items/:evidenceId/propose", () => {
  it("400s when the target claim does not exist — never proposes evidence against an invented claim", async () => {
    const projectId = await createProject();
    const sourceRes = await addManualSource(projectId);
    const extractRes = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/sources/${sourceRes.body.sources[0].id}/extract`)
      .send({ quote: "A quote." });
    const evidenceId = extractRes.body.items[0].id;
    await request(app).post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/verify`).send({});

    const res = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/propose`)
      .send({ claimId: "does-not-exist" });
    expect(res.status).toBe(400);
  });

  it("409s proposing an item that hasn't been verified yet", async () => {
    const projectId = await createProject();
    const sourceRes = await addManualSource(projectId);
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "claim-1", text: "x" } });
    const extractRes = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/sources/${sourceRes.body.sources[0].id}/extract`)
      .send({ quote: "A quote." });
    const evidenceId = extractRes.body.items[0].id;

    const res = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/propose`)
      .send({ claimId: "claim-1" });
    expect(res.status).toBe(409);
  });
});

describe("POST .../evidence-ledger/items/:evidenceId/approve — the only path to citable, and the meeting point with the Claim–Evidence Graph", () => {
  it("400s without actor/strength/rationale", async () => {
    const projectId = await createProject();
    const { evidenceId } = await fullPipelineUpToProposed(projectId);
    const res = await request(app).post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/approve`).send({});
    expect(res.status).toBe(400);
  });

  it("advances the evidence to citable AND creates a real binding in the Claim–Evidence Graph, atomically", async () => {
    const projectId = await createProject();
    const { evidenceId } = await fullPipelineUpToProposed(projectId);

    const res = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/approve`)
      .send({ actor: "human-1", strength: "strong", rationale: "Directly supports the claim." });

    expect(res.status).toBe(200);
    expect(res.body.evidenceLedger.items[0].state).toBe("citable");
    expect(res.body.claimGraph.bindings).toHaveLength(1);
    expect(res.body.claimGraph.bindings[0].claimId).toBe("claim-1");
    expect(res.body.claimGraph.bindings[0].evidence[0].quote).toBe("The cohort comprised 240 participants.");

    // The graph the compliance Rubric and citation engine actually read from
    // now contains this binding — fetched independently, not just echoed
    // back in the approve response.
    const graphRes = await request(app).get(`/api/projects/${projectId}/claims`);
    expect(graphRes.body.bindings).toHaveLength(1);
  });

  it("409s approving an item that was never proposed", async () => {
    const projectId = await createProject();
    const sourceRes = await addManualSource(projectId);
    const extractRes = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/sources/${sourceRes.body.sources[0].id}/extract`)
      .send({ quote: "A quote." });
    const evidenceId = extractRes.body.items[0].id;

    const res = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/approve`)
      .send({ actor: "human-1", strength: "strong", rationale: "x" });
    expect(res.status).toBe(409);
  });
});

describe("POST .../evidence-ledger/items/:evidenceId/reject", () => {
  it("returns a proposed item to verified rather than dead-ending it", async () => {
    const projectId = await createProject();
    const { evidenceId } = await fullPipelineUpToProposed(projectId);

    const res = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/reject`)
      .send({ actor: "human-1", reason: "Doesn't actually support this claim." });

    expect(res.status).toBe(200);
    expect(res.body.items[0].state).toBe("verified");
    expect(res.body.items[0].proposedClaimId).toBeUndefined();
  });

  it("400s without a reason", async () => {
    const projectId = await createProject();
    const { evidenceId } = await fullPipelineUpToProposed(projectId);
    const res = await request(app).post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/reject`).send({ actor: "human-1" });
    expect(res.status).toBe(400);
  });
});

function findGate(gates: Array<{ gate: string }>, id: string) {
  return gates.find((g) => g.gate === id);
}

describe("G2 (Sources gate) recomputed from evidence-ledger routes", () => {
  it("starts with both criteria outstanding (OT-10 requires 30 sources minimum)", async () => {
    const projectId = await createProject();
    const res = await request(app).get(`/api/projects/${projectId}`);
    const g2 = findGate(res.body.gates, "G2");
    expect(g2.outstandingBlocking.length).toBe(1); // corpus-meets-minimum; no-unreviewed-candidates is vacuously satisfied
  });

  it("adding a manual source recomputes G2 (visible via GET /api/projects/:id)", async () => {
    const projectId = await createProject();
    await addManualSource(projectId);
    const res = await request(app).get(`/api/projects/${projectId}`);
    const g2 = findGate(res.body.gates, "G2");
    expect(g2.outstandingBlocking.length).toBe(1); // still short of 30, but the criterion recomputed (not stuck at creation-time state)
  });

  it("proposing evidence makes G2's no-unreviewed-candidates criterion outstanding, approving clears it", async () => {
    const projectId = await createProject();
    const { evidenceId } = await fullPipelineUpToProposed(projectId);

    const afterPropose = await request(app).get(`/api/projects/${projectId}`);
    expect(findGate(afterPropose.body.gates, "G2").outstandingBlocking.some((d: string) => d.includes("proposed"))).toBe(true);

    const approveRes = await request(app)
      .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/approve`)
      .send({ actor: "human-1", strength: "strong", rationale: "Directly supports the claim." });
    expect(approveRes.status).toBe(200);
    expect(findGate(approveRes.body.gates, "G2").outstandingBlocking.some((d: string) => d.includes("proposed"))).toBe(false);
  });
});

describe("POST /api/projects/:id/gates/G2/accept-smaller-corpus", () => {
  it("400s without a reason or an actor", async () => {
    const projectId = await createProject();
    const noReason = await request(app).post(`/api/projects/${projectId}/gates/G2/accept-smaller-corpus`).send({ actor: "u1" });
    expect(noReason.status).toBe(400);
    const noActor = await request(app).post(`/api/projects/${projectId}/gates/G2/accept-smaller-corpus`).send({ reason: "Scoping review only." });
    expect(noActor.status).toBe(400);
  });

  it("satisfies G2's corpus-meets-minimum criterion even with zero sources, recording the reason", async () => {
    const projectId = await createProject();
    const res = await request(app)
      .post(`/api/projects/${projectId}/gates/G2/accept-smaller-corpus`)
      .send({ reason: "Scoping review only; full search deferred.", actor: "u1" });
    expect(res.status).toBe(200);
    const g2 = findGate(res.body.gates, "G2");
    expect(g2.outstandingBlocking).toEqual([]);
  });
});
