import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

  it("400s when a client sends an apiKey to enforce client-only BYOK boundary", async () => {
    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "s2",
      passageId: "p2",
      text: "This shows that it is quite important.",
      level: "clarity",
      provider: "openai",
      apiKey: "sk-test",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("User BYOK API keys are client-held");
  });

  it("400s when a client sends providerKey or secret in payload", async () => {
    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "s2",
      passageId: "p2",
      text: "This shows that it is quite important.",
      level: "clarity",
      providerKey: "sk-test",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("User BYOK API keys are client-held");
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

function longSample(wordCount: number): string {
  // Varied sentence lengths so meanSentenceLength/stdDev aren't degenerate.
  const sentences: string[] = [];
  let remaining = wordCount;
  let i = 0;
  while (remaining > 0) {
    const len = Math.min(remaining, 8 + (i % 6));
    sentences.push(Array.from({ length: len }, () => "word").join(" ") + ".");
    remaining -= len;
    i += 1;
  }
  return sentences.join(" ");
}

describe("POST /api/studio/voice-profile", () => {
  beforeEach(() => {
    __resetRateLimitStore();
  });

  it("400s when samples is missing or empty", async () => {
    const missing = await request(app).post("/api/studio/voice-profile").send({});
    expect(missing.status).toBe(400);

    const empty = await request(app).post("/api/studio/voice-profile").send({ samples: [] });
    expect(empty.status).toBe(400);
  });

  it("400s when the combined samples fall below the minimum word count", async () => {
    const res = await request(app).post("/api/studio/voice-profile").send({ samples: ["Too short."] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("1000");
  });

  it("builds a Voice Profile from sufficiently long samples", async () => {
    const res = await request(app).post("/api/studio/voice-profile").send({ samples: [longSample(1200)] });
    expect(res.status).toBe(200);
    expect(res.body.sampleWordCount).toBeGreaterThanOrEqual(1000);
    expect(typeof res.body.meanSentenceLength).toBe("number");
  });

  it("combines multiple samples toward the minimum", async () => {
    const res = await request(app)
      .post("/api/studio/voice-profile")
      .send({ samples: [longSample(600), longSample(600)] });
    expect(res.status).toBe(200);
    expect(res.body.sampleWordCount).toBeGreaterThanOrEqual(1000);
  });
});

describe("POST /api/studio/refine with a voiceProfile", () => {
  beforeEach(() => {
    __resetSessionPoliciesForTests();
    __resetAuditLogForTests();
    __resetRateLimitStore();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("400s on a malformed voiceProfile", async () => {
    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "vp1",
      passageId: "p1",
      text: "The results was  significant.",
      level: "proofread",
      voiceProfile: { notAProfile: true },
    });
    expect(res.status).toBe(400);
  });

  it("runs without a voiceProfile with no voiceDrift field in the result", async () => {
    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "vp2",
      passageId: "p2",
      text: "The results was  significant.",
      level: "proofread",
    });
    expect(res.status).toBe(200);
    expect(res.body.voiceDrift).toBeUndefined();
  });

  it("accepts a real voiceProfile built via POST /api/studio/voice-profile and reports drift for out-of-range text", async () => {
    const profileRes = await request(app)
      .post("/api/studio/voice-profile")
      .send({ samples: [longSample(1200)] }); // short, varied sentences — low mean length
    expect(profileRes.status).toBe(200);

    const longWindedText =
      "This is an extraordinarily long and deliberately convoluted sentence, constructed specifically to push the mean sentence length far outside the range the author's own writing sample established, since the profile above was built from many short clipped sentences averaging well under ten words each, and this single passage on its own already exceeds that average by a wide margin, so drift detection ought to flag it.";

    const res = await request(app).post("/api/studio/refine").send({
      sessionId: "vp3",
      passageId: "p3",
      text: longWindedText,
      level: "proofread",
      voiceProfile: profileRes.body,
    });
    expect(res.status).toBe(200);
    expect(res.body.voiceDrift).toBeDefined();
    expect(res.body.voiceDrift.drifted).toBe(true);
  });
});
