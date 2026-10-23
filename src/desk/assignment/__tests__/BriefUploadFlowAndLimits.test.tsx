// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
const authedFetch = vi.fn();
const authedJsonFetch = vi.fn();
const getProfile = vi.fn();
const getAiAccessStatus = vi.fn();

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  authedFetch: (...a: unknown[]) => authedFetch(...a),
  authedJsonFetch: (...a: unknown[]) => authedJsonFetch(...a),
  isEphemeralProject: (id: string) => typeof id === "string" && (id.startsWith("draft-") || id.startsWith("ephemeral-")),
  commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
}));

vi.mock("../../../services/supabaseAuthService", () => ({
  getProfile: (...a: unknown[]) => getProfile(...a),
}));

vi.mock("../../aiAccess/aiAccessApi", () => ({
  getAiAccessStatus: (...a: unknown[]) => getAiAccessStatus(...a),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

const { default: AssignmentWorkspace } = await import("../AssignmentWorkspace");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Brief Upload Flow, Recursion Prevention & Role-Based Limiter", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-brief-1",
      outputTypeId: "OT-01",
      title: "Academic Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "",
        word_count: 2000,
        target_word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "essay",
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", name: "Essay" });
    saveIntakeAnswers.mockResolvedValue({ success: true });
    getAiAccessStatus.mockResolvedValue({
      connections: [],
      entitlement: { status: "none", active: false },
      quota: null,
      creditBalance: null,
    });
  });

  it("Stress Test: Uploading a heavy multi-page handbook parses into Extracted Brief Question without call stack recursion crash", async () => {
    // Free user profile but file within 5MB limit
    getProfile.mockResolvedValue({
      success: true,
      profile: {
        username: "scholar_user",
        fullName: "Scholar User",
        email: "student@scholar.edu",
        phone: "",
        phoneCountryCode: "",
        phoneE164: "",
        affiliation: "University",
        userType: "student",
        educationLevel: "undergraduate",
      },
    });

    // Simulate multi-page handbook response text with 60,000 characters
    const heavyHandbookText =
      "MODULE HANDBOOK 2026: CRITICAL THEORIES OF INTERNATIONAL LAW\n" +
      "Word Count: 3500 words\n" +
      "Target Prompt: Critically evaluate the sovereignty doctrine under global environmental treaties.\n" +
      "Syllabus Content: ".repeat(2500);

    authedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        text: heavyHandbookText,
        detectedWordCount: 3500,
        detectedLevel: "postgraduate",
        detectedCitation: "harvard",
        updatedTitle: "Critical Theories of International Law",
      }),
    });

    render(<AssignmentWorkspace projectId="proj-brief-1" initialStage="understand" />);

    // Wait for stage to load
    await waitFor(() => {
      expect(screen.getByText("Understand Your Brief")).toBeInTheDocument();
    });

    // Switch to Upload Brief Document tab
    const uploadTabButton = screen.getByRole("button", {
      name: /Upload Brief Document/i,
    });
    fireEvent.click(uploadTabButton);

    // Find the file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    // Create a mock multi-page PDF file
    const handbookFile = new File(["dummy pdf content"], "Course_Handbook_2026.pdf", {
      type: "application/pdf",
    });

    // Trigger file upload - MUST NOT THROW "Maximum call stack size exceeded"
    fireEvent.change(fileInput, { target: { files: [handbookFile] } });

    // Verify document text is parsed and rendered under "Extracted Brief Question / Prompt:"
    await waitFor(
      () => {
        expect(
          screen.getByText(/Extracted Brief Question \/ Prompt:/i)
        ).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    expect(
      screen.getByText(/MODULE HANDBOOK 2026: CRITICAL THEORIES OF INTERNATIONAL LAW/i)
    ).toBeInTheDocument();

    // Confirm that saveAnswers was called without infinite loops
    expect(saveIntakeAnswers).toHaveBeenCalled();
  }, 15000);

  it("Admin Verification: Admin users bypass all limits and upload without paywall modals", async () => {
    getProfile.mockResolvedValue({
      success: true,
      profile: {
        username: "system_admin",
        fullName: "System Admin",
        email: "admin@scholar.edu",
        phone: "",
        phoneCountryCode: "",
        phoneE164: "",
        affiliation: "Scholar Admin",
        userType: "administrator",
        educationLevel: "faculty_academic",
      },
    });

    authedFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/assignment/parse-brief")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            text: "Advanced Institutional Policy Review 2026",
            detectedWordCount: 5000,
            detectedLevel: "postgraduate",
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<AssignmentWorkspace projectId="proj-brief-1" initialStage="understand" />);

    await waitFor(() => {
      expect(screen.getByText("Understand Your Brief")).toBeInTheDocument();
    });

    const uploadTabButton = screen.getByRole("button", {
      name: /Upload Brief Document/i,
    });
    fireEvent.click(uploadTabButton);

    await waitFor(() => {
      expect(screen.getByText(/Unlimited size · Admin/i)).toBeInTheDocument();
    });

    // Large file exceeding standard free limits (e.g. 15MB)
    const largeFile = new File([new ArrayBuffer(15 * 1024 * 1024)], "Institutional_Audit.pdf", {
      type: "application/pdf",
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    // Confirm NO UpgradeModal dialog appears for admin
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByText("Unlock Unlimited Document Analysis")).toBeNull();
    });

    // Admin should see parsed output
    await waitFor(() => {
      expect(
        screen.getByText(/Advanced Institutional Policy Review 2026/i)
      ).toBeInTheDocument();
    }, { timeout: 10000 });
  }, 15000);

  it("Free User Paywall Verification: Free user exceeding 5MB limit receives the styled Upgrade Modal", async () => {
    getProfile.mockResolvedValue({
      success: true,
      profile: {
        username: "free_student",
        fullName: "Free Student",
        email: "free@scholar.edu",
        phone: "",
        phoneCountryCode: "",
        phoneE164: "",
        affiliation: "College",
        userType: "student",
        educationLevel: "undergraduate",
      },
    });

    render(<AssignmentWorkspace projectId="proj-brief-1" initialStage="understand" />);

    await waitFor(() => {
      expect(screen.getByText("Understand Your Brief")).toBeInTheDocument();
    });

    const uploadTabButton = screen.getByRole("button", {
      name: /Upload Brief Document/i,
    });
    fireEvent.click(uploadTabButton);

    // Create a 8MB file (exceeds free 5MB limit)
    const oversizedFile = new File([new ArrayBuffer(8 * 1024 * 1024)], "Huge_Handbook.pdf", {
      type: "application/pdf",
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

    // The action must be intercepted: UpgradeModal must be displayed
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByText("Unlock Unlimited Document Analysis")
      ).toBeInTheDocument();
    });

    // Verify upgrade action buttons
    const upgradeBtn = screen.getByRole("button", { name: "Upgrade to Pro" });
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(upgradeBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();

    // Clicking Cancel closes the modal
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("Inline Notice & Error Boundary: Corrupted file yields dismissible notice without global crash", async () => {
    getProfile.mockResolvedValue({
      success: true,
      profile: {
        username: "student",
        fullName: "Student",
        email: "student@scholar.edu",
        phone: "",
        phoneCountryCode: "",
        phoneE164: "",
        affiliation: "School",
        userType: "student",
        educationLevel: "undergraduate",
      },
    });

    authedFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/assignment/parse-brief")) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "Corrupted PDF stream" }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<AssignmentWorkspace projectId="proj-brief-1" initialStage="understand" />);

    await waitFor(() => {
      expect(screen.getByText("Understand Your Brief")).toBeInTheDocument();
    });

    const uploadTabButton = screen.getByRole("button", {
      name: /Upload Brief Document/i,
    });
    fireEvent.click(uploadTabButton);

    const corruptFile = new File(["invalid binary"], "corrupt.pdf", {
      type: "application/pdf",
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [corruptFile] } });

    // Inline notice should appear
    await waitFor(() => {
      expect(
        screen.getByText(
          "Could not parse this document. Please verify the file format or paste the brief text manually."
        )
      ).toBeInTheDocument();
    });

    // Global crash screen MUST NOT be shown
    expect(screen.queryByText("Workspace encountered an issue")).toBeNull();

    // Dismiss notice
    const dismissBtn = screen.getByRole("button", { name: "Dismiss notice" });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(
        screen.queryByText(
          "Could not parse this document. Please verify the file format or paste the brief text manually."
        )
      ).toBeNull();
    });
  });
});
