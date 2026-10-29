import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const state = vi.hoisted(() => ({
  userId: "",
  dbEnabled: false,
  dbFails: false,
  rows: new Map<string, Record<string, unknown>>(),
  writes: [] as Array<{ op: string; filter?: string; row?: Record<string, unknown> }>,
}));

vi.mock("../../src/middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: state.userId, email: "user@example.test" };
    next();
  },
}));

// In-memory stand-in for the Supabase Data API, so ownership logic can be
// exercised against a database (including a failing one).
vi.mock("../../src/supabaseRest", () => {
  const idFrom = (filter: string) => decodeURIComponent(/id=eq\.([^&]+)/.exec(filter)?.[1] ?? "");
  const userFrom = (filter: string) => decodeURIComponent(/user_id=eq\.([^&]+)/.exec(filter)?.[1] ?? "");
  class SupabaseTable {
    private guard() {
      if (state.dbFails) throw new Error("upstream unavailable");
    }
    async select(filter: string) {
      this.guard();
      const uid = userFrom(filter);
      return [...state.rows.values()].filter((r) => r.user_id === uid);
    }
    async selectOne(filter: string) {
      this.guard();
      return state.rows.get(idFrom(filter));
    }
    async insert(row: Record<string, unknown>) {
      this.guard();
      if (state.rows.has(row.id as string)) throw new Error("duplicate key");
      state.writes.push({ op: "insert", row });
      state.rows.set(row.id as string, { ...row });
    }
    async upsert(row: Record<string, unknown>) {
      this.guard();
      state.writes.push({ op: "upsert", row });
      state.rows.set(row.id as string, { ...row });
    }
    async update(filter: string, patch: Record<string, unknown>) {
      this.guard();
      state.writes.push({ op: "update", filter, row: patch });
      const r = state.rows.get(idFrom(filter));
      if (r && r.user_id === userFrom(filter)) state.rows.set(r.id as string, { ...r, ...patch });
    }
    async delete(filter: string) {
      this.guard();
      state.writes.push({ op: "delete", filter });
      const r = state.rows.get(idFrom(filter));
      if (r && r.user_id === userFrom(filter)) state.rows.delete(r.id as string);
    }
  }
  return {
    SupabaseTable,
    getSupabaseRestConfig: () => (state.dbEnabled ? { url: "https://db.test", serviceRoleKey: "k" } : null),
  };
});

import { registerPresentationRoutes, memoryDecks } from "../presentations";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerPresentationRoutes(app);
  return app;
}

const as = (userId: string) => {
  state.userId = userId;
  return request(makeApp());
};

describe("presentation deck ownership", () => {
  beforeEach(() => {
    state.dbEnabled = true;
    state.dbFails = false;
    state.rows.clear();
    state.writes.length = 0;
    memoryDecks.clear();
    state.rows.set("deck-a", { id: "deck-a", user_id: USER_A, title: "A's deck", slides: [{ id: "s1" }] });
    state.rows.set("deck-legacy", { id: "deck-legacy", user_id: null, title: "Ownerless", slides: [] });
  });

  it("lets the owner read and save their deck", async () => {
    expect((await as(USER_A).get("/api/presentations/deck-a")).status).toBe(200);
    const res = await as(USER_A).put("/api/presentations/deck-a").send({ title: "Renamed" });
    expect(res.status).toBe(200);
    expect(state.rows.get("deck-a")?.title).toBe("Renamed");
  });

  it("returns 404 to another user for read, save, delete and copilot, leaving the deck unchanged", async () => {
    expect((await as(USER_B).get("/api/presentations/deck-a")).status).toBe(404);
    expect((await as(USER_B).put("/api/presentations/deck-a").send({ title: "Hijacked", slides: [] })).status).toBe(404);
    expect((await as(USER_B).delete("/api/presentations/deck-a")).status).toBe(404);
    expect(state.rows.get("deck-a")).toMatchObject({ user_id: USER_A, title: "A's deck" });
    expect(state.writes).toHaveLength(0);
    const list = await as(USER_B).get("/api/presentations");
    expect(list.body.decks.map((d: { id: string }) => d.id)).not.toContain("deck-a");
  });

  it("treats ownerless legacy rows as nobody's: no read, no takeover", async () => {
    expect((await as(USER_B).get("/api/presentations/deck-legacy")).status).toBe(404);
    expect((await as(USER_B).put("/api/presentations/deck-legacy").send({ title: "Mine now" })).status).toBe(404);
    expect(state.rows.get("deck-legacy")?.user_id).toBeNull();
  });

  it("fails closed when the ownership lookup errors: no write happens", async () => {
    state.dbFails = true;
    expect((await as(USER_B).put("/api/presentations/deck-a").send({ title: "Hijacked" })).status).toBe(503);
    expect((await as(USER_B).delete("/api/presentations/deck-a")).status).toBe(503);
    expect((await as(USER_A).get("/api/presentations/deck-a")).status).toBe(503);
    state.dbFails = false;
    expect(state.rows.get("deck-a")?.title).toBe("A's deck");
    expect(state.writes).toHaveLength(0);
  });

  it("never lets a client-chosen id land on someone else's deck", async () => {
    const res = await as(USER_B).post("/api/presentations").send({ id: "deck-a", title: "Collide" });
    expect(res.status).toBe(201);
    expect(res.body.deck.id).not.toBe("deck-a");
    expect(res.body.deck.user_id).toBe(USER_B);
    expect(state.rows.get("deck-a")).toMatchObject({ user_id: USER_A, title: "A's deck" });
  });

  it("ignores server-owned fields in the body (user_id, timestamps, unknown columns)", async () => {
    const res = await as(USER_A)
      .put("/api/presentations/deck-a")
      .send({ title: "Ok", user_id: USER_B, created_at: "1970-01-01", is_admin: true });
    expect(res.status).toBe(200);
    const stored = state.rows.get("deck-a") ?? {};
    expect(stored.user_id).toBe(USER_A);
    expect(stored).not.toHaveProperty("is_admin");
    expect(stored.created_at).not.toBe("1970-01-01");
    expect(res.body.deck).not.toHaveProperty("is_admin");
  });

  it("creates a new deck for the caller on first autosave", async () => {
    const res = await as(USER_B).put("/api/presentations/deck-new").send({ title: "Fresh", slides: [] });
    expect(res.status).toBe(200);
    expect(state.rows.get("deck-new")).toMatchObject({ user_id: USER_B, title: "Fresh" });
  });

  it("scopes the in-memory fallback (no database) to its owner and keeps it bounded", async () => {
    state.dbEnabled = false;
    await as(USER_A).post("/api/presentations").send({ id: "mem-a", title: "Memory A" });
    expect((await as(USER_B).get("/api/presentations/mem-a")).status).toBe(404);
    expect((await as(USER_B).put("/api/presentations/mem-a").send({ title: "x" })).status).toBe(404);
    const listB = await as(USER_B).get("/api/presentations");
    expect(listB.body.decks).toEqual([]);
    for (let i = 0; i < 150; i++) await as(USER_A).put(`/api/presentations/bulk-${i}`).send({ title: `d${i}` });
    expect(memoryDecks.size).toBeLessThanOrEqual(100);
  });
});
