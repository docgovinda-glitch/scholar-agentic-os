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
};
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();

vi.mock("../supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: mockAuth,
    from: mockFrom,
    rpc: mockRpc,
    functions: { invoke: mockFunctionsInvoke },
  }),
}));

import {
  signUp,
  signIn,
  checkApproval,
  saveModelPreferences,
  saveApiKeys,
  sendPasswordResetEmail,
  updatePassword,
  requestProfileUpdate,
} from "../supabaseAuthService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signUp", () => {
  it("creates the auth user and notifies the admin via the send-approval-email function", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFunctionsInvoke.mockResolvedValue({ data: {}, error: null });

    const result = await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      affiliation: "State University",
      authenticId: "None",
      password: "hunter2-hunter2",
    });

    expect(result.success).toBe(true);
    expect(mockAuth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "jane@example.com", password: "hunter2-hunter2" })
    );
    expect(mockFunctionsInvoke).toHaveBeenCalledWith("send-approval-email", expect.objectContaining({ body: expect.objectContaining({ userId: "u1" }) }));
  });

  it("surfaces a Supabase Auth error without calling the notification function", async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: null }, error: { message: "User already registered" } });

    const result = await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      affiliation: "State University",
      authenticId: "None",
      password: "hunter2-hunter2",
    });

    expect(result).toEqual({ success: false, error: "User already registered" });
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it("reports success with an honest caveat when the Edge Function's own body says emailSent:false", async () => {
    // send-approval-email always returns HTTP 200 with {success:true, emailSent,
    // error} in its own body, regardless of whether Resend actually sent
    // anything — supabase.functions.invoke()'s `error` only reflects
    // transport-level failures, so signUp() must also check the body itself.
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: true, emailSent: false, error: "RESEND_API_KEY not configured on this Supabase project" },
      error: null,
    });

    const result = await signUp({
      username: "jdoe",
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "",
      affiliation: "State University",
      authenticId: "None",
      password: "hunter2-hunter2",
    });

    expect(result).toEqual({
      success: true,
      error: "Registered, but the admin notification email couldn't be sent: RESEND_API_KEY not configured on this Supabase project",
    });
  });
});

describe("signIn", () => {
  it("resolves username to email, signs in, and returns the profile when approved", async () => {
    mockRpc.mockResolvedValue({ data: "jane@example.com", error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(
      makeChainable({
        data: { full_name: "Jane Doe", phone: "", affiliation: "State University", authentic_id: "None", is_approved: true },
        error: null,
      })
    );

    const result = await signIn({ username: "jdoe", password: "hunter2-hunter2" });

    expect(result.success).toBe(true);
    expect(result.isApproved).toBe(true);
    expect(result.profile?.email).toBe("jane@example.com");
    expect(mockRpc).toHaveBeenCalledWith("email_for_username", { lookup_username: "jdoe" });
  });

  it("blocks login with a clear message when the admin hasn't approved yet", async () => {
    mockRpc.mockResolvedValue({ data: "jane@example.com", error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    mockFrom.mockReturnValue(
      makeChainable({
        data: { full_name: "Jane Doe", phone: "", affiliation: "State University", authentic_id: "None", is_approved: false },
        error: null,
      })
    );

    const result = await signIn({ username: "jdoe", password: "hunter2-hunter2" });

    expect(result.success).toBe(false);
    expect(result.isApproved).toBe(false);
    expect(result.error).toBe("Awaiting Admin Approval");
  });

  it("fails cleanly when no profile exists for the given username", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await signIn({ username: "ghost", password: "x" });

    expect(result.success).toBe(false);
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("reports incorrect password without leaking whether the account exists", async () => {
    mockRpc.mockResolvedValue({ data: "jane@example.com", error: null });
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });

    const result = await signIn({ username: "jdoe", password: "wrong" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Incorrect password credentials.");
  });
});

describe("checkApproval", () => {
  it("returns the approval flag from the is_username_approved RPC", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    const result = await checkApproval("jdoe");
    expect(result).toEqual({ isApproved: true });
    expect(mockRpc).toHaveBeenCalledWith("is_username_approved", { lookup_username: "jdoe" });
  });

  it("treats an RPC error as not-approved rather than throwing", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "network" } });
    const result = await checkApproval("jdoe");
    expect(result).toEqual({ isApproved: false });
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
    expect(result).toEqual({
      success: true,
      error: "Update request created, but the admin notification email couldn't be sent: Resend not configured.",
    });
  });
});
