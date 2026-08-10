// @vitest-environment jsdom
//
// Regression coverage for the recovery-link race: a password-recovery link
// makes Supabase establish a real client-side session (that's how
// AuthFlow's RecoverScreen can call updateUser()), and this hook used to
// treat any session with a user on it as a sign-in — swapping DeskAuthGate
// straight to the authenticated app before the visitor ever saw the
// set-new-password screen. DeskAuthGate.test.tsx mocks this hook entirely,
// so it never exercised the real interaction between useDeskSession and
// Supabase's PASSWORD_RECOVERY event; this file is what actually covers it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

type AuthChangeHandler = (event: string, session: unknown) => void;

let authChangeHandler: AuthChangeHandler | null = null;
const mockUnsubscribe = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn((handler: AuthChangeHandler) => {
  authChangeHandler = handler;
  return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
});

vi.mock("../../services/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  }),
  isSupabaseConfigured: () => true,
}));

const { useDeskSession } = await import("../useDeskSession");

const USER = { id: "u1", email: "amara@example.com" };
const ORIGINAL_HREF = window.location.href;

beforeEach(() => {
  vi.clearAllMocks();
  authChangeHandler = null;
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

afterEach(() => {
  window.history.replaceState(null, "", ORIGINAL_HREF);
});

describe("useDeskSession — password recovery", () => {
  it("stays signed-out when the URL carries a recovery marker, even though a session exists", async () => {
    window.history.replaceState(null, "", "/#access_token=t&type=recovery");
    mockGetSession.mockResolvedValue({ data: { session: { user: USER } } });

    const { result } = renderHook(() => useDeskSession());

    await waitFor(() => expect(result.current.status).toBe("signed-out"));
  });

  it("stays signed-out when the PASSWORD_RECOVERY event arrives after getSession() already resolved signed-in", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: USER } } });

    const { result } = renderHook(() => useDeskSession());
    await waitFor(() => expect(result.current.status).toBe("signed-in"));

    authChangeHandler?.("PASSWORD_RECOVERY", { user: USER });
    await waitFor(() => expect(result.current.status).toBe("signed-out"));
  });

  it("becomes signed-in once USER_UPDATED confirms the new password was saved", async () => {
    window.history.replaceState(null, "", "/#access_token=t&type=recovery");
    mockGetSession.mockResolvedValue({ data: { session: { user: USER } } });

    const { result } = renderHook(() => useDeskSession());
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    authChangeHandler?.("USER_UPDATED", { user: USER });
    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    expect(result.current).toMatchObject({ status: "signed-in", userId: "u1", email: "amara@example.com" });
  });

  it("still reports an ordinary sign-in as signed-in", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useDeskSession());
    await waitFor(() => expect(result.current.status).toBe("signed-out"));

    authChangeHandler?.("SIGNED_IN", { user: USER });
    await waitFor(() => expect(result.current.status).toBe("signed-in"));
  });
});
