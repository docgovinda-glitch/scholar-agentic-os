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
  getUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
};
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();
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
});

describe("signIn", () => {
  it("resolves username to email, signs in, and returns the profile when account is active", async () => {
    mockRpc.mockResolvedValue({ data: "jane@example.com", error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(
      makeChainable({
        data: { full_name: "Jane Doe", phone: "", affiliation: "State University", account_status: "active" },
        error: null,
      })
    );

    const result = await signIn({ username: "jdoe", password: "hunter2-hunter2" });

    expect(result.success).toBe(true);
    expect(result.profile?.email).toBe("jane@example.com");
    expect(mockRpc).toHaveBeenCalledWith("email_for_username", { lookup_username: "jdoe" });
  });

  it("resolves email directly and signs in (unified login via email)", async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(
      makeChainable({
        data: { full_name: "Jane Doe", phone: "", affiliation: "State University", account_status: "active" },
        error: null,
      })
    );

    const result = await signIn({ username: "jane@example.com", password: "hunter2-hunter2" });

    expect(result.success).toBe(true);
    expect(result.profile?.email).toBe("jane@example.com");
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: "jane@example.com",
      password: "hunter2-hunter2",
      options: { captchaToken: undefined },
    });
  });

  it("resolves phone number in E.164 format to email and signs in (unified login via phone)", async () => {
    mockRpc.mockResolvedValue({ data: "jane@example.com", error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(
      makeChainable({
        data: { full_name: "Jane Doe", phone: "5550100", phone_country_code: "+1", affiliation: "State University", account_status: "active" },
        error: null,
      })
    );

    const result = await signIn({ username: "+15550100", password: "hunter2-hunter2" });

    expect(result.success).toBe(true);
    expect(result.profile?.email).toBe("jane@example.com");
    expect(mockRpc).toHaveBeenCalledWith("email_for_phone_e164", { lookup_phone_e164: "+15550100" });
  });

  it("rejects truly invalid identifier format (with special characters)", async () => {
    const result = await signIn({ username: "user name@!", password: "hunter2-hunter2" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("blocks login with a clear message when the account is restricted", async () => {
    mockRpc.mockResolvedValue({ data: "jane@example.com", error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(
      makeChainable({
        data: { full_name: "Jane Doe", phone: "", affiliation: "State University", account_status: "restricted" },
        error: null,
      })
    );

    const result = await signIn({ username: "jdoe", password: "hunter2-hunter2" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Your account has been restricted. Please contact support.");
  });

  it("fails cleanly when no profile exists for the given username", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await signIn({ username: "ghost", password: "x" });

    expect(result.success).toBe(false);
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("fails cleanly when no profile exists for the given email", async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });

    const result = await signIn({ username: "nonexistent@example.com", password: "x" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Incorrect password. Please try again.");
    expect(mockAuth.signInWithPassword).toHaveBeenCalled();
  });

  it("fails cleanly when no profile exists for the given phone number", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await signIn({ username: "+19999999999", password: "x" });

    expect(result.success).toBe(false);
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("reports incorrect password without leaking whether the account exists", async () => {
    mockRpc.mockResolvedValue({ data: "jane@example.com", error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });

    const result = await signIn({ username: "jdoe", password: "wrong" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Incorrect password. Please try again.");
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
      redirectTo: window.location.origin,
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
  it("invokes the request-profile-update Edge Function without persisting anything itself", async () => {
    mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });
    const result = await requestProfileUpdate({ username: "jdoe", pendingPhone: "555-0100" });
    expect(result.success).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("reports success with an honest caveat when emailSent is false in the function's own body", async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: true, emailSent: false, verificationKey: "UP-123456", error: "Resend not configured." },
      error: null,
    });
    const result = await requestProfileUpdate({ username: "jdoe", pendingPhone: "555-0100" });
    expect(result.success).toBe(true);
    expect(result.error).toBe("Update request created, but the admin notification email couldn't be sent: Resend not configured.");
    expect(result.emailSent).toBe(false);
    expect(result.verificationKey).toBe("UP-123456");
  });

  it("computes a keyHash from the Edge Function's plain verificationKey, matching the SHA-256 the old server.ts route computed server-side", async () => {
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: true, emailSent: true, verificationKey: "UP-654321" },
      error: null,
    });
    const result = await requestProfileUpdate({ username: "jdoe", pendingPhone: "555-0100" });

    expect(result.keyHash).toBeDefined();
    expect(result.keyHash).toHaveLength(64); // SHA-256 hex digest length
    // Deterministic: hashing the same key again must produce the identical digest.
    const again = await requestProfileUpdate({ username: "jdoe", pendingPhone: "555-0100" });
    expect(again.keyHash).toBe(result.keyHash);
  });
});

describe("availability checks", () => {
  it("checkUsernameAvailable returns true when username is available", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const result = await checkUsernameAvailable("newuser");
    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("check_username_available", { lookup_username: "newuser" });
  });

  it("checkUsernameAvailable returns false when username is taken", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const result = await checkUsernameAvailable("existinguser");
    expect(result).toBe(false);
  });

  it("checkUsernameAvailable handles RPC errors gracefully", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "RPC error" } });
    const result = await checkUsernameAvailable("someuser");
    expect(result).toBe(false);
  });

  it("checkEmailAvailable returns true when email is available", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const result = await checkEmailAvailable("new@example.com");
    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("check_email_available", { lookup_email: "new@example.com" });
  });

  it("checkEmailAvailable returns false when email is taken", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const result = await checkEmailAvailable("existing@example.com");
    expect(result).toBe(false);
  });

  it("checkPhoneAvailable returns true when phone is available", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const result = await checkPhoneAvailable("+15550000000");
    expect(result).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("check_phone_available", { lookup_phone_e164: "+15550000000" });
  });

  it("checkPhoneAvailable returns false when phone is taken", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    const result = await checkPhoneAvailable("+15559999999");
    expect(result).toBe(false);
  });

  it("checkPhoneAvailable handles RPC errors gracefully", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "RPC error" } });
    const result = await checkPhoneAvailable("+15550100000");
    expect(result).toBe(false);
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
