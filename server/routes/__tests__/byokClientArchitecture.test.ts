import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
    it("getCandidates() without req strictly returns empty array, ignoring server env keys", () => {
      const candidates = getCandidates();
      expect(candidates).toEqual([]);
      expect(candidates.length).toBe(0);
    });

    it("getCandidates(req) without x-ai headers returns empty array, never falling back to server keys", () => {
      const mockReq = { headers: {} } as any;
      const candidates = getCandidates(mockReq);
      expect(candidates).toEqual([]);
    });

    it("isServerAiAuthorized returns false when user has not provided request-scoped key", async () => {
      const mockReq = { headers: {} } as any;
      expect(await isServerAiAuthorized(mockReq)).toBe(false);
    });

    it("GET /api/ai/status reports BYOK tier and active model if provided via headers", async () => {
      const res = await request(app)
        .get("/api/ai/status")
        .set("x-ai-provider", "anthropic")
        .set("x-ai-model", "claude-3-7-sonnet-20250219")
        .set("x-ai-api-key", "sk-ant-test-key-1234");

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


  describe("Pillar 3: Transient Request-Scoped Candidate Resolution", () => {
    it("correctly extracts transient AI config from headers without persisting", async () => {
      const mockReq = {
        headers: {
          "x-ai-provider": "openrouter",
          "x-ai-api-key": "sk-or-v1-transient-secret-key",
          "x-ai-model": "meta-llama/llama-3.3-70b-instruct",
          "x-ai-base-url": "https://openrouter.ai/api/v1",
        },
      } as any;

      const config = resolveRequestAiConfig(mockReq);
      expect(config.provider).toBe("openrouter");
      expect(config.apiKey).toBe("sk-or-v1-transient-secret-key");
      expect(config.model).toBe("meta-llama/llama-3.3-70b-instruct");
      expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");

      const candidates = getCandidates(mockReq);
      expect(candidates.length).toBe(1);
      expect(candidates[0].provider).toBe("openrouter");
      expect(candidates[0].apiKey).toBe("sk-or-v1-transient-secret-key");
      expect(candidates[0].model).toBe("meta-llama/llama-3.3-70b-instruct");
      expect(await isServerAiAuthorized(mockReq)).toBe(true);
    });

    it("supports local runner configuration with localhost base-url and default model", async () => {
      const mockReq = {
        headers: {
          "x-ai-provider": "ollama",
          "x-ai-base-url": "http://localhost:11434",
          "x-ai-model": "qwen2.5-coder:32b",
        },
      } as any;

      const candidates = getCandidates(mockReq);
      expect(candidates.length).toBe(1);
      expect(candidates[0].provider).toBe("ollama");
      expect(candidates[0].model).toBe("qwen2.5-coder:32b");
      expect(candidates[0].baseUrl).toBe("http://localhost:11434");
      expect(await isServerAiAuthorized(mockReq)).toBe(true);
    });
  });
});
