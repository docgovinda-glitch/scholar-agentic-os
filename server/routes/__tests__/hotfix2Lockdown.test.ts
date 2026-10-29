import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { app } from "../../../server.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";

const TEST_JWT_SECRET = "hotfix2-test-jwt-secret-32-chars-minimum!!";
const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BOB_ID = "22222222-2222-4222-8222-222222222222";

function mintTestJwt(sub: string, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", TEST_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

describe("Hotfix 2 — Database, Storage, RPC, and Edge Function Lockdown (F-02, F-03, F-04, F-14)", () => {
  const originalJwtSecret = process.env.SUPABASE_JWT_SECRET;
  const originalSupabaseUrl = process.env.VITE_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalTurnstileKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  const originalFetch = global.fetch;

  let aliceToken: string;
  let bobToken: string;
  const aliceProjectId = "proj-hotfix2-alice";

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    process.env.VITE_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    delete process.env.CAPTCHA_SECRET_KEY;

    aliceToken = mintTestJwt(ALICE_ID, "alice@example.com");
    bobToken = mintTestJwt(BOB_ID, "bob@example.com");

    const store = getProjectStore();
    await store.create({
      projectId: aliceProjectId,
      ownerId: ALICE_ID,
      title: "Alice Private Research Project",
      outputType: "OT-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      state: {} as any,
    });
  });

  afterAll(() => {
    process.env.SUPABASE_JWT_SECRET = originalJwtSecret;
    process.env.VITE_SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = originalTurnstileKey;
    global.fetch = originalFetch;
  });

  describe("1. Migration SQL Verification (F-02, F-03, F-14)", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261028000000_hotfix2_db_storage_rpc_lockdown.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");

    it("enables RLS and revokes anon/authenticated access on the 3 unprotected tables (F-02)", () => {
      expect(sql).toContain("ALTER TABLE IF EXISTS public.project_research_gaps ENABLE ROW LEVEL SECURITY;");
      expect(sql).toContain("ALTER TABLE IF EXISTS public.project_titles ENABLE ROW LEVEL SECURITY;");
      expect(sql).toContain("ALTER TABLE IF EXISTS public.project_journal_candidates ENABLE ROW LEVEL SECURITY;");
      expect(sql).toContain("REVOKE ALL ON TABLE public.project_research_gaps FROM PUBLIC, anon, authenticated;");
      expect(sql).toContain("REVOKE ALL ON TABLE public.project_titles FROM PUBLIC, anon, authenticated;");
      expect(sql).toContain("REVOKE ALL ON TABLE public.project_journal_candidates FROM PUBLIC, anon, authenticated;");
    });

    it("sets all storage buckets private, drops open project-files policies, and retains id_documents_*_own policies (F-03)", () => {
      expect(sql).toContain("UPDATE storage.buckets");
      expect(sql).toContain("SET public = false");
      for (const policy of [
        "project_files_insert",
        "project_files_select",
        "project_files_update",
        "project_files_delete",
      ]) {
        expect(sql).toContain(`DROP POLICY IF EXISTS "${policy}" ON storage.objects;`);
      }
      for (const ownPolicy of [
        "id_documents_insert_own",
        "id_documents_select_own",
        "id_documents_update_own",
        "id_documents_delete_own",
      ]) {
        expect(sql).not.toContain(`DROP POLICY IF EXISTS "${ownPolicy}"`);
      }
    });

    it("revokes PUBLIC, anon, and authenticated EXECUTE on all 6 account-enumeration RPCs without CREATE OR REPLACE FUNCTION (F-14)", () => {
      expect(sql).not.toContain("CREATE OR REPLACE FUNCTION");
      for (const fn of [
        "email_for_username",
        "email_for_phone_e164",
        "email_for_identifier",
        "check_username_available",
        "check_email_available",
        "check_phone_available",
      ]) {
        expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}(text) FROM PUBLIC, anon, authenticated;`);
        expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}(text) TO service_role;`);
      }
    });
  });

  describe("2. Server-Side Login & Availability Endpoints (F-14)", () => {
    it("resolves username server-side, signs in via GoTrue, and never returns the resolved email to the client", async () => {
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/rest/v1/rpc/email_for_username")) {
          return new Response(JSON.stringify("secret.alice@university.edu"), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/auth/v1/token?grant_type=password")) {
          return new Response(
            JSON.stringify({
              access_token: "session-access-tok",
              refresh_token: "session-refresh-tok",
              expires_in: 3600,
              token_type: "bearer",
              user: { id: ALICE_ID, email: "secret.alice@university.edu" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("/rest/v1/profiles")) {
          return new Response(
            JSON.stringify([
              {
                full_name: "Dr. Alice",
                phone: "5550100",
                affiliation: "Oxford",
                account_status: "active",
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("{}", { status: 200 });
      }) as typeof fetch;

      const res = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", "hotfix2-test-login-success")
        .send({ identifier: "alice_user", password: "correct-horse-battery-staple" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session.access_token).toBe("session-access-tok");
      expect(res.body.profile.fullName).toBe("Dr. Alice");
      // The resolved email must never appear anywhere in the HTTP response body
      expect(JSON.stringify(res.body)).not.toContain("secret.alice@university.edu");
    });

    it("returns the exact same 401 message and executes GoTrue round-trip for both unknown username and wrong password", async () => {
      let goTrueCalls = 0;
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/rest/v1/rpc/email_for_username")) {
          return new Response(JSON.stringify("secret.alice@university.edu"), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/auth/v1/token?grant_type=password")) {
          goTrueCalls++;
          return new Response(
            JSON.stringify({ error_description: "Invalid login credentials" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("{}", { status: 200 });
      }) as typeof fetch;

      const resWrongPass = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", "hotfix2-test-login-wrong-pass")
        .send({ identifier: "alice_user", password: "wrong-password" });

      expect(resWrongPass.status).toBe(401);
      expect(resWrongPass.body.success).toBe(false);
      expect(JSON.stringify(resWrongPass.body)).not.toContain("secret.alice@university.edu");
      expect(goTrueCalls).toBe(1);

      // Now simulate unknown username (RPC returns null)
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/rest/v1/rpc/email_for_username")) {
          return new Response(JSON.stringify(null), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/auth/v1/token?grant_type=password")) {
          goTrueCalls++;
          return new Response(
            JSON.stringify({ error_description: "Invalid login credentials" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("{}", { status: 200 });
      }) as typeof fetch;

      const resUnknownUser = await request(app)
        .post("/api/auth/login")
        .set("User-Agent", "hotfix2-test-login-unknown-user")
        .send({ identifier: "ghost_user", password: "wrong-password" });

      expect(resUnknownUser.status).toBe(401);
      expect(resUnknownUser.body).toEqual(resWrongPass.body);
      expect(goTrueCalls).toBe(2);
    });

    it("enforces Turnstile presence on POST /api/auth/login without double-burning single-use tokens in Express", async () => {
      process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY = "turnstile-secret-for-test";
      let turnstileSiteverifyCalled = false;
      let forwardedCaptchaToGoTrue: string | undefined;
      let sbForwardedFor: string | null = null;
      global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("challenges.cloudflare.com/turnstile")) {
          turnstileSiteverifyCalled = true;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (url.includes("/auth/v1/token?grant_type=password")) {
          const headers = new Headers(init?.headers);
          sbForwardedFor = headers.get("Sb-Forwarded-For");
          const parsedBody = JSON.parse(String(init?.body ?? "{}"));
          forwardedCaptchaToGoTrue = parsedBody?.gotrue_meta_security?.captcha_token;
          return new Response(JSON.stringify({ error_description: "Invalid login credentials" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(null), { status: 200 });
      }) as typeof fetch;

      try {
        const resMissing = await request(app)
          .post("/api/auth/login")
          .set("X-Forwarded-For", "198.51.100.41, 173.245.48.10")
          .set("CF-Connecting-IP", "198.51.100.41")
          .send({ identifier: "alice_user", password: "password123" });

        expect(resMissing.status).toBe(400);
        expect(resMissing.body.success).toBe(false);
        expect(resMissing.body.error).toContain("CAPTCHA");

        const resProvided = await request(app)
          .post("/api/auth/login")
          .set("X-Forwarded-For", "198.51.100.41, 173.245.48.10")
          .set("CF-Connecting-IP", "198.51.100.41")
          .send({ identifier: "alice_user", password: "password123", captchaToken: "cf-single-use-tok" });

        expect(resProvided.status).toBe(401);
        expect(turnstileSiteverifyCalled).toBe(false);
        expect(forwardedCaptchaToGoTrue).toBe("cf-single-use-tok");
        expect(sbForwardedFor).toBe("198.51.100.41");
      } finally {
        delete process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
      }
    });

    it("caps single-IP login attempts at 5 per 5 minutes (< GoTrue 30/5m default) and maps upstream GoTrue 429 uniformly", async () => {
      let goTrueHits = 0;
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/v1/token?grant_type=password")) {
          goTrueHits++;
          return new Response(JSON.stringify({ msg: "over_request_rate_limit" }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(null), { status: 200 });
      }) as typeof fetch;

      for (let i = 1; i <= 6; i++) {
        const res = await request(app)
          .post("/api/auth/login")
          .set("X-Forwarded-For", `10.0.0.${i}, 198.51.100.88, 173.245.48.10`)
          .set("CF-Connecting-IP", "198.51.100.88")
          .send({ identifier: `probe_user_${i}`, password: "wrong" });

        expect(res.status).toBe(429);
        if (i <= 5) {
          expect(res.body.code).toBe("UPSTREAM_AUTH_RATE_LIMIT");
        } else {
          expect(res.body.code).toBe("RATE_LIMIT_EXCEEDED");
        }
      }
      // Exactly 5 requests from a single client IP can reach GoTrue in a 5-minute window (< 30 GoTrue default)
      expect(goTrueHits).toBe(5);
    });

    it("checks identifier availability via POST /api/auth/check-availability using service_role", async () => {
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/rest/v1/rpc/check_username_available")) {
          return new Response(JSON.stringify(false), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(true), { status: 200 });
      }) as typeof fetch;

      const res = await request(app)
        .post("/api/auth/check-availability")
        .set("User-Agent", "hotfix2-test-availability")
        .send({ type: "username", value: "alice_user" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ available: false });
    });
  });

  describe("3. Express-Mediated Private Storage Signed URLs (F-03)", () => {
    it("rejects unauthenticated requests to GET /api/projects/:id/files/:fileId/signed-url with 401", async () => {
      const res = await request(app).get(`/api/projects/${aliceProjectId}/files/file-1/signed-url`);
      expect(res.status).toBe(401);
    });

    it("rejects non-owner Bob with 404 when requesting a signed URL for Alice's project file", async () => {
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/rest/v1/profiles")) {
          return new Response(JSON.stringify([{ account_status: "active" }]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("[]", { status: 200 });
      }) as typeof fetch;

      const res = await request(app)
        .get(`/api/projects/${aliceProjectId}/files/file-1/signed-url`)
        .set("Authorization", `Bearer ${bobToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe("4. request-profile-update Edge Function Lockdown (F-04 / TICKET-SEC-01)", () => {
    const edgeFnPath = path.resolve(
      process.cwd(),
      "supabase/functions/request-profile-update/index.ts"
    );
    const edgeFnSource = fs.readFileSync(edgeFnPath, "utf8");

    it("never includes verificationKey in any HTTP Response JSON payload", () => {
      const responseMatches = [...edgeFnSource.matchAll(/new Response\(([\s\S]*?)\)/g)];
      expect(responseMatches.length).toBeGreaterThanOrEqual(2);
      for (const match of responseMatches) {
        expect(match[1]).not.toContain("verificationKey");
      }
    });

    it("returns HTTP 410 Gone (PROFILE_UPDATE_DISABLED) and fails closed with 503 when unconfigured", () => {
      expect(edgeFnSource).toContain("status: 410");
      expect(edgeFnSource).toContain("PROFILE_UPDATE_DISABLED");
      expect(edgeFnSource).toContain("status: 503");
    });
  });
});
