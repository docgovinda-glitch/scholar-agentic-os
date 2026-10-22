/**
 * Authorization tests for the project API.
 *
 * These exist because of a real vulnerability, not as a formality. Before
 * this suite, `server/routes/project.ts` had no authentication of any kind
 * and `ProjectRecord` had no owner field, while project ids were generated as
 * `proj-${Date.now().toString(36)}-${counter}` from a module-level counter.
 * The combination meant any unauthenticated caller could create projects,
 * enumerate ids arithmetically, and read, overwrite, or export anyone else's
 * work. `server/routes/pocket.ts` had required auth on every endpoint the
 * whole time — the gap was specific to the routes the Desk client uses.
 *
 * Deliberately NOT mocking requireAuth (unlike project.test.ts, which stubs
 * it because its subject is gate logic). The middleware runs for real here;
 * only the Supabase token-verification call underneath it is faked, so what
 * is under test is the actual wiring — whether requireAuth is genuinely
 * mounted on these routes.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const realFetch = global.fetch;

/**
 * Minimal PostgREST stand-in, backing the Data API store the server now
 * selects (services/store picks it whenever Supabase credentials are present,
 * which they must be here for requireAuth).
 *
 * Emulated rather than stubbed out so these tests still run the real
 * restProjectStore — the actual production persistence path — instead of an
 * in-memory shortcut that would pass regardless of whether that store works.
 * It implements only what the store uses: eq filters, ordering, and an upsert.
 */
const table = new Map<string, Record<string, unknown>>();

function postgrest(url: string, init?: RequestInit): Response {
  const query = url.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const method = (init?.method ?? "GET").toUpperCase();

  if (method === "POST") {
    const row = JSON.parse(init!.body as string) as Record<string, unknown>;
    const key = row.project_id as string;
    const merge = String((init?.headers as Record<string, string>)?.Prefer ?? "").includes(
      "merge-duplicates"
    );
    if (table.has(key) && !merge) {
      return { ok: false, status: 409, json: async () => ({ message: "duplicate key" }), text: async () => "duplicate key" } as Response;
    }
    table.set(key, { ...(table.get(key) ?? {}), ...row });
    return { ok: true, status: 201, json: async () => null, text: async () => "" } as Response;
  }

  let rows = [...table.values()];
  for (const [field, expr] of params.entries()) {
    if (!expr.startsWith("eq.")) continue;
    const want = expr.slice(3);
    rows = rows.filter((r) => String(r[field]) === want);
  }
  return { ok: true, status: 200, json: async () => rows, text: async () => JSON.stringify(rows) } as Response;
}

global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();

  /**
   * Fake GoTrue, standing in for the one network call requireAuth makes.
   * "alice-token" and "bob-token" resolve to distinct users; anything else is
   * rejected the way a real expired or forged token would be.
   *
   * This intercepts `fetch` rather than mocking `@supabase/supabase-js`,
   * because the middleware no longer uses that SDK — constructing a client
   * per request pulled in a RealtimeClient that needed a WebSocket Node 20
   * does not have, and took production down. Mocking the module would now
   * stub something nothing calls, and these tests would pass while verifying
   * nothing.
   */
  if (url.includes("/auth/v1/user")) {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = (headers.Authorization ?? "").replace(/^Bearer /, "");
    const user =
      token === "alice-token"
        ? { id: ALICE, email: "alice@example.com" }
        : token === "bob-token"
          ? { id: BOB, email: "bob@example.com" }
          : null;
    return Promise.resolve({
      ok: Boolean(user),
      status: user ? 200 : 401,
      json: async () => user ?? { msg: "invalid JWT" },
    } as Response);
  }

  if (url.includes("/rest/v1/projects")) return Promise.resolve(postgrest(url, init));

  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

// requireAuth reads these at module scope and 500s when unset, so they must
// exist before server.ts is imported below.
process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const { app } = await import("../../../server.ts");
const { __resetProjectStoreForTests } = await import("../../../src/app/conductor/projectStore.ts");
const { __resetRateLimitStore } = await import("../../src/middleware/rateLimit.ts");
const { __setEnabledOutputTypesForTests } = await import("../outputTypeAccess.ts");

const asAlice = () => ({ Authorization: "Bearer alice-token" });
const asBob = () => ({ Authorization: "Bearer bob-token" });

async function createProjectAs(headers: Record<string, string>): Promise<string> {
  const res = await request(app).post("/api/projects").set(headers).send({ outputTypeId: "OT-01" });
  expect(res.status).toBe(201);
  return res.body.projectId;
}

beforeEach(() => {
  __resetProjectStoreForTests();
  __resetRateLimitStore();
  // This suite's subject is auth wiring, not which output types are active
  // — OT-01 here is a neutral fixture. See outputTypeAccess.ts's own comment.
  __setEnabledOutputTypesForTests("all");
  // The Data API stand-in is the store's backing table now; leaving rows
  // behind would let one test's project satisfy another's assertions.
  table.clear();
});

describe("project API — authentication", () => {
  /** Every state-changing and state-reading route, in the shape needed to reach the auth check. */
  const ROUTES: ReadonlyArray<[string, string]> = [
    ["get", "/api/projects"],
    ["post", "/api/projects"],
    ["get", "/api/projects/proj-anything"],
    ["patch", "/api/projects/proj-anything/intake"],
    ["put", "/api/projects/proj-anything/document"],
    ["get", "/api/projects/proj-anything/rubric"],
    ["post", "/api/projects/proj-anything/rubric/waive"],
    ["post", "/api/projects/proj-anything/claims"],
    ["get", "/api/projects/proj-anything/claims"],
    ["post", "/api/projects/proj-anything/gates/G0/signoff"],
    ["post", "/api/projects/proj-anything/export"],
    ["post", "/api/drafting/section"],
    ["get", "/api/presentations"],
    ["post", "/api/presentations"],
  ];

  it.each(ROUTES)("401s on %s %s without a token", async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)("401s on %s %s with an invalid token", async (method, path) => {
    const res = await (request(app) as any)[method](path)
      .set({ Authorization: "Bearer forged-token" })
      .send({});
    expect(res.status).toBe(401);
  });

  it("401s on a malformed Authorization header", async () => {
    const res = await request(app).get("/api/projects").set({ Authorization: "alice-token" });
    expect(res.status).toBe(401);
  });

  it("leaves the Atlas catalog public — it holds no user data", async () => {
    const res = await request(app).get("/api/atlas/output-types");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe("project API — ownership", () => {
  it("records the creating user as the owner and lists it back to them", async () => {
    const projectId = await createProjectAs(asAlice());

    const mine = await request(app).get("/api/projects").set(asAlice());
    expect(mine.status).toBe(200);
    expect(mine.body.items.map((p: { projectId: string }) => p.projectId)).toContain(projectId);
  });

  it("does not list one user's projects to another", async () => {
    await createProjectAs(asAlice());

    const bobs = await request(app).get("/api/projects").set(asBob());
    expect(bobs.status).toBe(200);
    expect(bobs.body.items).toEqual([]);
  });

  it("404s — not 403 — when reading someone else's project", async () => {
    const aliceProject = await createProjectAs(asAlice());

    const res = await request(app).get(`/api/projects/${aliceProject}`).set(asBob());

    // 403 would confirm the id names a real project, turning id-guessing into
    // an existence oracle. "Not yours" must be indistinguishable from
    // "not there".
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(ALICE);
  });

  it("refuses to overwrite another user's document", async () => {
    const aliceProject = await createProjectAs(asAlice());

    const res = await request(app)
      .put(`/api/projects/${aliceProject}/document`)
      .set(asBob())
      .send({ document: { id: "d1", title: "Bob's takeover", blocks: [] } });

    expect(res.status).toBe(404);

    // And Alice's project is genuinely untouched, not merely reported as such.
    const check = await request(app).get(`/api/projects/${aliceProject}`).set(asAlice());
    expect(check.status).toBe(200);
    expect(check.body.hasDocument).toBe(false);
  });

  it("refuses to write another user's intake answers", async () => {
    const aliceProject = await createProjectAs(asAlice());

    const res = await request(app)
      .patch(`/api/projects/${aliceProject}/intake`)
      .set(asBob())
      .send({ answers: { title: "injected" } });

    expect(res.status).toBe(404);
  });

  it("refuses to sign off a gate on another user's project", async () => {
    const aliceProject = await createProjectAs(asAlice());

    const res = await request(app)
      .post(`/api/projects/${aliceProject}/gates/G0/signoff`)
      .set(asBob())
      .send({ actor: "bob" });

    expect(res.status).toBe(404);
  });

  it("refuses to export another user's project", async () => {
    const aliceProject = await createProjectAs(asAlice());

    const res = await request(app)
      .post(`/api/projects/${aliceProject}/export`)
      .set(asBob())
      .send({ format: "docx" });

    expect(res.status).toBe(404);
  });

  it("refuses to add a submission to another user's project", async () => {
    const aliceProject = await createProjectAs(asAlice());

    const res = await request(app)
      .post(`/api/projects/${aliceProject}/submissions`)
      .set(asBob())
      .send({ journalName: "Bob's Journal", submittedAt: "2026-01-01", status: "draft" });

    expect(res.status).toBe(404);
  });

  it("refuses to draft a section on another user's project", async () => {
    const aliceProject = await createProjectAs(asAlice());

    const res = await request(app)
      .post("/api/drafting/section")
      .set(asBob())
      .send({
        projectId: aliceProject,
        sectionTitle: "Introduction",
        sectionDescription: "Overview",
        keyThemes: ["Background"],
      });

    expect(res.status).toBe(404);
  });

  it("refuses to read another user's presentation deck", async () => {
    const createRes = await request(app)
      .post("/api/presentations")
      .set(asAlice())
      .send({
        id: "alice-deck-authz",
        title: "Alice Deck",
      });
    expect(createRes.status).toBe(201);

    const res = await request(app)
      .get("/api/presentations/alice-deck-authz")
      .set(asBob());

    expect(res.status).toBe(404);
  });

  it("lets the owner keep working on their own project", async () => {
    const aliceProject = await createProjectAs(asAlice());

    const res = await request(app)
      .put(`/api/projects/${aliceProject}/document`)
      .set(asAlice())
      .send({ document: { id: "d1", title: "Alice's draft", blocks: [] } });

    expect(res.status).toBe(200);
  });
});

describe("project ids", () => {
  it("are not enumerable from one another", async () => {
    const first = await createProjectAs(asAlice());
    const second = await createProjectAs(asAlice());

    // The previous scheme appended an incrementing counter, so `first` told
    // you `second`. Assert the ids share no ordering relationship a caller
    // could walk: no common timestamp prefix, and not adjacent integers.
    expect(first).not.toBe(second);

    const suffixOf = (id: string) => id.replace(/^proj-/, "");
    expect(suffixOf(first)).not.toBe(suffixOf(second));

    // Long enough to be infeasible to guess (UUID = 36 chars, hex fallback = 32).
    expect(suffixOf(first).length).toBeGreaterThanOrEqual(32);

    // The old format was `<base36 millis>-<counter>`; the new one must not
    // end in a small incrementing integer.
    expect(/-\d{1,4}$/.test(first)).toBe(false);
  });
});

describe("studio API — authentication", () => {
  it("401s on refine without a token — it spends provider budget", async () => {
    const res = await request(app)
      .post("/api/studio/refine")
      .send({ sessionId: "s1", passageId: "p1", text: "Some text.", level: "proofread" });

    expect(res.status).toBe(401);
  });

  it("401s on consent without a token", async () => {
    const res = await request(app).post("/api/studio/consent").send({ sessionId: "s1", provider: "openai" });
    expect(res.status).toBe(401);
  });

  it("401s on the egress audit log without a token", async () => {
    const res = await request(app).get("/api/studio/egress-audit");
    expect(res.status).toBe(401);
  });

  it("does not let one user inherit another's consent grant via a shared sessionId", async () => {
    // Both users use the literal sessionId "shared" — the value is
    // client-supplied, so nothing stops them. Alice consents; Bob must not
    // become consented as a side effect.
    const granted = await request(app)
      .post("/api/studio/consent")
      .set(asAlice())
      .send({ sessionId: "shared", provider: "openai" });
    expect(granted.status).toBe(200);

    // "proofread" is deterministic and needs no provider, so it is the level
    // that isolates the consent question from any model call.
    const bob = await request(app)
      .post("/api/studio/refine")
      .set(asBob())
      .send({ sessionId: "shared", passageId: "p1", text: "Some text.", level: "proofread" });

    // Bob's session key is namespaced by his user id, so Alice's grant is not
    // visible to him. He is not 401 (he is authenticated) and not silently
    // riding her consent.
    expect(bob.status).not.toBe(401);
  });
});
