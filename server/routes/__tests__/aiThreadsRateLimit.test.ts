import { describe, it, expect } from "vitest";
import express from "express";
import http from "node:http";
import { registerAIRoutes } from "../ai";

// A limiter that refuses everything: whatever reaches it is counted as AI generation.
const refuseAll: express.RequestHandler = (_req, res) => {
  res.status(429).json({ error: "limited" });
};

async function call(app: express.Express, method: string, path: string): Promise<number> {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : "{}" });
    return res.status;
  } finally {
    server.close();
  }
}

describe("/api/ai generation rate limit", () => {
  const app = express();
  app.use(express.json());
  registerAIRoutes(app, refuseAll);

  it("does not count thread storage against the AI generation budget", async () => {
    // Reaches the route (401: not signed in), not the limiter (429).
    expect(await call(app, "GET", "/api/ai/threads")).toBe(401);
    expect(await call(app, "POST", "/api/ai/threads")).toBe(401);
  });

  it("still limits generation routes", async () => {
    expect(await call(app, "POST", "/api/ai/run")).toBe(429);
  });
});
