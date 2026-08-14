// Scholar Core's active implementation scope (Journal Article only, docs
// per the current phase) vs. the Atlas catalog's full 24 types underneath
// it. The generic engine's own behavior across all 24 types is exercised in
// project.test.ts (which opts back into "all" via
// __setEnabledOutputTypesForTests — see that file's own comment); this file
// tests the restriction itself.

import { describe, it, expect, beforeEach, vi } from "vitest";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: TEST_USER_ID, email: "test@example.com" };
    next();
  },
}));

import request from "supertest";
import { app } from "../../../server.ts";
import { __resetProjectStoreForTests } from "../../../src/app/conductor/projectStore.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { __setEnabledOutputTypesForTests, isOutputTypeEnabled } from "../outputTypeAccess.ts";

beforeEach(() => {
  __resetProjectStoreForTests();
  __resetRateLimitStore();
  // The real production default — made explicit here rather than relying on
  // load order, since other test files in this directory reset it to "all".
  __setEnabledOutputTypesForTests(["OT-10"]);
});

describe("isOutputTypeEnabled", () => {
  it("allows Journal Article", () => {
    expect(isOutputTypeEnabled("OT-10")).toBe(true);
  });

  it("disallows other catalog types by default", () => {
    expect(isOutputTypeEnabled("OT-01")).toBe(false);
  });

  it("__setEnabledOutputTypesForTests('all') allows every id", () => {
    __setEnabledOutputTypesForTests("all");
    expect(isOutputTypeEnabled("OT-01")).toBe(true);
    expect(isOutputTypeEnabled("OT-24")).toBe(true);
  });
});

describe("GET /api/atlas/output-types", () => {
  it("lists only Journal Article", async () => {
    const res = await request(app).get("/api/atlas/output-types");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe("OT-10");
  });
});

describe("GET /api/atlas/output-types/:id", () => {
  it("still resolves a disabled type's full spec — existing projects of that type must keep working", async () => {
    const res = await request(app).get("/api/atlas/output-types/OT-01");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("OT-01");
  });
});

describe("POST /api/projects", () => {
  it("creates a Journal Article project", async () => {
    const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-10" });
    expect(res.status).toBe(201);
    expect(res.body.outputTypeId).toBe("OT-10");
  });

  it("403s for a disabled type — distinct from 404 (the type exists, it just isn't offered)", async () => {
    const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-01" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Journal Article/i);
  });

  it("still 404s for a genuinely unknown type", async () => {
    const res = await request(app).post("/api/projects").send({ outputTypeId: "OT-999" });
    expect(res.status).toBe(404);
  });
});

describe("a project created before this restriction (or of another type via direct store access)", () => {
  it("keeps loading normally through the ordinary project API", async () => {
    const store = getProjectStore();
    const created = await store.create("OT-01", TEST_USER_ID);

    const res = await request(app).get(`/api/projects/${created.projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.outputTypeId).toBe("OT-01");
  });
});
