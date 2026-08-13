// @vitest-environment jsdom
//
// The gate that stops Desk rendering to an anonymous visitor, and the auth
// screens behind it.
//
// Desk shipped for a while with no gate at all — main.tsx mounted it outside
// any auth provider, against endpoints that required none. This is the client
// half of closing that. It is deliberately not the enforcing half: a
// client-side gate protects nothing on its own, which is why
// server/routes/__tests__/project.authz.test.ts exists and why the
// "unconfigured" case below still refuses to render children.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const useDeskSession = vi.fn();
vi.mock("../useDeskSession", () => ({ useDeskSession: () => useDeskSession() }));

const signIn = vi.fn();
const signUp = vi.fn();
const sendPasswordResetEmail = vi.fn();
const updatePassword = vi.fn();
const resendVerificationEmail = vi.fn();
const checkUsernameAvailable = vi.fn();
const checkEmailAvailable = vi.fn();
const checkPhoneAvailable = vi.fn();
/** Captures the callback so a test can fire a recovery link's arrival. */
let recoveryCallback: (() => void) | null = null;
const onPasswordRecovery = vi.fn((cb: () => void) => {
  recoveryCallback = cb;
  return () => {};
});

vi.mock("../../services/supabaseAuthService", () => ({
  signIn: (...a: unknown[]) => signIn(...a),
  signUp: (...a: unknown[]) => signUp(...a),
  sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a),
  updatePassword: (...a: unknown[]) => updatePassword(...a),
  onPasswordRecovery: (cb: () => void) => onPasswordRecovery(cb),
  resendVerificationEmail: (...a: unknown[]) => resendVerificationEmail(...a),
  checkUsernameAvailable: (...a: unknown[]) => checkUsernameAvailable(...a),
  checkEmailAvailable: (...a: unknown[]) => checkEmailAvailable(...a),
  checkPhoneAvailable: (...a: unknown[]) => checkPhoneAvailable(...a),
}));

const { default: DeskAuthGate } = await import("../DeskAuthGate");

const Protected = () => <p>Your work</p>;
const gate = () =>
  render(
    <DeskAuthGate>
      <Protected />
    </DeskAuthGate>
  );

beforeEach(() => {
  signIn.mockResolvedValue({ success: true });
  signUp.mockResolvedValue({ success: true });
  sendPasswordResetEmail.mockResolvedValue({ success: true });
  updatePassword.mockResolvedValue({ success: true });
  resendVerificationEmail.mockResolvedValue({ success: true, emailSent: true });
  // Every identifier is available by default so existing signup tests that
  // don't care about duplicate detection aren't blocked by it; individual
  // tests below override these to exercise the "taken" paths.
  checkUsernameAvailable.mockResolvedValue(true);
  checkEmailAvailable.mockResolvedValue(true);
  checkPhoneAvailable.mockResolvedValue(true);
  recoveryCallback = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeskAuthGate", () => {
  it("renders the app once a session exists", () => {
    useDeskSession.mockReturnValue({ status: "signed-in", userId: "u1", email: "a@example.com" });
    gate();
    expect(screen.getByText("Your work")).toBeInTheDocument();
  });

  it("shows sign-in, and no app content, when signed out", () => {
    useDeskSession.mockReturnValue({ status: "signed-out" });
    gate();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("goes straight to the set-new-password screen on a recovery session, without waiting on AuthFlow's own detection", () => {
    // useDeskSession's "recovery" status carries the AuthFlow needs directly
    // (see its doc comment): by the time AuthFlow could mount and check for
    // itself, Supabase has already consumed the one-time PASSWORD_RECOVERY
    // event, so recoveryCallback is deliberately left unfired here.
    useDeskSession.mockReturnValue({ status: "recovery" });
    gate();
    expect(screen.getByText(/Set a new password/i)).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("shows the verification success screen, not app content, on an email-verified session", () => {
    const acknowledge = vi.fn();
    useDeskSession.mockReturnValue({ status: "email-verified", userId: "u1", email: "a@example.com", acknowledge });
    gate();
    expect(screen.getByText(/Email verified/i)).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("calls acknowledge() when Continue is clicked, so the app can actually be reached", () => {
    // Regression test: acknowledge() must be wired all the way from
    // useDeskSession through DeskAuthGate and AuthFlow to the success
    // screen's button — a version of this that only changed AuthFlow's own
    // local screen state would pass every other assertion here while still
    // leaving the user permanently stuck, since useDeskSession's session
    // status is what actually decides whether app content renders.
    const acknowledge = vi.fn();
    useDeskSession.mockReturnValue({ status: "email-verified", userId: "u1", email: "a@example.com", acknowledge });
    gate();

    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(acknowledge).toHaveBeenCalled();
  });

  it("does not render app content while the session is still resolving", () => {
    useDeskSession.mockReturnValue({ status: "loading" });
    gate();
    // Rendering children optimistically here would flash the signed-in UI to
    // someone who turns out to be signed out.
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("refuses to render app content when Supabase is not configured", () => {
    useDeskSession.mockReturnValue({ status: "unconfigured" });
    gate();
    // Failing open here would serve the whole client to anyone whenever the
    // env vars were missing — a misconfiguration becoming an access-control
    // failure. It fails closed, and says why.
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
    expect(screen.getByText(/Sign-in is not configured/i)).toBeInTheDocument();
  });
});

describe("sign in", () => {
  beforeEach(() => useDeskSession.mockReturnValue({ status: "signed-out" }));

  function navigateToSignIn() {
    gate();
    // The landing page shows first; navigate to sign-in from there
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("labels its inputs, rather than relying on placeholders", () => {
    navigateToSignIn();
    // A placeholder is not a label: it vanishes on focus and is not reliably
    // announced.
    expect(screen.getByLabelText("User ID, email, or mobile number")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("keeps submit disabled until both fields are filled", () => {
    navigateToSignIn();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("surfaces a credentials failure as an announced error", async () => {
    signIn.mockResolvedValue({ success: false, error: "Incorrect password credentials." });
    navigateToSignIn();

    fireEvent.change(screen.getByLabelText("User ID, email, or mobile number"), { target: { value: "amara" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect password credentials.");
  });

  it("does not navigate on success — the session subscription does that", async () => {
    navigateToSignIn();
    fireEvent.change(screen.getByLabelText("User ID, email, or mobile number"), { target: { value: "amara" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(signIn).toHaveBeenCalled());
    // Still on sign-in: useDeskSession swaps the gate out when the session
    // appears. Routing here too would race that.
    //
    // findByRole (not getByRole): signIn having been called and the
    // component's busy-state finally{} block having re-rendered the button
    // back from "Signing in…" to "Sign in" are two separate microtask ticks —
    // asserting with a retrying query avoids racing that gap, which a
    // synchronous getByRole intermittently lost under a loaded CI runner.
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("registration", () => {
  beforeEach(() => useDeskSession.mockReturnValue({ status: "signed-out" }));

  function navigateToSignUp() {
    gate();
    // The landing page shows first; navigate to sign-up from there
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
  }

  function openSignUp() {
    navigateToSignUp();
  }

  /** Fills every required field except whatever the caller omits, so a test can isolate one gating condition at a time. Institution is intentionally not included — it's optional. */
  function fillSignUpForm({ skip = [] as string[] } = {}) {
    const textFields: Array<[string, string]> = [
      ["Full name", "Amara Okafor"],
      ["Username", "amara"],
      ["Email", "amara@example.com"],
      ["Phone", "9800000000"],
      ["Password", "longenough1"],
    ];
    for (const [label, value] of textFields) {
      if (skip.includes(label)) continue;
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    if (!skip.includes("User Type")) {
      fireEvent.change(screen.getByLabelText("User Type"), { target: { value: "student" } });
    }
    if (!skip.includes("Level of Education")) {
      fireEvent.change(screen.getByLabelText("Level of Education"), { target: { value: "undergraduate" } });
    }
  }

  it("collects every field an administrator reviews, and none of the removed institutional-ID fields", () => {
    openSignUp();
    for (const label of ["Full name", "Username", "Email", "Phone", "Institution", "User Type", "Level of Education", "Password"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("Institutional ID")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Institutional ID Document")).not.toBeInTheDocument();
    expect(screen.queryByText(/institutional id/i)).not.toBeInTheDocument();
  });

  it("keeps submit disabled until all required fields are valid", () => {
    openSignUp();
    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeDisabled();

    fillSignUpForm({ skip: ["Password"] });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
    expect(submit).toBeEnabled();
  });

  it("allows submission with Institution left blank — it is optional", () => {
    openSignUp();
    fillSignUpForm();
    expect(screen.getByLabelText("Institution")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("checks username availability on blur and blocks submission when it's taken", async () => {
    checkUsernameAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();

    fireEvent.blur(screen.getByLabelText("Username"));

    expect(await screen.findByText(/username is already taken/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    expect(checkUsernameAvailable).toHaveBeenCalledWith("amara");
  });

  it("checks email availability on blur and blocks submission when it's taken, suggesting sign-in", async () => {
    checkEmailAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();

    fireEvent.blur(screen.getByLabelText("Email"));

    expect(await screen.findByText(/email address is already registered/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in if this is your account/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
  });

  it("checks phone availability on blur and blocks submission when it's taken", async () => {
    checkPhoneAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();

    fireEvent.blur(screen.getByLabelText("Phone"));

    expect(await screen.findByText(/mobile number is already registered/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    expect(checkPhoneAvailable).toHaveBeenCalledWith("+9779800000000");
  });

  it("re-checks availability once more at submit time as a defense against a check that never ran", async () => {
    // No blur ever fires here — this simulates every field being filled by
    // browser autofill and the user going straight to Create account, which
    // the on-blur checks alone would never catch.
    checkEmailAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    // Renders twice by design — once as the field-level error under Email,
    // once as the form-level AuthError — hence findAllByText, not findByText.
    await waitFor(() => expect(screen.getAllByText(/email address is already registered/i).length).toBeGreaterThan(0));
    expect(signUp).not.toHaveBeenCalled();
  });

  it("clears a stale 'taken' verdict once the field is edited to a different value", async () => {
    checkUsernameAvailable.mockResolvedValue(false);
    openSignUp();
    fillSignUpForm();
    fireEvent.blur(screen.getByLabelText("Username"));
    expect(await screen.findByText(/username is already taken/i)).toBeInTheDocument();

    checkUsernameAvailable.mockResolvedValue(true);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "amara2" } });
    expect(screen.queryByText(/username is already taken/i)).not.toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("Username"));
    await waitFor(() => expect(checkUsernameAvailable).toHaveBeenLastCalledWith("amara2"));
    expect(screen.queryByText(/username is already taken/i)).not.toBeInTheDocument();
  });

  it("shows a confirmation that the account was created", async () => {
    openSignUp();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/Account created/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Check your inbox/i);
  });

  it("passes the structured phone and role fields through to signUp", async () => {
    openSignUp();
    fillSignUpForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "9800000000",
          phoneCountryCode: "+977",
          userType: "student",
          educationLevel: "undergraduate",
        })
      )
    );
  });

  it.each([
    "scholar@gmail.com",
    "scholar@yahoo.com",
    "scholar@outlook.com",
    "scholar@protonmail.com",
    "scholar@tribhuvan.edu.np",
    "scholar@my-research-lab.org",
  ])("accepts %s — no Gmail-only or provider-specific restriction", async (email) => {
    openSignUp();
    fillSignUpForm();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    await waitFor(() => expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email })));
  });
});

describe("password reset", () => {
  beforeEach(() => useDeskSession.mockReturnValue({ status: "signed-out" }));

  function navigateToForgotPassword() {
    gate();
    // Navigate through landing page to sign-in screen
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  }

  it("does not confirm whether an address has an account", async () => {
    navigateToForgotPassword();
    fireEvent.click(screen.getByRole("button", { name: "Forgot your password?" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    // Confirming existence would turn this form into an account-enumeration
    // oracle, so the wording is conditional either way.
    expect(await screen.findByRole("status")).toHaveTextContent(/If an account exists/i);
  });

  it("switches to the set-new-password screen when a recovery link is detected", async () => {
    navigateToForgotPassword();
    expect(onPasswordRecovery).toHaveBeenCalled();

    // The user arrived by clicking a link in their email, not by navigating
    // here — so this is reached by event, never by a button.
    recoveryCallback?.();

    expect(await screen.findByText(/Set a new password/i)).toBeInTheDocument();
  });

  it("blocks submission while the two passwords differ", async () => {
    navigateToForgotPassword();
    recoveryCallback?.();
    await screen.findByText(/Set a new password/i);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "longenough2" } });

    expect(screen.getByRole("button", { name: "Save new password" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i);

    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "longenough1" } });
    expect(screen.getByRole("button", { name: "Save new password" })).toBeEnabled();
  });

  it("saves the new password through the auth service", async () => {
    navigateToForgotPassword();
    recoveryCallback?.();
    await screen.findByText(/Set a new password/i);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith("longenough1"));
  });
});
