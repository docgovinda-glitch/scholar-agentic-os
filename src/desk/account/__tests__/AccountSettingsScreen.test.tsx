// @vitest-environment jsdom
//
// Account Settings — the counterpart to AI Access after the standalone AI
// Settings page was retired. What matters here: it edits profile fields and
// password only, username stays read-only, and it touches none of the
// AI-configuration services (userAiSettings, aiAccessApi) — that boundary is
// the entire reason this screen and AI Access are two separate surfaces.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const getProfile = vi.fn();
const saveProfileFields = vi.fn();
const updatePassword = vi.fn();
vi.mock("../../../services/supabaseAuthService", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
  saveProfileFields: (...args: unknown[]) => saveProfileFields(...args),
  updatePassword: (...args: unknown[]) => updatePassword(...args),
}));

import AccountSettingsScreen from "../AccountSettingsScreen";

const PROFILE = { username: "scholar1", fullName: "Ada Lovelace", phone: "+1 555 0100", affiliation: "Analytical Engines Ltd" };

beforeEach(() => {
  getProfile.mockReset().mockResolvedValue({ success: true, profile: PROFILE });
  saveProfileFields.mockReset().mockResolvedValue({ success: true });
  updatePassword.mockReset().mockResolvedValue({ success: true });
});

afterEach(() => {
  cleanup();
});

describe("AccountSettingsScreen — loading and identity", () => {
  it("loads and displays the profile, with username read-only", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);

    const username = await screen.findByLabelText("Username");
    expect(username).toHaveValue("scholar1");
    expect(username).toBeDisabled();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Phone")).toHaveValue("+1 555 0100");
    expect(screen.getByLabelText("Affiliation")).toHaveValue("Analytical Engines Ltd");
  });

  it("surfaces a load error rather than rendering a blank form", async () => {
    getProfile.mockResolvedValue({ success: false, error: "Not signed in." });
    render(<AccountSettingsScreen onClose={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Not signed in.");
    expect(screen.queryByLabelText("Full name")).not.toBeInTheDocument();
  });

  it("closes via the header button without requiring the profile to have loaded", async () => {
    const onClose = vi.fn();
    getProfile.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<AccountSettingsScreen onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("AccountSettingsScreen — editing profile fields", () => {
  it("saves edited full name, phone and affiliation, and reports success", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ada King" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+1 555 0199" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(saveProfileFields).toHaveBeenCalledWith({
        fullName: "Ada King",
        phone: "+1 555 0199",
        affiliation: "Analytical Engines Ltd",
      })
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("shows the server's error and does not claim success when saving fails", async () => {
    saveProfileFields.mockResolvedValue({ success: false, error: "That name is too long." });
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("That name is too long.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("never sends a username field — it is not an editable part of this form", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(saveProfileFields).toHaveBeenCalled());
    expect(saveProfileFields.mock.calls[0][0]).not.toHaveProperty("username");
  });
});

describe("AccountSettingsScreen — password", () => {
  it("changes the password when the two fields match", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "correct horse battery staple" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith("correct horse battery staple"));
    expect(await screen.findByText("Password changed.")).toBeInTheDocument();
  });

  it("refuses a mismatched confirmation without calling the server", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "correct horse battery staple" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "something else entirely" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText(/don't match/i)).toBeInTheDocument();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("refuses a password under 8 characters without calling the server", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(updatePassword).not.toHaveBeenCalled();
  });
});
