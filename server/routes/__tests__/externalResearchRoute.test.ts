import { describe, it, expect, beforeEach, vi } from "vitest";
import { keyringHeader } from "../../test/aiTestKit.ts";

const TEST_USER_ID = "33333333-3333-4333-8333-333333333333";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "journal.tester@example.org" };
    next();
  },
}));

const llmCalls = vi.fn();
vi.mock("../../utils/llm.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/llm.ts")>();
  return { ...actual, streamOpenRouterJSON: (...a: unknown[]) => llmCalls(...a) };
});

vi.mock("../../src/discovery/discovery.ts", () => ({
  discoverMultiPortalSources: vi.fn(),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { discoverMultiPortalSources } from "../../src/discovery/discovery.ts";

process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_journal_test";

const PROJECT_ID = "proj-journal-external-1";

async function createJournalProject() {
  await getProjectStore().save({
    projectId: PROJECT_ID,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-10",
    answers: { working_title: "Quorum intersection bounds" },
    gates: [],
    manuscriptJob: null,
    peerReviewHistory: { rounds: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
}

const doneEvent = (text: string) => {
  const m = text.match(/event: done\ndata: (.*)\n/);
  return m ? JSON.parse(m[1]) : null;
};

describe("POST /api/projects/:id/agent/external-research (P0-2)", () => {
  beforeEach(async () => {
    __resetProjectStoreForTests();
    vi.clearAllMocks();
    await createJournalProject();
  });

  it("returns only scholarly-index records and never asks an LLM to generate papers", async () => {
    vi.mocked(discoverMultiPortalSources).mockResolvedValueOnce([
      {
        title: "Attention Is All You Need",
        authors: ["Ashish Vaswani", "Noam Shazeer"],
        year: 2017,
        doi: "10.48550/arXiv.1706.03762",
        venue: "NeurIPS",
        discoveredVia: "openalex",
        sourceType: "scholarly",
        authorityTier: "A",
      },
    ] as any);

    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/agent/external-research`)
      .send({ query: "self-attention" });

    expect(res.status).toBe(200);
    expect(llmCalls).not.toHaveBeenCalled();
    const done = doneEvent(res.text);
    expect(done.data).toHaveLength(1);
    expect(done.data[0]).toMatchObject({ title: "Attention Is All You Need", doi: "10.48550/arXiv.1706.03762", year: 2017 });
    // Nothing invented: no relevance, citation count or snippet were supplied.
    expect(done.data[0].relevance).toBeUndefined();
    expect(done.data[0].citation_count).toBeUndefined();
    expect(done.data[0].snippet).toBe("");
  });

  it("returns an empty list when the indexes find nothing", async () => {
    vi.mocked(discoverMultiPortalSources).mockResolvedValueOnce([]);
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/agent/external-research`)
      .send({ query: "nothing matches this" });
    expect(doneEvent(res.text).data).toEqual([]);
    expect(llmCalls).not.toHaveBeenCalled();
  });

  it("streams an error, not invented results, when the search fails", async () => {
    vi.mocked(discoverMultiPortalSources).mockRejectedValueOnce(new Error("upstream down"));
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/agent/external-research`)
      .send({ query: "anything" });
    expect(res.text).toMatch(/event: error/);
    expect(doneEvent(res.text)).toBeNull();
  });
});

describe("POST /api/projects/:id/agent/literature (P1-7, retired)", () => {
  beforeEach(async () => {
    __resetProjectStoreForTests();
    vi.clearAllMocks();
    await createJournalProject();
  });

  it("no longer exists, so no LLM can be asked to generate sources", async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/agent/literature`)
      .set(keyringHeader("ollama"))
      .send({});
    expect(res.status).toBe(404);
    expect(llmCalls).not.toHaveBeenCalled();
  });
});
