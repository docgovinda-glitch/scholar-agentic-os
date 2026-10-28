import { useEffect } from "react";

export interface UnsavedChangesGuardOptions {
  message?: string;
}

/**
 * Hook to guard against accidental page closure, reload, or navigation when unsaved changes exist or saving is in progress.
 * Registers a standard `beforeunload` listener on `window` when `isDirty || isSaving`.
 */
export function useUnsavedChangesGuard(
  isDirtyOrSaving: boolean | { isDirty?: boolean; isSaving?: boolean },
  options?: UnsavedChangesGuardOptions
): void {
  const isGuarded =
    typeof isDirtyOrSaving === "boolean"
      ? isDirtyOrSaving
      : Boolean(isDirtyOrSaving?.isDirty || isDirtyOrSaving?.isSaving);

  useEffect(() => {
    if (!isGuarded || typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      const message = options?.message || "You have unsaved changes. Are you sure you want to leave?";
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isGuarded, options?.message]);
}

export default useUnsavedChangesGuard;
