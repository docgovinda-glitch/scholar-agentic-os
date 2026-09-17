// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const getProfile = vi.fn();
vi.mock("../../../services/supabaseAuthService", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
}));

vi.mock("../../../services/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
    },
  }),
}));

const getSavedAccounts = vi.fn().mockReturnValue([]);
const switchActiveAccount = vi.fn().mockResolvedValue({ success: true });
const removeSavedAccount = vi.fn();

vi.mock("../../../services/auth/multiAccountService", () => ({
  getSavedAccounts: () => getSavedAccounts(),
  switchActiveAccount: (...args: unknown[]) => switchActiveAccount(...args),
  removeSavedAccount: (...args: unknown[]) => removeSavedAccount(...args),
}));

import UserAccountMenu from "../UserAccountMenu";

beforeEach(() => {
  getSavedAccounts.mockReset().mockReturnValue([]);
  getProfile.mockReset().mockResolvedValue({
    success: true,
    profile: {
      fullName: "Ada Lovelace",
      username: "adalove",
      email: "ada@example.com",
    },
  });
});

afterEach(() => {
  cleanup();
});

describe("UserAccountMenu — Task 1: Scholar Profile UI Card", () => {
  it("prominently displays the user's Full Name alongside Email/Username in sidebar variant", async () => {
    render(
      <UserAccountMenu
        userEmail="ada@example.com"
        userFullName="Ada Lovelace"
        variant="sidebar"
      />
    );

    // Full name is prominently rendered
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    // Email is rendered alongside
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("fetches profile and displays Full Name if not provided initially", async () => {
    render(
      <UserAccountMenu
        userEmail="ada@example.com"
        variant="sidebar"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    });
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("prominently displays Full Name and email in bar variant", async () => {
    render(
      <UserAccountMenu
        userEmail="ada@example.com"
        userFullName="Ada Lovelace"
        variant="bar"
      />
    );

    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });
});

describe("UserAccountMenu — Task 2: Minimal Dropdown Menu", () => {
  it("opens dropdown and shows only minimal items (Settings, Help & Support, Sign Out)", async () => {
    const onOpenAccountSettings = vi.fn();
    render(
      <UserAccountMenu
        userEmail="ada@example.com"
        userFullName="Ada Lovelace"
        onOpenAccountSettings={onOpenAccountSettings}
        variant="sidebar"
      />
    );

    // Open dropdown
    const trigger = screen.getByRole("button", { name: /Ada Lovelace/i });
    fireEvent.click(trigger);

    // Minimal options present (Settings relocated to sidebar; Help & Support and Sign Out remain)
    expect(screen.queryByRole("button", { name: /Settings/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Help & Support/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign Out/i })).toBeInTheDocument();

    // Verify "See plans and pricing" / subscription is NOT present
    expect(screen.queryByText(/See plans and pricing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/subscription/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pricing/i)).not.toBeInTheDocument();
  });

  it("consolidates multi-account functionality (+ Add another account, switch, and sign out)", async () => {
    getSavedAccounts.mockReturnValue([
      { userId: "u2", email: "second@example.com", institution: "MIT", token: "tok" },
    ]);

    render(
      <UserAccountMenu
        userEmail="ada@example.com"
        userFullName="Ada Lovelace"
        variant="sidebar"
      />
    );

    const trigger = screen.getByRole("button", { name: /Ada Lovelace/i });
    fireEvent.click(trigger);

    expect(screen.getByText("+ Add another account")).toBeInTheDocument();
    expect(screen.getByText("second@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign Out/i })).toBeInTheDocument();
  });
});
