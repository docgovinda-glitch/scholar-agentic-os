import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { keyringHeader } from "../../test/aiTestKit.ts";
import request from "supertest";
import {
  getCandidates,
  resolveRequestAiConfig,
  isServerAiAuthorized,
} from "../../utils/llm.ts";

export const TEST_USER_ID = "22222222-2222-4222-8222-222222222222";

let currentUser = { id: TEST_USER_ID, email: "byok-user@example.com" };

vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = currentUser;
    next();
  },
}));

import { app } from "../../../server.ts";

describe("Strict Client-Owned BYOK Architecture Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "server-owned-gemini-key";
    process.env.OPENROUTER_API_KEY = "server-owned-openrouter-key";
    process.env.ANTHROPIC_API_KEY = "server-owned-anthropic-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("Pillar 1: Zero Server-Sponsored AI Credentials", () => {



    it("GET /api/ai/status reports BYOK tier and active model if provided via headers", async () => {
      const res = await request(app)
        .get("/api/ai/status")
        .set(keyringHeader("anthropic", "claude-3-7-sonnet-20250219", "sk-ant-test-key-1234"));

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe("byok");
      expect(res.body.activeModel).toBe("claude-3-7-sonnet-20250219");
      expect(res.body.serverSponsoredAi).toBe(false);
      expect(res.body.configured).toBe(true);
    });

    it("GET /api/ai/status reports configured: false when headers are absent", async () => {
      const res = await request(app).get("/api/ai/status");

      expect(res.status).toBe(200);
      expect(res.body.tier).toBe("byok");
      expect(res.body.configured).toBe(false);
      expect(res.body.serverSponsoredAi).toBe(false);
    });
  });
});
