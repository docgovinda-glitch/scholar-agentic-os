// @vitest-environment jsdom
//
// AdminApp is the isolation boundary itself: the one thing standing between
// an arbitrary visitor at /admin and the Admin AI Infrastructure panel.
// These tests cover its own routing/gating logic — no session -> login form,
// signed in but not an admin -> a generic not-found (never anything that
// confirms an admin system exists), signed in and an admin -> the panel.
// AdminPanel's own internals aren't exercised here (no dedicated tests exist
// for it yet, matching this codebase's existing minimal-coverage precedent
// for that component) — it's mocked to a shallow stub so this file stays
// about AdminApp's own decisions.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import AdminApp from "../AdminApp";

let sessionState: { session: { access_token: string } | null } = { session: null };
const signOutMock = vi.fn(async () => {
  sessionState = { session: null };
});

vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: sessionState }),
      signOut: signOutMock,
    },
  }),
}));

const signInMock = vi.fn();
vi.mock("../../services/supabaseAuthService", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

const whoAmIMock = vi.fn();
vi.mock("../../desk/aiAccess/aiAccessApi", () => ({
  getAdminWhoAmI: () => whoAmIMock(),
}));

vi.mock("../../desk/admin/AdminPanel", () => ({
  default: ({ onClose, closeLabel, identity }: { onClose: () => void; closeLabel: string; identity: { isMainAdmin: boolean; scopes: string[] } }) => (
    <div>
      <p>AI Infrastructure (stub)</p>
      <p>{identity.isMainAdmin ? "main admin" : `scopes: ${identity.scopes.join(",")}`}</p>
      <button onClick={onClose}>{closeLabel}</button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  sessionState = { session: null };
  vi.clearAllMocks();
});

describe("AdminApp", () => {
  it("shows a plain sign-in form when no session exists", async () => {
    render(<AdminApp />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText(/AI Infrastructure/)).not.toBeInTheDocument();
  });

  it("shows a generic not-found for a signed-in account that isn't an admin — never anything admin-shaped", async () => {
    sessionState = { session: { access_token: "t" } };
    whoAmIMock.mockResolvedValue({ isAdmin: false, isMainAdmin: false, scopes: [] });

    render(<AdminApp />);

    expect(await screen.findByText("404 — page not found.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument();
  });

  it("renders the admin panel for a signed-in admin, with its actual scopes", async () => {
    sessionState = { session: { access_token: "t" } };
    whoAmIMock.mockResolvedValue({ isAdmin: true, isMainAdmin: false, scopes: ["manage_premium", "manage_users"] });

    render(<AdminApp />);

    expect(await screen.findByText("AI Infrastructure (stub)")).toBeInTheDocument();
    expect(screen.getByText("scopes: manage_premium,manage_users")).toBeInTheDocument();
  });

  it("marks the main admin distinctly", async () => {
    sessionState = { session: { access_token: "t" } };
    whoAmIMock.mockResolvedValue({ isAdmin: true, isMainAdmin: true, scopes: [] });

    render(<AdminApp />);

    expect(await screen.findByText("main admin")).toBeInTheDocument();
  });

  it("a failed sign-in shows the error and never reaches the panel", async () => {
    signInMock.mockResolvedValue({ success: false, error: "Incorrect password credentials." });

    render(<AdminApp />);
    await screen.findByRole("heading", { name: "Sign in" });

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Incorrect password credentials.")).toBeInTheDocument();
    expect(screen.queryByText(/AI Infrastructure/)).not.toBeInTheDocument();
  });

  it("a successful sign-in re-checks admin status and reaches the panel for an actual admin", async () => {
    signInMock.mockImplementation(async () => {
      sessionState = { session: { access_token: "t" } };
      return { success: true };
    });
    whoAmIMock.mockResolvedValue({ isAdmin: true, isMainAdmin: false, scopes: ["manage_budget"] });

    render(<AdminApp />);
    await screen.findByRole("heading", { name: "Sign in" });

    fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "correct" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("AI Infrastructure (stub)")).toBeInTheDocument();
  });

  it("signing out returns to the login form", async () => {
    sessionState = { session: { access_token: "t" } };
    whoAmIMock.mockResolvedValue({ isAdmin: true, isMainAdmin: false, scopes: [] });

    render(<AdminApp />);
    fireEvent.click(await screen.findByText("Sign out"));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledOnce());
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
