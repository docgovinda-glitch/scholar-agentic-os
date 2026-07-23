// @vitest-environment jsdom
//
// Characterization tests for ProfileSettings.tsx.
//
// Originally written against the OLD fetch("/api/request-profile-update")
// path and confirmed passing there first, as a locked-in behavioral baseline
// (see git history for that version) — updated in place to mock
// supabaseAuthService.ts's requestProfileUpdate() instead, following the
// cutover. Same assertions throughout; only the mocking layer changes.
//
// Everything else in this component (profile load, admin approve/reject,
// verification-key check, cancel-own-request) is pure localStorage — no
// network call exists to swap, confirmed by reading the whole file before
// writing these tests. Those flows are still covered here as a regression
// guard, not because they needed migrating.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProfileSettings from "../ProfileSettings";
import * as supabaseAuthService from "../../services/supabaseAuthService";

vi.mock("../../services/supabaseAuthService", () => ({
  requestProfileUpdate: vi.fn(),
}));

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

const PROFILES_LIST_KEY = "phd_profiles_meta";
const PROFILE_STATE_PREFIX = "phd_profile_state_";

function seedProfile(username: string, overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    `${PROFILE_STATE_PREFIX}${username}`,
    JSON.stringify({
      username,
      fullName: "Original Name",
      email: "original@example.com",
      phone: "+9779800000000",
      affiliation: "Original University",
      authenticId: "ID-0001",
      status: "approved",
      ...overrides,
    })
  );
}

describe("ProfileSettings — characterization", () => {
  const requestProfileUpdateMock = supabaseAuthService.requestProfileUpdate as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    requestProfileUpdateMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads and displays the current profile from localStorage", () => {
    seedProfile("jdoe");
    render(<ProfileSettings currentUser="jdoe" />);

    expect(screen.getByText("jdoe")).toBeInTheDocument();
    expect(screen.getByText("Original University")).toBeInTheDocument();
    expect(screen.getByText("ID-0001")).toBeInTheDocument();
  });

  it("gets stuck on the loading spinner when the profile isn't found in localStorage", () => {
    // Real, pre-existing quirk: the component DOES call setError("User profile
    // not found.") in this case, but its top-level early return is keyed on
    // `!profile` alone — since `profile` stays null, the component renders
    // only the loading spinner forever, and that error text is never actually
    // shown. Locking in the current (odd) behavior, not the intended one.
    render(<ProfileSettings currentUser="nobody" />);
    expect(screen.queryByText("User profile not found.")).not.toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("submits a profile-update request with only the changed fields, and stores the returned keyHash", async () => {
    requestProfileUpdateMock.mockResolvedValue({
      success: true,
      emailSent: true,
      verificationKey: "UP-111111",
      keyHash: "abc123hash",
    });
    seedProfile("jdoe");
    render(<ProfileSettings currentUser="jdoe" />);

    fireEvent.change(screen.getByDisplayValue("Original University"), { target: { value: "New University" } });
    fireEvent.click(screen.getByText("Submit Update Request"));

    await waitFor(() => {
      expect(requestProfileUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ username: "jdoe", pendingAffiliation: "New University" })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Verification key sent to administrator/)).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}jdoe`)!);
    expect(stored.pendingUpdateKeyHash).toBe("abc123hash");
    expect(stored.pendingAffiliation).toBe("New University");
  });

  it("shows the sandbox-bypass verification key when the notification email wasn't sent", async () => {
    requestProfileUpdateMock.mockResolvedValue({
      success: true,
      emailSent: false,
      verificationKey: "UP-222222",
      keyHash: "def456hash",
    });
    seedProfile("jdoe");
    render(<ProfileSettings currentUser="jdoe" />);

    fireEvent.change(screen.getByDisplayValue("Original University"), { target: { value: "New University" } });
    fireEvent.click(screen.getByText("Submit Update Request"));

    await waitFor(() => {
      expect(screen.getByText(/sandbox bypass verification key: UP-222222/)).toBeInTheDocument();
    });
  });

  it("rejects submission with no detected changes, without calling requestProfileUpdate", async () => {
    seedProfile("jdoe");
    render(<ProfileSettings currentUser="jdoe" />);

    fireEvent.click(screen.getByText("Submit Update Request"));

    await waitFor(() => {
      expect(screen.getByText(/No changes detected/)).toBeInTheDocument();
    });
    expect(requestProfileUpdateMock).not.toHaveBeenCalled();
  });

  it("surfaces an error message when the request fails", async () => {
    requestProfileUpdateMock.mockResolvedValue({ success: false, error: "Network error" });
    seedProfile("jdoe");
    render(<ProfileSettings currentUser="jdoe" />);

    fireEvent.change(screen.getByDisplayValue("Original University"), { target: { value: "New University" } });
    fireEvent.click(screen.getByText("Submit Update Request"));

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("approves a pending update once the correct verification key is entered", async () => {
    const real = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("UP-333333"));
    const realHash = Array.from(new Uint8Array(real)).map((b) => b.toString(16).padStart(2, "0")).join("");
    seedProfile("jdoe", { pendingAffiliation: "New University", pendingUpdateKeyHash: realHash });

    render(<ProfileSettings currentUser="jdoe" />);

    fireEvent.change(screen.getByPlaceholderText("e.g. UP-123456"), { target: { value: "UP-333333" } });
    fireEvent.click(screen.getByText("Verify Key"));

    await waitFor(() => {
      expect(screen.getByText("Profile details updated successfully!")).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}jdoe`)!);
    expect(stored.affiliation).toBe("New University");
    expect(stored.pendingAffiliation).toBeUndefined();
  });

  it("rejects an incorrect verification key without applying the pending change", async () => {
    seedProfile("jdoe", { pendingAffiliation: "New University", pendingUpdateKeyHash: "somehash" });
    render(<ProfileSettings currentUser="jdoe" />);

    fireEvent.change(screen.getByPlaceholderText("e.g. UP-123456"), { target: { value: "WRONG-KEY" } });
    fireEvent.click(screen.getByText("Verify Key"));

    await waitFor(() => {
      expect(screen.getByText(/Invalid verification key/)).toBeInTheDocument();
    });

    const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}jdoe`)!);
    expect(stored.affiliation).toBe("Original University");
  });

  it("lets the scholar cancel their own pending request (pure localStorage, no network)", () => {
    seedProfile("jdoe", { pendingAffiliation: "New University", pendingUpdateKeyHash: "somehash" });
    render(<ProfileSettings currentUser="jdoe" />);

    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.getByText("Pending update request cancelled.")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}jdoe`)!);
    expect(stored.pendingAffiliation).toBeUndefined();
    expect(requestProfileUpdateMock).not.toHaveBeenCalled();
  });

  describe("admin view", () => {
    beforeEach(() => {
      seedProfile("admin");
      localStorage.setItem(PROFILES_LIST_KEY, JSON.stringify({ profilesList: ["admin", "scholar1"] }));
      seedProfile("scholar1", { pendingAffiliation: "Requested University", pendingUpdateKeyHash: "somehash" });
    });

    it("lists pending profile-update requests for the admin to review", () => {
      render(<ProfileSettings currentUser="admin" />);
      expect(screen.getByText("scholar1")).toBeInTheDocument();
      expect(screen.getByText("Requested University")).toBeInTheDocument();
    });

    it("approves a scholar's pending update directly and shows the success message (pure localStorage, no network)", async () => {
      // Fixed: handleAdminApprove now calls loadProfileData() (which itself
      // calls setSuccess(null)) BEFORE setSuccess(msg), so the success
      // message set last is the one that sticks and is actually shown.
      render(<ProfileSettings currentUser="admin" />);
      fireEvent.click(screen.getByText("Approve"));

      await waitFor(() => {
        const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}scholar1`)!);
        expect(stored.affiliation).toBe("Requested University");
      });
      expect(screen.getByText(/Successfully approved changes for scholar scholar1/)).toBeInTheDocument();
      expect(requestProfileUpdateMock).not.toHaveBeenCalled();
    });

    it("rejects a scholar's pending update directly and shows the success message (pure localStorage, no network)", async () => {
      // Fixed: same setSuccess/loadProfileData order swap as the approve case above.
      render(<ProfileSettings currentUser="admin" />);
      fireEvent.click(screen.getByText("Reject"));

      await waitFor(() => {
        const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}scholar1`)!);
        expect(stored.pendingAffiliation).toBeUndefined();
      });
      expect(screen.getByText(/Rejected update request for scholar scholar1/)).toBeInTheDocument();

      const stored = JSON.parse(localStorage.getItem(`${PROFILE_STATE_PREFIX}scholar1`)!);
      expect(stored.pendingAffiliation).toBeUndefined();
      expect(stored.affiliation).toBe("Original University");
    });
  });
});
