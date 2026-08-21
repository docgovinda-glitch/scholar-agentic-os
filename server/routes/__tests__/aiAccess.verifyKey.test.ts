/**
 * Tests ensuring POST /api/ai-access/verify-provider-key is completely removed
 * from the server to prevent user BYOK credentials from reaching backend routes.
 */
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

describe("POST /api/ai-access/verify-provider-key removal", () => {
  it("returns 404 because user BYOK verification has moved to client-side", async () => {
    const res = await request(app)
      .post("/api/ai-access/verify-provider-key")
      .send({ providerId: "openai", apiKey: "sk-test" });
    expect(res.status).toBe(404);
  });
});
