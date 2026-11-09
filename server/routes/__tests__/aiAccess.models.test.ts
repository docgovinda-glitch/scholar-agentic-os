/** POST /api/ai-access/models fetches a user-typed address server-side: it must be screened. */
import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../../src/middleware/auth.ts", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { id: "11111111-1111-4111-8111-111111111111", email: "t@example.com" }; next(); },
}));

import { app } from "../../../server.ts";

const post = (body: object) => request(app).post("/api/ai-access/models").send(body);

describe("POST /api/ai-access/models address screening", () => {
  it("refuses an address that points at a private or metadata address, with the reason", async () => {
    const res = await post({ providerId: "openrouter", apiKey: "k", baseUrl: "https://169.254.169.254/latest" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/private|internal/i);
  });
  it("refuses plain http and addresses with credentials or a query string", async () => {
    expect((await post({ providerId: "openrouter", apiKey: "k", baseUrl: "http://api.example.com/v1" })).status).toBe(400);
    expect((await post({ providerId: "openrouter", apiKey: "k", baseUrl: "https://u:p@api.example.com/v1" })).status).toBe(400);
    expect((await post({ providerId: "openrouter", apiKey: "k", baseUrl: "https://api.example.com/v1?x=1" })).status).toBe(400);
  });
  it("does not list local runners from the server, and rejects unknown providers", async () => {
    expect((await post({ providerId: "ollama", baseUrl: "http://localhost:11434" })).status).toBe(400);
    expect((await post({ providerId: "nope", apiKey: "k" })).status).toBe(400);
  });
});
