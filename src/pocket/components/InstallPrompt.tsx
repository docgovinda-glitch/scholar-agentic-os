/**
 * Install prompt — PWA installation banner for Pocket.
 * Shows when app is installable on supported browsers.
 */

import { useState, useEffect } from "react";
import { useInstallPrompt } from "../hooks/useServiceWorker";

export default function InstallPrompt() {
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  // Hide after 5 seconds if not interacted with
  const [autoHide, setAutoHide] = useState(false);
  useEffect(() => {
    if (!canInstall || isInstalled || dismissed) return;

    const timer = setTimeout(() => setAutoHide(true), 5000);
    return () => clearTimeout(timer);
  }, [canInstall, isInstalled, dismissed]);

  if (!canInstall || isInstalled || dismissed || autoHide) {
    return null;
  }

  const handleInstall = async () => {
    const success = await install();
    if (success) {
      setDismissed(true);
    }
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 rounded-lg bg-[color:var(--color-luminous-blue-dim)] border border-[color:var(--color-luminous-blue)] p-4 shadow-lg z-50 md:bottom-4">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-serif font-semibold text-white">Install Pocket</p>
          <p className="text-xs text-[#E2E8F0] mt-1">
            Quick access to source review and project management
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 px-3 py-2 rounded-lg bg-white text-[color:var(--color-luminous-blue-dim)] text-xs font-mono uppercase tracking-wide font-semibold hover:bg-[#E2E8F0]"
          >
            Install
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="flex-1 px-3 py-2 rounded-lg border border-white text-white text-xs font-mono uppercase tracking-wide hover:bg-white/10"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
