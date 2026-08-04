// @vitest-environment jsdom
//
// The gate that stops Desk rendering to an anonymous visitor.
//
// Desk shipped for a while with no gate at all — main.tsx mounted it outside
// any auth provider, against endpoints that required no token. This is the
// client half of closing that. It is deliberately not the enforcing half:
// a client-side gate protects nothing on its own, which is why
// server/routes/__tests__/project.authz.test.ts exists and why the
// "unconfigured" case below still refuses to render children.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const useDeskSession = vi.fn();
vi.mock("../useDeskSession", () => ({ useDeskSession: () => useDeskSession() }));
vi.mock("../../services/supabaseAuthService", () => ({ signIn: vi.fn() }));

const { default: DeskAuthGate } = await import("../DeskAuthGate");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const Protected = () => <p>Your work</p>;

describe("DeskAuthGate", () => {
  it("renders the app once a session exists", () => {
    useDeskSession.mockReturnValue({ status: "signed-in", userId: "u1", email: "a@example.com" });

    render(
      <DeskAuthGate>
        <Protected />
      </DeskAuthGate>
    );

    expect(screen.getByText("Your work")).toBeInTheDocument();
  });

  it("shows sign-in, and no app content, when signed out", () => {
    useDeskSession.mockReturnValue({ status: "signed-out" });

    render(
      <DeskAuthGate>
        <Protected />
      </DeskAuthGate>
    );

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("does not render app content while the session is still resolving", () => {
    useDeskSession.mockReturnValue({ status: "loading" });

    render(
      <DeskAuthGate>
        <Protected />
      </DeskAuthGate>
    );

    // Rendering children optimistically here would flash the signed-in UI to
    // someone who turns out to be signed out.
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
  });

  it("refuses to render app content when Supabase is not configured", () => {
    useDeskSession.mockReturnValue({ status: "unconfigured" });

    render(
      <DeskAuthGate>
        <Protected />
      </DeskAuthGate>
    );

    // Failing open here would serve the whole client to anyone whenever the
    // env vars were missing — a misconfiguration becoming an access-control
    // failure. It fails closed, and says why.
    expect(screen.queryByText("Your work")).not.toBeInTheDocument();
    expect(screen.getByText(/Sign-in is not configured/i)).toBeInTheDocument();
  });

  it("labels its inputs, rather than relying on placeholders", () => {
    useDeskSession.mockReturnValue({ status: "signed-out" });

    render(
      <DeskAuthGate>
        <Protected />
      </DeskAuthGate>
    );

    // A placeholder is not a label: it vanishes on focus and is not reliably
    // announced.
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("keeps the submit button disabled until both fields are filled", () => {
    useDeskSession.mockReturnValue({ status: "signed-out" });

    render(
      <DeskAuthGate>
        <Protected />
      </DeskAuthGate>
    );

    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});
