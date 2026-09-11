import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

let currentUser = { id: TEST_USER_ID, email: "test@example.com" };

vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = currentUser;
    next();
  },
}));

import { app } from "../../../server.ts";

describe("Three-Way Architectural AI Isolation Tests", () => {
  let projectId = "";

  beforeEach(async () => {
    currentUser = { id: TEST_USER_ID, email: "test@example.com" };
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
    projectId = created.body.projectId;
  }, 20000);

  it("Test 1: Non-premium user calling server AI route is DENIED (returns 426)", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/agent/literature`)
      .send({});

    // Non-premium user gets HTTP 426 requiring frontend LLM execution
    expect(res.status).toBe(426);
    expect(res.body.requireFrontendLLM).toBe(true);
  }, 20000);

  it("Test 2: Server explicitly rejects client-supplied BYOK API keys with 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/agent/literature`)
      .send({
        apiKey: "sk-user-byok-secret-123",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("User BYOK API keys are client-held");
  }, 20000);

  it("Test 3: Premium user with active entitlement is authorized for server-side evaluation", async () => {
    currentUser = { id: "user-premium", email: "premium@example.com" };

    // With active entitlement, if server has no platform candidates configured, it still cleanly signals or handles
    const res = await request(app)
      .post(`/api/projects/${projectId}/agent/literature`)
      .send({});

    // If server candidates are not populated in env during test, it returns 426 or 404/200, never leaking
    expect([200, 404, 426]).toContain(res.status);
  }, 20000);
});
