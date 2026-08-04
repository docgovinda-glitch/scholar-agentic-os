import { describe, it, expect, afterEach, vi } from "vitest";
import { __resetProjectStoreForTests } from "../../../app/conductor/projectStore";

describe("services/store: backend selection", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
    __resetProjectStoreForTests();
  });

  it("without DATABASE_URL, falls back to the in-memory store and round-trips a project", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { getProjectStore } = await import("../projectStore");

    const store = getProjectStore();
    const created = await store.create("OT-07", "11111111-1111-4111-8111-111111111111");
    const fetched = await store.get(created.projectId);
    expect(fetched).toEqual(created);
    expect(created.ownerId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("caches the resolved backend across calls until reset", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { getProjectStore } = await import("../projectStore");

    expect(getProjectStore()).toBe(getProjectStore());
  });

  it("with DATABASE_URL set, resolves a Postgres-backed store without eagerly connecting at import time", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/testdb";
    vi.resetModules();
    // Importing must not throw even though nothing is listening on that
    // connection string yet — createPool() only builds a lazy pg.Pool, it
    // doesn't connect until a query actually runs.
    const mod = await import("../projectStore");
    expect(() => mod.getProjectStore()).not.toThrow();
  });
});
