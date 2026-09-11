// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mocks
const mockInitiateGoogleDriveAuth = vi.fn();
const mockInitiateOneDriveAuth = vi.fn();
const mockDisconnectCloudDrive = vi.fn();
const mockFetchDriveFiles = vi.fn().mockResolvedValue([]);

vi.mock("../../../services/vault/cloudDriveService", () => ({
  initiateGoogleDriveAuth: (...args: unknown[]) => mockInitiateGoogleDriveAuth(...args),
  initiateOneDriveAuth: (...args: unknown[]) => mockInitiateOneDriveAuth(...args),
  disconnectCloudDrive: (...args: unknown[]) => mockDisconnectCloudDrive(...args),
  fetchDriveFiles: (...args: unknown[]) => mockFetchDriveFiles(...args),
}));

const mockGetVaultStorageMode = vi.fn().mockResolvedValue("synced");
const mockUpdateVaultStorageMode = vi.fn().mockResolvedValue({ success: true });

vi.mock("../../../services/userVault", () => ({
  getVaultStorageMode: (...args: unknown[]) => mockGetVaultStorageMode(...args),
  updateVaultStorageMode: (...args: unknown[]) => mockUpdateVaultStorageMode(...args),
}));

const { default: SettingsView } = await import("../SettingsView");

describe("SettingsView — Knowledge Vault Settings Review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders cloud connections, storage mode, citation preferences, and privacy policy", async () => {
    render(
      <SettingsView
        userId="user-1"
        connectedDrives={[]}
        onRefreshDrives={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cloud Storage Connections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Vault Storage & Security Mode/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Citation & Research Preferences" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Canonical Storage Designation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Storage & Privacy Architecture/i })).toBeInTheDocument();
  });

  it("displays connected status and email when Google Drive is connected", () => {
    render(
      <SettingsView
        userId="user-1"
        connectedDrives={[
          {
            id: "conn-1",
            provider: "google_drive",
            accountEmail: "scholar.researcher@gmail.com",
            connectedAt: "2026-01-01",
          },
        ]}
        onRefreshDrives={vi.fn()}
      />
    );

    expect(screen.getByText(/scholar\.researcher@gmail\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Connected & Synced/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Drive ↗" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });

  it("toggles the Easy Setup Guide & Help card", () => {
    render(
      <SettingsView
        userId="user-1"
        connectedDrives={[]}
        onRefreshDrives={vi.fn()}
      />
    );

    const guideBtn = screen.getByRole("button", { name: /Setup Guide & Help/i });
    fireEvent.click(guideBtn);

    expect(screen.getByText(/Quick Setup & How It Works/i)).toBeInTheDocument();
    expect(screen.getByText(/Google Drive Setup/i)).toBeInTheDocument();
    expect(screen.getByText(/OneDrive Setup/i)).toBeInTheDocument();
  });

  it("handles disconnecting a connected drive", async () => {
    const onRefreshDrives = vi.fn();
    mockDisconnectCloudDrive.mockResolvedValueOnce(undefined);

    render(
      <SettingsView
        userId="user-1"
        connectedDrives={[
          {
            id: "conn-1",
            provider: "google_drive",
            accountEmail: "scholar.researcher@gmail.com",
            connectedAt: "2026-01-01",
          },
        ]}
        onRefreshDrives={onRefreshDrives}
      />
    );

    const disconnectBtn = screen.getByRole("button", { name: "Disconnect" });
    fireEvent.click(disconnectBtn);

    await waitFor(() => {
      expect(mockDisconnectCloudDrive).toHaveBeenCalledWith("user-1", "google_drive");
      expect(onRefreshDrives).toHaveBeenCalled();
    });
  });

  it("allows switching between Universal Cloud Sync and Local Device mode", async () => {
    mockGetVaultStorageMode.mockResolvedValueOnce("synced");

    render(
      <SettingsView
        userId="user-1"
        connectedDrives={[]}
        onRefreshDrives={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    const switchLocalBtn = screen.getByRole("button", { name: "Switch to Local Mode" });
    fireEvent.click(switchLocalBtn);

    await waitFor(() => {
      expect(mockUpdateVaultStorageMode).toHaveBeenCalledWith("local");
    });
  });

  it("updates default citation style and stores preference in localStorage", () => {
    render(
      <SettingsView
        userId="user-1"
        connectedDrives={[]}
        onRefreshDrives={vi.fn()}
      />
    );

    const citationSelect = screen.getByLabelText(/Default Citation Style/i);
    fireEvent.change(citationSelect, { target: { value: "mla9" } });

    expect(localStorage.getItem("scholar_vault_citation_style_user-1")).toBe("mla9");
    expect(screen.getByText(/Citation style set to MLA9/i)).toBeInTheDocument();
  });

  it("provides safe double-confirmation for library reset", () => {
    const onResetVault = vi.fn();
    render(
      <SettingsView
        userId="user-1"
        connectedDrives={[]}
        onRefreshDrives={vi.fn()}
        onResetVault={onResetVault}
      />
    );

    const resetBtn = screen.getByRole("button", { name: "Reset Library…" });
    fireEvent.click(resetBtn);

    expect(screen.getByRole("button", { name: "Confirm Reset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Reset" }));
    expect(onResetVault).toHaveBeenCalled();
  });
});
