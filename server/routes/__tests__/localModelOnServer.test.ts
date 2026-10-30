import { describe, it, expect, afterEach, vi } from "vitest";

const TEST_USER_ID = "44444444-4444-4444-8444-444444444444";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "local.model@example.org" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { resolveClientAiConfig, serverCanReachLocalModels } from "../../src/ai/clientAiConfig.ts";
import { scholarBrain } from "../../src/services/scholarBrain.ts";
import { LocalModelUnreachableError } from "../../src/ai/aiRouteErrors.ts";

// A deployed server cannot reach a model on the user's computer ("localhost"
// is the server itself). ALLOW_SERVER_LOCAL_AI=false simulates production.
const saved = process.env.ALLOW_SERVER_LOCAL_AI;
afterEach(() => {
  if (saved === undefined) delete process.env.ALLOW_SERVER_LOCAL_AI;
  else process.env.ALLOW_SERVER_LOCAL_AI = saved;
  vi.restoreAllMocks();
});

const LOCAL = { "x-ai-provider": "ollama", "x-ai-base-url": "http://localhost:11434" };

describe("local models are never called from a deployed server", () => {
  it("is reachable in development and tests, not in production", () => {
    delete process.env.ALLOW_SERVER_LOCAL_AI;
    const env = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(serverCanReachLocalModels()).toBe(false);
      process.env.NODE_ENV = "development";
      expect(serverCanReachLocalModels()).toBe(true);
    } finally {
      process.env.NODE_ENV = env;
    }
  });

  it("yields no server candidate for any catalog runner, and flags browser-only", () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    for (const provider of ["ollama", "lmstudio", "jan", "llamacpp", "koboldcpp", "textgenwebui"]) {
      const cfg = resolveClientAiConfig({ "x-ai-provider": provider });
      expect(cfg.candidates).toEqual([]);
      expect(cfg.localModelBrowserOnly).toBe(true);
    }
    // Cloud keys are unaffected.
    expect(resolveClientAiConfig({ "x-ai-provider": "openai", "x-ai-api-key": "k" }).candidates).toHaveLength(1);
  });

  it("scholarBrain says the local model is unreachable instead of calling the server's localhost", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    await expect(
      scholarBrain.complete({ req: { headers: LOCAL }, systemPrompt: "s", userPrompt: "u", taskClass: "reasoning" })
    ).rejects.toBeInstanceOf(LocalModelUnreachableError);
  });

  it("a server-only feature returns a clear 400 for a local model", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-09" });
    const res = await request(app)
      .post(`/api/projects/${created.body.projectId}/thesis/viva-simulate`)
      .set(LOCAL)
      .send({ title: "T", researchQuestions: ["RQ?"] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ai_local_model_unreachable");
    expect(res.body.error).toMatch(/can't reach a model running on your computer/);
  });

  it("a browser-capable feature hands the prompt to the browser (426) for a local model", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
    const res = await request(app).post(`/api/projects/${created.body.projectId}/agent/gaps`).set(LOCAL).send({});
    expect(res.status).toBe(426);
    expect(res.body.requireFrontendLLM).toBe(true);
  });
});
