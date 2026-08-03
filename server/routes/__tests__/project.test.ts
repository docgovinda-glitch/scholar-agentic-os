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
