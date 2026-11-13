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
const GUIDELINES = `Journal of Quantum Systems guide for authors. Research Articles should not exceed 6,000 words, excluding references and figure legends.
Manuscripts are organised as Introduction, Methods, Results and Discussion. References follow the IEEE numbered style.
All submissions must include a Data Availability statement and a declaration of competing interests before review can begin.`;

async function project(id: string) {
  const rec: ProjectRecord = {
    projectId: id,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-10",
    answers: {},
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await getProjectStore().save(rec);
  return id;
}

describe("POST /api/projects/:id/agentic/journal-profile/extract", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    aiCallMock.mockReset();
  });

  it("uses the user's AI and keeps only what the guidelines state", async () => {
    const id = await project("proj-profile-1");
    aiCallMock.mockResolvedValue(
      JSON.stringify({
        journalName: "Journal of Quantum Systems",
        wordLimit: { max: 6000 },
        citationStyle: "APA 7",
        structureOverride: ["Introduction", "Methods", "Results", "Discussion"],
        requiredDeclarations: ["Data availability statement", "Ethics approval"],
        articleType: "Research Articles",
        unresolvedFields: [],
      }),
    );
    const res = await request(app).post(`/api/projects/${id}/agentic/journal-profile/extract`).set(AI_HEADERS).send({ guidelinesText: GUIDELINES });
    expect(res.status).toBe(200);
    expect(aiCallMock.mock.calls[0][0].userPrompt).toBe(GUIDELINES);
    expect(res.body.proposal).toMatchObject({
      journalName: "Journal of Quantum Systems",
      wordLimit: { max: 6000 },
      structureOverride: ["Introduction", "Methods", "Results", "Discussion"],
      requiredDeclarations: ["Data availability statement"],
      articleType: "Research Articles",
    });
    // APA 7 and ethics approval are not in the text: dropped and flagged.
    expect(res.body.proposal.citationStyle).toBeUndefined();
    expect(res.body.proposal.unresolvedFields).toEqual(expect.arrayContaining(["citationStyle", "requiredDeclarations"]));
  });

  it("refuses short text, and says so when no AI is connected", async () => {
    const id = await project("proj-profile-2");
    const short = await request(app).post(`/api/projects/${id}/agentic/journal-profile/extract`).set(AI_HEADERS).send({ guidelinesText: "Use APA." });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe("guidelines_too_short");
    const noAi = await request(app).post(`/api/projects/${id}/agentic/journal-profile/extract`).send({ guidelinesText: GUIDELINES });
    expect(noAi.status).toBeGreaterThanOrEqual(400);
    expect(aiCallMock).not.toHaveBeenCalled();
  });

  it("an unreadable AI answer saves nothing and says so", async () => {
    const id = await project("proj-profile-3");
    aiCallMock.mockResolvedValue("Sure! The journal wants about 6000 words.");
    const res = await request(app).post(`/api/projects/${id}/agentic/journal-profile/extract`).set(AI_HEADERS).send({ guidelinesText: GUIDELINES });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe("ai_unusable");
  });
});
