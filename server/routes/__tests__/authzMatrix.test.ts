import crypto from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../../server.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { memoryDecks } from "../presentations.ts";
import { __resetRateLimitStore } from "../../src/middleware/rateLimit.ts";

const TEST_JWT_SECRET = "authz-matrix-test-secret-32-chars-minimum!!";
const USER_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mintJwt(sub: string, email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", TEST_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${sig}`;
}

interface DiscoveredRoute {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
}

/**
 * Recursively walks an Express 4 router stack to enumerate every registered
 * `(method, path)` under `/api/*`, normalizing Express `:id` regexes into `:id`.
 */
function discoverExpressApiRoutes(expressApp: any): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  const seen = new Set<string>();

  function cleanRegexPrefix(regex: RegExp | undefined, keys: Array<{ name: string }> = []): string {
    if (!regex) return "";
    const src = regex.source;
    if (src === "^\\/?$" || src === "^\\/?(?=\\/|$)") return "";
    let keyIdx = 0;
    return src
      .replace(/^\^/, "")
      .replace(/\\\/\?\(\?=\\\/\|\$\)$/, "")
      .replace(/\(\?=\\\/\|\$\)$/, "")
      .replace(/\\\//g, "/")
      .replace(/\(\?:\/\(\[\^\/\]\+\?\)\)/g, () => {
        const paramName = keys[keyIdx++]?.name || "id";
        return `/:${paramName}`;
      })
      .replace(/\$$/, "");
  }

  function walkStack(stack: any[], prefix = "") {
    if (!Array.isArray(stack)) return;
    for (const layer of stack) {
      if (layer.route && layer.route.path) {
        const routePaths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.keys(layer.route.methods || {}).filter(
          (m) => layer.route.methods[m] && ["get", "post", "put", "patch", "delete"].includes(m),
        ) as DiscoveredRoute["method"][];

        for (const rp of routePaths) {
          if (typeof rp !== "string") continue;
          const fullPath = `${prefix}${rp}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
          if (!fullPath.startsWith("/api/")) continue;
          for (const method of methods) {
            const key = `${method.toUpperCase()} ${fullPath}`;
            if (!seen.has(key)) {
              seen.add(key);
              routes.push({ method, path: fullPath });
            }
          }
        }
      } else if (layer.name === "router" && layer.handle?.stack) {
        const subPrefix = cleanRegexPrefix(layer.regexp, layer.keys);
        walkStack(layer.handle.stack, `${prefix}${subPrefix}`);
      }
    }
  }

  walkStack(expressApp._router?.stack || []);
  return routes;
}

/**
 * Explicit allowlist of intentionally public `/api/*` endpoints (plus temporary
 * pre-PR-4.3 AI endpoints that are tracked and removed in PR 4.3).
 */
const PUBLIC_API_ALLOWLIST = new Set<string>([
  "GET /api/health",
  "GET /api/ai/status",
  "GET /api/atlas/output-types",
  "GET /api/atlas/output-types/:id",
  "POST /api/auth/verify-signup",
  "POST /api/auth/login",
  "POST /api/auth/check-availability",
  // Tracked for removal in PR 4.3 (F-08):
  "POST /api/ai/search",
  "POST /api/ai/deep-research",
  "POST /api/ai/agent",
]);

function materializeRoutePath(
  routePath: string,
  ids: { projectId: string; deckId: string },
): string {
  return routePath
    .replace(":projectId", ids.projectId)
    .replace(":id", routePath.startsWith("/api/presentations/") ? ids.deckId : ids.projectId)
    .replace(":typeId", "OT-01")
    .replace(":gateId", "gate-1")
    .replace(":gate", "G1")
    .replace(":claimId", "claim-1")
    .replace(":sectionId", "sec-1")
    .replace(":fileId", "file-1")
    .replace(":commentId", "comment-1")
    .replace(":versionId", "ver-1")
    .replace(":slideId", "slide-1")
    .replace(/:([A-Za-z0-9_]+)/g, "test-$1");
}

describe("Automated Express Route Authz & Ownership Matrix", () => {
  const originalJwtSecret = process.env.SUPABASE_JWT_SECRET;
  const originalSupabaseUrl = process.env.VITE_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const projectAId = "proj-matrix-user-a";
  const deckAId = "deck-matrix-user-a";
  let userBToken: string;

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    userBToken = mintJwt(USER_B_ID, "userb@example.com");

    const store = getProjectStore();
    await store.create({
      projectId: projectAId,
      ownerId: USER_A_ID,
      title: "User A Confidential Project",
      outputType: "OT-01",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      state: {} as any,
    });

    memoryDecks.clear();
    memoryDecks.set(deckAId, {
      id: deckAId,
      user_id: USER_A_ID,
      title: "User A Confidential Deck",
      theme_id: "academic-classic",
      slides: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterAll(() => {
    process.env.SUPABASE_JWT_SECRET = originalJwtSecret;
    process.env.VITE_SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
  });

  const allApiRoutes = discoverExpressApiRoutes(app);

  it("discovers the Express /api/* route table dynamically (>200 endpoints)", () => {
    expect(allApiRoutes.length).toBeGreaterThan(200);
  });

  it("rejects unauthenticated requests with 401 on every non-allowlisted /api/* route", async () => {
    const protectedRoutes = allApiRoutes.filter(
      (r) => !PUBLIC_API_ALLOWLIST.has(`${r.method.toUpperCase()} ${r.path}`),
    );
    expect(protectedRoutes.length).toBeGreaterThan(200);

    const failures: string[] = [];

    for (const route of protectedRoutes) {
      __resetRateLimitStore();
      const url = materializeRoutePath(route.path, {
        projectId: projectAId,
        deckId: deckAId,
      });
      const res = await (request(app) as any)[route.method](url)
        .set("User-Agent", `authz-matrix-unauth-${route.method}-${url}`)
        .send({});

      if (res.status !== 401) {
        failures.push(`${route.method.toUpperCase()} ${route.path} -> HTTP ${res.status}`);
      }
    }

    expect(failures, `Protected routes did not return 401:\n${failures.join("\n")}`).toEqual([]);
  }, 60000);

  it("rejects cross-user access (User B -> User A resource) with 403 or 404 on every project & presentation :id route", async () => {
    const resourceRoutes = allApiRoutes.filter(
      (r) =>
        (r.path.startsWith("/api/projects/:id") ||
          r.path.startsWith("/api/projects/:projectId") ||
          r.path.startsWith("/api/presentations/:id")) &&
        !r.path.includes("/compliance/api/projects/"), // Known F-16 typo route fixed in PR 4.3
    );

    expect(resourceRoutes.length).toBeGreaterThan(150);

    const failures: string[] = [];

    for (const route of resourceRoutes) {
      __resetRateLimitStore();
      const url = materializeRoutePath(route.path, {
        projectId: projectAId,
        deckId: deckAId,
      });
      const res = await (request(app) as any)[route.method](url)
        .set("Authorization", `Bearer ${userBToken}`)
        .set("User-Agent", `authz-matrix-crossuser-${route.method}-${url}`)
        .send({ prompt: "test prompt" });

      if (res.status !== 403 && res.status !== 404) {
        failures.push(`${route.method.toUpperCase()} ${route.path} -> HTTP ${res.status}`);
      }
    }

    expect(
      failures,
      `Resource routes allowed cross-user access or returned unexpected status:\n${failures.join("\n")}`,
    ).toEqual([]);
  }, 60000);
});
