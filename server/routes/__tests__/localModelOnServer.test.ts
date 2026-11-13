import { describe, it, expect, afterEach, vi } from "vitest";
import { keyringHeader } from "../../test/aiTestKit.ts";

const TEST_USER_ID = "44444444-4444-4444-8444-444444444444";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "local.model@example.org" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { serverCanReachLocalModels } from "../../src/ai/serverLocalAccess.ts";
import { scholarBrain } from "../../src/services/scholarBrain.ts";
import {
  BrowserAiRequiredError,
  InvalidLlmChallengeError,
  LocalModelUnreachableError,
  NoClientAiProviderError,
} from "../../src/ai/aiRouteErrors.ts";

// A deployed server cannot reach a model on the user's computer ("localhost"
// is the server itself). ALLOW_SERVER_LOCAL_AI=false simulates production.
const saved = process.env.ALLOW_SERVER_LOCAL_AI;
afterEach(() => {
  if (saved === undefined) delete process.env.ALLOW_SERVER_LOCAL_AI;
  else process.env.ALLOW_SERVER_LOCAL_AI = saved;
  vi.restoreAllMocks();
});

const LOCAL = keyringHeader("ollama", "test-model", undefined, "http://localhost:11434");

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


  it("scholarBrain says the local model is unreachable instead of calling the server's localhost", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    await expect(
      scholarBrain.complete({ req: { headers: LOCAL }, systemPrompt: "s", userPrompt: "u", taskClass: "reasoning" })
    ).rejects.toBeInstanceOf(LocalModelUnreachableError);
  });

  it("scholarBrain hands the prompt to the browser when the route opts in, and accepts only a matching signed result", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    const user = { id: TEST_USER_ID };
    let handoff: BrowserAiRequiredError | undefined;
    try {
      await scholarBrain.complete({
        req: { headers: LOCAL, user, body: {} },
        browserFallback: true,
        systemPrompt: "Answer briefly.",
        userPrompt: "What is a viva?",
      });
    } catch (e) {
      handoff = e as BrowserAiRequiredError;
    }
    expect(handoff).toBeInstanceOf(BrowserAiRequiredError);
    expect(handoff!.payload.userPrompt).toBe("What is a viva?");
    expect(handoff!.payload.systemPrompt).toContain("Answer briefly.");

    const ok = await scholarBrain.complete({
      req: { headers: LOCAL, user, body: { llmResult: "An oral examination.", challengeToken: handoff!.payload.challengeToken } },
      browserFallback: true,
      systemPrompt: "Answer briefly.",
      userPrompt: "What is a viva?",
    });
    expect(ok.text).toContain("oral examination");
    expect(ok.provider).toBe("browser-local");

    // The token is bound to the prompt and the user: neither can be swapped.
    await expect(
      scholarBrain.complete({
        req: { headers: LOCAL, user, body: { llmResult: "x", challengeToken: handoff!.payload.challengeToken } },
        browserFallback: true,
        systemPrompt: "Answer briefly.",
        userPrompt: "A different prompt",
      })
    ).rejects.toBeInstanceOf(InvalidLlmChallengeError);
    await expect(
      scholarBrain.complete({
        req: { headers: LOCAL, user: { id: "someone-else" }, body: { llmResult: "x", challengeToken: handoff!.payload.challengeToken } },
        browserFallback: true,
        systemPrompt: "Answer briefly.",
        userPrompt: "What is a viva?",
      })
    ).rejects.toBeInstanceOf(InvalidLlmChallengeError);
  });

  it("with no AI set up at all, an opted-in route still says to connect a provider (no hand-off)", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    await expect(
      scholarBrain.complete({ req: { headers: {} }, browserFallback: true, userPrompt: "u" })
    ).rejects.toBeInstanceOf(NoClientAiProviderError);
  });

  it("Thesis viva runs on a browser-local model: 426 with the prompt, then 200 with the browser's answer", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-09" });
    const url = `/api/projects/${created.body.projectId}/thesis/viva-simulate`;
    const body = { title: "Rural clinic wait times", researchQuestions: ["What drives wait times?"] };

    const first = await request(app).post(url).set(LOCAL).send(body);
    expect(first.status).toBe(426);
    expect(first.body.requireFrontendLLM).toBe(true);
    expect(first.body.userPrompt).toContain("What drives wait times?");

    const browserAnswer = {
      questions: [
        {
          category: "Methodology",
          examinerQuestion: "How did you measure wait times?",
          assessmentFocus: "Measurement validity",
          suggestedRebuttalStructure: ["Describe the data source"],
        },
      ],
    };
    const second = await request(app)
      .post(url)
      .set(LOCAL)
      .send({ ...body, llmResult: browserAnswer, challengeToken: first.body.challengeToken });
    expect(second.status).toBe(200);
    expect(JSON.stringify(second.body)).toContain("How did you measure wait times?");

    const forged = await request(app)
      .post(url)
      .set(LOCAL)
      .send({ ...body, llmResult: browserAnswer, challengeToken: "forged" });
    expect(forged.status).toBe(403);
    expect(forged.body.code).toBe("ai_challenge_invalid");
  });

  it("a browser-capable feature hands the prompt to the browser (426) for a local model", async () => {
    process.env.ALLOW_SERVER_LOCAL_AI = "false";
    const created = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
    const res = await request(app).post(`/api/projects/${created.body.projectId}/agent/gaps`).set(LOCAL).send({});
    expect(res.status).toBe(426);
    expect(res.body.requireFrontendLLM).toBe(true);
  });
});
