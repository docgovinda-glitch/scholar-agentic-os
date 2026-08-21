import { describe, it, expect, beforeEach, vi } from "vitest";

// These suites exercise route logic — gates, rubric, claims, refinement — not
// authentication. requireAuth is stubbed to a fixed user so that stays their
// subject. Enforcement itself is tested for real, unmocked, in
// project.authz.test.ts; stubbing here and asserting there keeps each file
// testing one thing.
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

// This file exercises the generic Atlas/Conductor/Rubric engine across
// several output types (OT-01, OT-04, ...) as neutral fixtures — it is not
// testing those types as products. Scholar Core's real, product-facing
// active scope (Journal Article only) is narrower; opt back into every type
// here so this suite keeps proving the underlying engine still works for
// all 24, which is exactly what it's for. The restriction itself has its
// own dedicated tests in outputTypeAccess.test.ts.
beforeEach(() => {
  __setEnabledOutputTypesForTests("all");
});

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

  it("starts at intakeCompleteness 0", async () => {
    const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    expect(res.body.intakeCompleteness).toBe(0);
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

  it("intakeCompleteness spans all tiers, not just required — answering only required fields doesn't reach 1.0", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    const specRes = await request(app).get("/api/atlas/output-types/OT-01");
    const requiredFields: IntakeFieldLike[] = specRes.body.intakeSchema.required;
    const totalFields =
      specRes.body.intakeSchema.required.length +
      specRes.body.intakeSchema.recommended.length +
      specRes.body.intakeSchema.optional.length;

    const concreteAnswers: Record<string, string> = {};
    for (const field of requiredFields) {
      concreteAnswers[field.key] = "concrete answer";
    }

    const res = await request(app)
      .patch(`/api/projects/${projectId}/intake`)
      .send({ answers: concreteAnswers });
    expect(res.body.intakeCompleteness).toBeCloseTo(requiredFields.length / totalFields);
    expect(res.body.intakeCompleteness).toBeLessThan(1);
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
    expect(g1.status).toBe("ready");
    expect(g2.status).toBe("in_progress");
  });
});

function words(n: number): string {
  return Array.from({ length: n }, () => "word").join(" ");
}

function compliantOT01Document(id = "doc-1") {
  return {
    id,
    title: "Test Assignment",
    blocks: [
      { id: "title_page", kind: "heading1", text: "Test Assignment" },
      { id: "introduction", kind: "paragraph", text: words(150) },
      { id: "body", kind: "paragraph", text: words(700) },
      { id: "conclusion", kind: "paragraph", text: words(100) },
      { id: "references", kind: "paragraph", text: "Reference one." },
    ],
  };
}

describe("PUT /api/projects/:id/document", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown project", async () => {
    const res = await request(app).put("/api/projects/proj-nope/document").send({ document: compliantOT01Document() });
    expect(res.status).toBe(404);
  });

  it("400s when document is missing or malformed", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const missing = await request(app).put(`/api/projects/${created.body.projectId}/document`).send({});
    expect(missing.status).toBe(400);

    const malformed = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: { id: "d1", title: "x", blocks: [{ id: "b1", kind: "not-a-real-kind", text: "x" }] } });
    expect(malformed.status).toBe(400);
  });

  it("a compliant document leaves G6 with no outstanding blocking criteria", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: compliantOT01Document() });
    expect(res.status).toBe(200);
    expect(res.body.rubric.readyForG6).toBe(true);
    const g6 = res.body.gates.find((g: { gate: string }) => g.gate === "G6");
    expect(g6.outstandingBlocking).toEqual([]);
  });

  it("a document missing a required section leaves G6 with an outstanding blocking criterion", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const incomplete = compliantOT01Document();
    incomplete.blocks = incomplete.blocks.filter((b) => b.id !== "conclusion");
    const res = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: incomplete });
    expect(res.status).toBe(200);
    expect(res.body.rubric.readyForG6).toBe(false);
    const g6 = res.body.gates.find((g: { gate: string }) => g.gate === "G6");
    expect(g6.outstandingBlocking.length).toBeGreaterThan(0);
  });

  it("hasDocument flips true once a document is submitted", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    expect(created.body.hasDocument).toBe(false);
    const res = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: compliantOT01Document() });
    expect(res.body.hasDocument).toBe(true);
  });
});

describe("G3 (Structure gate), recomputed from both intake and document endpoints", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("right after project creation, G3 has one outstanding blocking criterion per required section (no document yet)", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const g3 = created.body.gates.find((g: { gate: string }) => g.gate === "G3");
    // OT-01 has 5 required sections; plus 1 deferred-field criterion since
    // allowsProvisional fields are now automatically initialized to "provisional"
    // on project creation.
    expect(g3.outstandingBlocking.length).toBe(6);
  });

  it("submitting a document with every required section clears the section-presence criteria", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: compliantOT01Document() });
    const g3 = res.body.gates.find((g: { gate: string }) => g.gate === "G3");
    expect(g3.outstandingBlocking.length).toBe(1); // 1 remaining for the deferred field
  });

  it("a deferred (provisional) intake field is an outstanding G3 criterion, resolved once answered for real", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;

    await request(app)
      .put(`/api/projects/${projectId}/document`)
      .send({ document: compliantOT01Document() });

    const provisional = await request(app)
      .patch(`/api/projects/${projectId}/intake`)
      .send({ answers: { assignment_brief: "provisional", word_limit: "1500" } });
    let g3 = provisional.body.gates.find((g: { gate: string }) => g.gate === "G3");
    expect(g3.outstandingBlocking.length).toBe(1); // sections are all present now; only the deferred field remains

    const resolved = await request(app)
      .patch(`/api/projects/${projectId}/intake`)
      .send({ answers: { assignment_brief: "Write 1500 words on X." } });
    g3 = resolved.body.gates.find((g: { gate: string }) => g.gate === "G3");
    expect(g3.outstandingBlocking.length).toBe(0);
  });
});

describe("G4 (Draft gate), recomputed from the document and claim-graph routes", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("right after project creation, G4 has one outstanding blocking criterion per required section (no document yet)", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const g4 = created.body.gates.find((g: { gate: string }) => g.gate === "G4");
    expect(g4.outstandingBlocking.length).toBe(5);
  });

  it("submitting a document with every required section non-empty clears the section-drafted criteria", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: compliantOT01Document() });
    const g4 = res.body.gates.find((g: { gate: string }) => g.gate === "G4");
    expect(g4.outstandingBlocking).toEqual([]);
  });

  it("adding an unbound claim makes G4's claims criterion outstanding; binding evidence clears it", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: compliantOT01Document() });

    const withClaim = await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "A claim." } });
    const g4AfterClaim = withClaim.body.gates.find((g: { gate: string }) => g.gate === "G4");
    expect(g4AfterClaim.outstandingBlocking.some((d: string) => d.includes("c1"))).toBe(true);

    const bound = await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [{ sourceId: "s1", locator: {}, quote: "q" }], strength: "strong", rationale: "r" } });
    const g4AfterBind = bound.body.gates.find((g: { gate: string }) => g.gate === "G4");
    expect(g4AfterBind.outstandingBlocking.some((d: string) => d.includes("c1"))).toBe(false);
  });
});

describe("POST /api/projects/:id/claims/:claimId/mark-unsupported", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown claim", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .post(`/api/projects/${created.body.projectId}/claims/no-such-claim/mark-unsupported`)
      .send({ reason: "x", actor: "u1" });
    expect(res.status).toBe(404);
  });

  it("400s without a reason or an actor", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "A claim." } });

    const noReason = await request(app).post(`/api/projects/${projectId}/claims/c1/mark-unsupported`).send({ actor: "u1" });
    expect(noReason.status).toBe(400);
    const noActor = await request(app).post(`/api/projects/${projectId}/claims/c1/mark-unsupported`).send({ reason: "Definitional." });
    expect(noActor.status).toBe(400);
  });

  it("marks the claim, clears G4's claims criterion, but leaves it in the Rubric's compliance-grade unsupportedClaims list", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: compliantOT01Document() });
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "A definitional claim." } });

    const res = await request(app).post(`/api/projects/${projectId}/claims/c1/mark-unsupported`).send({ reason: "Definitional, needs no citation.", actor: "u1" });
    expect(res.status).toBe(200);
    expect(res.body.claimGraph.claims[0].explicitlyUnsupported.reason).toBe("Definitional, needs no citation.");
    const g4 = res.body.gates.find((g: { gate: string }) => g.gate === "G4");
    expect(g4.outstandingBlocking.some((d: string) => d.includes("c1"))).toBe(false);

    const unsupported = await request(app).get(`/api/projects/${projectId}/claims/unsupported`);
    expect(unsupported.body.claims.map((c: { id: string }) => c.id)).toContain("c1");
  });
});

describe("G7 (Export gate), recomputed from the document endpoint alongside G6", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("right after project creation, G7 has no computed criteria yet, same as G6 before any document exists", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const g7 = created.body.gates.find((g: { gate: string }) => g.gate === "G7");
    expect(g7.outstandingBlocking).toEqual([]);
    expect(g7.status).toBe("not_started");
  });

  it("a compliant document clears both of G7's exit criteria", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: compliantOT01Document() });
    const g7 = res.body.gates.find((g: { gate: string }) => g.gate === "G7");
    expect(g7.outstandingBlocking).toEqual([]);
  });

  it("a document with unresolved blocking Rubric findings leaves G6's compliance criterion outstanding while G7 export remains clear", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const incomplete = compliantOT01Document();
    incomplete.blocks = incomplete.blocks.filter((b) => b.id !== "conclusion");
    const res = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: incomplete });
    const g6 = res.body.gates.find((g: { gate: string }) => g.gate === "G6");
    expect(g6.outstandingBlocking.length).toBeGreaterThan(0);
    const g7 = res.body.gates.find((g: { gate: string }) => g.gate === "G7");
    expect(g7.outstandingBlocking).toEqual([]);
  });

  it("waiving the sole blocking-Rubric-finding-causing issue also clears G7's compliance criterion", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    const overLength = await request(app).put(`/api/projects/${projectId}/document`).send({ document: overLengthOT01Document() });
    expect(overLength.body.gates.find((g: { gate: string }) => g.gate === "G7").outstandingBlocking).toEqual([]);
    // over-length trips a required (not blocking) rule, so G7 was already clear — waiving still recomputes it without error.
    const res = await request(app)
      .post(`/api/projects/${projectId}/rubric/waive`)
      .send({ ruleId: "OT-01-word-limit", reason: "Tutor granted an extension on length." });
    const g7 = res.body.gates.find((g: { gate: string }) => g.gate === "G7");
    expect(g7.outstandingBlocking).toEqual([]);
  });
});

function overLengthOT01Document() {
  const doc = compliantOT01Document();
  doc.blocks = doc.blocks.map((b) => (b.id === "body" ? { ...b, text: words(4000) } : b));
  return doc;
}

describe("POST /api/projects/:id/rubric/waive", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown project", async () => {
    const res = await request(app).post("/api/projects/proj-nope/rubric/waive").send({ ruleId: "x", reason: "y" });
    expect(res.status).toBe(404);
  });

  it("404s when no document has been submitted yet", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .post(`/api/projects/${created.body.projectId}/rubric/waive`)
      .send({ ruleId: "OT-01-word-limit", reason: "y" });
    expect(res.status).toBe(404);
  });

  it("400s when ruleId or reason is missing", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: compliantOT01Document() });

    const noRuleId = await request(app).post(`/api/projects/${projectId}/rubric/waive`).send({ reason: "y" });
    expect(noRuleId.status).toBe(400);

    const noReason = await request(app).post(`/api/projects/${projectId}/rubric/waive`).send({ ruleId: "OT-01-word-limit" });
    expect(noReason.status).toBe(400);
  });

  it("404s for a ruleId this output type doesn't compile", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: compliantOT01Document() });

    const res = await request(app)
      .post(`/api/projects/${projectId}/rubric/waive`)
      .send({ ruleId: "no-such-rule", reason: "y" });
    expect(res.status).toBe(404);
  });

  it("400s when the rule is blocking severity (never waivable)", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: compliantOT01Document() });

    const res = await request(app)
      .post(`/api/projects/${projectId}/rubric/waive`)
      .send({ ruleId: "OT-01-section-references", reason: "I don't feel like it" });
    expect(res.status).toBe(400);
  });

  it("waiving the word-limit rule clears it from requiredFailures and G6 becomes ready", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    const overLength = await request(app).put(`/api/projects/${projectId}/document`).send({ document: overLengthOT01Document() });
    expect(overLength.body.rubric.readyForG6).toBe(false);

    const res = await request(app)
      .post(`/api/projects/${projectId}/rubric/waive`)
      .send({ ruleId: "OT-01-word-limit", reason: "Tutor granted an extension on length." });
    expect(res.status).toBe(200);
    expect(res.body.rubric.readyForG6).toBe(true);
    const g6 = res.body.gates.find((g: { gate: string }) => g.gate === "G6");
    expect(g6.outstandingBlocking).toEqual([]);
  });

  it("a waiver survives a document resubmission rather than resetting", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: overLengthOT01Document() });
    await request(app)
      .post(`/api/projects/${projectId}/rubric/waive`)
      .send({ ruleId: "OT-01-word-limit", reason: "Tutor granted an extension on length." });

    // Resubmit the same over-length document — rules are recompiled from
    // scratch each time; the waiver must be reapplied, not lost.
    const resubmitted = await request(app)
      .put(`/api/projects/${projectId}/document`)
      .send({ document: overLengthOT01Document() });
    expect(resubmitted.body.rubric.readyForG6).toBe(true);
    const finding = resubmitted.body.rubric.findings.find((f: { ruleId: string }) => f.ruleId === "OT-01-word-limit");
    expect(finding.status).toBe("warn");
  });
});

describe("GET /api/projects/:id/rubric", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown project", async () => {
    const res = await request(app).get("/api/projects/proj-nope/rubric");
    expect(res.status).toBe(404);
  });

  it("404s when no document has been submitted yet", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app).get(`/api/projects/${created.body.projectId}/rubric`);
    expect(res.status).toBe(404);
  });

  it("returns the same report the document PUT computed", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const put = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: compliantOT01Document() });
    const res = await request(app).get(`/api/projects/${created.body.projectId}/rubric`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(put.body.rubric);
  });
});

function evidenceSpan(overrides: Partial<{ sourceId: string; quote: string }> = {}) {
  return {
    sourceId: overrides.sourceId ?? "src-1",
    locator: { page: 12 },
    quote: overrides.quote ?? "The observed effect was statistically significant.",
  };
}

describe("POST /api/projects/:id/claims", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown project", async () => {
    const res = await request(app)
      .post("/api/projects/proj-nope/claims")
      .send({ claim: { id: "c1", text: "Claim text." } });
    expect(res.status).toBe(404);
  });

  it("400s when claim is missing or malformed", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app).post(`/api/projects/${created.body.projectId}/claims`).send({});
    expect(res.status).toBe(400);
  });

  it("adds a claim and returns the updated graph", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .post(`/api/projects/${created.body.projectId}/claims`)
      .send({ claim: { id: "c1", text: "Claim text." } });
    expect(res.status).toBe(201);
    expect(res.body.claimGraph.claims).toEqual([{ id: "c1", text: "Claim text." }]);
  });

  it("409s on a duplicate claim id", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "First." } });
    const res = await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Second." } });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/projects/:id/claims/:claimId/evidence", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("400s when the claim doesn't exist", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app)
      .post(`/api/projects/${created.body.projectId}/claims/nope/evidence`)
      .send({ binding: { id: "b1", claimId: "nope", evidence: [evidenceSpan()], strength: "strong", rationale: "Direct measurement." } });
    expect(res.status).toBe(400);
  });

  it("400s when binding.claimId doesn't match the URL", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Claim text." } });
    const res = await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "other-claim", evidence: [evidenceSpan()], strength: "strong", rationale: "x" } });
    expect(res.status).toBe(400);
  });

  it("400s when evidence is an empty array", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Claim text." } });
    const res = await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [], strength: "strong", rationale: "x" } });
    expect(res.status).toBe(400);
  });

  it("binds evidence to an existing claim", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Claim text." } });
    const res = await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [evidenceSpan()], strength: "strong", rationale: "Direct measurement." } });
    expect(res.status).toBe(201);
    expect(res.body.claimGraph.bindings).toHaveLength(1);
  });
});

describe("GET /api/projects/:id/claims/unsupported and /conflicts", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("lists claims with zero bindings as unsupported", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Supported." } });
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c2", text: "Unsupported." } });
    await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [evidenceSpan()], strength: "strong", rationale: "x" } });

    const res = await request(app).get(`/api/projects/${projectId}/claims/unsupported`);
    expect(res.status).toBe(200);
    expect(res.body.claims.map((c: { id: string }) => c.id)).toEqual(["c2"]);
  });

  it("surfaces a claim with both supporting and contradicting evidence as a conflict", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Contested." } });
    await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [evidenceSpan({ sourceId: "src-a" })], strength: "strong", rationale: "x" } });
    await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b2", claimId: "c1", evidence: [evidenceSpan({ sourceId: "src-b" })], strength: "contradicts", rationale: "y" } });

    const res = await request(app).get(`/api/projects/${projectId}/claims/conflicts`);
    expect(res.status).toBe(200);
    expect(res.body.conflicts).toHaveLength(1);
    expect(res.body.conflicts[0].claimId).toBe("c1");
  });
});

describe("GET /api/projects/:id/sources/:sourceId/claims", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown project", async () => {
    const res = await request(app).get("/api/projects/proj-nope/sources/src-1/claims");
    expect(res.status).toBe(404);
  });

  it("lists only claims with a binding citing the given source", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "From source A." } });
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c2", text: "From source B." } });
    await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [evidenceSpan({ sourceId: "src-a" })], strength: "strong", rationale: "x" } });
    await request(app)
      .post(`/api/projects/${projectId}/claims/c2/evidence`)
      .send({ binding: { id: "b2", claimId: "c2", evidence: [evidenceSpan({ sourceId: "src-b" })], strength: "strong", rationale: "y" } });

    const res = await request(app).get(`/api/projects/${projectId}/sources/src-a/claims`);
    expect(res.status).toBe(200);
    expect(res.body.claims.map((c: { id: string }) => c.id)).toEqual(["c1"]);
  });

  it("returns an empty list for a source no claim depends on", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const res = await request(app).get(`/api/projects/${created.body.projectId}/sources/src-nope/claims`);
    expect(res.status).toBe(200);
    expect(res.body.claims).toEqual([]);
  });
});

describe("DELETE /api/projects/:id/sources/:sourceId", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("404s for an unknown project", async () => {
    const res = await request(app).delete("/api/projects/proj-nope/sources/src-1");
    expect(res.status).toBe(404);
  });

  it("removes a binding entirely once its only evidence source is removed, making the claim unsupported again", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    const projectId = created.body.projectId;
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Claim text." } });
    await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [evidenceSpan({ sourceId: "src-1" })], strength: "strong", rationale: "x" } });

    const res = await request(app).delete(`/api/projects/${projectId}/sources/src-1`);
    expect(res.status).toBe(200);
    expect(res.body.claimGraph.bindings).toEqual([]);

    const unsupported = await request(app).get(`/api/projects/${projectId}/claims/unsupported`);
    expect(unsupported.body.claims.map((c: { id: string }) => c.id)).toEqual(["c1"]);
  });
});

function compliantOT04Document() {
  return {
    id: "doc-abstract",
    title: "Test Abstract",
    blocks: [
      { id: "background", kind: "paragraph", text: words(40) },
      { id: "objective", kind: "paragraph", text: words(25) },
      { id: "methods", kind: "paragraph", text: words(40) },
      { id: "results", kind: "paragraph", text: words(60) },
      { id: "conclusion", kind: "paragraph", text: words(25) },
    ],
  };
}

describe("claim graph changes recompute G6 when a document already exists (OT-04's usesClaimGraph gate)", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  it("an empty claim graph passes vacuously right after a compliant document is submitted", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-04" });
    const res = await request(app)
      .put(`/api/projects/${created.body.projectId}/document`)
      .send({ document: compliantOT04Document() });
    const finding = res.body.rubric.findings.find(
      (f: { ruleId: string }) => f.ruleId === "OT-04-claims-claims_traceable_to_source"
    );
    expect(finding.status).toBe("pass");
  });

  it("adding an unsupported claim after the document exists recomputes G6 and flips the gate to fail", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-04" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: compliantOT04Document() });

    const res = await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Effect X was observed." } });
    expect(res.status).toBe(201);
    const finding = res.body.rubric.findings.find(
      (f: { ruleId: string }) => f.ruleId === "OT-04-claims-claims_traceable_to_source"
    );
    expect(finding.status).toBe("fail");
    expect(res.body.rubric.readyForG6).toBe(false);
  });

  it("binding evidence to the claim recomputes G6 back to passing", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-04" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: compliantOT04Document() });
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Effect X was observed." } });

    const res = await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [evidenceSpan()], strength: "strong", rationale: "Direct measurement." } });
    expect(res.status).toBe(201);
    const finding = res.body.rubric.findings.find(
      (f: { ruleId: string }) => f.ruleId === "OT-04-claims-claims_traceable_to_source"
    );
    expect(finding.status).toBe("pass");
    expect(res.body.rubric.readyForG6).toBe(true);
  });

  it("removing the claim's only evidence source recomputes G6 back to failing", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-04" });
    const projectId = created.body.projectId;
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: compliantOT04Document() });
    await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: "c1", text: "Effect X was observed." } });
    await request(app)
      .post(`/api/projects/${projectId}/claims/c1/evidence`)
      .send({ binding: { id: "b1", claimId: "c1", evidence: [evidenceSpan({ sourceId: "src-1" })], strength: "strong", rationale: "x" } });

    const res = await request(app).delete(`/api/projects/${projectId}/sources/src-1`);
    expect(res.status).toBe(200);
    const finding = res.body.rubric.findings.find(
      (f: { ruleId: string }) => f.ruleId === "OT-04-claims-claims_traceable_to_source"
    );
    expect(finding.status).toBe("fail");
  });

  it("claim mutations before any document exists don't attempt a recompute (no rubric key on the response)", async () => {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-04" });
    const res = await request(app)
      .post(`/api/projects/${created.body.projectId}/claims`)
      .send({ claim: { id: "c1", text: "Effect X was observed." } });
    expect(res.status).toBe(201);
    expect(res.body.rubric).toBeUndefined();
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

describe("submission tracking (/api/projects/:id/submissions)", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    __resetRateLimitStore();
  });

  async function newProject() {
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    return created.body.projectId as string;
  }

  describe("GET", () => {
    it("starts empty", async () => {
      const projectId = await newProject();
      const res = await request(app).get(`/api/projects/${projectId}/submissions`);
      expect(res.status).toBe(200);
      expect(res.body.submissions).toEqual([]);
    });

    it("404s for an unknown project", async () => {
      const res = await request(app).get("/api/projects/proj-nope/submissions");
      expect(res.status).toBe(404);
    });
  });

  describe("POST", () => {
    it("400s when journalName is missing", async () => {
      const projectId = await newProject();
      const res = await request(app)
        .post(`/api/projects/${projectId}/submissions`)
        .send({ submittedAt: "2026-01-01", status: "submitted" });
      expect(res.status).toBe(400);
    });

    it("400s for an invalid status", async () => {
      const projectId = await newProject();
      const res = await request(app)
        .post(`/api/projects/${projectId}/submissions`)
        .send({ journalName: "Nature", submittedAt: "2026-01-01", status: "in_orbit" });
      expect(res.status).toBe(400);
    });

    it("404s for an unknown project", async () => {
      const res = await request(app)
        .post("/api/projects/proj-nope/submissions")
        .send({ journalName: "Nature", submittedAt: "2026-01-01", status: "draft" });
      expect(res.status).toBe(404);
    });

    it("assigns an id and statusUpdatedAt, ignoring any the client sent", async () => {
      const projectId = await newProject();
      const res = await request(app)
        .post(`/api/projects/${projectId}/submissions`)
        .send({
          id: "client-supplied",
          journalName: "Nature Machine Intelligence",
          journalUrl: "https://nature.com",
          submittedAt: "2026-01-01",
          status: "submitted",
          notes: "first attempt",
        });
      expect(res.status).toBe(201);
      expect(res.body.submissions).toHaveLength(1);
      const submission = res.body.submissions[0];
      expect(submission.id).toMatch(/^sub-/);
      expect(submission.id).not.toBe("client-supplied");
      expect(submission.journalName).toBe("Nature Machine Intelligence");
      expect(submission.notes).toBe("first attempt");
      expect(typeof submission.statusUpdatedAt).toBe("string");
    });

    it("persists across requests", async () => {
      const projectId = await newProject();
      await request(app)
        .post(`/api/projects/${projectId}/submissions`)
        .send({ journalName: "Nature", submittedAt: "2026-01-01", status: "draft" });
      const res = await request(app).get(`/api/projects/${projectId}/submissions`);
      expect(res.body.submissions).toHaveLength(1);
    });
  });

  describe("PATCH", () => {
    async function withSubmission(projectId: string) {
      const res = await request(app)
        .post(`/api/projects/${projectId}/submissions`)
        .send({ journalName: "Nature", submittedAt: "2026-01-01", status: "submitted" });
      return res.body.submissions[0].id as string;
    }

    it("404s for an unknown submission id", async () => {
      const projectId = await newProject();
      const res = await request(app)
        .patch(`/api/projects/${projectId}/submissions/sub-nope`)
        .send({ notes: "x" });
      expect(res.status).toBe(404);
    });

    it("400s for an invalid status", async () => {
      const projectId = await newProject();
      const submissionId = await withSubmission(projectId);
      const res = await request(app)
        .patch(`/api/projects/${projectId}/submissions/${submissionId}`)
        .send({ status: "in_orbit" });
      expect(res.status).toBe(400);
    });

    it("updates fields and bumps statusUpdatedAt on a real status change", async () => {
      const projectId = await newProject();
      const submissionId = await withSubmission(projectId);
      const before = (await request(app).get(`/api/projects/${projectId}/submissions`)).body.submissions[0];

      const res = await request(app)
        .patch(`/api/projects/${projectId}/submissions/${submissionId}`)
        .send({ status: "under_review" });
      expect(res.status).toBe(200);
      const updated = res.body.submissions[0];
      expect(updated.status).toBe("under_review");
      expect(updated.statusUpdatedAt).not.toBe(before.statusUpdatedAt);
    });

    it("does not bump statusUpdatedAt for a non-status edit", async () => {
      const projectId = await newProject();
      const submissionId = await withSubmission(projectId);
      const before = (await request(app).get(`/api/projects/${projectId}/submissions`)).body.submissions[0];

      const res = await request(app)
        .patch(`/api/projects/${projectId}/submissions/${submissionId}`)
        .send({ notes: "still waiting to hear back" });
      expect(res.status).toBe(200);
      const updated = res.body.submissions[0];
      expect(updated.notes).toBe("still waiting to hear back");
      expect(updated.statusUpdatedAt).toBe(before.statusUpdatedAt);
    });
  });

  describe("DELETE", () => {
    it("404s for an unknown submission id", async () => {
      const projectId = await newProject();
      const res = await request(app).delete(`/api/projects/${projectId}/submissions/sub-nope`);
      expect(res.status).toBe(404);
    });

    it("removes the submission", async () => {
      const projectId = await newProject();
      const created = await request(app)
        .post(`/api/projects/${projectId}/submissions`)
        .send({ journalName: "Nature", submittedAt: "2026-01-01", status: "draft" });
      const submissionId = created.body.submissions[0].id;

      const res = await request(app).delete(`/api/projects/${projectId}/submissions/${submissionId}`);
      expect(res.status).toBe(200);
      expect(res.body.submissions).toEqual([]);
    });
  });
});
