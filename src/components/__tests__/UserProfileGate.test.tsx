// @vitest-environment jsdom
//
// Characterization tests for UserProfileGate.tsx.
//
// This file was originally written against the OLD server.ts /api/* path
// (see git history for that version) and confirmed passing there first, as
// a locked-in behavioral baseline. It has since been updated to mock
// supabaseAuthService.ts instead of fetch, following the cutover — most
// assertions are unchanged (same UI behavior, same onProfileActive calls),
// but three flows are NOT "the same test against a different backend":
//   - OTP dispatch: collapsed from 2 tests to 1. There's no Supabase
//     equivalent of the old /api/register OTP-email call, so the two old
//     "server sent it" / "server couldn't, bypass shown" branches collapse
//     into a single always-bypass behavior (see UserProfileGate.tsx's
//     handleCreateProfile comment).
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
// Also covers, as a CURRENT-behavior baseline ahead of a follow-up pass
// (dead-code removal + two small fixes, see .claude/HANDOVER.md):
//   - Google OAuth login (kept and untouched by that pass).
//   - The countryCode dropdown bug: its value is currently ignored when
//     building the phone number passed to signUp() (fix pending).
//   - handleForgotPasswordSubmit currently does NOT surface result.error
//     when result.success is true — the same silent-email-failure gap as
//     signUp(), but not yet fixed here (fix pending).
//
// Deliberately NOT covering: Facebook login (dead/unreachable code, being
// removed in the same follow-up pass), the API-credentials settings modal,
// password strength visuals.

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

  describe("signup — OTP dispatch (step 1 -> dual-verify screen)", () => {
    it("always shows the OTP screen with the bypass code (no Supabase equivalent of the old email-dispatch call exists)", async () => {
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm();
      fireEvent.click(screen.getByText("Submit Account Request"));

      expect(await screen.findByText("Email OTP Scholar Verification")).toBeInTheDocument();
      expect(screen.getByText(/Sandbox Bypass Code/)).toHaveTextContent(/\d{6}/);
      expect(signUpMock).not.toHaveBeenCalled(); // signUp only happens after OTP verification
    });
  });

  describe("signup — OTP verification (step 2 -> registration submit -> pending screen)", () => {
    async function getToOtpScreenWithKnownCode(): Promise<string> {
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      await fillSignupForm();
      fireEvent.click(screen.getByText("Submit Account Request"));
      const bypassEl = await screen.findByText(/Sandbox Bypass Code/);
      const match = bypassEl.textContent!.match(/(\d{6})/);
      return match![1];
    }

    it("rejects an incorrect OTP", async () => {
      await getToOtpScreenWithKnownCode();
      fireEvent.change(screen.getByPlaceholderText("Enter email code..."), { target: { value: "000000" } });
      fireEvent.click(screen.getByText("Verify & Request Account"));
      expect(
        await screen.findByText("Invalid verification code. Please enter the correct Email OTP.")
      ).toBeInTheDocument();
    });

    it("on correct OTP, calls signUp and moves to the pending-approval screen", async () => {
      const code = await getToOtpScreenWithKnownCode();
      signUpMock.mockResolvedValue({ success: true });

      fireEvent.change(screen.getByPlaceholderText("Enter email code..."), { target: { value: code } });
      fireEvent.click(screen.getByText("Verify & Request Account"));

      expect(await screen.findByText("Request Pending Admin Verification")).toBeInTheDocument();
      expect(signUpMock).toHaveBeenCalledWith(
        expect.objectContaining({ username: "newscholar", fullName: "Dr. Jane Doe", affiliation: "Oxford", password: "Str0ng!Pass" })
      );
    });

    it("on signUp failure, shows the error and stays on the OTP screen", async () => {
      const code = await getToOtpScreenWithKnownCode();
      signUpMock.mockResolvedValue({ success: false, error: "Email address already registered." });

      fireEvent.change(screen.getByPlaceholderText("Enter email code..."), { target: { value: code } });
      fireEvent.click(screen.getByText("Verify & Request Account"));

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

      const bypassEl = await screen.findByText(/Sandbox Bypass Code/);
      const code = bypassEl.textContent!.match(/(\d{6})/)![1];
      fireEvent.change(screen.getByPlaceholderText("Enter email code..."), { target: { value: code } });
      fireEvent.click(screen.getByText("Verify & Request Account"));

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
      const bypassEl = await screen.findByText(/Sandbox Bypass Code/);
      const code = bypassEl.textContent!.match(/(\d{6})/)![1];
      fireEvent.change(screen.getByPlaceholderText("Enter email code..."), { target: { value: code } });
      fireEvent.click(screen.getByText("Verify & Request Account"));
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
    it("rejects a username with no local profile on this device", async () => {
      // A device with zero profiles defaults to the signup tab (and the tab
      // switcher itself only renders once profiles.length > 0) — seed an
      // unrelated profile so the login form is reachable at all.
      seedExistingProfile("someoneelse");
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.change(screen.getByPlaceholderText("Enter your username..."), { target: { value: "ghost" } });
      fireEvent.change(screen.getByPlaceholderText("Enter your password..."), { target: { value: "whatever" } });
      fireEvent.click(screen.getByText("Launch Scholar Workspace"));
      expect(
        await screen.findByText(/Scholar identity not found on this device/)
      ).toBeInTheDocument();
      expect(signInMock).not.toHaveBeenCalled();
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

    it("falls back to the local passcode check when signIn throws (network failure)", async () => {
      seedExistingProfile("offlineuser");
      signInMock.mockRejectedValue(new Error("network down"));

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.change(screen.getByPlaceholderText("Enter your username..."), { target: { value: "offlineuser" } });
      fireEvent.change(screen.getByPlaceholderText("Enter your password..."), { target: { value: "CorrectPassw0rd!" } });
      fireEvent.click(screen.getByText("Launch Scholar Workspace"));

      await waitFor(() => expect(onProfileActive).toHaveBeenCalledWith("offlineuser", expect.any(Object)));
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

    it("does NOT treat a Supabase recovery hash (type=recovery) as a Google OAuth callback", () => {
      // Regression test: Supabase's password-recovery redirect also lands
      // with access_token in the URL hash, same as Google's OAuth implicit
      // flow. The pre-existing Google-callback handler used to grab any
      // access_token unconditionally and strip the hash via
      // history.replaceState before Supabase's own client library could
      // read it — silently breaking password recovery. type=recovery is
      // what disambiguates the two.
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

  describe("Google OAuth login (kept, untouched by the follow-up dead-code-removal pass)", () => {
    afterEach(() => {
      delete (window as any).google;
    });

    it("shows a clear error when no Google Client ID is configured", async () => {
      seedExistingProfile("someoneelse");
      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.click(screen.getByTitle("Sign in with Google"));
      expect(
        await screen.findByText(/Google Client ID is not configured/)
      ).toBeInTheDocument();
    });

    it("completes a full Google sign-in and calls onProfileActive", async () => {
      seedExistingProfile("someoneelse");
      localStorage.setItem("phd_google_client_id", "test-client-id.apps.googleusercontent.com");
      (globalThis as any).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ name: "Jane Googler", email: "jane.g@example.com" }),
      });

      let capturedCallback: ((tokenResponse: any) => void) | null = null;
      (window as any).google = {
        accounts: {
          oauth2: {
            initTokenClient: (opts: any) => {
              capturedCallback = opts.callback;
              return { requestAccessToken: () => capturedCallback!({ access_token: "fake-token" }) };
            },
          },
        },
      };

      render(<UserProfileGate onProfileActive={onProfileActive} />);
      fireEvent.click(screen.getByTitle("Sign in with Google"));

      await waitFor(() => expect(onProfileActive).toHaveBeenCalledWith("Jane Googler", expect.any(Object)));
    });
  });
});
