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
  const KEYS = ["DATABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k] as string;
    }
    vi.resetModules();
    __resetProjectStoreForTests();
  });

  it("with no backend configured, falls back to in-memory and round-trips a project", async () => {
    const { getProjectStore } = await import("../projectStore");

    const store = getProjectStore();
    const created = await store.create("OT-07", "11111111-1111-4111-8111-111111111111");
    const fetched = await store.get(created.projectId);
    expect(fetched).toEqual(created);
    expect(created.ownerId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("warns loudly when falling back to in-memory", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getProjectStore } = await import("../projectStore");
    getProjectStore();

    // Silent data loss is the failure mode this guards: the in-memory store
    // behaves correctly right up until the process restarts.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("in-memory"));
    warn.mockRestore();
  });

  it("caches the resolved backend across calls until reset", async () => {
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

  it("does not use the Data API when only one of the two credentials is present", async () => {
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
