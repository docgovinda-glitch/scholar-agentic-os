// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, renderHook, cleanup, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import fs from "node:fs";
import path from "node:path";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { WorkspaceAutosaveBadge } from "../../components/ui/WorkspaceAutosaveBadge";
import { AriaLiveAnnouncer, announcePolite } from "../../components/ui/AriaLiveAnnouncer";
import { FeedbackProvider, showAppToast, requestAppConfirm } from "../../components/ui/FeedbackSystem";

const listProjects = vi.fn();
const listOutputTypes = vi.fn();
const deleteProject = vi.fn();
const saveIntakeAnswers = vi.fn();
const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();

vi.mock("../api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  isEphemeralProject: () => false,
  commitProjectToDatabase: vi.fn(),
  authedFetch: vi.fn(),
  authedJsonFetch: vi.fn(),
}));

vi.mock("../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
  connectCloudDrive: vi.fn(),
  disconnectCloudDrive: vi.fn(),
  listCloudDriveFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("../vault/SourceLibraryScreen", () => ({
  default: () => <div data-testid="mock-source-library">Source Library Screen</div>,
}));

vi.mock("../vault/SettingsView", () => ({
  default: () => <div data-testid="mock-settings-view">Settings View</div>,
}));

const { default: KnowledgeVault } = await import("../vault/KnowledgeVault");
const { default: AssignmentWorkspace } = await import("../assignment/AssignmentWorkspace");

describe("Forensic Remediation Batch 4 - UX, Ergonomics & Accessibility Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // 1. Zero alert() or confirm() in src/
  it("verifies zero alert() or confirm() calls exist in src/ production source files", () => {
    const srcDir = path.resolve(__dirname, "../../");
    const violations: string[] = [];

    function scanDir(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file !== "node_modules" && file !== "__tests__") {
            scanDir(fullPath);
          }
        } else if (/\.(ts|tsx|js|jsx)$/.test(file) && !file.includes(".test.") && !file.includes(".spec.")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          const alertMatches = content.match(/(?<![a-zA-Z0-9_$])alert\s*\(/g);
          const confirmMatches = content.match(/(?<![a-zA-Z0-9_$])confirm\s*\(/g);
          if (alertMatches && alertMatches.length > 0) {
            violations.push(`alert() found in ${fullPath}: ${alertMatches.length}`);
          }
          if (confirmMatches && confirmMatches.length > 0) {
            violations.push(`confirm() found in ${fullPath}: ${confirmMatches.length}`);
          }
        }
      }
    }

    scanDir(srcDir);
    expect(violations).toEqual([]);
  });

  // 2. Mobile AI Tutor Drawer on AssignmentWorkspace
  it("renders AssignmentWorkspace mobile AI Tutor drawer and backdrop when toggled", async () => {
    getProject.mockResolvedValue({
      projectId: "proj-123",
      outputTypeId: "OT-01",
      title: "Test Assignment",
      hasDocument: false,
      answers: {
        assignment_question: "Test Question",
        word_count: 1500,
        citation_style: "apa7",
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });

    render(
      <FeedbackProvider>
        <AssignmentWorkspace
          projectId="proj-123"
          initialStage="understand"
          onStageChange={vi.fn()}
        />
      </FeedbackProvider>
    );

    // AI copilot is open by default (tutorPanelOpen = true)
    const drawer = await screen.findByTestId("assignment-tutor-drawer");
    expect(drawer).toBeInTheDocument();

    const mobileBackdrop = screen.getByTestId("mobile-tutor-backdrop");
    expect(mobileBackdrop).toBeInTheDocument();

    const mobileCloseBtn = screen.getByTestId("mobile-tutor-close");
    expect(mobileCloseBtn).toBeInTheDocument();

    // Clicking close hides drawer
    fireEvent.click(mobileCloseBtn);
    expect(screen.queryByTestId("assignment-tutor-drawer")).not.toBeInTheDocument();

    // The header no longer carries an Inspector toggle
    expect(screen.queryByTestId("inspector-toggle")).not.toBeInTheDocument();
  });

  // 3. useUnsavedChangesGuard registers beforeunload
  it("registers beforeunload event listener when dirty or saving, and cleans up", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { rerender, unmount } = renderHook(
      ({ isDirty, isSaving }) => useUnsavedChangesGuard({ isDirty, isSaving }),
      { initialProps: { isDirty: false, isSaving: false } }
    );

    // Clean initial state
    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));

    // Dirty state
    rerender({ isDirty: true, isSaving: false });
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    // Saving state
    rerender({ isDirty: false, isSaving: true });
    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    // Simulate beforeunload event preventDefault
    const beforeUnloadHandler = addSpy.mock.calls.find((call) => call[0] === "beforeunload")?.[1] as EventListener;
    expect(beforeUnloadHandler).toBeDefined();

    const mockEvent = new Event("beforeunload", { cancelable: true });
    const preventDefaultSpy = vi.spyOn(mockEvent, "preventDefault");
    beforeUnloadHandler(mockEvent);
    expect(preventDefaultSpy).toHaveBeenCalled();

    // Both false cleans up
    rerender({ isDirty: false, isSaving: false });
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));

    unmount();
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  // 4. KnowledgeVault defaults to sources tab
  it("KnowledgeVault defaults to the sources tab without duplicate projects list", async () => {
    render(
      <KnowledgeVault
        userId="user-123"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    expect(await screen.findByRole("heading", { name: "Knowledge Vault" })).toBeInTheDocument();
    // Sources view is mounted by default
    expect(await screen.findByTestId("mock-source-library")).toBeInTheDocument();
    // Projects card grid should not be mounted
    expect(screen.queryByTestId("project-card-grid")).not.toBeInTheDocument();
  });

  // 5. WorkspaceAutosaveBadge and AriaLiveAnnouncer render with proper ARIA attributes
  it("WorkspaceAutosaveBadge renders appropriate statuses and ARIA attributes", () => {
    const { rerender } = render(<WorkspaceAutosaveBadge status="saving" version={3} />);

    const badge = screen.getByTestId("autosave-status");
    expect(badge).toHaveAttribute("role", "status");
    expect(badge).toHaveAttribute("aria-live", "polite");
    expect(badge).toHaveTextContent(/Saving changes\.\.\./);
    expect(badge).toHaveTextContent(/v3/);

    rerender(<WorkspaceAutosaveBadge status="saved" version={3} />);
    expect(badge).toHaveTextContent(/All changes saved/);
    expect(badge).toHaveTextContent(/v3/);

    rerender(<WorkspaceAutosaveBadge status="offline" />);
    expect(badge).toHaveTextContent(/Offline Backup/);
  });

  it("AriaLiveAnnouncer renders with polite live region and updates dynamically", async () => {
    render(<AriaLiveAnnouncer />);

    const region = screen.getByTestId("aria-live-announcer");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveClass("sr-only");

    act(() => {
      announcePolite("AI manuscript generation complete");
    });

    await waitFor(() => {
      expect(region).toHaveTextContent("AI manuscript generation complete");
    });
  });

  it("FeedbackSystem supports programmatic toasts and confirmation modals without native popups", async () => {
    render(
      <FeedbackProvider>
        <button
          onClick={() => {
            showAppToast("Batch 4 changes applied successfully", "success");
          }}
        >
          Trigger Toast
        </button>
        <button
          onClick={async () => {
            const confirmed = await requestAppConfirm("Are you sure you want to proceed?");
            if (confirmed) {
              showAppToast("Confirmed action executed", "info");
            }
          }}
        >
          Trigger Confirm
        </button>
      </FeedbackProvider>
    );

    // Test Toast
    fireEvent.click(screen.getByText("Trigger Toast"));
    expect(await screen.findByText("Batch 4 changes applied successfully")).toBeInTheDocument();

    // Test Confirm Modal
    fireEvent.click(screen.getByText("Trigger Confirm"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to proceed?")).toBeInTheDocument();

    // Click Confirm in modal
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Confirmed action executed")).toBeInTheDocument();
  });
});
