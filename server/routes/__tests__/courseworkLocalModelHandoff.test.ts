/**
 * The whole browser hand-off round trip for Coursework drafting, through the
 * real AI plumbing: the router chain, the fallback across connections, the
 * signed challenge and its verification. Nothing here is mocked except the
 * provider adapter at the very edge and the signed-in user.
 *
 * It reproduces the student setup the hand-off exists for: a cloud connection
 * first and their own model (Ollama, LM Studio) behind it, on a deployed
 * server that cannot reach that model (ALLOW_SERVER_LOCAL_AI unset, as on
 * Render). The cloud model fails after the event stream has opened, so no 426
 * can be sent; the prompt has to go back over the open stream instead.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const TEST_USER_ID = "44444444-4444-4444-8444-444444444444";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "handoff@example.test" };
    next();
  },
}));

process.env.LLM_CHALLENGE_SECRET = "test-challenge-secret";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_handoff_test";

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { configureRouterBridge } from "../../src/ai/routerBridge.ts";
import { clearLiveModelState, setLiveModelsFetch } from "../../src/ai/liveModels.ts";
import { CircuitBreaker, MemoryBreakerStore } from "../../../src/platform/router/circuitBreaker.ts";
import { ProviderHttpError } from "../../../src/platform/router/errors.ts";
import type { AdapterChunk, Candidate, ProviderAdapter } from "../../../src/platform/router/types.ts";

/** The student's cloud connection: out of credit, like the one that started this. */
const deadCloud: ProviderAdapter = {
  // eslint-disable-next-line require-yield
  async *stream(_c: Candidate): AsyncIterable<AdapterChunk> {
    throw new ProviderHttpError(429, "This account has no remaining credit or quota with the provider.");
  },
};

const keyring = (entries: unknown[]) => Buffer.from(JSON.stringify(entries)).toString("base64url");
/** A cloud key first, the student's own model behind it: the chain this bug needs. */
const CLOUD_THEN_LOCAL = keyring([
  { provider: "openai", model: "gpt-dead", apiKey: "sk-test-NOT-A-REAL-KEY-000" },
  { provider: "ollama", model: "llama3" },
]);

const events = (body: string) =>
  body
    .split("\n\n")
    .filter((l) => l.startsWith("data: {"))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);

/** supertest does not buffer an event stream by default. */
const sse = (req: request.Test) =>
  req.buffer(true).parse((r, cb) => {
    let d = "";
    r.on("data", (c: Buffer) => (d += c));
    r.on("end", () => cb(null, d));
  });

async function createProject(): Promise<string> {
  const project = {
    projectId: "proj-coursework-local-handoff",
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: { assignment_brief: "Discuss non-Western IR theory.", assignment_type: "essay" },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await getProjectStore().save(project as any);
  return project.projectId;
}

const SECTION = { sectionTitle: "1.0 Introduction to Non-Western IR Theory", allocatedWords: 250 };
const draft = (id: string, body: Record<string, unknown>) =>
  sse(request(app).post(`/api/projects/${id}/assignment/stream-section`).set("x-ai-keyring", CLOUD_THEN_LOCAL).send(body));

beforeEach(() => {
  __resetProjectStoreForTests();
  clearLiveModelState();
  // No test reaches a real provider: the model list fails, so named models are trusted as given.
  setLiveModelsFetch((async () => { throw new Error("offline"); }) as unknown as typeof fetch);
  configureRouterBridge({ adapters: { openai: deadCloud }, breaker: new CircuitBreaker(new MemoryBreakerStore()) });
  // As on Render: a deployed server cannot reach the student's own model. (Unset
  // means the same there, since it falls back to NODE_ENV !== "production".)
  process.env.ALLOW_SERVER_LOCAL_AI = "false";
});

describe("Coursework drafting on the student's own model", () => {
  it("hands the prompt back, then writes the section from the answer the browser returns", async () => {
    const id = await createProject();

    // 1. The cloud model fails after the stream has opened. The prompt comes
    //    back instead of the dead-end error the student used to see.
    const first = await draft(id, SECTION);
    expect(first.status).toBe(200);
    expect(first.headers["content-type"]).toContain("text/event-stream");

    const handOff = events(first.body as string).find((e) => e.requireFrontendLLM) as
      | { challengeToken: string; systemPrompt: string; userPrompt: string }
      | undefined;
    expect(handOff, "the server asks the browser to run the prompt").toBeTruthy();
    expect(handOff!.challengeToken).toBeTruthy();
    expect(handOff!.userPrompt).toContain("Non-Western IR Theory");
    // Nothing was written in its place.
    expect(first.body as string).not.toContain("fullText");

    // 2. What the browser's own model answers, sent back with the challenge.
    const localAnswer =
      "Western international relations theory has long presented itself as universal. " +
      "This report asks what Hindu philosophical traditions offer in its place, and why that question matters now.";
    const second = await draft(id, { ...SECTION, llmResult: localAnswer, challengeToken: handOff!.challengeToken });

    expect(second.status).toBe(200);
    const finished = events(second.body as string).find((e) => typeof e.fullText === "string");
    expect(finished, "the section is finished from the browser's answer").toBeTruthy();
    expect(finished!.fullText).toContain("Hindu philosophical traditions");
    // The section is the student's model's prose, not a scaffold or an error.
    expect(second.body as string).not.toContain("offline_scaffold");
    expect(second.body as string).not.toContain("recoverable");
  });

  it("an answer signed for a different prompt is refused, and no section is written", async () => {
    const id = await createProject();
    const handOff = events((await draft(id, SECTION)).body as string).find((e) => e.requireFrontendLLM) as { challengeToken: string };

    // The same signed challenge offered for a different section: its prompt hash no longer matches.
    const res = await draft(id, { ...SECTION, sectionTitle: "5.0 Conclusion", llmResult: "Not this section.", challengeToken: handOff.challengeToken });
    expect(events(res.body as string).some((e) => typeof e.fullText === "string" && String(e.fullText).includes("Not this section."))).toBe(false);
  });
});
