/**
 * Tests for POST /api/projects/:id/manuscript/resolve-citations — turning
 * approved evidence into real in-text citations and a rendered References
 * section, deterministically (no model call).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { getSharedStore } from "../project.ts";
import { sourceToReference } from "../../../src/app/citation/resolveCitations.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { __setEnabledOutputTypesForTests } from "../outputTypeAccess.ts";

beforeEach(() => {
  __resetProjectStoreForTests();
  __resetRateLimitStore();
  __setEnabledOutputTypesForTests(["OT-10"]);
});

async function createProject(): Promise<string> {
  const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
  return res.body.projectId;
}

function otTenDocument(introText: string) {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
  return {
    id: "doc-1",
    title: "A Paper",
    blocks: [
      { id: "abstract", kind: "paragraph", text: words(200) },
      { id: "introduction", kind: "paragraph", text: introText },
      { id: "methods", kind: "paragraph", text: words(300) },
      { id: "results", kind: "paragraph", text: words(300) },
      { id: "discussion", kind: "paragraph", text: words(300) },
      { id: "declarations", kind: "paragraph", text: "See metadata." },
      { id: "references", kind: "paragraph", text: "" },
    ],
  };
}

async function addSourceAndCitableEvidence(projectId: string, claimId: string, titleTag: string): Promise<{ sourceId: string; evidenceId: string }> {
  await request(app).post(`/api/projects/${projectId}/claims`).send({ claim: { id: claimId, text: "A claim." } });
  const sourceRes = await request(app)
    .post(`/api/projects/${projectId}/evidence-ledger/sources`)
    .send({ title: `Title of ${titleTag}`, authors: ["Jane Q. Smith"], sourceType: "scholarly", authorityTier: "A", venue: "Journal of Testing", year: 2023 });
  const sourceId = sourceRes.body.sources[0].id;
  const extractRes = await request(app)
    .post(`/api/projects/${projectId}/evidence-ledger/sources/${sourceId}/extract`)
    .send({ quote: "A verbatim quote." });
  const evidenceId = extractRes.body.items[0].id;
  await request(app).post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/verify`).send({ actor: "u1" });
  await request(app).post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/propose`).send({ claimId, actor: "u1" });
  await request(app)
    .post(`/api/projects/${projectId}/evidence-ledger/items/${evidenceId}/approve`)
    .send({ actor: "u1", strength: "strong", rationale: "Direct measurement." });
  const store = getSharedStore();
  const record = await store.get(projectId);
  if (record) {
    record.evidenceLedger.sources = record.evidenceLedger.sources.map(s => {
      if (s.id === sourceId) {
        return { ...s, citationStatus: "confirmed", canonicalReference: sourceToReference(s) };
      }
      return s;
    });
    // Ensure the item reaches citable state since the source is now confirmed
    record.evidenceLedger.items = record.evidenceLedger.items.map(i => {
      if (i.sourceId === sourceId && i.state === "user_approved") {
        return { ...i, state: "citable" };
      }
      return i;
    });
    await store.save(record);
  }

  return { sourceId, evidenceId };
}

describe("POST /api/projects/:id/manuscript/resolve-citations", () => {
  it("400s when no document has been submitted yet", async () => {
    const projectId = await createProject();
    const res = await request(app).post(`/api/projects/${projectId}/manuscript/resolve-citations`).send({});
    expect(res.status).toBe(400);
  });

  it("400s for an unrecognised citation style", async () => {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument("Plain text.") });
    const res = await request(app).post(`/api/projects/${projectId}/manuscript/resolve-citations`).send({ style: "apa-6" });
    expect(res.status).toBe(400);
  });

  it("is a safe no-op when the document has no bracket-ids", async () => {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument("Plain text, no citations.") });
    const res = await request(app).post(`/api/projects/${projectId}/manuscript/resolve-citations`).send({ style: "apa-7" });
    expect(res.status).toBe(200);
    expect(res.body.citedSourceIds).toEqual([]);
  });

  it("resolves a real bracket-id into a real in-text citation and a rendered References section, using the explicit style", async () => {
    const projectId = await createProject();
    const { evidenceId } = await addSourceAndCitableEvidence(projectId, "c1", "s1");

    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument(`This point is supported [${evidenceId}].`) });

    const res = await request(app).post(`/api/projects/${projectId}/manuscript/resolve-citations`).send({ style: "vancouver" });
    expect(res.status).toBe(200);
    expect(res.body.citedSourceIds).toHaveLength(1);
    expect(res.body.unresolvedIds).toEqual([]);

    const doc = await request(app).get(`/api/projects/${projectId}/document`);
    const intro = doc.body.blocks.find((b: { id: string }) => b.id === "introduction");
    expect(intro.text).toBe("This point is supported [1].");
    const refs = doc.body.blocks.find((b: { id: string }) => b.id === "references");
    expect(refs.text).toContain("Title of s1");
    expect(refs.text).toContain("Smith J");
  });

  it("defaults to the captured journal's citation style when none is given in the body", async () => {
    const projectId = await createProject();
    const { evidenceId } = await addSourceAndCitableEvidence(projectId, "c1", "s1");

    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument(`Supported [${evidenceId}].`) });
    await request(app)
      .put(`/api/projects/${projectId}/journal-requirements`)
      .send({ journalName: "Water Research", citationStyle: "ieee", requiredDeclarations: [] });

    const res = await request(app).post(`/api/projects/${projectId}/manuscript/resolve-citations`).send({});
    expect(res.status).toBe(200);
    const doc = await request(app).get(`/api/projects/${projectId}/document`);
    const intro = doc.body.blocks.find((b: { id: string }) => b.id === "introduction");
    expect(intro.text).toBe("Supported [1]."); // IEEE also uses numbered markers
  });

  it("leaves an unresolved bracket-id in place and reports it, never fabricating a citation", async () => {
    const projectId = await createProject();
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument("A claim [ev-does-not-exist].") });

    const res = await request(app).post(`/api/projects/${projectId}/manuscript/resolve-citations`).send({ style: "apa-7" });
    expect(res.status).toBe(200);
    expect(res.body.unresolvedIds).toEqual(["ev-does-not-exist"]);

    const doc = await request(app).get(`/api/projects/${projectId}/document`);
    const intro = doc.body.blocks.find((b: { id: string }) => b.id === "introduction");
    expect(intro.text).toBe("A claim [ev-does-not-exist].");
  });

  it("recomputes the Rubric report so the References section's compliance is re-evaluated", async () => {
    const projectId = await createProject();
    const { evidenceId } = await addSourceAndCitableEvidence(projectId, "c1", "s1");
    await request(app).put(`/api/projects/${projectId}/document`).send({ document: otTenDocument(`Supported [${evidenceId}].`) });

    const res = await request(app).post(`/api/projects/${projectId}/manuscript/resolve-citations`).send({ style: "apa-7" });
    expect(res.status).toBe(200);
    expect(res.body.rubric).toBeDefined();
    expect(res.body.gates).toBeDefined();
  });
});
