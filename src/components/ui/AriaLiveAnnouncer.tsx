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
    const handleAnnounce: AnnouncerListener = (msg) => {
      // Clear briefly so identical consecutive messages still trigger screen reader updates
      setAnnouncement("");
      const timer = setTimeout(() => {
        setAnnouncement(msg);
      }, 50);
      return () => clearTimeout(timer);
    };

    listeners.add(handleAnnounce);
    return () => {
      listeners.delete(handleAnnounce);
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
