import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../..//server";
import { __resetRateLimitStore } from "../middleware/rateLimit";

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: vi.fn().mockResolvedValue({
            text: "mock-text",
          }),
          generateContentStream: vi.fn().mockResolvedValue(
            (async function* () {
              yield { text: "mock-stream-text" };
            })()
          ),
        },
      };
    }),
  };
});

const mockFetch = vi.fn(async (_url: any) => {
  // Default JSON for CrossRef-like calls and HTML/text for other calls
  return {
    ok: false,
    status: 404,
    statusText: "Not Found",
    headers: {
      get: () => "application/json",
    },
    json: async () => ({}),
    text: async () => "Not Found",
    arrayBuffer: async () => new ArrayBuffer(0),
  };
});

// Ensure stream-generate and lookup-doi never depend on network.
(globalThis as any).fetch = mockFetch;

function getRetryAfterNumber(body: any): number | null {
  const v = body?.retryAfter;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim().length) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

describe("T006 — Rate limiting & brute-force protection", () => {
  beforeEach(() => {
    // Ensure NODE_ENV behavior doesn't start real server; server.ts gates on NODE_ENV.
    process.env.NODE_ENV = "test";
    // Isolate in-memory rate limiter store between tests.
    __resetRateLimitStore();
    mockFetch.mockClear();
  });

  it("throttles auth brute-force endpoint by (ip + username)", async () => {
    const username = "rl_user_1";
    const password = "wrong_password";

    // loginBruteForceLimit: window 15m, max 5
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/verify-and-sync-profile")
        .send({ username, password });
      expect(res.status).not.toBe(429);
    }

    const res429 = await request(app)
      .post("/api/verify-and-sync-profile")
      .send({ username, password });

    expect(res429.status).toBe(429);
    expect(res429.headers["content-type"]).toContain("application/json");
    expect(res429.body?.code).toBe("RATE_LIMIT_EXCEEDED");
    const retryAfter = getRetryAfterNumber(res429.body);
    expect(retryAfter).not.toBeNull();
    expect((retryAfter as number) >= 0).toBe(true);
  });

  it("throttles AI generation endpoints", async () => {
    // aiAbuseLimit: window 60s, max 20
    const payload = {
      provider: "gemini",
      apiKey: "",
      model: "gemini-2.5-flash",
      systemInstruction: "You are a helpful assistant.",
      prompt: "Hello",
      temperature: 0.1,
      responseMimeType: "text/plain",
      username: "ai_user_1",
    };

    // Ensure below limit does not 429 (may be 400/500 depending on env keys; but should not be 429)
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/api/generate").send(payload);
      expect(res.status).not.toBe(429);
    }

    const res429 = await request(app).post("/api/generate").send(payload);
    expect(res429.status).toBe(429);
    expect(res429.body?.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(getRetryAfterNumber(res429.body)).not.toBeNull();
  });

  it("throttles parse-external-link endpoint", async () => {
    // parseExternalLinkLimit: window 60s, max 30
    const payload = { url: "https://example.com/" };

    for (let i = 0; i < 30; i++) {
      const res = await request(app).post("/api/parse-external-link").send(payload);
      expect(res.status).not.toBe(429);
    }

    const res429 = await request(app).post("/api/parse-external-link").send(payload);
    expect(res429.status).toBe(429);
    expect(res429.body?.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(getRetryAfterNumber(res429.body)).not.toBeNull();
  });

  it("throttles auth endpoints by IP (register + password reset)", async () => {
    // authModerateLimit: window 15m, max 20 (IP only)
    // /api/request-password-reset uses authModerateLimit
    const resetPayload = {
      username: "rl_reset_user_1",
      email: "rl_reset_user_1@example.com",
      newPasswordHash: "hash",
    };

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post("/api/request-password-reset")
        .send(resetPayload);
      expect(res.status).not.toBe(429);
    }

    const res429 = await request(app)
      .post("/api/request-password-reset")
      .send(resetPayload);

    expect(res429.status).toBe(429);
    expect(res429.body?.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(getRetryAfterNumber(res429.body)).not.toBeNull();
  });

  it(
    "throttles AI streaming generation endpoint",
    async () => {
      // aiAbuseLimit: window 60s, max 20 (IP only)
      const payload = {
        provider: "gemini",
        apiKey: "",
        model: "gemini-2.5-flash",
        systemInstruction: "You are a helpful assistant.",
        prompt: "Hello streaming",
        temperature: 0.1,
        responseMimeType: "text/plain",
        username: "ai_stream_1",
      };

      // With mocks, requests are fast and deterministic.
      for (let i = 0; i < 20; i++) {
        const res = await request(app).post("/api/stream-generate").send(payload);
        expect(res.status).not.toBe(429);
      }

      const res429 = await request(app).post("/api/stream-generate").send(payload);
      expect(res429.status).toBe(429);
      expect(res429.body?.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(getRetryAfterNumber(res429.body)).not.toBeNull();
    },
    15000
  );

  it(
    "throttles DOI lookup endpoint",
    async () => {
      // lookupDoiLimit: window 60s, max 30 (IP only)
      // Mock CrossRef response to avoid any network dependency.
      mockFetch.mockImplementation(async () => {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {
            get: () => "application/json",
          },
          json: async () => ({
            message: {
              title: ["Mock Research Title"],
              author: [{ given: "John", family: "Doe" }],
              "container-title": ["Mock Journal"],
              volume: "1",
              issue: "2",
              published: { "date-parts": [[2026]] },
              URL: "https://doi.org/10.1000/xyz123",
              abstract: "Mock abstract",
            },
          }),
          text: async () => "OK",
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      });

      const payload = { doi: "10.1000/xyz123" };

      for (let i = 0; i < 30; i++) {
        const res = await request(app).post("/api/lookup-doi").send(payload);
        expect(res.status).not.toBe(429);
      }

      const res429 = await request(app).post("/api/lookup-doi").send(payload);
      expect(res429.status).toBe(429);
      expect(res429.body?.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(getRetryAfterNumber(res429.body)).not.toBeNull();
    },
    15000
  );
});
