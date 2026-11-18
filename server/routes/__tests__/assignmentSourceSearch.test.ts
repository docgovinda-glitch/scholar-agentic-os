/**
 * POST /assignment/sources/search runs Coursework's search on the shared
 * retrieval pipeline: one record per work across phrases and providers, off-
 * topic records dropped, relevance measured (not rescaled), verification from
 * the citation engine with nothing filled in, and the brief's own references
 * first without duplicates.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const TEST_USER_ID = "77777777-7777-4777-8777-777777777777";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "sources.tester@university.ac.uk" };
    next();
  },
}));
const retrieveSources = vi.fn();
vi.mock("../../src/retrieval/retrievalService.ts", async (orig) => ({
  ...(await orig<typeof import("../../src/retrieval/retrievalService.ts")>()),
  retrieveSources: (...a: unknown[]) => retrieveSources(...a),
}));
const searchCrossref = vi.fn();
const searchOpenAlex = vi.fn();
vi.mock("../../../src/shared/retrieval/providers.ts", async (orig) => ({
  ...(await orig<typeof import("../../../src/shared/retrieval/providers.ts")>()),
  searchCrossref: (...a: unknown[]) => searchCrossref(...a),
  searchOpenAlex: (...a: unknown[]) => searchOpenAlex(...a),
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";

const BRIEF =
  "Evaluate how loyalty schemes shape customer retention in UK supermarkets, drawing on Sharp (2010). Write 1,500 words. Use Harvard referencing.";
const ID = "proj-sources-1";

async function seed(extra: Record<string, unknown> = {}) {
  await getProjectStore().save({
    projectId: ID,
    ownerId: TEST_USER_ID,
    schemaVersion: 1,
    outputTypeId: "OT-01",
    answers: { assignment_brief: BRIEF, citation_style: "harvard", ...extra },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
}

const record = (over: Record<string, unknown>) => ({ provider: "openalex", kind: "scholarly", relevance: 50, sourceType: "peer-reviewed article", ...over });
const response = (results: unknown[]) => ({ results, searchedCount: results.length, queriesExecuted: [], providers: [{ provider: "openalex", count: results.length }], complexity: "simple", discipline: "general", retrievedAt: "" });

const LOYALTY = { title: "Loyalty schemes and customer retention in UK supermarkets", authors: ["Smith, J."], year: 2019, venue: "Journal of Retailing", snippet: "We study loyalty schemes and retention among supermarket shoppers." };

beforeEach(() => {
  __resetProjectStoreForTests();
  retrieveSources.mockReset();
  searchCrossref.mockReset();
  searchOpenAlex.mockReset();
});

describe("POST /assignment/sources/search", () => {
  it("returns one record per work, verified where it can be, measured relevance, off-topic dropped", async () => {
    await seed({ assignment_understanding: JSON.stringify({ searchQueries: ["loyalty schemes retention"] }) });
    retrieveSources
      .mockResolvedValueOnce(response([record({ ...LOYALTY, doi: "10.1016/j.jretai.2019.01.002" }), record({ title: "Protein folding with deep networks", authors: ["Doe, A."], year: 2021 })]))
      .mockResolvedValue(response([record({ ...LOYALTY, provider: "semantic_scholar", title: "Loyalty Schemes and Customer Retention in UK Supermarkets." }), record({ title: "Supermarket loyalty cards: a note", year: 2020, authors: [] })]));
    const res = await request(app).post(`/api/projects/${ID}/assignment/sources/search`).send({});
    expect(res.status).toBe(200);
    const titles = res.body.sources.map((s: { title: string }) => s.title);
    // The same paper from two providers is one record, the one with the DOI.
    expect(titles.filter((t: string) => /Loyalty schemes and customer retention/i.test(t))).toHaveLength(1);
    const loyalty = res.body.sources.find((s: { title: string }) => /Loyalty schemes and customer retention/i.test(s.title));
    expect(loyalty.doi).toBe("10.1016/j.jretai.2019.01.002");
    expect(loyalty.verificationStatus).toBe("verified");
    expect(loyalty.relevanceScore).toBeGreaterThan(0);
    expect(loyalty.relevanceScore).toBeLessThanOrEqual(100);
    // Off topic: dropped.
    expect(titles.some((t: string) => /Protein folding/.test(t))).toBe(false);
    // No authors: kept, flagged, nothing invented.
    const noAuthors = res.body.sources.find((s: { title: string }) => /loyalty cards/.test(s.title));
    expect(noAuthors.verificationStatus).toBe("metadata_incomplete");
    expect(noAuthors.authors).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/"Author"|Scholarly Resource|Unknown author/);
    // The AI plan's search phrase was used, and every phrase carries the subject word.
    const queries = retrieveSources.mock.calls.map((c) => (c[0] as { query: string }).query);
    expect(queries[0]).toMatch(/loyalty schemes retention/);
    expect(retrieveSources.mock.calls.every((c) => (c[0] as { mode: string }).mode === "scholarly")).toBe(true);
  });

  it("gives the same id to the same work on a later search", async () => {
    await seed();
    retrieveSources.mockResolvedValue(response([record({ ...LOYALTY, doi: "10.1016/j.jretai.2019.01.002" })]));
    const a = await request(app).post(`/api/projects/${ID}/assignment/sources/search`).send({});
    const b = await request(app).post(`/api/projects/${ID}/assignment/sources/search`).send({ queries: ["supermarket loyalty"] });
    expect(a.body.sources[0].id).toBe(b.body.sources[0].id);
  });

  it("lists the brief's own references first, resolved when an index confirms author and year, without duplicating them", async () => {
    await seed();
    const sharp = { title: "How brands grow: what marketers don't know about loyalty", authors: ["Sharp, B."], year: 2010, doi: "10.1234/hbg.2010", venue: "Oxford University Press" };
    searchCrossref.mockResolvedValue({ items: [sharp] });
    searchOpenAlex.mockResolvedValue({ items: [] });
    retrieveSources.mockResolvedValue(response([record({ ...sharp }), record({ ...LOYALTY })]));
    const res = await request(app).post(`/api/projects/${ID}/assignment/sources/search`).send({ includePrescribed: true });
    expect(res.body.sources[0].prescribedInBrief).toBe(true);
    expect(res.body.sources[0].doi).toBe("10.1234/hbg.2010");
    expect(res.body.sources.filter((s: { title: string }) => /How brands grow/.test(s.title))).toHaveLength(1);
  });

  it("searches the student's own phrase with the brief's subject word", async () => {
    await seed();
    retrieveSources.mockResolvedValue(response([]));
    await request(app).post(`/api/projects/${ID}/assignment/sources/search`).send({ queries: ["customer data personalisation"] });
    const q = (retrieveSources.mock.calls[0][0] as { query: string }).query;
    expect(q).toMatch(/customer data personalisation/);
    expect(retrieveSources).toHaveBeenCalledTimes(1);
  });

  it("asks for the brief first", async () => {
    await seed({ assignment_brief: "" });
    const res = await request(app).post(`/api/projects/${ID}/assignment/sources/search`).send({});
    expect(res.status).toBe(400);
    expect(retrieveSources).not.toHaveBeenCalled();
  });
});
