import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getConnectedCloudDrives,
  connectCloudDrive,
  disconnectCloudDrive,
  initiateGoogleDriveAuth,
  initiateOneDriveAuth,
  fetchDriveFiles,
  uploadFileToCloudDrive,
} from "../cloudDriveService";

// Mock Supabase client
const signInWithOAuth = vi.fn();
const mockSupabase = {
  auth: {
    signInWithOAuth: (...args: any[]) => signInWithOAuth(...args),
  },
  from: () => ({
    select: () => ({
      eq: () => Promise.resolve({ data: [], error: null }),
    }),
    upsert: () => Promise.resolve({ error: null }),
    delete: () => ({
      eq: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  }),
};

vi.mock("../../supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => mockSupabase,
}));

describe("CloudDriveService — Real OAuth & Anti-Mock Verification", () => {
  const userId = "test-user-oauth-123";

  beforeEach(() => {
    localStorage.clear();
    signInWithOAuth.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Sanitization & Anti-Mock Safeguards", () => {
    it("purges legacy mock accounts (academic.scholar@outlook.com) on load", async () => {
      // Simulate legacy mock account stored in localStorage
      localStorage.setItem(
        `scholar_cloud_drive_${userId}`,
        JSON.stringify([
          {
            id: "fake-1",
            provider: "onedrive",
            accountEmail: "academic.scholar@outlook.com",
            connectedAt: new Date().toISOString(),
          },
          {
            id: "real-1",
            provider: "google_drive",
            accountEmail: "verified.user@gmail.com",
            connectedAt: new Date().toISOString(),
          },
        ])
      );

      const drives = await getConnectedCloudDrives(userId);
      expect(drives.length).toBe(1);
      expect(drives[0].accountEmail).toBe("verified.user@gmail.com");

      // Verify the storage was sanitized
      const stored = JSON.parse(localStorage.getItem(`scholar_cloud_drive_${userId}`) || "[]");
      expect(stored.some((a: any) => a.accountEmail === "academic.scholar@outlook.com")).toBe(false);
    });

    it("fetchDriveFiles never returns hardcoded fake files", async () => {
      const files = await fetchDriveFiles("google_drive", userId);
      expect(files).toEqual([]);

      const oneDriveFiles = await fetchDriveFiles("onedrive", userId);
      expect(oneDriveFiles).toEqual([]);
    });

    it("fetchDriveFiles returns only genuine user-uploaded files", async () => {
      const testFile = new File(["Research Paper Content"], "MyActualResearch.pdf", {
        type: "application/pdf",
      });

      await uploadFileToCloudDrive(userId, "google_drive", testFile);
      const files = await fetchDriveFiles("google_drive", userId);

      expect(files.length).toBe(1);
      expect(files[0].name).toBe("MyActualResearch.pdf");
      expect(files[0].mimeType).toBe("application/pdf");
    });
  });

  describe("Real OAuth Initiation", () => {
    it("initiateGoogleDriveAuth requests Drive scopes via Supabase OAuth", async () => {
      signInWithOAuth.mockResolvedValueOnce({
        data: { url: "https://accounts.google.com/o/oauth2/v2/auth?scope=drive" },
        error: null,
      });

      await initiateGoogleDriveAuth(userId);

      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: expect.objectContaining({
          scopes: expect.stringContaining("https://www.googleapis.com/auth/drive.readonly"),
          queryParams: expect.objectContaining({
            access_type: "offline",
          }),
        }),
      });
    });

    it("initiateGoogleDriveAuth throws descriptive error when OAuth provider is not configured", async () => {
      signInWithOAuth.mockResolvedValueOnce({
        data: null,
        error: { message: "Unsupported provider: provider is not enabled" },
      });

      await expect(initiateGoogleDriveAuth(userId)).rejects.toThrow(
        /Google Drive OAuth failed: Unsupported provider: provider is not enabled/i
      );
    });

    it("initiateOneDriveAuth requests Files.Read scope via Azure OAuth", async () => {
      signInWithOAuth.mockResolvedValueOnce({
        data: { url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize" },
        error: null,
      });

      await initiateOneDriveAuth(userId);

      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: "azure",
        options: expect.objectContaining({
          scopes: expect.stringContaining("Files.Read"),
        }),
      });
    });

    it("initiateOneDriveAuth throws descriptive error when Azure provider fails", async () => {
      signInWithOAuth.mockResolvedValueOnce({
        data: null,
        error: { message: "Application with identifier was not found in the directory" },
      });

      await expect(initiateOneDriveAuth(userId)).rejects.toThrow(
        /Microsoft OneDrive OAuth failed/i
      );
    });
  });

  describe("Account Disconnection", () => {
    it("disconnectCloudDrive removes provider from connected accounts", async () => {
      await connectCloudDrive(userId, "google_drive", { email: "real.user@gmail.com" });
      let drives = await getConnectedCloudDrives(userId);
      expect(drives.some((d) => d.provider === "google_drive")).toBe(true);

      await disconnectCloudDrive(userId, "google_drive");
      drives = await getConnectedCloudDrives(userId);
      expect(drives.some((d) => d.provider === "google_drive")).toBe(false);
    });
  });
});
