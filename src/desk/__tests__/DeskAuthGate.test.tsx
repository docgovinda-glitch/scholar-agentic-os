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

  it("labels its inputs, rather than relying on placeholders", () => {
    gate();
    // A placeholder is not a label: it vanishes on focus and is not reliably
    // announced.
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("keeps submit disabled until both fields are filled", () => {
    gate();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("surfaces a credentials failure as an announced error", async () => {
    signIn.mockResolvedValue({ success: false, error: "Incorrect password credentials." });
    gate();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "amara" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect password credentials.");
  });

  it("does not navigate on success — the session subscription does that", async () => {
    gate();
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "amara" } });
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

  function openSignUp() {
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
  }

  it("collects every field an administrator reviews", () => {
    openSignUp();
    for (const label of ["Full name", "Username", "Email", "Phone", "Institution", "Institutional ID", "Password"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("keeps submit disabled until all fields are valid", () => {
    openSignUp();
    const submit = screen.getByRole("button", { name: "Create account" });
    expect(submit).toBeDisabled();

    for (const [label, value] of [
      ["Full name", "Amara Okafor"],
      ["Username", "amara"],
      ["Email", "amara@example.com"],
      ["Phone", "+1000000"],
      ["Institution", "Test University"],
      ["Institutional ID", "S123"],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    // Six of seven filled, and a password below the minimum.
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough1" } });
    expect(submit).toBeEnabled();
  });

  it("shows a confirmation that the account was created", async () => {
    openSignUp();
    for (const [label, value] of [
      ["Full name", "Amara Okafor"],
      ["Username", "amara"],
      ["Email", "amara@example.com"],
      ["Phone", "+1000000"],
      ["Institution", "Test University"],
      ["Institutional ID", "S123"],
      ["Password", "longenough1"],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/Account created/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/check your email/i);
  });
});

describe("password reset", () => {
  beforeEach(() => useDeskSession.mockReturnValue({ status: "signed-out" }));

  it("does not confirm whether an address has an account", async () => {
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Forgot your password?" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    // Confirming existence would turn this form into an account-enumeration
    // oracle, so the wording is conditional either way.
    expect(await screen.findByRole("status")).toHaveTextContent(/If an account exists/i);
  });

  it("switches to the set-new-password screen when a recovery link is detected", async () => {
    gate();
    expect(onPasswordRecovery).toHaveBeenCalled();

    // The user arrived by clicking a link in their email, not by navigating
    // here — so this is reached by event, never by a button.
    recoveryCallback?.();

    expect(await screen.findByText(/Set a new password/i)).toBeInTheDocument();
  });

  it("blocks submission while the two passwords differ", async () => {
    gate();
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
    gate();
    recoveryCallback?.();
    await screen.findByText(/Set a new password/i);

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith("longenough1"));
  });
});
