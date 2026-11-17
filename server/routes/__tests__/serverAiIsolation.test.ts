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

  it("Test 1: with no AI connected, a server AI route hands the prompt to the browser (426)", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/agentic/peer-review`)
      .send({});

    expect(res.status).toBe(426);
    expect(res.body.requireFrontendLLM).toBe(true);
  }, 20000);

  it("Test 2: Server explicitly rejects client-supplied BYOK API keys with 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/agentic/peer-review`)
      .send({
        apiKey: "sk-user-byok-secret-123",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("User BYOK API keys are client-held");
  }, 20000);
});
