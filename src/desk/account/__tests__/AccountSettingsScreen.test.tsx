// @vitest-environment jsdom
//
// Account Settings — the counterpart to AI Access after the standalone AI
// Settings page was retired, and Create Account's Single Source of Truth
// twin (see config/accountSchema.ts's header comment). What matters here:
// it edits the shared canonical profile fields (and only those), username
// and email stay read-only, verification status and subscription plan are
// shown but never editable, and the password section only ever asks for a
// NEW password — it never displays or pre-populates the existing one.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const getProfile = vi.fn();
const saveProfileFields = vi.fn();
const updatePassword = vi.fn();
const uploadIdDocument = vi.fn();
vi.mock("../../../services/supabaseAuthService", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
  saveProfileFields: (...args: unknown[]) => saveProfileFields(...args),
  updatePassword: (...args: unknown[]) => updatePassword(...args),
  uploadIdDocument: (...args: unknown[]) => uploadIdDocument(...args),
}));

const getAiAccessStatus = vi.fn();
vi.mock("../../aiAccess/aiAccessApi", () => ({
  getAiAccessStatus: (...args: unknown[]) => getAiAccessStatus(...args),
}));

import AccountSettingsScreen from "../AccountSettingsScreen";

const PROFILE = {
  username: "scholar1",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "5550100",
  phoneCountryCode: "+1",
  phoneE164: "+15550100",
  affiliation: "Analytical Engines Ltd",
  authenticId: "S-1815",
  userType: "student",
  educationLevel: "undergraduate",
  idVerificationStatus: "verification_required",
  idDocumentPath: null,
};

beforeEach(() => {
  getProfile.mockReset().mockResolvedValue({ success: true, profile: PROFILE });
  saveProfileFields.mockReset().mockResolvedValue({ success: true });
  updatePassword.mockReset().mockResolvedValue({ success: true });
  uploadIdDocument.mockReset().mockResolvedValue({ success: true });
  getAiAccessStatus.mockReset().mockResolvedValue({ connections: [], entitlement: { status: "none", active: false }, quota: null, creditBalance: null });
});

afterEach(() => {
  cleanup();
});

describe("AccountSettingsScreen — loading and identity", () => {
  it("loads and displays the profile, with username and email read-only", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);

    const username = await screen.findByLabelText("Username");
    expect(username).toHaveValue("scholar1");
    expect(username).toBeDisabled();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("ada@example.com");
    expect(email).toBeDisabled();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText("Phone")).toHaveValue("5550100");
    expect(screen.getByLabelText("Institution")).toHaveValue("Analytical Engines Ltd");
    expect(screen.getByLabelText("Institutional ID")).toHaveValue("S-1815");
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
  it("saves edited fields, and reports success", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ada King" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "5550199" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(saveProfileFields).toHaveBeenCalledWith({
        fullName: "Ada King",
        phone: "5550199",
        phoneCountryCode: "+1",
        affiliation: "Analytical Engines Ltd",
        authenticId: "S-1815",
        userType: "student",
        educationLevel: "undergraduate",
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

  it("never sends a username or email field — neither is an editable part of this form", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(saveProfileFields).toHaveBeenCalled());
    expect(saveProfileFields.mock.calls[0][0]).not.toHaveProperty("username");
    expect(saveProfileFields.mock.calls[0][0]).not.toHaveProperty("email");
  });

  it("refuses to save an invalid phone number without calling the server", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/phone number is required/i)).toBeInTheDocument();
    expect(saveProfileFields).not.toHaveBeenCalled();
  });
});

describe("AccountSettingsScreen — system-controlled fields", () => {
  it("shows the verification status as read-only text, not an editable field", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    expect(screen.getByText("Verification Required")).toBeInTheDocument();
  });

  it("shows the current plan and disables Upgrade when no handler is wired", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade to Premium" })).toBeDisabled();
  });

  it("shows Premium and 'Manage Premium Plan' when the entitlement is active", async () => {
    getAiAccessStatus.mockResolvedValue({ connections: [], entitlement: { status: "active", active: true, planId: "premium" }, quota: null, creditBalance: null });
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    expect(await screen.findByText("Premium")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage Premium Plan" })).toBeInTheDocument();
  });

  it("calls onManagePremium when the plan button is clicked", async () => {
    const onManagePremium = vi.fn();
    render(<AccountSettingsScreen onClose={() => {}} onManagePremium={onManagePremium} />);
    await screen.findByLabelText("Full name");

    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Premium" }));
    expect(onManagePremium).toHaveBeenCalled();
  });
});

describe("AccountSettingsScreen — institutional ID document", () => {
  function makeFile(name: string, type: string, size: number) {
    const file = new File(["x".repeat(size)], name, { type });
    return file;
  }

  it("uploads a selected document and reports success", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    const input = screen.getByLabelText("Institutional ID Document");
    const file = makeFile("id.pdf", "application/pdf", 1024);
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "Upload document" }));

    await waitFor(() => expect(uploadIdDocument).toHaveBeenCalledWith(file));
    expect(await screen.findByText("Document submitted for verification.")).toBeInTheDocument();
  });

  it("keeps Upload document disabled until a file is chosen", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");
    expect(screen.getByRole("button", { name: "Upload document" })).toBeDisabled();
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

  it("never shows the existing password anywhere on the screen", async () => {
    render(<AccountSettingsScreen onClose={() => {}} />);
    await screen.findByLabelText("Full name");

    expect(screen.queryByLabelText(/^Password$/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  });
});
