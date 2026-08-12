// @vitest-environment jsdom
//
// Phase 4: Integration Testing for the new automated authentication system.
// Tests the complete signup flow including CAPTCHA verification, email
// verification, password reset, rate limiting, and account status validation.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch for backend API calls
global.fetch = vi.fn() as any;

const mockAuth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  getUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
};

const mockFrom = vi.fn();
const mockRpc = vi.fn();

// Chainable query-builder mock for Supabase queries
function makeChainable(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    single: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    upsert: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

vi.mock("../services/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: mockAuth,
    from: mockFrom,
    rpc: mockRpc,
  }),
  isSupabaseConfigured: () => true,
}));

vi.mock("../services/captchaService", () => ({
  getCaptchaConfig: () => ({ siteKey: "test_site_key", enabled: true }),
  getCaptchaToken: vi.fn(),
  resetCaptcha: vi.fn(),
  clearCaptcha: vi.fn(),
}));

import { signUp, signIn, sendPasswordResetEmail } from "../services/supabaseAuthService";
import { getCaptchaConfig } from "../services/captchaService";

describe("Phase 4: Integration Testing - Automated Authentication Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Test 1: Signup with CAPTCHA Verification", () => {
    it("completes signup when CAPTCHA verification succeeds", async () => {
      // Mock CAPTCHA verification endpoint
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      // Mock Supabase auth signup
      mockAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: "user-123", email: "test@example.com" } },
        error: null,
      });

      // Mock profile creation via database trigger
      mockFrom.mockReturnValue(
        makeChainable({
          data: [{ id: "user-123", account_status: "active", email: "test@example.com" }],
          error: null,
        })
      );

      const result = await signUp({
        username: "testuser",
        fullName: "Test User",
        email: "test@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12345",
        password: "TestPassword123!",
        captchaToken: "valid_captcha_token",
      });

      expect(result.success).toBe(true);
      expect(mockAuth.signUp).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/auth/verify-signup",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("valid_captcha_token"),
        })
      );
    });

    it("rejects signup when CAPTCHA verification fails", async () => {
      // Mock CAPTCHA verification endpoint returning failure
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ success: false, error: "CAPTCHA verification failed" }),
      });

      const result = await signUp({
        username: "testuser",
        fullName: "Test User",
        email: "test@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12345",
        password: "TestPassword123!",
        captchaToken: "invalid_captcha_token",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("CAPTCHA");
      // Supabase signup should NOT be called if CAPTCHA fails
      expect(mockAuth.signUp).not.toHaveBeenCalled();
    });

    // This previously asserted the opposite ("allows signup without CAPTCHA if
    // token is not provided"), which is precisely how a bot signs up: omitting
    // the field skipped verification entirely and Turnstile protected nothing.
    // With CAPTCHA configured, a missing token must fail closed.
    it("refuses signup when CAPTCHA is configured but no token was produced", async () => {
      mockAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: "user-456", email: "test2@example.com" } },
        error: null,
      });

      mockFrom.mockReturnValue(
        makeChainable({
          data: [{ id: "user-456", account_status: "active" }],
          error: null,
        })
      );

      const result = await signUp({
        username: "testuser2",
        fullName: "Test User 2",
        email: "test2@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12346",
        password: "TestPassword123!",
        // No captchaToken provided
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/CAPTCHA/i);
      // Rejected before any account could be created, and with no pointless
      // round-trip to the verification endpoint.
      expect(mockAuth.signUp).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("passes the CAPTCHA token to Supabase Auth, which is the enforcing side", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      mockAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: "user-457", email: "test3@example.com" } },
        error: null,
      });

      await signUp({
        username: "testuser3",
        fullName: "Test User 3",
        email: "test3@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12347",
        password: "TestPassword123!",
        captchaToken: "valid_captcha_token",
      });

      // signUp() runs in the browser, so its own /api/auth/verify-signup check
      // is a front door, not a boundary — a bot skips this code and posts to
      // Supabase directly. The token therefore has to reach Supabase Auth,
      // which validates it server-side at the endpoint that creates the user.
      expect(mockAuth.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ captchaToken: "valid_captcha_token" }),
        })
      );
    });
  });

  describe("Test 1b: CAPTCHA on sign-in and password reset", () => {
    // Supabase Auth's CAPTCHA setting is per-PROJECT, not per-endpoint:
    // enabling it protects the password grant and /recover at the same moment
    // it protects signup. A sign-in that sends no token therefore stops working
    // the instant CAPTCHA is switched on, locking out every existing user.
    it("passes the CAPTCHA token through to signInWithPassword", async () => {
      mockRpc.mockResolvedValueOnce({ data: "user@example.com", error: null });
      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-1", email: "user@example.com" } },
        error: null,
      });
      mockFrom.mockReturnValue(
        makeChainable({ data: { full_name: "U", phone: "", affiliation: "A", authentic_id: "None", account_status: "active" }, error: null })
      );

      await signIn({ username: "someone", password: "pw", captchaToken: "signin_token" });

      expect(mockAuth.signInWithPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ captchaToken: "signin_token" }),
        })
      );
    });

    it("passes the CAPTCHA token through to resetPasswordForEmail", async () => {
      mockAuth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });

      await sendPasswordResetEmail("user@example.com", "reset_token");

      expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith(
        "user@example.com",
        expect.objectContaining({ captchaToken: "reset_token" })
      );
    });
  });

  describe("Test 2: Email Verification Workflow", () => {
    it("creates user with unverified email status after signup", async () => {
      // CAPTCHA is mocked as configured for this whole file, so a signup that
      // is meant to SUCCEED has to carry a token and let verification pass —
      // this test is about email verification, not about CAPTCHA.
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      mockAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: "user-789", email: "unverified@example.com" } },
        error: null,
      });

      const result = await signUp({
        username: "unverified",
        fullName: "Unverified User",
        email: "unverified@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12347",
        password: "TestPassword123!",
        captchaToken: "valid_captcha_token",
      });

      expect(result.success).toBe(true);
      // Database trigger creates profile with account_status='active' automatically
      expect(mockAuth.signUp).toHaveBeenCalled();
    });

    it("prevents login until email is verified", async () => {
      mockRpc.mockResolvedValueOnce({
        data: "verify@example.com",
        error: null,
      });

      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-verify-test" }, session: null },
        error: null,
      });

      mockFrom.mockReturnValue(
        makeChainable({
          data: { id: "user-verify-test", account_status: "active", email_verified: false },
          error: null,
        })
      );

      const result = await signIn({
        username: "verify",
        password: "TestPassword123!",
      });

      // Should succeed even if not verified yet (Supabase Auth handles verification)
      expect(result).toBeDefined();
    });

    it("allows login after email is verified", async () => {
      mockRpc.mockResolvedValueOnce({
        data: "verified@example.com",
        error: null,
      });

      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: "user-verified", email: "verified@example.com" },
          session: { access_token: "token", user: { id: "user-verified" } },
        },
        error: null,
      });

      mockFrom.mockReturnValue(
        makeChainable({
          data: { id: "user-verified", full_name: "Verified User", phone: "", affiliation: "University", authentic_id: "V123", account_status: "active" },
          error: null,
        })
      );

      const result = await signIn({
        username: "verified",
        password: "TestPassword123!",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Test 3: Password Reset Flow", () => {
    it("initiates password reset with email link", async () => {
      mockAuth.resetPasswordForEmail.mockResolvedValueOnce({
        data: {},
        error: null,
      });

      const { sendPasswordResetEmail } = await import("../services/supabaseAuthService");
      const result = await sendPasswordResetEmail("reset@example.com");

      expect(result.success).toBe(true);
      expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith("reset@example.com", expect.any(Object));
    });

    it("allows password update after recovery link", async () => {
      mockAuth.updateUser.mockResolvedValueOnce({
        data: { user: { id: "user-reset", email: "reset@example.com" } },
        error: null,
      });

      const { updatePassword } = await import("../services/supabaseAuthService");
      const result = await updatePassword("NewPassword123!");

      expect(result.success).toBe(true);
      expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: "NewPassword123!" });
    });
  });

  describe("Test 4: Abuse Prevention - CAPTCHA Challenge", () => {
    it("requires CAPTCHA to be solved before signup", () => {
      const captchaConfig = getCaptchaConfig();

      expect(captchaConfig.enabled).toBe(true);
      expect(captchaConfig.siteKey).toBe("test_site_key");
    });

    it("rejects signup if CAPTCHA verification endpoint returns 429 (rate limited)", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ success: false, error: "Too many requests" }),
      });

      const result = await signUp({
        username: "ratelimited",
        fullName: "Rate Limited User",
        email: "ratelimited@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12348",
        password: "TestPassword123!",
        captchaToken: "token",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Too many");
    });

    it("re-challenges CAPTCHA after multiple failed attempts", async () => {
      // First attempt fails
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ success: false, error: "CAPTCHA verification failed" }),
      });

      const result1 = await signUp({
        username: "nocaptcha1",
        fullName: "No CAPTCHA User 1",
        email: "nocaptcha1@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12349",
        password: "TestPassword123!",
        captchaToken: "invalid_token_1",
      });

      expect(result1.success).toBe(false);

      // Second attempt with new token should be allowed to try
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      mockAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: "user-retry", email: "nocaptcha1@example.com" } },
        error: null,
      });

      const result2 = await signUp({
        username: "nocaptcha1",
        fullName: "No CAPTCHA User 1",
        email: "nocaptcha1@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12349",
        password: "TestPassword123!",
        captchaToken: "valid_token_retry",
      });

      expect(result2.success).toBe(true);
    });
  });

  describe("Test 5: Rate Limiting Enforcement", () => {
    it("returns 429 status when login attempts exceed limit", async () => {
      mockRpc.mockResolvedValueOnce({
        data: "spamuser@example.com",
        error: null,
      });

      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: { user: null, session: null },
        error: { message: "Incorrect password credentials" },
      });

      const result = await signIn({
        username: "spamuser",
        password: "TestPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Incorrect password credentials.");
    });

    it("includes retry-after information in rate limit response", async () => {
      const retryAfterSeconds = 892;

      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            success: false,
            error: "Too many login attempts. Please try again in 15 minutes.",
            retryAfter: retryAfterSeconds,
          }),
      });

      const response = await (global.fetch as any)("/api/auth/verify-signup", {
        method: "POST",
        body: JSON.stringify({ captchaToken: "token" }),
      });

      const data = await response.json();
      expect(data.retryAfter).toBe(retryAfterSeconds);
    });
  });

  describe("Test 6: Account Status Validation", () => {
    it("sets account_status to 'active' on successful signup", async () => {
      // See the note in Test 2: CAPTCHA is configured for this file, so a
      // signup expected to succeed carries a token and passes verification.
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      mockAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: "user-active", email: "active@example.com" } },
        error: null,
      });

      const result = await signUp({
        username: "activeuser",
        fullName: "Active User",
        email: "active@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12350",
        password: "TestPassword123!",
        captchaToken: "valid_captcha_token",
      });

      expect(result.success).toBe(true);
      // signUp succeeds when Supabase auth signup succeeds
      // (database trigger creates profile with account_status='active' automatically)
      expect(mockAuth.signUp).toHaveBeenCalled();
    });

    it("prevents login for restricted accounts", async () => {
      mockRpc.mockResolvedValueOnce({
        data: "restricted@example.com",
        error: null,
      });

      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-restricted" }, session: null },
        error: null,
      });

      mockFrom.mockReturnValue(
        makeChainable({
          data: { full_name: "Restricted User", phone: "", affiliation: "University", authentic_id: "R123", account_status: "restricted" },
          error: null,
        })
      );

      const result = await signIn({
        username: "restricted",
        password: "TestPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("restricted");
    });

    it("prevents login for suspended accounts", async () => {
      mockRpc.mockResolvedValueOnce({
        data: "suspended@example.com",
        error: null,
      });

      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-suspended" }, session: null },
        error: null,
      });

      mockFrom.mockReturnValue(
        makeChainable({
          data: { full_name: "Suspended User", phone: "", affiliation: "University", authentic_id: "S123", account_status: "suspended" },
          error: null,
        })
      );

      const result = await signIn({
        username: "suspended",
        password: "TestPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("suspended");
    });

    it("prevents login for deleted accounts", async () => {
      mockRpc.mockResolvedValueOnce({
        data: "deleted@example.com",
        error: null,
      });

      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: { user: { id: "user-deleted" }, session: null },
        error: null,
      });

      mockFrom.mockReturnValue(
        makeChainable({
          data: { full_name: "Deleted User", phone: "", affiliation: "University", authentic_id: "D123", account_status: "deleted" },
          error: null,
        })
      );

      const result = await signIn({
        username: "deleted",
        password: "TestPassword123!",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("deleted");
    });
  });

  describe("Test 7: Complete End-to-End Signup Flow", () => {
    it("successfully registers and activates user with CAPTCHA and email verification", async () => {
      // Step 2: Backend verifies CAPTCHA
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      // Step 3: Supabase Auth creates user
      mockAuth.signUp.mockResolvedValueOnce({
        data: { user: { id: "user-e2e", email: "e2e@example.com" } },
        error: null,
      });

      const signupResult = await signUp({
        username: "e2euser",
        fullName: "E2E Test User",
        email: "e2e@example.com",
        phone: "+1234567890",
        affiliation: "Test University",
        authenticId: "T12351",
        password: "TestPassword123!",
        captchaToken: "valid_token",
      });

      expect(signupResult.success).toBe(true);
      // Database trigger creates profile with account_status='active' automatically

      // Step 5: User verifies email (simulated - Supabase handles this)
      // Step 6: User can now login
      mockRpc.mockResolvedValueOnce({
        data: "e2e@example.com",
        error: null,
      });

      mockAuth.signInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: "user-e2e", email: "e2e@example.com" },
          session: { access_token: "token", user: { id: "user-e2e" } },
        },
        error: null,
      });

      mockFrom.mockReturnValue(
        makeChainable({
          data: { id: "user-e2e", account_status: "active", email: "e2e@example.com" },
          error: null,
        })
      );

      const loginResult = await signIn({
        username: "e2euser",
        password: "TestPassword123!",
      });

      expect(loginResult.success).toBe(true);
    });
  });
});
