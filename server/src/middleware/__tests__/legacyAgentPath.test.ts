import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { legacyAgentPath, rewriteLegacyAgentPath } from "../legacyAgentPath";

describe("rewriteLegacyAgentPath", () => {
  it("moves the old /agent address of a project to /agentic", () => {
    expect(rewriteLegacyAgentPath("/api/projects/p1/agent/export")).toBe("/api/projects/p1/agentic/export");
    expect(rewriteLegacyAgentPath("/api/projects/p1/agent/copilot-chat?x=1")).toBe("/api/projects/p1/agentic/copilot-chat?x=1");
    expect(rewriteLegacyAgentPath("/api/projects/p1/agent")).toBe("/api/projects/p1/agentic");
  });

  it("leaves every other path alone", () => {
    for (const url of [
      "/api/projects/p1/agentic/export",
      "/api/projects/p1/assignment/agent/sources",
      "/api/projects/p1/agents",
      "/api/ai/agent",
      "/api/projects/agent/x",
    ]) {
      expect(rewriteLegacyAgentPath(url)).toBe(url);
    }
  });
});

describe("legacyAgentPath middleware", () => {
  it("serves an old-tab request with the /agentic handler and marks it deprecated", async () => {
    const app = express();
    app.use(legacyAgentPath);
    app.post("/api/projects/:id/agentic/export", (req, res) => res.json({ id: req.params.id, path: req.path }));
    const res = await request(app).post("/api/projects/p1/agent/export");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "p1", path: "/api/projects/p1/agentic/export" });
    expect(res.headers.deprecation).toBe("true");
  });
});
