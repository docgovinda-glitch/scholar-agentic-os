/**
 * Admin platform credentials (B4): stored encrypted with the existing
 * MASTER_KEY, never returned, and validated on the way in.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { SCOPES } from "../../src/middleware/requireAdmin";
import { generateMasterKeyBase64 } from "../../../src/services/crypto/crypto";

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECRET = "sk-test-PLAINTEXT-should-never-be-stored-1234567890";

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
process.env.MASTER_KEY = generateMasterKeyBase64();
process.env.GEMINI_API_KEY = "test-gemini-key";

let writes: Array<{ url: string; method: string; body: string }> = [];
let stored: Record<string, unknown>[] = [];

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (body === null ? "" : JSON.stringify(body)) } as Response;
}

beforeEach(() => {
  vi.resetModules();
  writes = [];
  stored = [];
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (init?.body) writes.push({ url, method, body: String(init.body) });

    if (url.includes("/auth/v1/user")) {
      const token = (init?.headers as Record<string, string>)?.Authorization?.replace("Bearer ", "");
      return Promise.resolve(token === "admin-token" ? json(200, { id: ADMIN_ID, email: "admin@example.com" }) : json(401, {}));
    }
    if (url.includes("/rest/v1/admin_users")) {
      return Promise.resolve(json(200, url.includes(ADMIN_ID) ? [{ user_id: ADMIN_ID, scopes: SCOPES }] : []));
    }
    if (url.includes("/rest/v1/platform_provider_credentials")) {
      if (method === "POST") {
        const row = JSON.parse(String(init?.body));
        stored.push({ id: "cred-1", ...row });
        return Promise.resolve(json(201, null));
      }
      if (method === "GET") {
        // Return only the columns the route asks for, as PostgREST would.
        const cols = new URL(url).searchParams.get("select")?.split(",") ?? [];
        return Promise.resolve(json(200, stored.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))));
      }
      return Promise.resolve(json(200, null));
    }
    return Promise.resolve(json(200, method === "GET" ? [] : null));
  }) as unknown as typeof fetch;
});

async function buildApp() {
  const { registerAdminRoutes } = await import("../admin");
  const app = express();
  app.use(express.json());
  registerAdminRoutes(app);
  return app;
}
const asAdmin = (r: request.Test) => r.set("Authorization", "Bearer admin-token");

describe("platform credentials", () => {
  it("stores the key encrypted and never returns it", async () => {
    const app = await buildApp();
    const res = await asAdmin(request(app).post("/api/admin/ai/platform-credentials")).send({ providerId: "openai", credential: SECRET });
    expect(res.status).toBe(200);

    // Nothing sent to the database contains the plaintext key.
    const credentialWrites = writes.filter((w) => w.url.includes("platform_provider_credentials"));
    expect(credentialWrites.length).toBeGreaterThan(0);
    for (const w of writes) expect(w.body).not.toContain(SECRET);
    expect(stored[0]).toHaveProperty("encrypted_credential");
    expect(stored[0]).toHaveProperty("encrypted_cek");

    // The list shows a masked preview, never the key or its ciphertext.
    const list = await asAdmin(request(app).get("/api/admin/ai/platform-credentials"));
    expect(list.status).toBe(200);
    const text = JSON.stringify(list.body);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("encrypted_credential");
    expect(text).not.toContain("encrypted_cek");
  });

  it("the stored key decrypts back to the original with the MASTER_KEY", async () => {
    const app = await buildApp();
    await asAdmin(request(app).post("/api/admin/ai/platform-credentials")).send({ providerId: "openai", label: "main", credential: SECRET });
    const { decryptToString, unwrapKey, getMasterKeyFromEnv } = await import("../../../src/services/crypto/crypto");
    const row = stored[0] as { encrypted_cek: Parameters<typeof unwrapKey>[0]; encrypted_credential: Parameters<typeof decryptToString>[0] };
    const cek = unwrapKey(row.encrypted_cek, getMasterKeyFromEnv());
    expect(decryptToString(row.encrypted_credential, cek)).toBe(SECRET);
  });

  it("rejects missing, non-text and oversized input", async () => {
    const app = await buildApp();
    const post = (body: unknown) => asAdmin(request(app).post("/api/admin/ai/platform-credentials")).send(body as object);
    expect((await post({ providerId: "openai" })).status).toBe(400);
    expect((await post({ providerId: "openai", credential: 12345 })).status).toBe(400);
    expect((await post({ providerId: "openai", credential: "x".repeat(5000) })).status).toBe(400);
    expect((await post({ providerId: "openai", credential: "k", label: { a: 1 } })).status).toBe(400);
    expect(stored).toHaveLength(0);
  });

  it("status must be active, disabled or error", async () => {
    const app = await buildApp();
    const bad = await asAdmin(request(app).patch("/api/admin/ai/platform-credentials/cred-1/status")).send({ status: "pwned" });
    expect(bad.status).toBe(400);
    const ok = await asAdmin(request(app).patch("/api/admin/ai/platform-credentials/cred-1/status")).send({ status: "disabled" });
    expect(ok.status).toBe(200);
  });

  it("requires an admin", async () => {
    const app = await buildApp();
    const res = await request(app).post("/api/admin/ai/platform-credentials").send({ providerId: "openai", credential: SECRET });
    expect(res.status).toBe(401);
  });
});
