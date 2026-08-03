import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../../server.ts";
import { __resetSessionPoliciesForTests } from "../../../src/app/studio/sessionPolicyStore.ts";
import { __resetAuditLogForTests } from "../../../src/platform/warden/warden.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";

const originalFetch = global.fetch;

describe("POST /api/studio/refine", () => {
  beforeEach(() => {
    __resetSessionPoliciesForTests();
    __resetAuditLogForTests();
    __resetRateLimitStore();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("400s on a missing required field", async () => {
    const res = await request(app).post("/api/studio/refine").send({ sessionId: "s1", passageId: "p1" });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid intervention level", async () => {
    const res = await request(app)
      .post("/api/studio/refine")
      .send({ sessionId: "s1", passageId: "p1", text: "hello", level: "not-a-real-level" });
    expect(res.status).toBe(400);
  });

  it("runs Level 1 (proofread) fully deterministically with no provider/apiKey and no outbound call", async () => {
    global.fetch = vi.fn();
    const res = await request(app)
      .post("/api/studio/refine")
      .send({ sessionId: "s1", passageId: "p1", text: "The results was  significant.", level: "proofread" });
    expect(res.status).toBe(200);
    expect(res.body.diff.changes.length).toBeGreaterThan(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 428 consent_required for a model-backed level on first use of a provider", async () => {
    global.fetch = vi.fn();
    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "s2",
      passageId: "p2",
      text: "This shows that it is quite important.",
      level: "clarity",
      provider: "openai",
      apiKey: "sk-test",
    });
    expect(res.status).toBe(428);
    expect(res.body.error).toBe("consent_required");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("proceeds once consent is recorded via /api/studio/consent for the same session", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                revised: "The cohort comprised 240 participants.",
                changes: [{ original: "sample", replacement: "cohort", reason: "Avoids repetition." }],
              }),
            },
          },
        ],
      }),
    });

    const consentRes = await request(app)
      .post("/api/studio/consent")
      .send({ sessionId: "s3", provider: "openai" });
    expect(consentRes.status).toBe(200);

    const refineRes = await request(app).post("/api/studio/refine").send({
      sessionId: "s3",
      passageId: "p3",
      text: "The sample comprised 240 participants.",
      level: "clarity",
      provider: "openai",
      apiKey: "sk-test",
    });
    expect(refineRes.status).toBe(200);
    expect(refineRes.body.languageChangeCount).toBe(1);
    expect(refineRes.body.diff.changes[0].reason).toBe("Avoids repetition.");
  });

  it("consent recorded for one session does not leak to another session", async () => {
    global.fetch = vi.fn();
    await request(app).post("/api/studio/consent").send({ sessionId: "session-A", provider: "openai" });

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "session-B",
      passageId: "p4",
      text: "Some text to refine.",
      level: "clarity",
      provider: "openai",
      apiKey: "sk-test",
    });
    expect(res.status).toBe(428);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("denies content in a scope marked restricted, even with prior provider consent", async () => {
    global.fetch = vi.fn();
    await request(app).post("/api/studio/consent").send({ sessionId: "s4", provider: "openai" });
    const restrictRes = await request(app)
      .post("/api/studio/restrict")
      .send({ sessionId: "s4", scopeId: "project-embargoed" });
    expect(restrictRes.status).toBe(200);

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "s4",
      passageId: "p5",
      text: "the trial enrolled 40 participants under ethics approval",
      level: "clarity",
      provider: "openai",
      apiKey: "sk-test",
      scopeId: "project-embargoed",
    });
    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("a restricted scope does not affect other scopes on the same session", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ revised: "x", changes: [] }) } }] }),
    });
    await request(app).post("/api/studio/consent").send({ sessionId: "s4b", provider: "openai" });
    await request(app).post("/api/studio/restrict").send({ sessionId: "s4b", scopeId: "project-embargoed" });

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "s4b",
      passageId: "p5b",
      text: "an ordinary passage in a different project",
      level: "clarity",
      provider: "openai",
      apiKey: "sk-test",
      scopeId: "project-ordinary",
    });
    expect(res.status).toBe(200);
  });

  it("rejects an unknown L1 profile", async () => {
    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "s5",
      passageId: "p6",
      text: "hello",
      level: "proofread",
      l1: "klingon",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/studio/egress-audit", () => {
  beforeEach(() => {
    __resetSessionPoliciesForTests();
    __resetAuditLogForTests();
    __resetRateLimitStore();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reflects calls made through /api/studio/refine, content-free", async () => {
    // Level 1 (proofread) makes no Warden evaluation at all — it's fully
    // deterministic and never egresses (that's the point). Use a
    // model-backed level so there is an evaluation to audit; the 428 is
    // expected (no consent recorded) and the audit entry is written before
    // that response is returned.
    await request(app).post("/api/studio/refine").send({
      sessionId: "s6",
      passageId: "p7",
      text: "a very secret sentence to refine",
      level: "clarity",
      provider: "openai",
      apiKey: "sk-test",
    });

    const res = await request(app).get("/api/studio/egress-audit");
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body.entries)).not.toContain("secret sentence");
  });
});
