import { describe, it, expect, vi } from "vitest";
import { createPgProjectStore, type PgQueryable } from "../pgProjectStore";
import type { ProjectRecord } from "../types";

/**
 * No live Postgres here — a fake PgQueryable captures the SQL/params it was
 * called with and returns canned rows, so these tests verify row-mapping and
 * query shape without needing a database (createPool() is the one function
 * that touches a real connection, and isn't exercised by these tests).
 */
function fakeDb(rows: Record<string, unknown>[] = []): PgQueryable & { calls: { text: string; params?: unknown[] }[] } {
  const calls: { text: string; params?: unknown[] }[] = [];
  return {
    calls,
    async query(text: string, params?: unknown[]) {
      calls.push({ text, params });
      return { rows };
    },
  };
}

describe("services/store: pgProjectStore", () => {
  it("create() inserts a row with empty answers/waivers and an empty claim graph, and returns the same shape as the in-memory store", async () => {
    const db = fakeDb();
    const store = createPgProjectStore(db);
    const record = await store.create("OT-07", "11111111-1111-4111-8111-111111111111");

    expect(record.projectId).toMatch(/^proj-/);
    expect(record.ownerId).toBe("11111111-1111-4111-8111-111111111111");
    expect(record.outputTypeId).toBe("OT-07");
    expect(record.answers).toEqual({});
    expect(record.waivers).toEqual({});
    expect(record.submissions).toEqual([]);
    expect(record.claimGraph.claims).toEqual([]);
    expect(record.document).toBeUndefined();
    expect(record.rubricReport).toBeUndefined();

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].text).toMatch(/insert into public\.projects/i);
    expect(db.calls[0].params?.[0]).toBe(record.projectId);
    expect(db.calls[0].params?.[1]).toBe("11111111-1111-4111-8111-111111111111"); // owner_id
    expect(db.calls[0].params?.[2]).toBe("OT-07");
  });

  it("get() maps a jsonb row back into a ProjectRecord, treating null document/rubric_report as undefined", async () => {
    const db = fakeDb([
      {
        project_id: "proj-abc",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-07",
        answers: { research_question: "provisional" },
        gates: { G0: { status: "ready" } },
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
      },
    ]);
    const store = createPgProjectStore(db);
    const record = await store.get("proj-abc");

    expect(record).toBeDefined();
    expect(record?.ownerId).toBe("11111111-1111-4111-8111-111111111111");
    expect(record?.document).toBeUndefined();
    expect(record?.rubricReport).toBeUndefined();
    expect(record?.answers).toEqual({ research_question: "provisional" });
    // Row predates the submissions column — must default to an empty list, not undefined.
    expect(record?.submissions).toEqual([]);
    expect(db.calls[0].text).toMatch(/select \* from public\.projects where project_id = \$1/i);
    expect(db.calls[0].params).toEqual(["proj-abc"]);
  });

  it("get() returns undefined for a project id with no matching row", async () => {
    const store = createPgProjectStore(fakeDb([]));
    const record = await store.get("proj-does-not-exist");
    expect(record).toBeUndefined();
  });

  it("save() upserts on project_id and serializes document/rubric_report to null when absent", async () => {
    const db = fakeDb();
    const store = createPgProjectStore(db);
    const record: ProjectRecord = {
      projectId: "proj-xyz",
      ownerId: "11111111-1111-4111-8111-111111111111",
      outputTypeId: "OT-07",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
    };

    const saved = await store.save(record);
    expect(saved).toBe(record);
    expect(db.calls[0].text).toMatch(/on conflict \(project_id\) do update/i);
    expect(db.calls[0].params?.[5]).toBeNull(); // document
    expect(db.calls[0].params?.[6]).toBeNull(); // rubric_report
  });

  it("listByOwner() scopes the query to the owner in SQL, not in memory", async () => {
    const db = fakeDb([]);
    const store = createPgProjectStore(db);
    await store.listByOwner("11111111-1111-4111-8111-111111111111");

    // The owner filter must be in the WHERE clause. Selecting every row and
    // filtering after the fact would put one bug between a user and everyone
    // else's projects.
    expect(db.calls[0].text).toMatch(/where owner_id = \$1/i);
    expect(db.calls[0].params).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("save() serializes a present document as JSON, not passed through raw", async () => {
    const db = fakeDb();
    const store = createPgProjectStore(db);
    const record: ProjectRecord = {
      projectId: "proj-doc",
      ownerId: "11111111-1111-4111-8111-111111111111",
      outputTypeId: "OT-07",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      document: { id: "doc-1", title: "T", blocks: [] },
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
    };

    await store.save(record);
    const documentParam = db.calls[0].params?.[5];
    expect(typeof documentParam).toBe("string");
    expect(JSON.parse(documentParam as string)).toEqual(record.document);
  });

  it("journal_requirements round-trips: absent serializes to null, present serializes to JSON and get() rehydrates it", async () => {
    const insertDb = fakeDb();
    const insertStore = createPgProjectStore(insertDb);
    const withoutRequirements: ProjectRecord = {
      projectId: "proj-jr",
      ownerId: "11111111-1111-4111-8111-111111111111",
      outputTypeId: "OT-10",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
    };
    await insertStore.save(withoutRequirements);
    expect(insertDb.calls[0].params?.[10]).toBeNull();

    const journalRequirements: ProjectRecord["journalRequirements"] = {
      journalName: "Water Research",
      source: "manual",
      citationStyle: "vancouver",
      requiredDeclarations: ["funding"],
      capturedAt: "2026-01-01T00:00:00.000Z",
      capturedBy: "11111111-1111-4111-8111-111111111111",
    };
    const withDb = fakeDb();
    const withStore = createPgProjectStore(withDb);
    await withStore.save({ ...withoutRequirements, journalRequirements });
    const param = withDb.calls[0].params?.[10];
    expect(typeof param).toBe("string");
    expect(JSON.parse(param as string)).toEqual(journalRequirements);

    const getDb = fakeDb([
      {
        project_id: "proj-jr",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        journal_requirements: journalRequirements,
      },
    ]);
    const getStore = createPgProjectStore(getDb);
    const fetched = await getStore.get("proj-jr");
    expect(fetched?.journalRequirements).toEqual(journalRequirements);
  });

  it("evidence_ledger round-trips: serializes to JSON on save, defaults to an empty ledger when a row predates the column, and rehydrates when present", async () => {
    const record: ProjectRecord = {
      projectId: "proj-ev",
      ownerId: "11111111-1111-4111-8111-111111111111",
      outputTypeId: "OT-10",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: {
        sources: [
          { id: "src-1", title: "A Paper", authors: ["A"], sourceType: "scholarly", authorityTier: "B", discoveredVia: "arxiv", discoveredAt: "2026-01-01T00:00:00.000Z" },
        ],
        items: [],
      },
    };
    const saveDb = fakeDb();
    await createPgProjectStore(saveDb).save(record);
    const param = saveDb.calls[0].params?.[11];
    expect(typeof param).toBe("string");
    expect(JSON.parse(param as string)).toEqual(record.evidenceLedger);

    const staleRowDb = fakeDb([
      {
        project_id: "proj-old",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        // No evidence_ledger key at all — a row from before the migration.
      },
    ]);
    const staleFetched = await createPgProjectStore(staleRowDb).get("proj-old");
    expect(staleFetched?.evidenceLedger).toEqual({ sources: [], items: [] });

    const getDb = fakeDb([
      {
        project_id: "proj-ev",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        evidence_ledger: record.evidenceLedger,
      },
    ]);
    const fetched = await createPgProjectStore(getDb).get("proj-ev");
    expect(fetched?.evidenceLedger).toEqual(record.evidenceLedger);
  });

  it("generation_job round-trips: absent serializes to null, present serializes to JSON and get() rehydrates it", async () => {
    const generationJob: ProjectRecord["generationJob"] = {
      state: "running",
      plan: [{ key: "introduction", title: "Introduction", guidance: "g", targetWords: 500 }],
      sections: [],
      totalWordTarget: 6000,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const record: ProjectRecord = {
      projectId: "proj-gen",
      ownerId: "11111111-1111-4111-8111-111111111111",
      outputTypeId: "OT-10",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
      generationJob,
    };
    const saveDb = fakeDb();
    await createPgProjectStore(saveDb).save(record);
    const param = saveDb.calls[0].params?.[12];
    expect(typeof param).toBe("string");
    expect(JSON.parse(param as string)).toEqual(generationJob);

    const getDb = fakeDb([
      {
        project_id: "proj-gen",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        generation_job: generationJob,
      },
    ]);
    const fetched = await createPgProjectStore(getDb).get("proj-gen");
    expect(fetched?.generationJob).toEqual(generationJob);
  });

  it("peer_review_history round-trips: serializes to JSON on save, defaults to an empty history when a row predates the column, and rehydrates when present", async () => {
    const peerReviewHistory: ProjectRecord["peerReviewHistory"] = {
      rounds: [{ roundNumber: 1, lensReviews: [], lensesRun: [], lensErrors: {}, createdAt: "2026-01-01T00:00:00.000Z" }],
    };
    const record: ProjectRecord = {
      projectId: "proj-review",
      ownerId: "11111111-1111-4111-8111-111111111111",
      outputTypeId: "OT-10",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
      peerReviewHistory,
    };
    const saveDb = fakeDb();
    await createPgProjectStore(saveDb).save(record);
    const param = saveDb.calls[0].params?.[13];
    expect(typeof param).toBe("string");
    expect(JSON.parse(param as string)).toEqual(peerReviewHistory);

    const staleRowDb = fakeDb([
      {
        project_id: "proj-old2",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        // No peer_review_history key at all — a row from before the migration.
      },
    ]);
    const staleFetched = await createPgProjectStore(staleRowDb).get("proj-old2");
    expect(staleFetched?.peerReviewHistory).toEqual({ rounds: [] });

    const getDb = fakeDb([
      {
        project_id: "proj-review",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        peer_review_history: peerReviewHistory,
      },
    ]);
    const fetched = await createPgProjectStore(getDb).get("proj-review");
    expect(fetched?.peerReviewHistory).toEqual(peerReviewHistory);
  });

  it("cover_letter/anonymization_report/anonymized_document round-trip: serialize to JSON on save, default to undefined when a row predates the columns, and rehydrate when present", async () => {
    const coverLetter: ProjectRecord["coverLetter"] = { text: "Dear Editor,\n\n...", journalName: "Water Research", generatedAt: "2026-01-01T00:00:00.000Z" };
    const anonymizationReport: ProjectRecord["anonymizationReport"] = {
      proposals: [{ blockId: "acknowledgements", category: "acknowledgement", originalText: "Dr. Smith", replacementText: "[name removed]", reason: "Names a person." }],
      checkedAt: "2026-01-01T00:00:00.000Z",
    };
    const anonymizedDocument: ProjectRecord["anonymizedDocument"] = { id: "d1", title: "Paper", blocks: [{ id: "acknowledgements", kind: "paragraph", text: "We thank [name removed]." }] };
    const record: ProjectRecord = {
      projectId: "proj-anon",
      ownerId: "11111111-1111-4111-8111-111111111111",
      outputTypeId: "OT-10",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
      peerReviewHistory: { rounds: [] },
      coverLetter,
      anonymizationReport,
      anonymizedDocument,
    };
    const saveDb = fakeDb();
    await createPgProjectStore(saveDb).save(record);
    const params = saveDb.calls[0].params;
    expect(JSON.parse(params?.[14] as string)).toEqual(coverLetter);
    expect(JSON.parse(params?.[15] as string)).toEqual(anonymizationReport);
    expect(JSON.parse(params?.[16] as string)).toEqual(anonymizedDocument);

    const staleRowDb = fakeDb([
      {
        project_id: "proj-old3",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        // No cover_letter/anonymization_report/anonymized_document keys at all — a row from before the migration.
      },
    ]);
    const staleFetched = await createPgProjectStore(staleRowDb).get("proj-old3");
    expect(staleFetched?.coverLetter).toBeUndefined();
    expect(staleFetched?.anonymizationReport).toBeUndefined();
    expect(staleFetched?.anonymizedDocument).toBeUndefined();

    const getDb = fakeDb([
      {
        project_id: "proj-anon",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        cover_letter: coverLetter,
        anonymization_report: anonymizationReport,
        anonymized_document: anonymizedDocument,
      },
    ]);
    const fetchedRecord = await createPgProjectStore(getDb).get("proj-anon");
    expect(fetchedRecord?.coverLetter).toEqual(coverLetter);
    expect(fetchedRecord?.anonymizationReport).toEqual(anonymizationReport);
    expect(fetchedRecord?.anonymizedDocument).toEqual(anonymizedDocument);
  });

  it("source_count_override round-trips: serializes to JSON on save, defaults to undefined when a row predates the column, and rehydrates when present", async () => {
    const sourceCountOverride: ProjectRecord["sourceCountOverride"] = { reason: "Scoping review only.", acceptedBy: "u1", at: "2026-01-01T00:00:00.000Z" };
    const record: ProjectRecord = {
      projectId: "proj-g2",
      ownerId: "11111111-1111-4111-8111-111111111111",
      outputTypeId: "OT-10",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
      peerReviewHistory: { rounds: [] },
      sourceCountOverride,
    };
    const saveDb = fakeDb();
    await createPgProjectStore(saveDb).save(record);
    expect(JSON.parse(saveDb.calls[0].params?.[17] as string)).toEqual(sourceCountOverride);

    const staleRowDb = fakeDb([
      {
        project_id: "proj-old4",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        // No source_count_override key at all — a row from before the migration.
      },
    ]);
    expect((await createPgProjectStore(staleRowDb).get("proj-old4"))?.sourceCountOverride).toBeUndefined();

    const getDb = fakeDb([
      {
        project_id: "proj-g2",
        owner_id: "11111111-1111-4111-8111-111111111111",
        output_type_id: "OT-10",
        answers: {},
        gates: {},
        document: null,
        rubric_report: null,
        claim_graph: { claims: {}, evidence: {}, bindings: {} },
        waivers: {},
        submissions: [],
        source_count_override: sourceCountOverride,
      },
    ]);
    expect((await createPgProjectStore(getDb).get("proj-g2"))?.sourceCountOverride).toEqual(sourceCountOverride);
  });
});
