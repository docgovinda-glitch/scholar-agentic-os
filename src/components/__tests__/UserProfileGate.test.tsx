// @vitest-environment jsdom
//
// Characterization tests for UserProfileGate.tsx.
//
// This file was originally written against the OLD server.ts /api/* path
// (see git history for that version) and confirmed passing there first, as
// a locked-in behavioral baseline. It has since been updated to mock
// supabaseAuthService.ts instead of fetch, following the cutover — most
// assertions are unchanged (same UI behavior, same onProfileActive calls),
// but these flows are NOT "the same test against a different backend":
//   - Email-OTP step: removed entirely (2026-07-30 auth production-
//     readiness pass). It never actually emailed a code — the "Credentials
//     for Resend not fully configured" message was a hardcoded, always-on
//     placeholder shown regardless of any real configuration (see git
//     history for the removed handleVerifyDualOtp/showDualVerifyScreen).
//     Submitting the signup form now calls signUp() directly and moves
//     straight to the pending-approval screen.
//   - Login: used to require a local-device profile cache to already exist
//     BEFORE calling signIn() at all, so an approved Supabase account could
//     never log in from a second browser/device. signIn() is now called
//     first, unconditionally; the local cache is read if present and
//     created fresh from signIn()'s returned profile otherwise. The old
//     network-failure fallback (comparing the entered password against a
//     locally-cached plaintext value under the misleadingly-named
//     `passcodeHash` field) was removed along with it — a signIn() network
//     error now surfaces a clear error message instead of silently trusting
//     that local cache.
//   - Activation: entirely restructured. There's no activation-key concept
//     under Supabase (approval is the admin flipping is_approved directly);
//     "activation" is now a "check approval status" login attempt.
//   - Forgot-password bypass-link display: removed. supabaseAuthService's
//     requestPasswordReset() only reports failure on a transport-level
//     error, never on the Edge Function's own emailSent:false — so the old
//     "show the admin bypass link when the email couldn't send" UI path is
//     no longer reachable at all via this service. Pre-existing gap in
//     supabaseAuthService.ts, not introduced by this component's rewire;
//     out of scope for this pass (password-reset logic is untouched).
//
// Also covers, as a CURRENT-behavior baseline:
//   - The countryCode dropdown bug: its value is currently ignored when
//     building the phone number passed to signUp() (fix pending).
//   - handleForgotPasswordSubmit currently does NOT surface result.error
//     when result.success is true — the same silent-email-failure gap as
//     signUp(), but not yet fixed here (fix pending).
//
// Google OAuth login was migrated (2026-07-30) from a client-side Google
// Identity Services implementation (VITE_GOOGLE_CLIENT_ID,
// window.google.accounts.oauth2.initTokenClient, a manual userinfo fetch)
// to Supabase Auth's own signInWithOAuth — see the "Google OAuth login"
// describe block below. The old client-side Google Client ID settings
// modal (and its dead, never-shown sibling modal) were removed entirely
// in the same pass, along with the manual access_token-in-URL-hash
// parsing this component used to do for the old Google callback.
//
// Deliberately NOT covering: Facebook login (dead/unreachable code, removed
// separately before this pass), password strength visuals.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import UserProfileGate from "../UserProfileGate";
import type { PaperProject } from "../../types";
import * as supabaseAuthService from "../../services/supabaseAuthService";

vi.mock("../../services/supabaseAuthService", () => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  updatePassword: vi.fn(),
  onPasswordRecovery: vi.fn(() => () => {}),
  signInWithGoogle: vi.fn(),
  onGoogleSignIn: vi.fn(() => () => {}),
  // Real implementation (not a vi.fn()) — a pure, deterministic helper with
  // no network/Supabase dependency, so there's nothing to mock; the
  // component under test calls it directly (see its own doc comment in
  // supabaseAuthService.ts for what it's guarding against).
  safeAuthErrorMessage: (error: { message?: string; status?: number } | null | undefined, fallback: string): string => {
    if (error?.message && error.message.trim() && error.message.trim() !== "{}") {
      return error.message;
    }
    return error?.status ? `${fallback} (server error ${error.status}).` : fallback;
  },
  clearPendingGoogleSignIn: vi.fn(),
}));

// Vitest's jsdom environment proxies window's own-enumerable properties onto
// `global`, but `localStorage` is a jsdom prototype-level accessor that isn't
// enumerated in that copy — so plain `window.localStorage` here resolves to
// the same gap (window === global in this environment). The real JSDOM
// instance is stashed at global.jsdom; pull localStorage from there instead,
// so both this file and UserProfileGate.tsx's bare `localStorage.*` calls
// resolve to a real, working Storage implementation.
Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

const PROFILES_LIST_KEY = "phd_profiles_meta";
const PROFILE_STATE_PREFIX = "phd_profile_state_";

function seedExistingProfile(username: string, overrides: Record<string, unknown> = {}) {
  localStorage.setItem(PROFILES_LIST_KEY, JSON.stringify({ profilesList: [username] }));
  localStorage.setItem(
    `${PROFILE_STATE_PREFIX}${username}`,
    JSON.stringify({
      username,
      passcodeHash: "CorrectPassw0rd!",
      projectState: { id: "proj_1", sections: {}, aiSettings: undefined },
      fullName: "Original Name",
      email: "original@example.com",
      status: "approved",
      ...overrides,
    })
  );
}

describe("UserProfileGate — characterization (new Supabase-backed path)", () => {
  let onProfileActive: ReturnType<typeof vi.fn<(username: string, projectState: PaperProject) => void>>;
  const signUpMock = supabaseAuthService.signUp as ReturnType<typeof vi.fn>;
  const signInMock = supabaseAuthService.signIn as ReturnType<typeof vi.fn>;
  const sendPasswordResetEmailMock = supabaseAuthService.sendPasswordResetEmail as ReturnType<typeof vi.fn>;
  const updatePasswordMock = supabaseAuthService.updatePassword as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    onProfileActive = vi.fn();
    signUpMock.mockReset();
    signInMock.mockReset();
    sendPasswordResetEmailMock.mockReset();
    updatePasswordMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  const fillSignupForm = async (opts?: { username?: string; password?: string }) => {
    fireEvent.change(screen.getByPlaceholderText("Choose a username..."), {
      target: { value: opts?.username ?? "newscholar" },
    });
    fireEvent.change(screen.getByPlaceholderText("Create secure password..."), {
      target: { value: opts?.password ?? "Str0ng!Pass" },
    });
    fireEvent.change(screen.getByPlaceholderText("Dr. John Doe"), { target: { value: "Dr. Jane Doe" } });
    fireEvent.change(screen.getByPlaceholderText("doe@uni.edu"), { target: { value: "jane@uni.edu" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 9851108291"), { target: { value: "9800000000" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Oxford University"), { target: { value: "Oxford" } });
  };

  describe("signup — step 1 validation", () => {
    it("rejects an empty username without calling signUp", async () => {
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm({ username: "  " });
      fireEvent.click(screen.getByText("Submit Account Request"));
      expect(await screen.findByText("Scholar username cannot be empty.")).toBeInTheDocument();
      expect(signUpMock).not.toHaveBeenCalled();
    });

    it("rejects a weak password without calling signUp", async () => {
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm({ password: "weak" });
      // The submit button is disabled below strength 4 — this validation
      // check is unreachable via the UI as a result (unchanged from before).
      expect(screen.getByText("Submit Account Request").closest("button")).toBeDisabled();
      expect(signUpMock).not.toHaveBeenCalled();
    });
  });

  describe("signup — direct registration (no email-OTP step)", () => {
    it("on submit, calls signUp directly and moves to the pending-approval screen", async () => {
      signUpMock.mockResolvedValue({ success: true });
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm();
      fireEvent.click(screen.getByText("Submit Account Request"));

      expect(await screen.findByText("Request Pending Admin Verification")).toBeInTheDocument();
      expect(signUpMock).toHaveBeenCalledWith(
        expect.objectContaining({ username: "newscholar", fullName: "Dr. Jane Doe", affiliation: "Oxford", password: "Str0ng!Pass" })
      );
    });

    it("regression: shows the honest email-failure caveat on the pending screen when signUp succeeds with a warning", async () => {
      // signUp() can return success:true with an error string when the
      // account was created but the admin-notification email couldn't be
      // sent (see supabaseAuthService.ts). This must actually render on the
      // pending screen, not just be stored in state.
      signUpMock.mockResolvedValue({
        success: true,
        error: "Registered, but the admin notification email couldn't be sent: RESEND_API_KEY not configured.",
      });
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm();
      fireEvent.click(screen.getByText("Submit Account Request"));

      expect(await screen.findByText("Request Pending Admin Verification")).toBeInTheDocument();
      expect(await screen.findByText(/admin notification email couldn't be sent/)).toBeInTheDocument();
    });

    it("on signUp failure, shows the error and stays on the signup screen", async () => {
      signUpMock.mockResolvedValue({ success: false, error: "Email address already registered." });
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm();
      fireEvent.click(screen.getByText("Submit Account Request"));

      expect(await screen.findByText("Email address already registered.")).toBeInTheDocument();
    });

    it("prepends the selected country code when building the phone number", async () => {
      signUpMock.mockResolvedValue({ success: true });
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm();
      // Change the country code away from its "+977" default before submitting.
      const countrySelect = document.querySelector("select") as HTMLSelectElement;
      fireEvent.change(countrySelect, { target: { value: "+91" } });
      fireEvent.click(screen.getByText("Submit Account Request"));

      await waitFor(() => expect(signUpMock).toHaveBeenCalled());
      expect(signUpMock).toHaveBeenCalledWith(expect.objectContaining({ phone: "919800000000" }));
    });
  });

  describe("pending-approval screen (replaces activation-key entry)", () => {
    async function getToPendingScreen(): Promise<void> {
      signUpMock.mockResolvedValue({ success: true });
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm();
      fireEvent.click(screen.getByText("Submit Account Request"));
      await screen.findByText("Request Pending Admin Verification");
    }

    it("shows a still-pending message when signIn reports not approved yet, without calling onProfileActive", async () => {
      await getToPendingScreen();
      signInMock.mockResolvedValue({ success: false, isApproved: false, error: "Awaiting Admin Approval" });

      fireEvent.click(screen.getByText("Check Approval Status"));

      expect(
        await screen.findByText(/Still awaiting Admin Approval/)
      ).toBeInTheDocument();
      expect(onProfileActive).not.toHaveBeenCalled();
    });

    it("calls onProfileActive once signIn reports approval", async () => {
      await getToPendingScreen();
      signInMock.mockResolvedValue({
        success: true,
        isApproved: true,
        profile: { fullName: "Dr. Jane Doe", email: "jane@uni.edu", phone: "9800000000", affiliation: "Oxford", authenticId: "None" },
      });

      fireEvent.click(screen.getByText("Check Approval Status"));

      await waitFor(() => expect(onProfileActive).toHaveBeenCalledWith("newscholar", expect.any(Object)));
      expect(signInMock).toHaveBeenCalledWith({ username: "newscholar", password: "Str0ng!Pass" });
    });
  });

  describe("login", () => {
    it("logs in successfully on a device with no local profile cache (cross-device fix), creating one from signIn's response", async () => {
      // A device with zero profiles defaults to the signup tab (and the tab
      // switcher itself only renders once profiles.length > 0) — seed an
      // unrelated profile so the login form is reachable at all. "newuser"
      // itself has no local cache — this is the new-device/cleared-storage
      // scenario the cross-device login fix (2026-07-30) targets: signIn()
      // must be tried regardless, not rejected before ever contacting Supabase.
      seedExistingProfile("someoneelse");
      signInMock.mockResolvedValue({
        success: true,
        isApproved: true,
        profile: { fullName: "New Device User", email: "newdevice@example.com", phone: "111", affiliation: "Some U", authenticId: "None" },
      });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.change(screen.getByPlaceholderText("Enter your username..."), { target: { value: "newuser" } });
      fireEvent.change(screen.getByPlaceholderText("Enter your password..."), { target: { value: "CorrectPassw0rd!" } });
      fireEvent.click(screen.getByText("Launch Scholar Workspace"));

      expect(signInMock).toHaveBeenCalledWith({ username: "newuser", password: "CorrectPassw0rd!" });
      await waitFor(() => expect(onProfileActive).toHaveBeenCalledWith("newuser", expect.any(Object)));
      const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}newuser`)!);
      expect(stored.fullName).toBe("New Device User");
    });

    it("logs in successfully when signIn confirms approval, syncing profile fields", async () => {
      seedExistingProfile("existinguser");
      signInMock.mockResolvedValue({
        success: true,
        isApproved: true,
        profile: { fullName: "Synced Name", email: "synced@example.com", phone: "111", affiliation: "Synced U", authenticId: "None" },
      });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.change(screen.getByPlaceholderText("Enter your username..."), { target: { value: "existinguser" } });
      fireEvent.change(screen.getByPlaceholderText("Enter your password..."), { target: { value: "CorrectPassw0rd!" } });
      fireEvent.click(screen.getByText("Launch Scholar Workspace"));

      await waitFor(() => expect(onProfileActive).toHaveBeenCalledWith("existinguser", expect.any(Object)));
      const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}existinguser`)!);
      expect(stored.fullName).toBe("Synced Name");
    });

    it("shows Awaiting Admin Approval when signIn says the account isn't approved", async () => {
      seedExistingProfile("pendinguser", { status: "pending" });
      signInMock.mockResolvedValue({ success: false, isApproved: false, error: "Awaiting Admin Approval" });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.change(screen.getByPlaceholderText("Enter your username..."), { target: { value: "pendinguser" } });
      fireEvent.change(screen.getByPlaceholderText("Enter your password..."), { target: { value: "CorrectPassw0rd!" } });
      fireEvent.click(screen.getByText("Launch Scholar Workspace"));

      expect(await screen.findByText(/Awaiting Admin Approval/)).toBeInTheDocument();
      expect(onProfileActive).not.toHaveBeenCalled();
    });

    it("shows signIn's error message on an incorrect password (now reached directly, not via local fallback)", async () => {
      // Unlike the old path (where a 400 status made res.ok false and the
      // code fell back to a LOCAL passcode comparison that happened to
      // produce the same-looking message), signIn() resolves normally with
      // success:false, so this now hits the direct "show the error" branch.
      seedExistingProfile("existinguser2");
      signInMock.mockResolvedValue({ success: false, error: "Incorrect password credentials." });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.change(screen.getByPlaceholderText("Enter your username..."), { target: { value: "existinguser2" } });
      fireEvent.change(screen.getByPlaceholderText("Enter your password..."), { target: { value: "WrongPassword!" } });
      fireEvent.click(screen.getByText("Launch Scholar Workspace"));

      expect(await screen.findByText("Incorrect password credentials.")).toBeInTheDocument();
      expect(onProfileActive).not.toHaveBeenCalled();
    });

    it("shows a clear network error when signIn throws, without calling onProfileActive (no insecure local fallback)", async () => {
      // The old behavior here fell back to comparing the entered password
      // against a locally-cached plaintext value — removed as part of the
      // cross-device login fix (2026-07-30), since signIn() is now always
      // the source of truth.
      seedExistingProfile("offlineuser");
      signInMock.mockRejectedValue(new Error("network down"));

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.change(screen.getByPlaceholderText("Enter your username..."), { target: { value: "offlineuser" } });
      fireEvent.change(screen.getByPlaceholderText("Enter your password..."), { target: { value: "CorrectPassw0rd!" } });
      fireEvent.click(screen.getByText("Launch Scholar Workspace"));

      expect(await screen.findByText("network down")).toBeInTheDocument();
      expect(onProfileActive).not.toHaveBeenCalled();
    });
  });

  describe("forgot password (Supabase's own resetPasswordForEmail — replaces the old admin-approval flow)", () => {
    it("sends a reset email and shows a generic success message (email-only, no username/new-password fields anymore)", async () => {
      seedExistingProfile("someoneelse");
      sendPasswordResetEmailMock.mockResolvedValue({ success: true });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.click(screen.getByText("Forgot Password?"));
      expect(screen.queryByPlaceholderText("Enter username...")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Enter new password...")).not.toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText("Enter registered email..."), { target: { value: "reset@example.com" } });
      fireEvent.click(screen.getByText("Send Reset Link"));

      expect(await screen.findByText(/password reset link has been sent/)).toBeInTheDocument();
      expect(sendPasswordResetEmailMock).toHaveBeenCalledWith("reset@example.com");
    });

    it("shows an error when the request itself fails", async () => {
      seedExistingProfile("someoneelse2");
      sendPasswordResetEmailMock.mockResolvedValue({ success: false, error: "Rate limit exceeded" });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.click(screen.getByText("Forgot Password?"));
      fireEvent.change(screen.getByPlaceholderText("Enter registered email..."), { target: { value: "reset2@example.com" } });
      fireEvent.click(screen.getByText("Send Reset Link"));

      expect(await screen.findByText(/Failed to send reset email/)).toBeInTheDocument();
    });
  });

  describe("password recovery screen (shown after clicking the emailed reset link)", () => {
    afterEach(() => {
      window.location.hash = "";
    });

    it("does not show the recovery screen until onPasswordRecovery's callback fires", () => {
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      expect(screen.queryByText("Set New Password")).not.toBeInTheDocument();
    });

    it("does not fetch anything for a Supabase recovery hash (type=recovery) landing in the URL", () => {
      // This used to be a regression test against UserProfileGate.tsx's own
      // manual access_token-in-hash parsing (the old Google Identity
      // Services callback path), which grabbed any access_token
      // unconditionally and could clobber Supabase's own recovery-session
      // hash handling. That manual hash parsing has since been removed
      // entirely — Google sign-in now goes through Supabase's
      // signInWithOAuth/onGoogleSignIn instead, which never touches the URL
      // hash from this component's side at all. Kept as a basic sanity
      // check that a recovery-shaped hash still triggers no unexpected
      // fetch from this component.
      window.location.hash = "#access_token=fake-supabase-token&type=recovery&expires_in=3600";
      const fetchMock = vi.fn();
      (globalThis as any).fetch = fetchMock;

      render(<UserProfileGate onProfileActive={onProfileActive} />);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows the recovery screen and updates the password on submit", async () => {
      let recoveryCallback: (() => void) | null = null;
      (supabaseAuthService.onPasswordRecovery as ReturnType<typeof vi.fn>).mockImplementation((cb: () => void) => {
        recoveryCallback = cb;
        return () => {};
      });
      updatePasswordMock.mockResolvedValue({ success: true });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      recoveryCallback!();

      expect(await screen.findByText("Set New Password")).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText("Enter new password..."), { target: { value: "BrandNewPassw0rd!" } });
      fireEvent.click(screen.getByText("Update Password"));

      expect(await screen.findByText(/Password updated successfully/)).toBeInTheDocument();
      expect(updatePasswordMock).toHaveBeenCalledWith("BrandNewPassw0rd!");
    });

    it("shows an error when updating the password fails", async () => {
      let recoveryCallback: (() => void) | null = null;
      (supabaseAuthService.onPasswordRecovery as ReturnType<typeof vi.fn>).mockImplementation((cb: () => void) => {
        recoveryCallback = cb;
        return () => {};
      });
      updatePasswordMock.mockResolvedValue({ success: false, error: "Auth session missing." });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      recoveryCallback!();

      await screen.findByText("Set New Password");
      fireEvent.change(screen.getByPlaceholderText("Enter new password..."), { target: { value: "BrandNewPassw0rd!" } });
      fireEvent.click(screen.getByText("Update Password"));

      expect(await screen.findByText("Auth session missing.")).toBeInTheDocument();
    });
  });

  describe("Google OAuth login (migrated to Supabase Auth's signInWithOAuth — no client-side Google Identity Services anymore)", () => {
    const signInWithGoogleMock = supabaseAuthService.signInWithGoogle as ReturnType<typeof vi.fn>;

    it("calls Supabase's signInWithGoogle() when 'Sign in with Google' is clicked", async () => {
      seedExistingProfile("someoneelse");
      signInWithGoogleMock.mockResolvedValue({ error: null });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.click(screen.getByTitle("Sign in with Google"));

      await waitFor(() => expect(signInWithGoogleMock).toHaveBeenCalled());
    });

    it("shows a clear error when Supabase's signInWithOAuth call itself fails", async () => {
      seedExistingProfile("someoneelse");
      signInWithGoogleMock.mockResolvedValue({ error: { message: "OAuth provider not enabled." } });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.click(screen.getByTitle("Sign in with Google"));

      expect(await screen.findByText(/Google Sign-In failed: OAuth provider not enabled\./)).toBeInTheDocument();
    });

    it("calls onProfileActive once onGoogleSignIn's callback fires with a real session user (the post-redirect path)", async () => {
      let capturedCallback: ((user: { id: string; email: string; fullName: string }) => void) | null = null;
      (supabaseAuthService.onGoogleSignIn as ReturnType<typeof vi.fn>).mockImplementation((cb) => {
        capturedCallback = cb;
        return () => {};
      });

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      capturedCallback!({ id: "google-user-1", email: "jane.g@example.com", fullName: "Jane Googler" });

      await waitFor(() => expect(onProfileActive).toHaveBeenCalledWith("Jane Googler", expect.any(Object)));
    });
  });
});
