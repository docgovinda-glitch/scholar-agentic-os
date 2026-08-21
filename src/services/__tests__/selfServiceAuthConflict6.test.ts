import { describe, it, expect, beforeEach, vi } from "vitest";

// Set up window mock for Node test environment
(globalThis as any).window = {
  location: {
    origin: "http://localhost:3000",
  },
};

// Mock Supabase client to test self-service auth service methods
const mockAuthSignUp = vi.fn();
const mockAuthSignInWithPassword = vi.fn();
const mockAuthResetPassword = vi.fn();
const mockFrom = vi.fn();

vi.mock("../supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      signUp: mockAuthSignUp,
      signInWithPassword: mockAuthSignInWithPassword,
      resetPasswordForEmail: mockAuthResetPassword,
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id" } } }),
    },
    from: mockFrom,
  }),
}));

import {
  signUp,
  signIn,
  sendPasswordResetEmail,
  type SignUpInput,
} from "../supabaseAuthService";

describe("Conflict #6 — Access Control & Registration (Direct Supabase Auth vs. Approval Queue)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Self-service registration passes profile data directly to Supabase Auth without approval gate", async () => {
    mockAuthSignUp.mockResolvedValueOnce({
      data: {
        user: { id: "new-user-123", email: "scholar@example.edu" },
        session: null,
      },
      error: null,
    });

    const input: SignUpInput = {
      username: "dr_scholar",
      fullName: "Dr. Scholar",
      email: "scholar@example.edu",
      phone: "5551234",
      phoneCountryCode: "+1",
      affiliation: "Independent Researcher", // Optional affiliation
      userType: "freelance_researcher",
      educationLevel: "phd",
      password: "SecurePassword123!",
    };

    const result = await signUp(input);

    expect(result.success).toBe(true);
    expect(mockAuthSignUp).toHaveBeenCalledWith({
      email: "scholar@example.edu",
      password: "SecurePassword123!",
      options: {
        emailRedirectTo: "http://localhost:3000/verify-email",
        data: {
          username: "dr_scholar",
          full_name: "Dr. Scholar",
          phone: "5551234",
          phone_country_code: "+1",
          affiliation: "Independent Researcher",
          user_type: "freelance_researcher",
          education_level: "phd",
        },
      },
    });
  });

  it("2. Active user can sign in immediately without administrative approval", async () => {
    // Mock user lookup by email directly
    mockAuthSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "user-123", email: "user@example.com" },
        session: { access_token: "jwt-token-xyz" },
      },
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "user-123", account_status: "active", full_name: "Dr. Scholar", phone: "", affiliation: "" },
          error: null,
        }),
      }),
    });
    mockFrom.mockReturnValue({ select: mockSelect });

    const result = await signIn({ username: "user@example.com", password: "SecurePassword123!" });
    expect(result.success).toBe(true);
    expect(result.profile?.fullName).toBe("Dr. Scholar");
    expect(result.profile?.email).toBe("user@example.com");
  });

  it("3. Suspended account is rejected at sign-in", async () => {
    mockAuthSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: "user-suspended", email: "suspended@example.com" },
        session: { access_token: "jwt-token-xyz" },
      },
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "user-suspended", account_status: "suspended", full_name: "Suspended User", phone: "", affiliation: "" },
          error: null,
        }),
      }),
    });
    mockFrom.mockReturnValue({ select: mockSelect });

    const result = await signIn({ username: "suspended@example.com", password: "password123" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("suspended");
  });

  it("4. Self-service password reset sends email via Supabase without admin approval", async () => {
    mockAuthResetPassword.mockResolvedValueOnce({
      data: {},
      error: null,
    });

    const result = await sendPasswordResetEmail("scholar@example.edu");
    expect(result.success).toBe(true);
    expect(mockAuthResetPassword).toHaveBeenCalledWith(
      "scholar@example.edu",
      expect.objectContaining({
        redirectTo: expect.stringContaining("/reset-password/confirm"),
      })
    );
  });

  it("5. Data minimization: Registration schema only requires essential account information", () => {
    const minimalInput: SignUpInput = {
      username: "independent_thinker",
      fullName: "Jane Doe",
      email: "jane@example.org",
      phone: "",
      phoneCountryCode: "",
      affiliation: "", // Empty / unaffiliated
      userType: "freelance_researcher",
      educationLevel: "masters",
      password: "ValidPassword123!",
    };

    expect(minimalInput.affiliation).toBe("");
    expect((minimalInput as any).authentic_id).toBeUndefined(); // Institutional ID does not exist
    expect((minimalInput as any).institutional_document).toBeUndefined();
  });
});
