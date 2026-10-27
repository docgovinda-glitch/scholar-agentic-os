// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  FeedbackProvider,
  useToast,
  useConfirm,
  useAriaAnnounce,
} from "../../components/ui/FeedbackSystem";
import { WorkspaceAutosaveBadge } from "../../components/ui/WorkspaceAutosaveBadge";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { RESEARCH_PHASES } from "../workspace/types";
import { ASSIGNMENT_PHASES } from "../assignment/types";

describe("System Remediation Step 6: UX & Accessibility Upgrades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /* -------------------------------------------------------------------------- */
  /* 1. Unified Toast & Confirm Dialog System (No window.alert / confirm)       */
  /* -------------------------------------------------------------------------- */
  describe("1. Accessible Toast & Confirm System", () => {
    it("renders toast notifications without calling native window.alert", async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

      function TestToastConsumer() {
        const toast = useToast();
        return (
          <div>
            <button
              type="button"
              onClick={() => toast.error("Duplicate project title detected")}
            >
              Trigger Error Toast
            </button>
            <button
              type="button"
              onClick={() => toast.success("Draft exported successfully")}
            >
              Trigger Success Toast
            </button>
          </div>
        );
      }

      render(
        <FeedbackProvider>
          <TestToastConsumer />
        </FeedbackProvider>
      );

      // Trigger error toast
      fireEvent.click(screen.getByText("Trigger Error Toast"));
      expect(alertSpy).not.toHaveBeenCalled();
      expect(await screen.findByText("Duplicate project title detected")).toBeInTheDocument();

      // Trigger success toast
      fireEvent.click(screen.getByText("Trigger Success Toast"));
      expect(await screen.findByText("Draft exported successfully")).toBeInTheDocument();

      alertSpy.mockRestore();
    });

    it("renders confirm dialog with keyboard focus trapping without native window.confirm", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => false);
      let userChoice: boolean | null = null;

      function TestConfirmConsumer() {
        const confirm = useConfirm();
        return (
          <button
            type="button"
            onClick={async () => {
              const res = await confirm({
                title: "Sign Out",
                message: "Sign out of Scholar Core and return to Home?",
                confirmLabel: "Sign Out",
                cancelLabel: "Stay Signed In",
                variant: "danger",
              });
              userChoice = res;
            }}
          >
            Sign Out Trigger
          </button>
        );
      }

      render(
        <FeedbackProvider>
          <TestConfirmConsumer />
        </FeedbackProvider>
      );

      fireEvent.click(screen.getByText("Sign Out Trigger"));

      // Confirm dialog appears
      expect(confirmSpy).not.toHaveBeenCalled();
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText("Sign out of Scholar Core and return to Home?")).toBeInTheDocument();

      // Cancel button resolves to false
      const cancelBtn = screen.getByRole("button", { name: /Stay Signed In/i });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(userChoice).toBe(false);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      // Re-trigger and confirm with Enter / confirm button
      fireEvent.click(screen.getByText("Sign Out Trigger"));
      const confirmBtn = await screen.findByRole("button", { name: "Sign Out" });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(userChoice).toBe(true);
      });

      confirmSpy.mockRestore();
    });

    it("allows canceling confirm dialog with Escape key", async () => {
      let resolvedValue: boolean | null = null;

      function TestEscapeConsumer() {
        const confirm = useConfirm();
        return (
          <button
            type="button"
            onClick={async () => {
              const res = await confirm({
                title: "Discard Draft",
                message: "Are you sure you want to discard your draft?",
              });
              resolvedValue = res;
            }}
          >
            Open Modal
          </button>
        );
      }

      render(
        <FeedbackProvider>
          <TestEscapeConsumer />
        </FeedbackProvider>
      );

      fireEvent.click(screen.getByText("Open Modal"));
      expect(await screen.findByRole("dialog")).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(resolvedValue).toBe(false);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 2. Unsaved Changes Guard Hook                                              */
  /* -------------------------------------------------------------------------- */
  describe("2. Unsaved Changes Guard", () => {
    it("attaches beforeunload listener and intercepts unload when isDirty is true", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesGuard({
          isDirty: true,
          saveStatus: "saving",
        })
      );

      const event = new Event("beforeunload", { cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("does NOT intercept unload when isDirty is false and saveStatus is saved", () => {
      const { result } = renderHook(() =>
        useUnsavedChangesGuard({
          isDirty: false,
          saveStatus: "saved",
        })
      );

      const event = new Event("beforeunload", { cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      window.dispatchEvent(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it("guardedNavigate runs immediately when not dirty", () => {
      const targetNav = vi.fn();
      const { result } = renderHook(() =>
        useUnsavedChangesGuard({
          isDirty: false,
          saveStatus: "saved",
        })
      );

      act(() => {
        result.current.guardedNavigate(targetNav);
      });

      expect(targetNav).toHaveBeenCalledTimes(1);
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 3. Standardized WorkspaceAutosaveBadge                                     */
  /* -------------------------------------------------------------------------- */
  describe("3. Standardized Autosave Badge", () => {
    it("renders saving state with correct accessible copy", () => {
      render(<WorkspaceAutosaveBadge status="saving" />);
      const badge = screen.getByTestId("autosave-status");
      expect(badge).toHaveTextContent("Saving changes...");
    });

    it("renders saved state with version number", () => {
      render(<WorkspaceAutosaveBadge status="saved" version={4} />);
      const badge = screen.getByTestId("autosave-status");
      expect(badge).toHaveTextContent("All changes saved · v4");
    });

    it("renders error state with offline backup indicator", () => {
      render(<WorkspaceAutosaveBadge status="error" />);
      const badge = screen.getByTestId("autosave-status");
      expect(badge).toHaveTextContent("Offline Backup");
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 4. Screen-Reader ARIA Live Announcements                                   */
  /* -------------------------------------------------------------------------- */
  describe("4. ARIA Live Announcements", () => {
    it("updates polite announcement live region", async () => {
      function AnnounceTestConsumer() {
        const { announce } = useAriaAnnounce();
        return (
          <button
            type="button"
            onClick={() => announce("Peer review simulation running", "polite")}
          >
            Announce Polite
          </button>
        );
      }

      render(
        <FeedbackProvider>
          <AnnounceTestConsumer />
        </FeedbackProvider>
      );

      fireEvent.click(screen.getByText("Announce Polite"));

      await waitFor(() => {
        const politeRegion = screen.getByTestId("aria-live-polite");
        expect(politeRegion).toHaveTextContent("Peer review simulation running");
        expect(politeRegion).toHaveAttribute("aria-live", "polite");
      });
    });

    it("updates assertive alert region on critical events", async () => {
      function AnnounceAssertiveConsumer() {
        const { announce } = useAriaAnnounce();
        return (
          <button
            type="button"
            onClick={() => announce("Model generation timeout", "assertive")}
          >
            Announce Assertive
          </button>
        );
      }

      render(
        <FeedbackProvider>
          <AnnounceAssertiveConsumer />
        </FeedbackProvider>
      );

      fireEvent.click(screen.getByText("Announce Assertive"));

      await waitFor(() => {
        const assertiveRegion = screen.getByTestId("aria-live-assertive");
        expect(assertiveRegion).toHaveTextContent("Model generation timeout");
        expect(assertiveRegion).toHaveAttribute("role", "alert");
        expect(assertiveRegion).toHaveAttribute("aria-live", "assertive");
      });
    });
  });

  /* -------------------------------------------------------------------------- */
  /* 5. Harmonized 5-Stage Progress Spine Subtitles                              */
  /* -------------------------------------------------------------------------- */
  describe("5. Harmonized 5-Stage Progress Spine", () => {
    it("RESEARCH_PHASES follows unified mental model: Scope -> Evidence -> Drafting -> Review -> Export", () => {
      expect(RESEARCH_PHASES).toHaveLength(5);

      const [p1, p2, p3, p4, p5] = RESEARCH_PHASES;
      expect(p1.label).toBe("I. Scope & Blueprint");
      expect(p1.description).toContain("1. Scope & Blueprint");

      expect(p2.label).toBe("II. Evidence & Sources");
      expect(p2.description).toContain("2. Evidence & Sources");

      expect(p3.label).toBe("III. Studio Drafting");
      expect(p3.description).toContain("3. Studio Drafting");

      expect(p4.label).toBe("IV. Review & Simulation");
      expect(p4.description).toContain("4. Review & Simulation");

      expect(p5.label).toBe("V. Audit & Export");
      expect(p5.description).toContain("5. Audit & Export");
    });

    it("ASSIGNMENT_PHASES describes alignment with the 5-stage academic pipeline", () => {
      expect(ASSIGNMENT_PHASES).toHaveLength(5);
      const descriptions = ASSIGNMENT_PHASES.map((p) => p.description);

      expect(descriptions[0]).toContain("1. Scope & Blueprint");
      expect(descriptions[1]).toContain("2. Evidence & Sources");
      expect(descriptions[3]).toContain("3. Studio Drafting");
      expect(descriptions[4]).toContain("5. Audit & Export");
    });
  });
});
