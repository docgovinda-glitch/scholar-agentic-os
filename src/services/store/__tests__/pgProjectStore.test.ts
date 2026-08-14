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
});
