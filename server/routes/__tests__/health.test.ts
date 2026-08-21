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
