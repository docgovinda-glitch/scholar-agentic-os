/**
 * Me tab — account, settings, and notification preferences (docs 23 §5.5).
 * Shows user info, notification settings, and dark mode toggle.
 */

import { useState } from "react";
import type { PocketUser, NotificationPreferences } from "../types";

interface MeTabProps {
  user?: PocketUser;
  onNotificationsChange?: (prefs: NotificationPreferences) => void;
}

export default function MeTab({ user, onNotificationsChange }: MeTabProps) {
  const [notifs, setNotifs] = useState<NotificationPreferences>(
    user?.notificationPreferences ?? {
      runComplete: true,
      gateReady: true,
      sourcesWaiting: true,
      securityEvents: true,
    }
  );

  const handleToggle = (key: keyof NotificationPreferences) => {
    const updated = { ...notifs, [key]: !notifs[key] };
    setNotifs(updated);
    onNotificationsChange?.(updated);
  };

  return (
    <div className="space-y-6">
      {/* Account Info */}
      {user && (
        <div className="space-y-3">
          <h2 className="text-xs text-[color:var(--text-secondary)]">Account</h2>
          <div className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] p-3 space-y-2 text-sm">
            <div>
              <span className="text-[color:var(--text-secondary)]">Name: </span>
              <span className="text-[color:var(--text-primary)]">{user.name}</span>
            </div>
            <div>
              <span className="text-[color:var(--text-secondary)]">Email: </span>
              <span className="text-[color:var(--text-primary)] text-xs break-all">{user.email}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notification Preferences */}
      <div className="space-y-3">
        <h2 className="text-xs text-[color:var(--text-secondary)]">Notifications</h2>
        <div className="space-y-2">
          {[
            { key: "runComplete", label: "Extraction complete", desc: "When source discovery finishes" },
            { key: "gateReady", label: "Gate ready", desc: "When a project gate is ready to proceed" },
            { key: "sourcesWaiting", label: "Sources waiting", desc: "When new sources await approval" },
            { key: "securityEvents", label: "Security events", desc: "Authentication and consent changes" },
          ].map(({ key, label, desc }) => (
            <div
              key={key}
              className="flex items-start gap-3 rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] p-3 cursor-pointer hover:border-[color:var(--color-luminous-blue-dim)]"
              onClick={() => handleToggle(key as keyof NotificationPreferences)}
            >
              <input
                type="checkbox"
                checked={notifs[key as keyof NotificationPreferences]}
                onChange={() => {}}
                className="mt-1 w-4 h-4 cursor-pointer accent-[color:var(--color-luminous-blue)]"
              />
              <div className="flex-1">
                <div className="text-sm text-[color:var(--text-primary)]">{label}</div>
                <div className="text-xs text-[color:var(--text-muted)]">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Display Settings */}
      <div className="space-y-3">
        <h2 className="text-xs text-[color:var(--text-secondary)]">Display</h2>
        <div className="rounded-lg border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[color:var(--text-primary)]">Dark Mode</span>
            <span className="text-xs text-[color:var(--text-secondary)]">Always on</span>
          </div>
          <div className="text-xs text-[color:var(--text-muted)]">Pocket is optimized for low-light reading and review.</div>
        </div>
      </div>

      {/* About */}
      <div className="space-y-3 pb-4">
        <h2 className="text-xs text-[color:var(--text-secondary)]">About</h2>
        <div className="text-xs text-[color:var(--text-muted)] space-y-1">
          <p>Scholar OS Pocket</p>
          <p>Mobile-first source approval and project review</p>
          <p className="text-[color:var(--text-muted)]">docs 23-MOBILE-WEB-UX-SPECIFICATION.md</p>
        </div>
      </div>
    </div>
  );
}
