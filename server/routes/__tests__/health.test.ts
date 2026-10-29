import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { registerHealthRoutes } from "../health";

describe("GET /api/health — persistence mode inspection (P1-5)", () => {
  let app: express.Express;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerHealthRoutes(app);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports in-memory-test in test environment", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.DATABASE_URL;

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.persistenceMode).toBe("in-memory-test");
    expect(res.body.persistenceDurable).toBe(true);
  });

  it("reports supabase-rest when Supabase credentials are configured", async () => {
    process.env.NODE_ENV = "development";
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    delete process.env.DATABASE_URL;

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.persistenceMode).toBe("supabase-rest");
    expect(res.body.persistenceDurable).toBe(true);
  });

  it("reports postgres when DATABASE_URL is configured", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.persistenceMode).toBe("postgres");
    expect(res.body.persistenceDurable).toBe(true);
  });

  it("reports in-memory-EPHEMERAL and persistenceDurable: false when unconfigured in dev", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.DATABASE_URL;

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.persistenceMode).toBe("in-memory-EPHEMERAL");
    expect(res.body.persistenceDurable).toBe(false);
  });
});

describe("GET /api/health — commit and ?deep=1 (T10)", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });
  const appWith = (fetchImpl?: typeof fetch) => {
    const app = express();
    registerHealthRoutes(app, { fetchImpl });
    return app;
  };

  it("reports the short running commit when Render provides one", async () => {
    process.env.RENDER_GIT_COMMIT = "b4031a2f0906d90548d4f27696b41180378d968f";
    const res = await request(appWith()).get("/api/health");
    expect(res.body.commit).toBe("b4031a2");
    expect(res.body.checks).toBeUndefined();
  });

  it("deep=1 reports ok when the database answers", async () => {
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    const fetchImpl = (async () => new Response("[]", { status: 200 })) as unknown as typeof fetch;
    const res = await request(appWith(fetchImpl)).get("/api/health?deep=1");
    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual({ database: "ok" });
  });

  it("deep=1 returns 503 degraded without leaking details when the database is unreachable", async () => {
    process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
    const fetchImpl = (async () => {
      throw new Error("connect ECONNREFUSED example.supabase.co service-role-secret");
    }) as unknown as typeof fetch;
    const res = await request(appWith(fetchImpl)).get("/api/health?deep=1");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.checks).toEqual({ database: "unreachable" });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|example\.supabase|service-role-secret/);
  });
});
