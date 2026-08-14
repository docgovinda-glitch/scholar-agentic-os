/**
 * Tests for the Data API store.
 *
 * No live Supabase: a fake fetch captures the URL, method, headers, and body,
 * so these assert the request shape PostgREST actually needs. That shape is
 * the whole risk surface here — the store is thin, but a wrong `Prefer`
 * header silently turns an upsert into a duplicate-key error, and a filter in
 * the wrong place silently returns other users' rows.
 */

import { describe, it, expect } from "vitest";
import { createRestProjectStore, type FetchLike } from "../restProjectStore";
import type { ProjectRecord } from "../types";

const URL_BASE = "https://test.supabase.co";
const KEY = "sb_secret_test";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

function fakeFetch(responder: (call: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const impl: FetchLike = (url, init = {}) => {
    const call: Call = {
      url,
      method: (init.method ?? "GET").toUpperCase(),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    const { status = 200, body = [] } = responder(call);
    // `text` is what the store actually reads. Modelled faithfully: a
    // return=minimal write answers 201 with an EMPTY body, not "null" — the
    // difference is what made a successful create surface as a 500.
    const text = body === undefined ? "" : JSON.stringify(body);
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => text,
    } as Response);
  };
  return { impl, calls };
}

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  project_id: "proj-abc",
  owner_id: OWNER,
  output_type_id: "OT-07",
  answers: {},
  gates: {},
  document: null,
  rubric_report: null,
  claim_graph: { claims: {}, evidence: {}, bindings: {} },
  waivers: {},
  ...over,
});

function store(responder: (call: Call) => { status?: number; body?: unknown }) {
  const { impl, calls } = fakeFetch(responder);
  return {
    s: createRestProjectStore({ supabaseUrl: URL_BASE, serviceRoleKey: KEY, fetchImpl: impl }),
    calls,
  };
}

describe("restProjectStore: authentication", () => {
  it("sends the service-role key as both apikey and bearer", async () => {
    const { s, calls } = store(() => ({ body: [] }));
    await s.listByOwner(OWNER);

    // PostgREST needs `apikey` to route and `Authorization` to assume the
    // role; with only one, the request runs as `anon` and RLS denies it.
    expect(calls[0].headers.apikey).toBe(KEY);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
  });
});

describe("restProjectStore: create", () => {
  it("posts a row whose gate state is keyed to the record's own id", async () => {
    const { s, calls } = store(() => ({ status: 201, body: null }));
    const record = await s.create("OT-07", OWNER);

    expect(record.ownerId).toBe(OWNER);
    expect(record.projectId).toMatch(/^proj-/);
    expect(calls[0].method).toBe("POST");

    const body = calls[0].body as Record<string, unknown>;
    expect(body.project_id).toBe(record.projectId);
    expect(body.owner_id).toBe(OWNER);

    // A second generateProjectId() call here would desynchronise the gate
    // state from the row it belongs to, and nothing downstream would notice.
    expect(JSON.stringify(record.gates)).toContain(record.projectId);
  });
});

describe("restProjectStore: empty response bodies", () => {
  it("treats a 201 with an empty body as success, not a parse error", async () => {
    // PostgREST answers `Prefer: return=minimal` writes with 201 and no body.
    // Calling res.json() on that throws "Unexpected end of JSON input", which
    // reported a create that had genuinely succeeded as a 500.
    const { s } = store(() => ({ status: 201, body: undefined }));
    await expect(s.create("OT-07", OWNER)).resolves.toMatchObject({ ownerId: OWNER });
  });

  it("treats a 204 with an empty body as success", async () => {
    const { s } = store(() => ({ status: 204, body: undefined }));
    await expect(
      s.save({
        projectId: "p",
        ownerId: OWNER,
        outputTypeId: "OT-07",
        answers: {},
        gates: {} as ProjectRecord["gates"],
        claimGraph: {} as ProjectRecord["claimGraph"],
        waivers: {},
        submissions: [],
        evidenceLedger: { sources: [], items: [] },
      })
    ).resolves.toBeDefined();
  });
});

describe("restProjectStore: get", () => {
  it("filters by primary key and maps the row back", async () => {
    const { s, calls } = store(() => ({ body: [row()] }));
    const record = await s.get("proj-abc");

    expect(calls[0].url).toContain("project_id=eq.proj-abc");
    expect(record?.projectId).toBe("proj-abc");
    expect(record?.ownerId).toBe(OWNER);
  });

  it("returns undefined when no row matches", async () => {
    const { s } = store(() => ({ body: [] }));
    expect(await s.get("proj-missing")).toBeUndefined();
  });

  it("maps SQL NULL document/rubric_report to undefined, not null", async () => {
    const { s } = store(() => ({ body: [row({ document: null, rubric_report: null })] }));
    const record = await s.get("proj-abc");

    // ProjectRecord marks these optional; leaking null would make
    // `record.document !== undefined` true and report a document that is not there.
    expect(record?.document).toBeUndefined();
    expect(record?.rubricReport).toBeUndefined();
  });

  it("defaults submissions to an empty list for a row that predates the column", async () => {
    const { s } = store(() => ({ body: [row()] }));
    const record = await s.get("proj-abc");
    expect(record?.submissions).toEqual([]);
  });

  it("maps SQL NULL journal_requirements to undefined, and a present one through as-is", async () => {
    const { s: withoutReqs } = store(() => ({ body: [row({ journal_requirements: null })] }));
    expect((await withoutReqs.get("proj-abc"))?.journalRequirements).toBeUndefined();

    const journalRequirements = {
      journalName: "Water Research",
      source: "manual" as const,
      citationStyle: "vancouver",
      requiredDeclarations: ["funding"],
      capturedAt: "2026-01-01T00:00:00.000Z",
      capturedBy: OWNER,
    };
    const { s: withReqs } = store(() => ({ body: [row({ journal_requirements: journalRequirements })] }));
    expect((await withReqs.get("proj-abc"))?.journalRequirements).toEqual(journalRequirements);
  });

  it("url-encodes the id rather than interpolating it raw", async () => {
    const { s, calls } = store(() => ({ body: [] }));
    await s.get("proj-a b&c");
    expect(calls[0].url).not.toContain("proj-a b&c");
    expect(calls[0].url).toContain(encodeURIComponent("proj-a b&c"));
  });
});

describe("restProjectStore: save", () => {
  it("upserts rather than inserting", async () => {
    const { s, calls } = store(() => ({ status: 204, body: null }));
    const record: ProjectRecord = {
      projectId: "proj-xyz",
      ownerId: OWNER,
      outputTypeId: "OT-07",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: { claims: {}, evidence: {}, bindings: {} } as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
    };

    await s.save(record);

    // save() is called for existing rows as well as new ones. Without
    // merge-duplicates this is a plain INSERT and every update fails on the
    // primary key.
    expect(calls[0].headers.Prefer).toContain("resolution=merge-duplicates");
  });

  it("serialises an absent document as null", async () => {
    const { s, calls } = store(() => ({ status: 204, body: null }));
    await s.save({
      projectId: "p",
      ownerId: OWNER,
      outputTypeId: "OT-07",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: {} as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
    });

    const body = calls[0].body as Record<string, unknown>;
    expect(body.document).toBeNull();
    expect(body.rubric_report).toBeNull();
    expect(body.journal_requirements).toBeNull();
  });

  it("serialises a present journal_requirements through as-is", async () => {
    const { s, calls } = store(() => ({ status: 204, body: null }));
    const journalRequirements = {
      journalName: "Water Research",
      source: "manual" as const,
      citationStyle: "vancouver",
      requiredDeclarations: ["funding"],
      capturedAt: "2026-01-01T00:00:00.000Z",
      capturedBy: OWNER,
    };
    await s.save({
      projectId: "p",
      ownerId: OWNER,
      outputTypeId: "OT-10",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: {} as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger: { sources: [], items: [] },
      journalRequirements,
    });

    const body = calls[0].body as Record<string, unknown>;
    expect(body.journal_requirements).toEqual(journalRequirements);
  });

  it("serialises the evidence ledger through as-is, and defaults a row missing the column to an empty ledger on get()", async () => {
    const { s, calls } = store(() => ({ status: 204, body: null }));
    const evidenceLedger = {
      sources: [{ id: "src-1", title: "A Paper", authors: ["A"], sourceType: "scholarly" as const, authorityTier: "B" as const, discoveredVia: "arxiv" as const, discoveredAt: "2026-01-01T00:00:00.000Z" }],
      items: [],
    };
    await s.save({
      projectId: "p",
      ownerId: OWNER,
      outputTypeId: "OT-10",
      answers: {},
      gates: {} as ProjectRecord["gates"],
      claimGraph: {} as ProjectRecord["claimGraph"],
      waivers: {},
      submissions: [],
      evidenceLedger,
    });
    const body = calls[0].body as Record<string, unknown>;
    expect(body.evidence_ledger).toEqual(evidenceLedger);

    const { s: getStore } = store(() => ({ body: [row()] }));
    expect((await getStore.get("proj-abc"))?.evidenceLedger).toEqual({ sources: [], items: [] });
  });
});

describe("restProjectStore: listByOwner", () => {
  it("scopes by owner in the query, not after fetching", async () => {
    const { s, calls } = store(() => ({ body: [row()] }));
    await s.listByOwner(OWNER);

    // Filtering client-side would put one bug between a user and everyone
    // else's projects.
    expect(calls[0].url).toContain(`owner_id=eq.${OWNER}`);
    expect(calls[0].url).toContain("order=updated_at.desc");
  });

  it("returns only what the API returned for that owner", async () => {
    const { s } = store((c) => ({ body: c.url.includes(OTHER) ? [] : [row()] }));

    expect(await s.listByOwner(OTHER)).toEqual([]);
    expect((await s.listByOwner(OWNER)).map((r) => r.projectId)).toEqual(["proj-abc"]);
  });

  it("treats a null body as an empty list rather than throwing", async () => {
    const { s } = store(() => ({ body: null }));
    await expect(s.listByOwner(OWNER)).resolves.toEqual([]);
  });
});

describe("restProjectStore: failures", () => {
  it("surfaces the API's own message rather than a bare status", async () => {
    const { s } = store(() => ({
      status: 401,
      body: { message: 'new row violates row-level security policy for table "projects"' },
    }));

    // An RLS denial and a schema mismatch both arrive as non-2xx; the message
    // is the only thing that tells them apart.
    await expect(s.create("OT-07", OWNER)).rejects.toThrow(/row-level security/);
  });

  it("includes the status code in the error", async () => {
    const { s } = store(() => ({ status: 500, body: { message: "boom" } }));
    await expect(s.get("proj-abc")).rejects.toThrow(/500/);
  });
});
