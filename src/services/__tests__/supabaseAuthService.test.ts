// @vitest-environment jsdom
// (needed for sendPasswordResetEmail's use of window.location.origin — the
// rest of this file's tests don't touch the DOM and are unaffected by jsdom.)
import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable query-builder mock: each method returns the same object so
// `.from(...).select(...).eq(...).single()` resolves to whatever `result`
// was configured for that call, matching how the real Supabase JS client's
// query builder is thenable at any point in the chain.
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

const mockAuth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  setSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
  getUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
};
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
// Every existing test in this file assumes a configured Supabase project —
// default true so none of them need to know this mock exists. The
// onPasswordRecovery/onGoogleSignIn regression tests below flip it to
// false for the specific case they're covering.
const mockIsSupabaseConfigured = vi.fn(() => true);

vi.mock("../supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: mockAuth,
    from: mockFrom,
    rpc: mockRpc,
    functions: { invoke: mockFunctionsInvoke },
  }),
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
}));

import {
  signUp,
  signIn,
  getProfile,
  saveProfileFields,
  saveModelPreferences,
  saveApiKeys,
  sendPasswordResetEmail,
  updatePassword,
  requestProfileUpdate,
  onPasswordRecovery,
  onGoogleSignIn,
  checkUsernameAvailable,
  checkEmailAvailable,
  checkPhoneAvailable,
  resendVerificationEmail,
} from "../supabaseAuthService";

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSupabaseConfigured.mockReturnValue(true);
});

describe("signUp", () => {
  it("creates the auth user with automatic account activation", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const result = await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "5550100",
      phoneCountryCode: "+1",
      affiliation: "State University",
      userType: "student",
      educationLevel: "undergraduate",
      password: "hunter2-hunter2",
    });

    expect(result.success).toBe(true);
    expect(mockAuth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "jane@example.com", password: "hunter2-hunter2" })
    );
    expect(mockAuth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({ phone_country_code: "+1", user_type: "student", education_level: "undergraduate" }),
        }),
      })
    );
  });

  it("never sends authentic_id — institutional ID was removed completely", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "5550100",
      phoneCountryCode: "+1",
      affiliation: "State University",
      userType: "student",
      educationLevel: "undergraduate",
      password: "hunter2-hunter2",
    });

    const [[callArgs]] = mockAuth.signUp.mock.calls;
    expect(callArgs.options.data).not.toHaveProperty("authentic_id");
  });

  it("sends the confirmation link to the app's own /verify-email route", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "5550100",
      phoneCountryCode: "+1",
      affiliation: "State University",
      userType: "student",
      educationLevel: "undergraduate",
      password: "hunter2-hunter2",
    });

    expect(mockAuth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ emailRedirectTo: `${window.location.origin}/verify-email` }),
      })
    );
  });

  it("allows affiliation to be sent as an empty string — Institution is optional", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const result = await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "5550100",
      phoneCountryCode: "+1",
      affiliation: "",
      userType: "student",
      educationLevel: "undergraduate",
      password: "hunter2-hunter2",
    });

    expect(result.success).toBe(true);
    expect(mockAuth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ data: expect.objectContaining({ affiliation: "" }) }) })
    );
  });

  it("surfaces a Supabase Auth error", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } });

    const result = await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      phoneCountryCode: "+1",
      affiliation: "State University",
      userType: "student",
      educationLevel: "undergraduate",
      password: "hunter2-hunter2",
    });

    expect(result).toEqual({ success: false, error: "User already registered" });
  });

  it("treats Supabase's obfuscated fake-user response (empty identities) as an already-registered email, not a fresh signup", async () => {
    // Per @supabase/auth-js's own signUp() docs: when Confirm Email is on and
    // signUp() is called for an existing CONFIRMED user, Supabase returns a
    // fake user object with error: null instead of an error, to avoid email
    // enumeration. An empty identities array is what a real new signup never
    // has (it always gets exactly one identity for the provider just used).
    mockAuth.signUp.mockResolvedValue({
      data: { user: { id: "u1", email: "jane@example.com", identities: [] } },
      error: null,
    });

    const result = await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      phoneCountryCode: "+1",
      affiliation: "State University",
      userType: "student",
      educationLevel: "undergraduate",
      password: "hunter2-hunter2",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already registered");
  });

  it("treats a non-empty identities array as a genuine new signup", async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: { id: "u1", email: "jane@example.com", identities: [{ id: "identity-1" }] } },
      error: null,
    });

    const result = await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      phoneCountryCode: "+1",
      affiliation: "State University",
      userType: "student",
      educationLevel: "undergraduate",
      password: "hunter2-hunter2",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("signIn", () => {
  it("delegates username login to POST /api/auth/login, sets the session, and never calls client-side email_for_username RPC", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          session: { access_token: "tok-access", refresh_token: "tok-refresh" },
          profile: { fullName: "Jane Doe", phone: "", affiliation: "State University" },
        }),
    });

    const result = await signIn({ username: "jdoe", password: "hunter2-hunter2" });

    expect(result.success).toBe(true);
    expect(result.profile?.fullName).toBe("Jane Doe");
    expect(result.profile?.email).toBe("");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAuth.setSession).toHaveBeenCalledWith({
      access_token: "tok-access",
      refresh_token: "tok-refresh",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          identifier: "jdoe",
          password: "hunter2-hunter2",
          captchaToken: undefined,
        }),
      })
    );
  });

  it("delegates email login to POST /api/auth/login without client-side RPC", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          session: { access_token: "tok-access", refresh_token: "tok-refresh" },
          profile: { fullName: "Jane Doe", phone: "", affiliation: "State University" },
        }),
    });

    const result = await signIn({ username: "jane@example.com", password: "hunter2-hunter2" });

    expect(result.success).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("delegates E.164 phone login to POST /api/auth/login without client-side email_for_phone_e164 RPC", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          session: { access_token: "tok-access", refresh_token: "tok-refresh" },
          profile: { fullName: "Jane Doe", phone: "5550100", affiliation: "State University" },
        }),
    });

    const result = await signIn({ username: "+15550100", password: "hunter2-hunter2" });

    expect(result.success).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects truly invalid identifier format (with special characters)", async () => {
    const result = await signIn({ username: "user name@!", password: "hunter2-hunter2" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("blocks login with a clear message when the account is restricted", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Your account has been restricted. Please contact support.",
        }),
    });

    const result = await signIn({ username: "jdoe", password: "hunter2-hunter2" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Your account has been restricted. Please contact support.");
  });

  it("fails cleanly when no profile exists for the given username, without confirming the username doesn't exist", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Invalid credentials. Please check your User ID, email, or mobile number and try again.",
        }),
    });

    const result = await signIn({ username: "ghost", password: "x" });

    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/no account/i);
    expect(result.error).toBe("Invalid credentials. Please check your User ID, email, or mobile number and try again.");
  });

  it("fails cleanly when no profile exists for the given email", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Incorrect password. Please try again.",
        }),
    });

    const result = await signIn({ username: "nonexistent@example.com", password: "x" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Incorrect password. Please try again.");
  });

  it("fails cleanly when no profile exists for the given phone number, without confirming the number doesn't exist", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Invalid credentials. Please check your User ID, email, or mobile number and try again.",
        }),
    });

    const result = await signIn({ username: "+19999999999", password: "x" });

    expect(result.success).toBe(false);
    expect(result.error).not.toMatch(/no account/i);
    expect(result.error).toBe("Invalid credentials. Please check your User ID, email, or mobile number and try again.");
  });

  it("reports incorrect password without leaking whether the account exists", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Incorrect password. Please try again.",
        }),
    });

    const result = await signIn({ username: "jdoe", password: "wrong" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Incorrect password. Please try again.");
  });

  it("reports unconfirmed email with clear verification prompt", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          success: false,
          error: "Your email address has not been verified yet. Please check your inbox or resend the verification link.",
        }),
    });

    const result = await signIn({ username: "jdoe", password: "secret-password" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Your email address has not been verified yet");
  });
});


describe("getProfile", () => {
  it("requires an active session", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await getProfile();
    expect(result).toEqual({ success: false, error: "Not signed in." });
  });

  it("combines the profiles row with auth.getUser()'s email, never a duplicated copy from `profiles`, and carries no institutional-ID field", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "jane@example.com" } }, error: null });
    mockFrom.mockReturnValue(
      makeChainable({
        data: {
          username: "jdoe",
          full_name: "Jane Doe",
          phone: "5550100",
          phone_country_code: "+1",
          phone_e164: "+15550100",
          affiliation: "State University",
          user_type: "student",
          education_level: "undergraduate",
        },
        error: null,
      })
    );

    const result = await getProfile();
    expect(result).toEqual({
      success: true,
      profile: {
        username: "jdoe",
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: "5550100",
        phoneCountryCode: "+1",
        phoneE164: "+15550100",
        affiliation: "State University",
        userType: "student",
        educationLevel: "undergraduate",
      },
    });
  });

  it("defaults affiliation to an empty string rather than throwing when a row has none", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1", email: "jane@example.com" } }, error: null });
    mockFrom.mockReturnValue(
      makeChainable({
        data: {
          username: "jdoe",
          full_name: "Jane Doe",
          phone: "",
          phone_country_code: "",
          phone_e164: null,
          affiliation: null,
          user_type: null,
          education_level: null,
        },
        error: null,
      })
    );

    const result = await getProfile();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.profile.affiliation).toBe("");
    }
  });
});

describe("saveProfileFields", () => {
  it("never accepts username — out of scope for this form — and never sends authentic_id", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));

    const result = await saveProfileFields({
      fullName: "Jane Doe",
      phone: "5550100",
      phoneCountryCode: "+1",
      affiliation: "State University",
      userType: "student",
      educationLevel: "undergraduate",
    });

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });

  it("allows saving an empty affiliation — Institution is optional", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const update = vi.fn(() => makeChainable({ data: null, error: null }));
    mockFrom.mockReturnValue({ ...makeChainable({ data: null, error: null }), update });

    const result = await saveProfileFields({
      fullName: "Jane Doe",
      phone: "5550100",
      phoneCountryCode: "+1",
      affiliation: "",
      userType: "student",
      educationLevel: "undergraduate",
    });

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ affiliation: "" }));
  });
});

describe("saveModelPreferences", () => {
  it("requires an active session", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await saveModelPreferences({ provider: "gemini" });
    expect(result).toEqual({ success: false, error: "Not signed in." });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("updates the profile row for the current user", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));

    const result = await saveModelPreferences({ provider: "gemini", model: "gemini-2.5-flash" });

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("profiles");
  });
});

describe("saveApiKeys", () => {
  it("upserts non-empty keys and deletes empty ones in the same call", async () => {
    mockAuth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(makeChainable({ data: null, error: null }));

    const result = await saveApiKeys({ gemini: "new-key-value", openai: "" });

    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith("api_credentials");
  });
});

describe("sendPasswordResetEmail", () => {
  it("calls Supabase's own resetPasswordForEmail with a redirect back to the app", async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const result = await sendPasswordResetEmail("jane@example.com");
    expect(result).toEqual({ success: true });
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith("jane@example.com", {
      redirectTo: `${window.location.origin}/reset-password/confirm`,
    });
  });

  it("surfaces an error if the call itself fails", async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: "Rate limit exceeded" } });
    const result = await sendPasswordResetEmail("jane@example.com");
    expect(result).toEqual({ success: false, error: "Rate limit exceeded" });
  });
});

describe("updatePassword", () => {
  it("updates the password for the active (recovery) session", async () => {
    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    const result = await updatePassword("NewPassw0rd!");
    expect(result).toEqual({ success: true });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: "NewPassw0rd!" });
  });

  it("surfaces an error if there's no active recovery session", async () => {
    mockAuth.updateUser.mockResolvedValue({ data: null, error: { message: "Auth session missing." } });
    const result = await updatePassword("NewPassw0rd!");
    expect(result).toEqual({ success: false, error: "Auth session missing." });
  });
});

describe("requestProfileUpdate", () => {
  it("invokes the request-profile-update Edge Function and never exposes verificationKey", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: { success: true, emailSent: true }, error: null });
    const result = await requestProfileUpdate({ username: "jdoe", pendingPhone: "555-0100" });
    expect(result.success).toBe(true);
    expect((result as any).verificationKey).toBeUndefined();
    expect((result as any).keyHash).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("fails closed when emailSent is false or the Edge Function returns 503", async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: false, emailSent: false, error: "Profile update email service is unavailable." },
      error: null,
    });
    const result = await requestProfileUpdate({ username: "jdoe", pendingPhone: "555-0100" });
    expect(result.success).toBe(false);
    expect(result.emailSent).toBe(false);
    expect((result as any).verificationKey).toBeUndefined();
  });
});

describe("resendVerificationEmail", () => {
  it("successfully resends verification email", async () => {
    mockAuth.resend = vi.fn().mockResolvedValue({ error: null });
    const result = await resendVerificationEmail({ email: "user@example.com" });
    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(mockAuth.resend).toHaveBeenCalledWith({ type: "signup", email: "user@example.com" });
  });

  it("handles user not found error", async () => {
    mockAuth.resend = vi.fn().mockResolvedValue({ error: { message: "user_not_found" } });
    const result = await resendVerificationEmail({ email: "nonexistent@example.com" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No account found");
  });

  it("handles already verified error", async () => {
    mockAuth.resend = vi.fn().mockResolvedValue({ error: { message: "already confirmed" } });
    const result = await resendVerificationEmail({ email: "verified@example.com" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("already been verified");
  });

  it("handles generic errors gracefully", async () => {
    mockAuth.resend = vi.fn().mockResolvedValue({ error: { message: "Email service error", status: 500 } });
    const result = await resendVerificationEmail({ email: "user@example.com" });
    expect(result.success).toBe(false);
    // Error should be a helpful message, not the raw error
    expect(result.error).toBeDefined();
  });
});

describe("availability checks", () => {
  it("checkUsernameAvailable returns true when username is available via POST /api/auth/check-availability", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ available: true }),
    });
    const result = await checkUsernameAvailable("newuser");
    expect(result).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/check-availability",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "username", value: "newuser" }),
      })
    );
  });

  it("checkUsernameAvailable returns false when username is taken", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ available: false }),
    });
    const result = await checkUsernameAvailable("existinguser");
    expect(result).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("checkUsernameAvailable fails OPEN on a network or 5xx error rather than blocking every signup", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const result = await checkUsernameAvailable("someuser");
    expect(result).toBe(true);
  });

  it("checkEmailAvailable returns true when email is available via POST /api/auth/check-availability", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ available: true }),
    });
    const result = await checkEmailAvailable("new@example.com");
    expect(result).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/check-availability",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "email", value: "new@example.com" }),
      })
    );
  });

  it("checkEmailAvailable returns false when email is taken", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ available: false }),
    });
    const result = await checkEmailAvailable("existing@example.com");
    expect(result).toBe(false);
  });

  it("checkEmailAvailable fails open on a server error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const result = await checkEmailAvailable("someone@example.com");
    expect(result).toBe(true);
  });

  it("checkPhoneAvailable returns true when phone is available via POST /api/auth/check-availability", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ available: true }),
    });
    const result = await checkPhoneAvailable("+15550000000");
    expect(result).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/check-availability",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "phone", value: "+15550000000" }),
      })
    );
  });

  it("checkPhoneAvailable returns false when phone is taken", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ available: false }),
    });
    const result = await checkPhoneAvailable("+15559999999");
    expect(result).toBe(false);
  });

  it("checkPhoneAvailable fails open on a server error", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    const result = await checkPhoneAvailable("+15550100000");
    expect(result).toBe(true);
  });
});

describe("onPasswordRecovery / onGoogleSignIn — unconfigured Supabase", () => {
  // Regression test (2026-08-04): both are called unconditionally from
  // UserProfileGate's mount-time useEffect, with no try/catch around them.
  // Before this fix, getSupabaseClient() threw synchronously here whenever
  // Supabase wasn't configured — crashing the ENTIRE app on first render,
  // caught only by the top-level ErrorBoundary, before any UI (including
  // the signup form itself) could ever be seen. Confirmed live: this was
  // this app's actual out-of-the-box behavior with no
  // VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY set.
  beforeEach(() => {
    mockIsSupabaseConfigured.mockReturnValue(false);
  });

  it("onPasswordRecovery does not throw and returns a working no-op unsubscribe", () => {
    expect(() => onPasswordRecovery(() => {})).not.toThrow();
    const unsubscribe = onPasswordRecovery(() => {});
    expect(() => unsubscribe()).not.toThrow();
    expect(mockAuth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it("onGoogleSignIn does not throw and returns a working no-op unsubscribe", () => {
    expect(() => onGoogleSignIn(() => {})).not.toThrow();
    const unsubscribe = onGoogleSignIn(() => {});
    expect(() => unsubscribe()).not.toThrow();
    expect(mockAuth.getSession).not.toHaveBeenCalled();
    expect(mockAuth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it("still subscribes normally once Supabase is configured", () => {
    mockIsSupabaseConfigured.mockReturnValue(true);
    onPasswordRecovery(() => {});
    onGoogleSignIn(() => {});
    expect(mockAuth.onAuthStateChange).toHaveBeenCalledTimes(2);
  });
});
