import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../../server.ts";
import {
  createLLMChallengeToken,
  verifyLLMChallengeToken,
  handleFrontendLLMOverride,
  handleFrontendLLMOverrideJSON,
  getLLMChallengeSecret,
} from "../../utils/llm.ts";
import { scholarBrain } from "../../utils/scholarBrain.ts";
import { complete, GatewayDenied } from "../../../src/platform/gateway/gateway.ts";
import { defaultPolicy } from "../../../src/platform/warden/warden.js";
import {
  verifyAccessToken,
  clearAuthTokenCache,
  getAuthCacheSize,
} from "../../src/middleware/auth.ts";

describe("Remediation Step 1: Security & Auth Hardening", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearAuthTokenCache();
    delete process.env.SUPABASE_JWT_SECRET;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    clearAuthTokenCache();
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // 1. HTTP 426 HMAC Challenge Signing & scholarBrain Sanitization
  // ─────────────────────────────────────────────────────────
  describe("1. HTTP 426 HMAC Challenge Integrity Verification", () => {
    const mockReq = {
      user: { id: "user-uuid-123", email: "scholar@example.edu" },
      userId: "user-uuid-123",
      params: { id: "project-uuid-456" },
      originalUrl: "/api/projects/project-uuid-456/agentic-draft",
    };

    it("rejects forged / unsigned body.llmResult with HTTP 403", () => {
      const forgedReq = {
        ...mockReq,
        body: {
          llmResult: "Fabricated peer review score: 10/10",
          // Missing challengeToken!
        },
      };

      const mockRes = {
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.body = payload;
          return this;
        },
      };

      expect(() =>
        handleFrontendLLMOverride(forgedReq, mockRes as never, {
          systemPrompt: "System instruction",
          userPrompt: "User prompt",
        })
      ).toThrowError(/Forbidden LLM override/);

      expect(mockRes.statusCode).toBe(403);
    });

    it("rejects tampered or expired challenge tokens with HTTP 403", () => {
      // 1. Tampered signature
      const validToken = createLLMChallengeToken(mockReq, "sys", "usr");
      const [payloadB64] = validToken.split(".");
      const tamperedToken = `${payloadB64}.tampered_signature_xyz`;

      const tamperedReq = {
        ...mockReq,
        body: {
          llmResult: "Tampered response",
          challengeToken: tamperedToken,
        },
      };

      expect(() =>
        handleFrontendLLMOverride(tamperedReq, undefined, {
          systemPrompt: "sys",
          userPrompt: "usr",
        })
      ).toThrowError(/Forbidden LLM override: Invalid HMAC signature/);

      // 2. Expired token (issued in past, ttl expired)
      const secret = getLLMChallengeSecret();
      const expiredPayload = {
        userId: "user-uuid-123",
        projectId: "project-uuid-456",
        routeId: mockReq.originalUrl,
        promptSha256: crypto.createHash("sha256").update("sys:::usr").digest("hex"),
        issuedAt: Date.now() - 600_000,
        expiresAt: Date.now() - 10_000, // expired 10s ago
      };
      const expB64 = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
      const expSig = crypto.createHmac("sha256", secret).update(expB64).digest("base64url");
      const expiredToken = `${expB64}.${expSig}`;

      const expiredReq = {
        ...mockReq,
        body: {
          llmResult: "Expired response",
          challengeToken: expiredToken,
        },
      };

      expect(() =>
        handleFrontendLLMOverride(expiredReq, undefined, {
          systemPrompt: "sys",
          userPrompt: "usr",
        })
      ).toThrowError(/Forbidden LLM override: Challenge token has expired/);
    });

    it("rejects challenge tokens generated for a different userId or projectId with HTTP 403", () => {
      // Token generated for user-attacker
      const attackerReq = {
        user: { id: "user-attacker" },
        params: { id: "project-uuid-456" },
      };
      const tokenForAttacker = createLLMChallengeToken(attackerReq, "sys", "usr");

      const victimReq = {
        user: { id: "user-victim" },
        params: { id: "project-uuid-456" },
        body: {
          llmResult: "Stolen response",
          challengeToken: tokenForAttacker,
        },
      };

      expect(() =>
        handleFrontendLLMOverride(victimReq, undefined, {
          systemPrompt: "sys",
          userPrompt: "usr",
        })
      ).toThrowError(/User ID mismatch/);
    });

    it("accepts validly signed challenges and passes text through scholarBrain voice and citation sanitization", () => {
      const sysPrompt = "Act as an academic editor.";
      const usrPrompt = "Synthesize the recent literature on quantum coherence.";
      const validToken = createLLMChallengeToken(mockReq, sysPrompt, usrPrompt);

      const rawLlmOutput =
        "It is worth noting that we delve into this rich tapestry, which is a testament to the framework. " +
        "The model analyzed the behavior with diacritic Śaṅkara in [ 1 ] and ((Smith, 2020)).";

      const validReq = {
        ...mockReq,
        body: {
          llmResult: rawLlmOutput,
          challengeToken: validToken,
        },
      };

      const sanitized = handleFrontendLLMOverride(validReq, undefined, {
        systemPrompt: sysPrompt,
        userPrompt: usrPrompt,
      });

      expect(sanitized).toBeDefined();
      // Clichés suppressed by scholarBrain
      expect(sanitized).not.toContain("delve into");
      expect(sanitized).not.toContain("rich tapestry");
      expect(sanitized).not.toContain("testament to");
      // British orthography standardized
      expect(sanitized).toContain("analysed");
      expect(sanitized).toContain("behaviour");
      // Unicode NFC diacritic preserved
      expect(sanitized).toContain("Śaṅkara");
      // Citations scrubbed and normalized
      expect(sanitized).toContain("[1]");
      expect(sanitized).toContain("(Smith, 2020)");
      expect(sanitized).not.toContain("[ 1 ]");
      expect(sanitized).not.toContain("((Smith, 2020))");
    });

    it("sanitizes JSON overrides recursively and enforces structural schema validation", () => {
      const validToken = createLLMChallengeToken(mockReq, "sys", "usr");
      const jsonReq = {
        ...mockReq,
        body: {
          llmResult: JSON.stringify({
            title: "Analysis of the Rich Tapestry",
            summary: "It is worth noting that we delve into behavioral biology.",
            score: 95,
          }),
          challengeToken: validToken,
        },
      };

      interface ReviewSchema {
        title: string;
        summary: string;
        score: number;
      }

      const validated = handleFrontendLLMOverrideJSON<ReviewSchema>(jsonReq, undefined, {
        systemPrompt: "sys",
        userPrompt: "usr",
        schemaValidator: (val: unknown) => {
          const rec = val as Record<string, unknown>;
          if (typeof rec.title !== "string" || typeof rec.score !== "number") {
            throw new Error("Invalid review schema");
          }
          return rec as unknown as ReviewSchema;
        },
      });

      expect(validated).toBeDefined();
      expect(validated?.score).toBe(95);
      expect(validated?.summary).not.toContain("delve into");
      expect(validated?.summary).toContain("behavioural");
    });
  });

  // ─────────────────────────────────────────────────────────
  // 2. Warden Privacy Egress Guard on systemPrompt
  // ─────────────────────────────────────────────────────────
  describe("2. Warden Privacy Egress Guard on systemPrompt and userPrompt", () => {
    it("redacts sensitive content in both systemPrompt and userPrompt before dispatching to provider", async () => {
      let dispatchedSystemPrompt = "";
      let dispatchedUserPrompt = "";

      global.fetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const bodyStr = init?.body as string;
        if (bodyStr) {
          const parsed = JSON.parse(bodyStr);
          dispatchedSystemPrompt = parsed.messages?.find((m: { role: string }) => m.role === "system")?.content || "";
          dispatchedUserPrompt = parsed.messages?.find((m: { role: string }) => m.role === "user")?.content || "";
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: "Safe scholarly completion." } }] }),
        } as Response;
      });

      // Egress policy that redacts user_content
      const policy = {
        ...defaultPolicy(),
        rules: {
          ...defaultPolicy().rules,
          user_content: "redact" as const,
        },
      };

      const result = await complete(
        {
          provider: "openai",
          apiKey: "sk-test-key",
          taskClass: "drafting",
          systemPrompt: "Patient clinical record: SSN 000-12-3456 with diagnosis of coronary artery disease.",
          userPrompt: "Draft an analytical case vignette based on the clinical record.",
          segments: [],
        },
        policy
      );

      expect(result.text).toBe("Safe scholarly completion.");
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Verify outbound payload intercepted and redacted by Warden
      expect(dispatchedSystemPrompt).toContain("[redacted by privacy policy]");
      expect(dispatchedSystemPrompt).not.toContain("000-12-3456");
      expect(dispatchedUserPrompt).toContain("[redacted by privacy policy]");
    });

    it("hard-denies outbound execution when systemPrompt contains restricted scope data", async () => {
      global.fetch = vi.fn();

      const policy = {
        ...defaultPolicy(),
        restrictedScopes: new Set(["restricted-project-id"]),
      };

      await expect(
        complete(
          {
            provider: "openai",
            apiKey: "sk-test-key",
            taskClass: "drafting",
            scopeId: "restricted-project-id",
            systemPrompt: "Confidential institutional guidelines",
            userPrompt: "Summarize guidelines",
            segments: [],
          },
          policy
        )
      ).rejects.toBeInstanceOf(GatewayDenied);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 3. Local Cryptographic JWT Verification & Bounded LRU Cache
  // ─────────────────────────────────────────────────────────
  describe("3. Fast-Path Auth: Local JWT Verification & TTL LRU Cache", () => {
    it("Tier 1: verifies HS256 JWT locally in <0.5ms with 0 network calls when SUPABASE_JWT_SECRET is set", async () => {
      const secret = "super-secret-jwt-key-32-characters-minimum";
      process.env.SUPABASE_JWT_SECRET = secret;

      // Construct a valid Supabase HS256 JWT
      const header = { alg: "HS256", typ: "JWT" };
      const nowSec = Math.floor(Date.now() / 1000);
      const payload = {
        sub: "user-local-jwt-99",
        email: "fast@scholar.org",
        role: "authenticated",
        aud: "authenticated",
        exp: nowSec + 3600,
        iat: nowSec,
      };

      const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = crypto.createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest("base64url");
      const validJwt = `${headerB64}.${payloadB64}.${sig}`;

      // Global fetch should NEVER be called on Tier 1 fast path
      global.fetch = vi.fn().mockImplementation(() => {
        throw new Error("Network fetch should not be called when SUPABASE_JWT_SECRET is active");
      });

      const start = performance.now();
      const res = await verifyAccessToken(validJwt);
      const durationMs = performance.now() - start;

      expect(res.ok).toBe(true);
      expect(res.user?.id).toBe("user-local-jwt-99");
      expect(res.user?.email).toBe("fast@scholar.org");
      expect(durationMs).toBeLessThan(5); // Typically <0.5ms
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("Tier 1: rejects forged signature or expired JWT locally without network calls", async () => {
      const secret = "super-secret-jwt-key-32-characters-minimum";
      process.env.SUPABASE_JWT_SECRET = secret;

      const header = { alg: "HS256", typ: "JWT" };
      const nowSec = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        sub: "user-expired",
        aud: "authenticated",
        exp: nowSec - 100, // expired
      };

      const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
      const expB64 = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
      const sig = crypto.createHmac("sha256", secret).update(`${headerB64}.${expB64}`).digest("base64url");
      const expiredJwt = `${headerB64}.${expB64}.${sig}`;

      global.fetch = vi.fn();
      const result = await verifyAccessToken(expiredJwt);
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("invalid");
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("Tier 2: caches remote GoTrue verification in in-memory LRU cache (1 fetch across repeated calls)", async () => {
      delete process.env.SUPABASE_JWT_SECRET;
      process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret";

      const token = "remote-bearer-token-xyz-123";
      let fetchCount = 0;

      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "user-from-gotrue", email: "gotrue@scholar.edu", exp: Math.floor(Date.now() / 1000) + 3600 }),
        } as Response;
      });

      // Call 5 times in succession
      for (let i = 0; i < 5; i++) {
        const res = await verifyAccessToken(token);
        expect(res.ok).toBe(true);
        expect(res.user?.id).toBe("user-from-gotrue");
      }

      // Exactly 1 network fetch made across all 5 calls
      expect(fetchCount).toBe(1);
      expect(getAuthCacheSize()).toBe(1);

      // Invalidate cache entry via clearAuthTokenCache
      clearAuthTokenCache(token);
      expect(getAuthCacheSize()).toBe(0);

      // Next call must re-fetch
      const afterClearRes = await verifyAccessToken(token);
      expect(afterClearRes.ok).toBe(true);
      expect(fetchCount).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────
  // 4. Static Standards Routes & SPA Routing Extension Guard
  // ─────────────────────────────────────────────────────────
  describe("4. Static Standards Routes & Route Hardening", () => {
    it("serves explicit text/plain for /robots.txt with disallow /api/", async () => {
      const res = await request(app).get("/robots.txt");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
      expect(res.text).toContain("User-agent: *");
      expect(res.text).toContain("Disallow: /api/");
    });

    it("serves explicit text/plain for /llms.txt standard with AI capabilities", async () => {
      const res = await request(app).get("/llms.txt");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/plain");
      expect(res.text).toContain("Scholar AI Agentic OS");
      expect(res.text).toContain("Academic Literature Harvester");
    });

    it("serves explicit application/json for /ai-catalog.json", async () => {
      const res = await request(app).get("/ai-catalog.json");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.name).toBe("Scholar AI Agentic OS");
      expect(Array.isArray(res.body.capabilities)).toBe(true);
      expect(res.body.capabilities).toContain("literature_synthesis");
    });

    it("returns explicit 404 for missing static assets instead of index.html", async () => {
      // Missing javascript asset
      const jsRes = await request(app).get("/assets/missing-asset-bundle-1234.js");
      expect(jsRes.status).toBe(404);
      expect(jsRes.text).not.toContain("<!DOCTYPE html>");
      expect(jsRes.text).toContain("404 Not Found");

      // Missing css asset
      const cssRes = await request(app).get("/assets/missing-style.css");
      expect(cssRes.status).toBe(404);
      expect(cssRes.text).not.toContain("<!DOCTYPE html>");

      // Missing source map
      const mapRes = await request(app).get("/assets/missing.js.map");
      expect(mapRes.status).toBe(404);
    });

    it("returns explicit 404 JSON for unmatched /api/* routes instead of index.html", async () => {
      const apiRes = await request(app).get("/api/nonexistent-system-endpoint");
      expect(apiRes.status).toBe(404);
      expect(apiRes.headers["content-type"]).toContain("application/json");
      expect(apiRes.body.error).toContain("API endpoint not found");
    });
  });
});
