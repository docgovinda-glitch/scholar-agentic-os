import { useEffect, useCallback } from "react";
import { useConfirm } from "../components/ui/FeedbackSystem";

export type SaveStatus = "saved" | "saving" | "idle" | "error" | "offline";

export interface UnsavedChangesGuardOptions {
  isDirty?: boolean;
  saveStatus?: SaveStatus;
  onFlushSave?: () => Promise<void> | void;
}

export interface UnsavedChangesGuardResult {
  guardedNavigate: (target: string | (() => void)) => Promise<boolean>;
  isProtected: boolean;
  hasUnsavedChanges: boolean;
}

/**
 * useUnsavedChangesGuard:
 * 1. Attaches window `beforeunload` listener if there are unpersisted edits or saving in-flight.
 * 2. Provides `guardedNavigate()` to ensure in-app navigation prompts or flushes pending saves.
 */
export function useUnsavedChangesGuard({
  isDirty = false,
  saveStatus = "saved",
  onFlushSave,
}: UnsavedChangesGuardOptions): UnsavedChangesGuardResult {
  const confirm = useConfirm();
  const isProtected = isDirty || saveStatus === "saving";

  // Browser reload / tab close guard
  useEffect(() => {
    if (!isProtected) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required for modern browsers to display the standard leave confirmation dialog
      e.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isProtected]);

  // In-app navigation guard
  const guardedNavigate = useCallback(
    async (target: string | (() => void)): Promise<boolean> => {
      if (isProtected) {
        if (onFlushSave) {
          try {
            await onFlushSave();
          } catch (err) {
            console.warn("[UnsavedChangesGuard] Failed to auto-flush pending save before navigation:", err);
          }
        }

        const shouldLeave = await confirm({
          title: "Unsaved Work in Progress",
          message: "You have unsaved edits or a background save in progress. Leaving now may discard your recent changes. Are you sure you want to leave?",
          confirmLabel: "Leave Workspace",
          cancelLabel: "Stay & Continue Editing",
          variant: "warning",
        });

        if (!shouldLeave) return false;
      }

      if (typeof target === "function") {
        target();
      } else if (typeof window !== "undefined") {
        window.location.href = target;
      }
      return true;
    },
    [isProtected, onFlushSave, confirm]
  );

  return {
    guardedNavigate,
    isProtected,
    hasUnsavedChanges: isProtected,
  };
}

export default useUnsavedChangesGuard;
