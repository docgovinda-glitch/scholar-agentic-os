/**
 * AI keys saved to the user's account (/api/ai-access/keys). What matters:
 * a session is required; every query is scoped to the verified user's own
 * id; the stored row never holds the plaintext key; the user gets back
 * exactly what they saved; bad input is refused; and without MASTER_KEY the
 * routes refuse (fail closed) instead of storing anything.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { generateMasterKeyBase64 } from "../../../src/services/crypto/crypto";

const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECRET = "AIzaTestOnly-not-a-real-key-9876";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";

const realFetch = global.fetch;
const realMaster = process.env.MASTER_KEY;

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

interface Db {
  rows: Record<string, unknown>[];
  urls: string[];
  writes: string[];
}

function mockSupabase(db: Db) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/auth/v1/user")) {
      const token = (init?.headers as Record<string, string>)?.Authorization?.replace("Bearer ", "");
      return Promise.resolve(token === "alice-token" ? jsonResponse(200, { id: ALICE, email: "alice@example.com" }) : jsonResponse(401, {}));
    }
    db.urls.push(url);
    if (!url.includes("/rest/v1/user_provider_keys")) return Promise.resolve(jsonResponse(200, []));
    const method = init?.method ?? "GET";
    if (method === "POST") {
      const row = JSON.parse(init!.body as string) as Record<string, unknown>;
      db.writes.push(init!.body as string);
      db.rows = db.rows.filter((r) => !(r.user_id === row.user_id && r.provider_id === row.provider_id));
      db.rows.push({ ...row, created_at: row.updated_at });
      return Promise.resolve(jsonResponse(201, null));
    }
    if (method === "DELETE") {
      const pid = decodeURIComponent(url.match(/provider_id=eq\.([^&]+)/)?.[1] ?? "");
      db.rows = db.rows.filter((r) => !(r.user_id === ALICE && r.provider_id === pid));
      return Promise.resolve(jsonResponse(204, null));
    }
    return Promise.resolve(jsonResponse(200, db.rows.filter((r) => url.includes(`user_id=eq.${r.user_id}`))));
  }) as unknown as typeof fetch;
}

let db: Db;

beforeEach(() => {
  vi.resetModules();
  process.env.MASTER_KEY = generateMasterKeyBase64();
  db = { rows: [], urls: [], writes: [] };
  mockSupabase(db);
});

afterEach(() => {
  global.fetch = realFetch;
  if (realMaster === undefined) delete process.env.MASTER_KEY;
  else process.env.MASTER_KEY = realMaster;
});

async function buildApp() {
  const { registerAiAccessRoutes } = await import("../aiAccess");
  const app = express();
  registerAiAccessRoutes(app);
  return app;
}

const auth = { Authorization: "Bearer alice-token" };

describe("AI keys saved to the account", () => {
  it("requires a session for every route", async () => {
    const app = await buildApp();
    expect((await request(app).get("/api/ai-access/keys")).status).toBe(401);
    expect((await request(app).get("/api/ai-access/keys/sync")).status).toBe(401);
    expect((await request(app).put("/api/ai-access/keys/gemini").send({ key: SECRET })).status).toBe(401);
    expect((await request(app).delete("/api/ai-access/keys/gemini")).status).toBe(401);
    expect(db.rows).toHaveLength(0);
  });

  it("stores the key encrypted, lists only the masked form, and gives the owner back exactly what they saved", async () => {
    const app = await buildApp();
    const put = await request(app).put("/api/ai-access/keys/gemini").set(auth).send({ key: SECRET, userId: "someone-else" });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ providerId: "gemini", maskedPreview: "••••9876" });
    expect(put.headers["cache-control"]).toBe("no-store");

    // The stored row is Alice's, and the plaintext is nowhere in it.
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].user_id).toBe(ALICE);
    expect(db.writes.join("")).not.toContain(SECRET);

    const list = await request(app).get("/api/ai-access/keys").set(auth);
    expect(list.body.keys).toEqual([expect.objectContaining({ providerId: "gemini", maskedPreview: "••••9876" })]);
    expect(JSON.stringify(list.body)).not.toContain(SECRET);

    const sync = await request(app).get("/api/ai-access/keys/sync").set(auth);
    expect(sync.status).toBe(200);
    expect(sync.headers["cache-control"]).toBe("no-store");
    expect(sync.body.keys).toEqual([expect.objectContaining({ providerId: "gemini", apiKey: SECRET })]);

    // Every data query was scoped to Alice's verified id.
    for (const u of db.urls.filter((x) => x.includes("user_provider_keys") && !x.includes("on_conflict"))) {
      expect(u).toContain(`user_id=eq.${ALICE}`);
      expect(u).not.toContain("someone-else");
    }

    const del = await request(app).delete("/api/ai-access/keys/gemini").set(auth);
    expect(del.status).toBe(200);
    expect((await request(app).get("/api/ai-access/keys/sync").set(auth)).body.keys).toEqual([]);
  });

  it("refuses unknown providers and malformed keys without storing anything", async () => {
    const app = await buildApp();
    expect((await request(app).put("/api/ai-access/keys/not-a-provider").set(auth).send({ key: SECRET })).status).toBe(400);
    expect((await request(app).put("/api/ai-access/keys/ollama").set(auth).send({ key: SECRET })).status).toBe(400);
    expect((await request(app).put("/api/ai-access/keys/gemini").set(auth).send({ key: "short" })).status).toBe(400);
    expect((await request(app).put("/api/ai-access/keys/gemini").set(auth).send({ key: "has a space in it" })).status).toBe(400);
    expect((await request(app).put("/api/ai-access/keys/gemini").set(auth).send({})).status).toBe(400);
    expect(db.rows).toHaveLength(0);
  });

  it("fails closed when the server has no MASTER_KEY", async () => {
    delete process.env.MASTER_KEY;
    const app = await buildApp();
    const put = await request(app).put("/api/ai-access/keys/gemini").set(auth).send({ key: SECRET });
    expect(put.status).toBe(503);
    expect((await request(app).get("/api/ai-access/keys/sync").set(auth)).status).toBe(503);
    expect(db.rows).toHaveLength(0);
  });

  it("disconnecting a provider also removes its saved key", async () => {
    const app = await buildApp();
    await request(app).put("/api/ai-access/keys/gemini").set(auth).send({ key: SECRET });
    expect(db.rows).toHaveLength(1);
    expect((await request(app).delete("/api/ai-access/connections/gemini").set(auth)).status).toBe(200);
    expect(db.rows).toHaveLength(0);
  });
});
