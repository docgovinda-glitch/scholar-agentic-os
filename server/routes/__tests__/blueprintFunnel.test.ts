import { describe, it, expect, beforeEach, vi } from "vitest";

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

const AI_HEADERS = { "x-ai-provider": "openai", "x-ai-model": "gpt-4o-mini", "x-ai-api-key": "test-key" };
async function project(id: string) {
  const rec: ProjectRecord = {
    projectId: id, ownerId: TEST_USER_ID, schemaVersion: 1, outputTypeId: "OT-10", answers: {}, gates: [],
    manuscriptJob: null, peerReviewHistory: { rounds: [] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await getProjectStore().save(rec);
  return id;
}

const OPENALEX_WORKS = {
  results: [
    {
      id: "https://openalex.org/W1", doi: "https://doi.org/10.1/rural", title: "Governing clinical AI in rural hospitals", publication_year: 2024,
      abstract_inverted_index: { Rural: [0], settings: [1], were: [2], not: [3], examined: [4] },
      primary_location: { source: { display_name: "Health Policy" } }, authorships: [{ author: { display_name: "A. Rai" } }],
    },
  ],
};
const CROSSREF_WORKS = {
  message: { items: [{ DOI: "10.2/audit", title: ["Audit trails for diagnostic algorithms"], abstract: "<jats:p>Their effect on clinician trust has not been tested.</jats:p>", "container-title": ["BMJ Health & Care Informatics"], published: { "date-parts": [[2023]] }, author: [{ given: "B", family: "Lee" }] }] },
};

let openAlexUp = true;
const fetchMock = vi.fn(async (input: string | URL) => {
  const url = String(input);
  if (url.includes("api.openalex.org/works") && url.includes("group_by") === false && url.includes("select=title%2Cprimary_location")) {
    if (!openAlexUp) return new Response("budget", { status: 429 });
    return Response.json({ results: [
      { title: "J1", primary_location: { source: { id: "https://openalex.org/S1", display_name: "Health Policy", issn_l: "0168-8510", host_organization_name: "Elsevier" } } },
      { title: "J2", primary_location: { source: { id: "https://openalex.org/S1", display_name: "Health Policy" } } },
      { title: "J3", primary_location: { source: { id: "https://openalex.org/S2", display_name: "JMIR AI" } } },
    ] });
  }
  if (url.includes("api.openalex.org/sources")) return Response.json({ results: [{ id: "https://openalex.org/S1", homepage_url: "https://www.journals.elsevier.com/health-policy", is_oa: false }] });
  if (url.includes("api.openalex.org/works")) return openAlexUp ? Response.json(OPENALEX_WORKS) : new Response("budget", { status: 429 });
  if (url.includes("api.crossref.org/works")) return Response.json(CROSSREF_WORKS);
  return new Response("unexpected " + url, { status: 500 });
});

describe("Mode 1 blueprint funnel routes", () => {
  beforeEach(() => {
    __resetProjectStoreForTests();
    aiCallMock.mockReset();
    fetchMock.mockClear();
    openAlexUp = true;
    vi.stubGlobal("fetch", fetchMock);
  });

  it("finds gaps only from real papers, and drops a gap whose quote is not in its paper", async () => {
    const id = await project("proj-bp-1");
    aiCallMock.mockResolvedValue(JSON.stringify({ gaps: [
      { type: "contextual", statement: "Rural hospitals are unstudied.", whyItMatters: "Pilots are urban.", evidence: [{ paper: "p1", quote: "Rural settings were not examined" }] },
      { statement: "Made up.", evidence: [{ paper: "p1", quote: "a trial of 4,000 patients showed benefit" }] },
    ] }));
    const res = await request(app).post(`/api/projects/${id}/agentic/blueprint/gaps`).set(AI_HEADERS).send({ interest: "AI governance in healthcare" });
    expect(res.status).toBe(200);
    expect(res.body.papers[0]).toMatchObject({ key: "p1", doi: "10.1/rural", abstract: "Rural settings were not examined", source: "openalex" });
    expect(res.body.gaps).toHaveLength(1);
    expect(res.body.dropped).toBe(1);
    // The AI saw the papers it had to cite.
    expect(aiCallMock.mock.calls[0][0].userPrompt).toContain("[p1] Governing clinical AI in rural hospitals (2024)");
  });

  it("falls back to Crossref when OpenAlex refuses", async () => {
    const id = await project("proj-bp-2");
    openAlexUp = false;
    aiCallMock.mockResolvedValue(JSON.stringify({ gaps: [{ statement: "Trust effect untested.", evidence: [{ paper: "p1", quote: "effect on clinician trust has not been tested" }] }] }));
    const res = await request(app).post(`/api/projects/${id}/agentic/blueprint/gaps`).set(AI_HEADERS).send({ interest: "AI governance in healthcare" });
    expect(res.status).toBe(200);
    expect(res.body.papers[0]).toMatchObject({ source: "crossref", doi: "10.2/audit", venue: "BMJ Health & Care Informatics" });
    expect(res.body.gaps[0].evidence[0].paperKey).toBe("p1");
  });

  it("needs an AI for gaps and says so, and validates input", async () => {
    const id = await project("proj-bp-3");
    const res = await request(app).post(`/api/projects/${id}/agentic/blueprint/gaps`).send({ interest: "AI governance in healthcare" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(aiCallMock).not.toHaveBeenCalled();
    expect((await request(app).post(`/api/projects/${id}/agentic/blueprint/gaps`).set(AI_HEADERS).send({ interest: "x" })).status).toBe(400);
  });

  it("suggests questions and titles without stated results", async () => {
    const id = await project("proj-bp-4");
    aiCallMock.mockResolvedValue(JSON.stringify({ questions: ["How do rural managers govern clinical AI tools?", "Does AI cut errors by 40%?"], titles: ["Governing Clinical AI Beyond the City"] }));
    const res = await request(app).post(`/api/projects/${id}/agentic/blueprint/questions`).set(AI_HEADERS).send({ interest: "AI governance", gap: { statement: "Rural hospitals are unstudied." } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ questions: ["How do rural managers govern clinical AI tools?"], titles: ["Governing Clinical AI Beyond the City"] });
  });

  it("matches journals from the index with no AI, and states nothing the index lacks", async () => {
    const id = await project("proj-bp-5");
    const res = await request(app).post(`/api/projects/${id}/agentic/blueprint/journals`).send({ query: "AI governance in rural hospitals" });
    expect(res.status).toBe(200);
    expect(aiCallMock).not.toHaveBeenCalled();
    const [first, second] = res.body.journals;
    expect(first).toMatchObject({ name: "Health Policy", publisher: "Elsevier", matchingWorks: 2, searchedWorks: 3, homepage: "https://www.journals.elsevier.com/health-policy", isOpenAccess: false });
    expect(first.rationale).toMatch(/^Published 2 of the 3 most relevant articles on this topic since \d{4}, e\.g\. “J1”\.$/);
    expect(second.name).toBe("JMIR AI");
    for (const k of ["wordLimit", "citationStyle", "reviewFormat"]) expect(first).not.toHaveProperty(k);
  });
});
