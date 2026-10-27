import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { __resetProjectStoreForTests } from "../../../app/conductor/projectStore";

/**
 * Backend selection.
 *
 * Which store the server picks is a production-behaviour decision, not a
 * detail: picking in-memory silently means a user's projects disappear on the
 * next restart, and on a plan that idles out the container that is within the
 * hour. These assert the precedence explicitly.
 *
 * Every relevant variable is cleared before each case. Left to inherit the
 * ambient environment, a `.env` present on the machine would decide which
 * branch ran and the tests would quietly stop testing what they name.
 */
describe("services/store: backend selection", () => {
  const KEYS = ["DATABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NODE_ENV"] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
    process.env.USE_REAL_STORE_IN_TESTS = "true";
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k] as string;
    }
    delete process.env.USE_REAL_STORE_IN_TESTS;
    vi.resetModules();
    __resetProjectStoreForTests();
  });

  it("with no backend configured in development, falls back to in-memory and round-trips a project", async () => {
    process.env.NODE_ENV = "development";
    const { getProjectStore } = await import("../projectStore");

    const store = getProjectStore();
    const created = await store.create("OT-07", "11111111-1111-4111-8111-111111111111");
    const fetched = await store.get(created.projectId);
    expect(fetched).toEqual(created);
    expect(created.ownerId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("warns loudly when falling back to in-memory in development", async () => {
    process.env.NODE_ENV = "development";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getProjectStore } = await import("../projectStore");
    getProjectStore();

    // Silent data loss is the failure mode this guards: the in-memory store
    // behaves correctly right up until the process restarts.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("in-memory"));
    warn.mockRestore();
  });

  it("P1-5: FAILS FAST in production when no durable backend is configured", async () => {
    process.env.NODE_ENV = "production";
    const { getProjectStore } = await import("../projectStore");

    // In production, silent fallback to in-memory storage is strictly prohibited.
    // The server must throw an explicit, actionable error rather than pretending
    // projects are safely persisted.
    expect(() => getProjectStore()).toThrowError(
      /FATAL: Durable Persistence Required.*Production cannot start with ephemeral in-memory project storage/
    );
  });

  it("P1-5: starts successfully in production when Supabase Data API is configured", async () => {
    process.env.NODE_ENV = "production";
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const { getProjectStore } = await import("../projectStore");
    expect(() => getProjectStore()).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Data API"));
    log.mockRestore();
  });

  it("P1-5: starts successfully in production when direct Postgres is configured", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/testdb";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const { getProjectStore } = await import("../projectStore");
    expect(() => getProjectStore()).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("direct Postgres"));
    log.mockRestore();
  });

  it("caches the resolved backend across calls until reset", async () => {
    process.env.NODE_ENV = "development";
    const { getProjectStore } = await import("../projectStore");
    expect(getProjectStore()).toBe(getProjectStore());
  });

  it("prefers the Data API when Supabase credentials are present", async () => {
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const { getProjectStore } = await import("../projectStore");
    expect(() => getProjectStore()).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Data API"));
    log.mockRestore();
  });

  it("prefers the Data API over a direct connection when both are configured", async () => {
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
    // A DATABASE_URL that would fail if it were actually chosen.
    process.env.DATABASE_URL = "postgres://user:pass@db.example.invalid:5432/db";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const { getProjectStore } = await import("../projectStore");
    getProjectStore();

    // The direct path failed in production four separate ways (IPv6-only
    // host, pooler tenancy, untrusted cert chain, separate password); HTTPS
    // wins when both are available.
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Data API"));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("direct Postgres"));
    log.mockRestore();
  });

  it("falls back to a direct connection when only DATABASE_URL is set, without connecting at import time", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/testdb";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    // Importing must not throw even though nothing is listening: createPool()
    // builds a lazy pg.Pool and does not connect until a query runs.
    const mod = await import("../projectStore");
    expect(() => mod.getProjectStore()).not.toThrow();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("direct Postgres"));
    log.mockRestore();
  });

  it("does not use the Data API when only one of the two credentials is present (in dev falls back to in-memory)", async () => {
    process.env.NODE_ENV = "development";
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    // No service-role key: the URL alone cannot authenticate, and choosing the
    // Data API here would fail on every request instead of falling back.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getProjectStore } = await import("../projectStore");
    getProjectStore();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("in-memory"));
    warn.mockRestore();
  });
});

describe("createDiskFallbackStore — atomic disk persistence (B3)", () => {
  const fs = require("fs");
  const path = require("path");
  const testStorePath = path.join(process.cwd(), "data", ".test_scholar_store.json");

  beforeEach(() => {
    try {
      if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);
    } catch (_) {}
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);
    } catch (_) {}
  });

  it("atomically writes projects to disk and reloads them in a new store instance", async () => {
    const { createDiskFallbackStore } = await import("../projectStore");

    const store1 = createDiskFallbackStore(testStorePath);
    const created = await store1.create("OT-07", "owner-123");
    created.answers["topic"] = "Post-Quantum Cryptography";
    await store1.save(created);

    // Verify file exists on disk
    expect(fs.existsSync(testStorePath)).toBe(true);

    // Instantiate a new store instance pointing at the same file
    const store2 = createDiskFallbackStore(testStorePath);
    const loaded = await store2.get(created.projectId);
    expect(loaded).toBeDefined();
    expect(loaded?.projectId).toBe(created.projectId);
    expect(loaded?.answers["topic"]).toBe("Post-Quantum Cryptography");

    // Test listByOwner
    const list = await store2.listByOwner("owner-123");
    expect(list.length).toBe(1);
    expect(list[0].projectId).toBe(created.projectId);

    // Test delete
    await store2.delete(created.projectId);
    const afterDelete = await store2.get(created.projectId);
    expect(afterDelete).toBeUndefined();

    // Instantiate store3 to ensure deletion persisted to disk
    const store3 = createDiskFallbackStore(testStorePath);
    expect(await store3.get(created.projectId)).toBeUndefined();
  });
});
