import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: { user?: { id: string; email: string } }, _res: unknown, next: () => void) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getProjectStore, type ProjectRecord } from "../../../src/services/store/projectStore.ts";

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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Stands in for Crossref and DataCite; records which URLs were asked for. */
function registries(routes: Record<string, () => Response>) {
  const asked: string[] = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!/api\.(crossref|datacite)\.org/.test(url)) return realFetch(input, init);
    asked.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    return hit ? hit[1]() : new Response("not found", { status: 404 });
  });
  return asked;
}

describe("POST /api/projects/:id/agentic/references/*", () => {
  beforeEach(() => __resetProjectStoreForTests());
  afterEach(() => vi.unstubAllGlobals());

  it("looks up a DOI at Crossref and reports a registered retraction", async () => {
    const id = await project("proj-ref-1");
    const asked = registries({
      "api.crossref.org/works/10.1000%2Fretracted": () =>
        json({
          message: {
            type: "journal-article",
            title: ["A withdrawn result"],
            author: [{ given: "Jane", family: "Smith" }],
            "container-title": ["Journal of Tests"],
            issued: { "date-parts": [[2019]] },
            abstract: "<jats:p>We found things.</jats:p>",
            "updated-by": [{ type: "retraction", DOI: "10.1000/notice" }],
          },
        }),
    });
    const res = await request(app).post(`/api/projects/${id}/agentic/references/lookup`).send({ doi: "https://doi.org/10.1000/retracted" });
    expect(res.status).toBe(200);
    expect(res.body.record).toMatchObject({
      id: "doi_10_1000_retracted",
      title: "A withdrawn result",
      authors: [{ family: "Smith", given: "Jane" }],
      year: 2019,
      container: "Journal of Tests",
      registry: "crossref",
      integrity: { status: "retracted", notice: "https://doi.org/10.1000/notice" },
    });
    expect(res.body.abstract).toBe("We found things.");
    expect(asked).toEqual(["https://api.crossref.org/works/10.1000%2Fretracted"]);
  });

  it("falls back to DataCite, which can't say 'clean'", async () => {
    const id = await project("proj-ref-2");
    registries({
      "api.datacite.org/dois/10.5281%2Fzenodo.1": () =>
        json({ data: { attributes: { titles: [{ title: "Raw data" }], creators: [{ name: "Lovelace, Ada" }], publicationYear: 2024, types: { resourceTypeGeneral: "Dataset" } } } }),
    });
    const res = await request(app).post(`/api/projects/${id}/agentic/references/lookup`).send({ doi: "10.5281/zenodo.1" });
    expect(res.status).toBe(200);
    expect(res.body.record).toMatchObject({ kind: "dataset", registry: "datacite", integrity: { status: "unknown" } });
  });

  it("says what went wrong: not a DOI, not registered, registries down", async () => {
    const id = await project("proj-ref-3");
    registries({});
    const bad = await request(app).post(`/api/projects/${id}/agentic/references/lookup`).send({ doi: "hello" });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("invalid_doi");

    const missing = await request(app).post(`/api/projects/${id}/agentic/references/lookup`).send({ doi: "10.1000/nothing" });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe("doi_not_found");

    vi.unstubAllGlobals();
    registries({ "api.crossref.org": () => new Response("busy", { status: 503 }), "api.datacite.org": () => new Response("busy", { status: 503 }) });
    const down = await request(app).post(`/api/projects/${id}/agentic/references/lookup`).send({ doi: "10.1000/x" });
    expect(down.status).toBe(502);
    expect(down.body.code).toBe("registry_unreachable");
  });

  it("checks many DOIs; one that can't be reached is 'unknown', never 'clean'", async () => {
    const id = await project("proj-ref-4");
    registries({
      "works/10.1000%2Fa": () => json({ message: { type: "journal-article" } }),
      "works/10.1000%2Fb": () => json({ message: { "updated-by": [{ type: "expression_of_concern" }] } }),
      "works/10.1000%2Fc": () => new Response("busy", { status: 503 }),
    });
    const res = await request(app)
      .post(`/api/projects/${id}/agentic/references/check`)
      .send({ dois: ["10.1000/a", "https://doi.org/10.1000/b", "10.1000/c", "10.1000/a", "junk"] });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.results).sort()).toEqual(["10.1000/a", "10.1000/b", "10.1000/c"]);
    expect(res.body.results["10.1000/a"].status).toBe("clean");
    expect(res.body.results["10.1000/b"].status).toBe("concern");
    expect(res.body.results["10.1000/c"].status).toBe("unknown");

    const none = await request(app).post(`/api/projects/${id}/agentic/references/check`).send({ dois: [] });
    expect(none.status).toBe(400);
  });

  it("only works on the caller's own project", async () => {
    const res = await request(app).post(`/api/projects/not-mine/agentic/references/lookup`).send({ doi: "10.1000/x" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/projects/:id/export/markdown with the rendered manuscript", () => {
  beforeEach(() => __resetProjectStoreForTests());

  it("exports the text the workspace sends, with its citations already formatted", async () => {
    const id = await project("proj-ref-export");
    await getProjectStore().save({ ...(await getProjectStore().get(id))!, answers: { working_title: "T", manuscript_markdown: "Raw [CITE:a]." } });
    const res = await request(app)
      .post(`/api/projects/${id}/export/markdown`)
      .send({ manuscriptMarkdown: "Rendered (Smith, 2020).\n\n## References\n\nSmith, J. (2020). Title." });
    expect(res.status).toBe(200);
    expect(res.text).toContain("Rendered (Smith, 2020).");
    expect(res.text).not.toContain("[CITE:a]");

    const stored = await request(app).post(`/api/projects/${id}/export/markdown`).send({});
    expect(stored.text).toContain("Raw [CITE:a].");
  });
});

