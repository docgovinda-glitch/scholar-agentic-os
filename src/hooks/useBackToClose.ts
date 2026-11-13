import { useEffect, useRef } from "react";

/**
 * Makes the browser/hardware Back button close a full-screen overlay (the phone
 * chat, the navigation drawer) instead of leaving the app.
 *
 * While `open`, one history entry is pushed. Back pops it and calls `onClose`.
 * If the overlay is closed by its own UI instead, the entry is removed again so
 * Back does not later land on a stale, identical page.
 *
 * The existing history state is carried over so the router's own bookkeeping
 * (`key`, `idx`) stays valid.
 */
export function useBackToClose(open: boolean, onClose: () => void, enabled = true): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled || !open || typeof window === "undefined") return;
    let ownsEntry = true;
    window.history.pushState({ ...(window.history.state ?? {}), scholarOverlay: true }, "");

    const onPop = () => {
      ownsEntry = false; // Back already removed our entry
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (ownsEntry && window.history.state?.scholarOverlay) window.history.back();
    };
  }, [open, enabled]);
}
