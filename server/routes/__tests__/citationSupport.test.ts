import { describe, it, expect, beforeEach, vi } from "vitest";
import { keyringHeader } from "../../test/aiTestKit.ts";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

const { aiCallMock } = vi.hoisted(() => ({ aiCallMock: vi.fn() }));
vi.mock("../../src/ai/routerBridge.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/ai/routerBridge.ts")>();
  const { NoClientAiProviderError } = await import("../../src/ai/aiRouteErrors.ts");
  return {
    ...real,
    routedCompletion: async (req: Parameters<typeof real.routedCompletion>[0], call: Parameters<typeof real.routedCompletion>[1]) => {
      if ((await real.aiAvailability(req, call.task)) === "none") throw new NoClientAiProviderError();
      return aiCallMock({ systemPrompt: call.systemPrompt, userPrompt: call.userPrompt });
    },
  };
});

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore, type ProjectRecord } from "../../../src/services/store/projectStore.ts";

const AI_HEADERS = keyringHeader("openai", "gpt-4o-mini", "test-key");
const SOURCES = JSON.stringify([
  { id: "a", title: "Sleep study", authors: ["J. Smith"], year: 2020, keyFindings: "Participants who slept recalled 20% more word pairs." },
  { id: "b", title: "Caffeine trial", authors: ["K. Lee"], year: 2021, keyFindings: "Caffeine had no effect on recall." },
]);

async function project(id: string, answers: Record<string, string>) {
  const rec: ProjectRecord = {
    projectId: id,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-10",
    answers,
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await getProjectStore().save(rec);
  return id;
}

describe("POST /api/projects/:id/agentic/citations/support", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    aiCallMock.mockReset();
  });

  it("checks each citing sentence against the saved source record, keeping only grounded verdicts", async () => {
    const id = await project("proj-support-1", {
      manuscript_markdown: "Sleep improves recall [CITE:a]. Caffeine improves recall too [CITE:b].",
      approved_vault_sources: SOURCES,
    });
    aiCallMock.mockResolvedValue(
      JSON.stringify({
        results: [
          { key: "p1", verdict: "supports", quote: "recalled 20% more word pairs", reason: "States it." },
          { key: "p2", verdict: "does_not_support", quote: "Caffeine had no effect on recall", reason: "Says the opposite." },
        ],
      })
    );
    const res = await request(app).post(`/api/projects/${id}/agentic/citations/support`).set(AI_HEADERS).send({ manuscript: "ignored" });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { verdict: string }) => r.verdict)).toEqual(["supports", "does_not_support"]);
    // The AI saw the saved record, not anything from the request.
    const prompt = aiCallMock.mock.calls[0][0].userPrompt as string;
    expect(prompt).toContain("SOURCE TEXT: Participants who slept recalled 20% more word pairs.");
    expect(prompt).not.toContain("ignored");
    expect(typeof res.body.fingerprint).toBe("string");
  });

  it("says when there is nothing to check, and never calls the AI for sources with no record", async () => {
    const empty = await project("proj-support-2", { manuscript_markdown: "No citations here." });
    const none = await request(app).post(`/api/projects/${empty}/agentic/citations/support`).set(AI_HEADERS).send({});
    expect(none.status).toBe(400);
    expect(none.body.code).toBe("nothing_to_check");

    const bare = await project("proj-support-3", {
      manuscript_markdown: "A claim [CITE:x].",
      approved_vault_sources: JSON.stringify([{ id: "x", title: "No notes", authors: [], year: 2020 }]),
    });
    const res = await request(app).post(`/api/projects/${bare}/agentic/citations/support`).set(AI_HEADERS).send({});
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ verdict: "cannot_tell", note: "no_source_text" });
    expect(aiCallMock).not.toHaveBeenCalled();
  });

  it("reports an unreadable AI answer instead of guessing", async () => {
    const id = await project("proj-support-4", { manuscript_markdown: "Sleep helps [CITE:a].", approved_vault_sources: SOURCES });
    aiCallMock.mockResolvedValue("I think it is fine.");
    const res = await request(app).post(`/api/projects/${id}/agentic/citations/support`).set(AI_HEADERS).send({});
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("ai_unusable");
  });

  it("only works on the caller's own project", async () => {
    const res = await request(app).post(`/api/projects/someone-else/agentic/citations/support`).set(AI_HEADERS).send({});
    expect(res.status).toBe(404);
  });
});
