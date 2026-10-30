import React, { useState, useEffect } from "react";

type AnnouncerListener = (message: string) => void;
const listeners = new Set<AnnouncerListener>();

/**
 * Imperatively trigger a polite screen reader announcement from anywhere in the app.
 * Can be called inside utility functions, event handlers, or lifecycle hooks.
 */
export function announcePolite(message: string): void {
  if (!message || typeof message !== "string") return;
  listeners.forEach((listener) => {
    try {
      listener(message);
    } catch {
      // Non-blocking failover
    }
  });
}

/**
 * Screen Reader Accessible Live Announcer Component.
 * Mounts a visually-hidden live region that notifies assistive technologies
 * of asynchronous app state changes (e.g. AI generation start/finish, autosave status).
 */
export function AriaLiveAnnouncer(): React.ReactElement {
  const [announcement, setAnnouncement] = useState<string>("");

  useEffect(() => {
    // One pending timer at a time, cleared on unmount so it never sets state
    // after the component is gone (the listener's return value is ignored).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleAnnounce: AnnouncerListener = (msg) => {
      // Clear briefly so identical consecutive messages still trigger screen reader updates
      setAnnouncement("");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        setAnnouncement(msg);
      }, 50);
    };

    listeners.add(handleAnnounce);
    return () => {
      listeners.delete(handleAnnounce);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="aria-live-announcer"
    >
      {announcement}
    </div>
  );
}

export default AriaLiveAnnouncer;
