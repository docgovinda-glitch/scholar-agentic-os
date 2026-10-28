import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { __clearTokenCacheForTests } from "../../src/middleware/auth.ts";
import {
  __resetHeavyParseGuardForTests,
  tryAcquireHeavyParseSlot,
} from "../../src/middleware/uploadGuard.ts";

const ALICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TEST_JWT_SECRET = "hotfix-containment-test-jwt-secret";

function signToken(userId: string, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", TEST_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

const realFetch = global.fetch;
const projectsTable = new Map<string, Record<string, unknown>>();

function mockPostgrestProjects(url: string, init?: RequestInit): Response {
  const query = url.split("?")[1] ?? "";
  const params = new URLSearchParams(query);
  const method = (init?.method ?? "GET").toUpperCase();

  if (method === "POST") {
    const row = JSON.parse(init!.body as string) as Record<string, unknown>;
    const key = row.project_id as string;
    projectsTable.set(key, { ...(projectsTable.get(key) ?? {}), ...row });
    return {
      ok: true,
      status: 201,
      json: async () => [projectsTable.get(key)],
      text: async () => JSON.stringify([projectsTable.get(key)]),
    } as Response;
  }

  let rows = [...projectsTable.values()];
  for (const [field, expr] of params.entries()) {
    if (!expr.startsWith("eq.")) continue;
    const want = expr.slice(3);
    rows = rows.filter((r) => String(r[field]) === want);
  }
  return {
    ok: true,
    status: 200,
    json: async () => rows,
    text: async () => JSON.stringify(rows),
  } as Response;
}

process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

const { app } = await import("../../../server.ts");
const { __resetProjectStoreForTests } = await import("../../../src/app/conductor/projectStore.ts");
const { __resetRateLimitStore } = await import("../../src/middleware/rateLimit.ts");
const { __setEnabledOutputTypesForTests } = await import("../outputTypeAccess.ts");

const asAlice = () => ({ Authorization: `Bearer ${signToken(ALICE_ID, "alice@example.com")}` });
const asBob = () => ({ Authorization: `Bearer ${signToken(BOB_ID, "bob@example.com")}` });

describe("Hotfix Containment (Part A & Part A2): Authz, IDOR, 10MB Limit, Concurrency Guard, SSRF", () => {
  const originalMaxUploadMb = process.env.MAX_UPLOAD_MB;

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    delete process.env.MAX_UPLOAD_MB; // Use default (10 MB)
    __clearTokenCacheForTests();
    __resetHeavyParseGuardForTests();
    __resetProjectStoreForTests();
    __resetRateLimitStore();
    __setEnabledOutputTypesForTests("all");
    projectsTable.clear();

    global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/rest/v1/projects")) {
        return Promise.resolve(mockPostgrestProjects(url, init));
      }
      if (url.includes("/rest/v1/profiles")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ account_status: "active" }],
          text: async () => JSON.stringify([{ account_status: "active" }]),
        } as Response);
      }
      if (url.includes("/rest/v1/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
          text: async () => "[]",
        } as Response);
      }
      return realFetch(input as RequestInfo, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    if (originalMaxUploadMb === undefined) {
      delete process.env.MAX_UPLOAD_MB;
    } else {
      process.env.MAX_UPLOAD_MB = originalMaxUploadMb;
    }
    __resetHeavyParseGuardForTests();
  });

  async function createAliceProject(): Promise<string> {
    const res = await request(app)
      .post("/api/projects")
      .set(asAlice())
      .send({ outputTypeId: "OT-01" });
    expect(res.status).toBe(201);
    return res.body.projectId as string;
  }

  describe("1. Unauthenticated requests -> 401", () => {
    const PROTECTED_ROUTES: ReadonlyArray<[string, string]> = [
      ["post", "/api/vault/parse-file"],
      ["post", "/api/vault/parse-url"],
      ["post", "/api/vault/lookup-doi"],
      ["post", "/api/lookup-doi"],
      ["post", "/api/vault/search-semantic"],
      ["post", "/api/vault/zotero/sync"],
      ["post", "/api/vault/mendeley/sync"],
      ["get", "/api/vault/drive/files"],
      ["get", "/api/vault/onedrive/files"],
      ["post", "/api/vault/reset"],
      ["get", "/api/search?q=test"],
      ["get", "/api/search/live?q=test"],
      ["post", "/api/search/live"],
      ["post", "/api/search/multi-portal"],
      ["post", "/api/discovery/live"],
      ["get", "/api/user/saved-authors"],
      ["post", "/api/user/saved-authors"],
      ["delete", "/api/user/saved-authors/auth-1"],
    ];

    it.each(PROTECTED_ROUTES)("rejects unauthenticated %s %s with 401", async (method, path) => {
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status).toBe(401);
    });
  });

  describe("2. Service-role IDOR containment -> 404 on cross-user access", () => {
    it("blocks Bob from reading or modifying Alice's project across assignment, agentic, files, activity, parse, and editor routes", async () => {
      const aliceProjectId = await createAliceProject();

      const idorChecks: Array<() => Promise<request.Response>> = [
        () =>
          request(app)
            .post(`/api/projects/${aliceProjectId}/assignment/parse-brief`)
            .set(asBob())
            .attach("file", Buffer.from("Brief text"), "brief.txt"),
        () =>
          request(app)
            .post(`/api/projects/${aliceProjectId}/assignment/extract`)
            .set(asBob())
            .send({ rawBriefText: "Injected brief" }),
        () =>
          request(app)
            .post(`/api/projects/${aliceProjectId}/agentic/allocate-budget`)
            .set(asBob())
            .send({ targetTotalWords: 5000 }),
        () =>
          request(app)
            .get(`/api/projects/${aliceProjectId}/agentic/manuscript`)
            .set(asBob()),
        () =>
          request(app)
            .put(`/api/projects/${aliceProjectId}/agentic/manuscript`)
            .set(asBob())
            .send([{ section_name: "Intro", content: "Hacked" }]),
        () =>
          request(app)
            .post(`/api/projects/${aliceProjectId}/agentic/upload-user-data`)
            .set(asBob())
            .send({ rawText: "Injected dataset" }),
        () =>
          request(app)
            .get(`/api/projects/${aliceProjectId}/files`)
            .set(asBob()),
        () =>
          request(app)
            .post(`/api/projects/${aliceProjectId}/files`)
            .set(asBob())
            .attach("file", Buffer.from("malicious"), "evil.txt"),
        () =>
          request(app)
            .get(`/api/projects/${aliceProjectId}/activity`)
            .set(asBob()),
        () =>
          request(app)
            .put(`/api/projects/${aliceProjectId}/editor/gaps/gap-1`)
            .set(asBob())
            .send({ status: "modified" }),
        () =>
          request(app)
            .put(`/api/projects/${aliceProjectId}/editor/evidence/ev-1`)
            .set(asBob())
            .send({ quote: "tampered" }),
        () =>
          request(app)
            .put(`/api/projects/${aliceProjectId}/editor/claims/cl-1`)
            .set(asBob())
            .send({ text: "tampered" }),
        () =>
          request(app)
            .post(`/api/projects/${aliceProjectId}/parse-file`)
            .set(asBob())
            .attach("file", Buffer.from("hello"), "notes.txt"),
        () =>
          request(app)
            .post(`/api/projects/${aliceProjectId}/parse-file/url`)
            .set(asBob())
            .send({ url: "https://example.com" }),
        () =>
          request(app)
            .post(`/api/projects/${aliceProjectId}/parse-file/text`)
            .set(asBob())
            .send({ text: "some notes" }),
      ];

      for (const runCheck of idorChecks) {
        const res = await runCheck();
        expect(res.status).toBe(404);
      }
    });
  });

  describe("3. Unified 10 MB upload limit -> 413 Payload Too Large", () => {
    it("rejects a >10 MB upload at the default 10 MB limit with HTTP 413 and clear user message", async () => {
      const oversizeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1024, 0x41); // 10 MB + 1 KB

      const res = await request(app)
        .post("/api/vault/parse-file")
        .set(asAlice())
        .attach("file", oversizeBuffer, {
          filename: "oversize.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).toBe(413);
      expect(res.body.code).toBe("LIMIT_FILE_SIZE");
      expect(res.body.maxUploadMb).toBe(10);
      expect(res.body.error).toMatch(/10 MB upload limit/i);
    });

    it("enforces MAX_UPLOAD_MB across project parse-file, assignment parse-brief, files, and presentations parse-document", async () => {
      process.env.MAX_UPLOAD_MB = "1"; // 1 MB for fast multi-route assertion
      const aliceProjectId = await createAliceProject();
      const oversize1Mb = Buffer.alloc(1024 * 1024 + 512, 0x42);

      const endpoints = [
        `/api/vault/parse-file`,
        `/api/projects/${aliceProjectId}/parse-file`,
        `/api/projects/${aliceProjectId}/assignment/parse-brief`,
        `/api/projects/${aliceProjectId}/files`,
        `/api/presentations/parse-document`,
      ];

      for (const endpoint of endpoints) {
        const res = await request(app)
          .post(endpoint)
          .set(asAlice())
          .attach("file", oversize1Mb, {
            filename: "large.pdf",
            contentType: "application/pdf",
          });
        expect(res.status).toBe(413);
        expect(res.body.error).toMatch(/1 MB upload limit/i);
      }
    });
  });

  describe("4. Server-wide heavy parse concurrency guard -> 503 with Retry-After", () => {
    it("rejects a concurrent second heavy parse (PDF/XLSX/DOCX/PPTX) with 503 and Retry-After header, then recovers after release", async () => {
      // Simulate an active in-flight heavy parse holding the single server-wide slot
      const releaseFirstSlot = tryAcquireHeavyParseSlot();
      expect(releaseFirstSlot).not.toBeNull();

      const minimalPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF"
      );

      try {
        const secondRes = await request(app)
          .post("/api/vault/parse-file")
          .set(asAlice())
          .attach("file", minimalPdf, {
            filename: "concurrent.pdf",
            contentType: "application/pdf",
          });

        expect(secondRes.status).toBe(503);
        expect(secondRes.headers["retry-after"]).toBe("5");
        expect(secondRes.body.error).toMatch(/currently processing another document/i);
      } finally {
        releaseFirstSlot?.();
      }

      // Once the first parse completes and releases the slot, the next heavy parse succeeds
      const afterReleaseRes = await request(app)
        .post("/api/vault/parse-file")
        .set(asAlice())
        .attach("file", minimalPdf, {
          filename: "subsequent.pdf",
          contentType: "application/pdf",
        });

      expect(afterReleaseRes.status).toBe(200);
      expect(afterReleaseRes.body.success).toBe(true);
    });
  });

  describe("5. SSRF guard on both parse-url endpoints (/api/vault/parse-url & /api/projects/:id/parse-file/url)", () => {
    const FORBIDDEN_URLS = [
      "http://127.0.0.1:8080/internal",
      "http://localhost:3000/api/health",
      "http://[::1]:3000/",
      "http://10.0.0.1/admin",
      "http://172.16.0.1/secret",
      "http://192.168.1.1/router",
      "http://169.254.169.254/latest/meta-data/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "ftp://example.com/file.pdf",
    ];

    it.each(FORBIDDEN_URLS)("rejects unsafe URL %s on POST /api/vault/parse-url", async (unsafeUrl) => {
      const res = await request(app)
        .post("/api/vault/parse-url")
        .set(asAlice())
        .send({ url: unsafeUrl });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });

    it.each(FORBIDDEN_URLS)("rejects unsafe URL %s on POST /api/projects/:id/parse-file/url", async (unsafeUrl) => {
      const aliceProjectId = await createAliceProject();
      const res = await request(app)
        .post(`/api/projects/${aliceProjectId}/parse-file/url`)
        .set(asAlice())
        .send({ url: unsafeUrl });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    });
  });
});

