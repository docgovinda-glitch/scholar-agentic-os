import { describe, it, expect, vi } from "vitest";
import request from "supertest";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import { app } from "../../../server.ts";

describe("Server Ingress Protection — BYOK Credential Rejection", () => {
  it("rejects POST /api/studio/refine with 400 when an apiKey is submitted", async () => {
    const res = await request(app)
      .post("/api/studio/refine")
      .send({
        sessionId: "test-sess",
        passageId: "test-passage",
        text: "Sample text",
        level: "clarity",
        apiKey: "sk-user-byok-secret-123",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("User BYOK API keys are client-held");
  });

  it("rejects POST /api/studio/refine with 400 when api_key or providerKey is submitted", async () => {
    const res = await request(app)
      .post("/api/studio/refine")
      .send({
        sessionId: "test-sess",
        passageId: "test-passage",
        text: "Sample text",
        level: "clarity",
        api_key: "sk-user-byok-secret-123",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("User BYOK API keys are client-held");
  });

  it("confirms /api/ai-access/verify-provider-key is 404 (removed from server)", async () => {
    const res = await request(app)
      .post("/api/ai-access/verify-provider-key")
      .send({
        providerId: "gemini",
        apiKey: "sk-user-byok-secret-123",
      });

    expect(res.status).toBe(404);
  });
});
