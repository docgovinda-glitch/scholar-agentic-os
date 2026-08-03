import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";

interface IntakeFieldLike {
  key: string;
  allowsProvisional: boolean;
}

/** Build an answer for every required field: "provisional" where allowed, a concrete dummy value otherwise. */
function answerAllRequired(requiredFields: IntakeFieldLike[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const field of requiredFields) {
    answers[field.key] = field.allowsProvisional ? "provisional" : "a concrete test value";
  }
  return answers;
}

describe("GET /api/atlas/output-types", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("lists catalog entries with summary fields only", async () => {
    const res = await request(app).get("/api/atlas/output-types");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(6);
    expect(res.body.items[0]).toHaveProperty("id");
    expect(res.body.items[0]).toHaveProperty("label");
    expect(res.body.items[0]).not.toHaveProperty("intakeSchema");
  });

  it("returns the full spec for a known output type", async () => {
    const res = await request(app).get("/api/atlas/output-types/OT-01");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("OT-01");
    expect(res.body.intakeSchema.required.length).toBeGreaterThan(0);
  });

  it("404s for an unknown output type", async () => {
    const res = await request(app).get("/api/atlas/output-types/OT-999");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/projects", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("400s when outputTypeId is missing", async () => {
    const res = await request(app).post("/api/projects").send({});
    expect(res.status).toBe(400);
  });

  it("404s for an unknown output type", async () => {
    const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-999" });
    expect(res.status).toBe(404);
  });

  it("creates a project with G0 in progress and every other gate not started", async () => {
    const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    expect(res.status).toBe(201);
    expect(res.body.projectId).toMatch(/^proj-/);
    expect(res.body.outputTypeId).toBe("OT-01");
    expect(res.body.gates).toHaveLength(8);
    expect(res.body.gates[0]).toMatchObject({ gate: "G0", status: "in_progress" });
    expect(res.body.gates[1]).toMatchObject({ gate: "G1", status: "not_started" });
  });
});

describe("GET /api/projects/:id", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown project", async () => {
    const res = await request(app).get("/api/projects/proj-does-not-exist");
    expect(res.status).toBe(404);
  });

  it("round-trips a created project", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app).get(`/api/projects/${created.body.projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(created.body.projectId);
  });
});

describe("PATCH /api/projects/:id/intake", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown project", async () => {
    const res = await request(app).patch("/api/projects/proj-nope/intake").send({ answers: {} });
    expect(res.status).toBe(404);
  });

  it("400s when answers is missing", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app).patch(`/api/projects/${created.body.projectId}/intake`).send({});
    expect(res.status).toBe(400);
  });

  it("partially answering leaves G0 not ready; fully answering (with provisional where allowed) makes it ready", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;

    const specRes = await request(app).get("/api/atlas/output-types/OT-01");
    const requiredFields: IntakeFieldLike[] = specRes.body.intakeSchema.required;
    expect(requiredFields.length).toBeGreaterThan(1);

    const partial = await request(app)
      .patch(`/api/projects/${projectId}/intake`)
      .send({ answers: { [requiredFields[0].key]: "provisional" } });
    expect(partial.status).toBe(200);
    const g0Partial = partial.body.gates.find((g: { gate: string }) => g.gate === "G0");
    expect(g0Partial.status).not.toBe("ready");

    const full = await request(app)
      .patch(`/api/projects/${projectId}/intake`)
      .send({ answers: answerAllRequired(requiredFields) });
    expect(full.status).toBe(200);
    const g0Full = full.body.gates.find((g: { gate: string }) => g.gate === "G0");
    expect(g0Full.status).toBe("ready");
  });
});

describe("POST /api/projects/:id/gates/:gate/signoff", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("400s on an unknown gate id", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .post(`/api/projects/${created.body.projectId}/gates/G99/signoff`)
      .send({ actor: "amara" });
    expect(res.status).toBe(400);
  });

  it("409s when the gate is not yet ready", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .post(`/api/projects/${created.body.projectId}/gates/G0/signoff`)
      .send({ actor: "amara" });
    expect(res.status).toBe(409);
  });

  it("signs off G0 once all required fields are answered, and unlocks G1/G2", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    const specRes = await request(app).get("/api/atlas/output-types/OT-01");
    const requiredFields: IntakeFieldLike[] = specRes.body.intakeSchema.required;
    await request(app).patch(`/api/projects/${projectId}/intake`).send({ answers: answerAllRequired(requiredFields) });

    const res = await request(app).post(`/api/projects/${projectId}/gates/G0/signoff`).send({ actor: "amara" });
    expect(res.status).toBe(200);
    const g0 = res.body.gates.find((g: { gate: string }) => g.gate === "G0");
    const g1 = res.body.gates.find((g: { gate: string }) => g.gate === "G1");
    const g2 = res.body.gates.find((g: { gate: string }) => g.gate === "G2");
    expect(g0.status).toBe("signed_off");
    expect(g1.status).toBe("in_progress");
    expect(g2.status).toBe("in_progress");
  });
});

describe("POST /api/projects/:id/gates/:gate/invalidate", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("400s when reason is missing", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app).post(`/api/projects/${created.body.projectId}/gates/G0/invalidate`).send({});
    expect(res.status).toBe(400);
  });

  it("invalidates a signed-off gate and records the reason", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    const specRes = await request(app).get("/api/atlas/output-types/OT-01");
    const requiredFields: IntakeFieldLike[] = specRes.body.intakeSchema.required;
    await request(app).patch(`/api/projects/${projectId}/intake`).send({ answers: answerAllRequired(requiredFields) });
    await request(app).post(`/api/projects/${projectId}/gates/G0/signoff`).send({ actor: "amara" });

    const res = await request(app)
      .post(`/api/projects/${projectId}/gates/G0/invalidate`)
      .send({ reason: "scope changed" });
    expect(res.status).toBe(200);
    const g0 = res.body.gates.find((g: { gate: string }) => g.gate === "G0");
    expect(g0.status).toBe("invalidated");
  });
});
