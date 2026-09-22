import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import http from "node:http";
import { registerSupabaseProxy, getRemoteSupabaseUrl } from "../supabaseProxy";

describe("Supabase Reverse Proxy (/api/supabase)", () => {
  let app: express.Express;
  let mockServer: http.Server;
  let mockPort: number;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Spin up a lightweight local mock HTTP server simulating remote Supabase
    await new Promise<void>((resolve) => {
      mockServer = http.createServer((req, res) => {
        if (req.url === "/auth/v1/health") {
          res.writeHead(200, {
            "content-type": "application/json",
            "x-custom-header": "test-val",
          });
          res.end(JSON.stringify({ status: "ok", version: "1.0.0" }));
        } else if (req.url === "/auth/v1/redirect-test") {
          res.writeHead(302, {
            location: `http://127.0.0.1:${mockPort}/auth/v1/callback?code=abc`,
          });
          res.end();
        } else if (req.url === "/rest/v1/projects") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify([{ id: "proj-1" }]));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (addr && typeof addr === "object") {
          mockPort = addr.port;
        }
        resolve();
      });
    });

    process.env.SUPABASE_TARGET_URL = `http://127.0.0.1:${mockPort}`;
    app = express();
    registerSupabaseProxy(app);
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  it("resolves target URL correctly from SUPABASE_TARGET_URL or fallback", () => {
    expect(getRemoteSupabaseUrl()).toBe(`http://127.0.0.1:${mockPort}`);
  });

  it("proxies GET requests to upstream and returns response headers", async () => {
    const res = await request(app).get("/api/supabase/auth/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", version: "1.0.0" });
    expect(res.headers["x-custom-header"]).toBe("test-val");
  });

  it("rewrites Location redirect headers to point to /api/supabase", async () => {
    const res = await request(app).get("/api/supabase/auth/v1/redirect-test").redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain("/api/supabase/auth/v1/callback?code=abc");
  });

  it("proxies database REST queries correctly", async () => {
    const res = await request(app).get("/api/supabase/rest/v1/projects");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "proj-1" }]);
  });

  it("returns 502 when upstream server is unreachable", async () => {
    // Point proxy to a dead port
    process.env.SUPABASE_TARGET_URL = "http://127.0.0.1:59999";
    const deadApp = express();
    registerSupabaseProxy(deadApp);

    const res = await request(deadApp).get("/api/supabase/auth/v1/health");
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Bad Gateway");
  });
});
