import { useCallback, useEffect, useState } from "react";
import { isConfigured, loadUserAiSettings } from "../../services/userAiSettings";

/**
 * Whether the signed-in user still needs to see AI setup.
 *
 * Doc 25 §1.1: every stage after login is skippable, and skips are "recorded,
 * re-offered contextually, never nagged". So a skip is remembered rather than
 * re-prompted on the next load — the AI features remain reachable from the
 * workspace when the user actually wants them.
 *
 * The skip is stored per device, not per account, because it is a statement
 * about this sitting ("not now"), not a durable preference worth syncing. It
 * is also keyed by user, so signing in as someone else on a shared machine
 * does not inherit their skip.
 */

export type AiSetupStatus = "checking" | "needed" | "ready";

const SKIP_PREFIX = "scholar-ai-setup-skipped:";

function skipKey(userId: string) {
  return `${SKIP_PREFIX}${userId}`;
}

function wasSkipped(userId: string): boolean {
  try {
    return localStorage.getItem(skipKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function useAiSetupStatus(userId: string | null) {
  const [status, setStatus] = useState<AiSetupStatus>("checking");

  const refresh = useCallback(async () => {
    if (!userId) return setStatus("checking");
    if (wasSkipped(userId)) return setStatus("ready");
    const settings = await loadUserAiSettings();
    setStatus(isConfigured(settings) ? "ready" : "needed");
  }, [userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!userId) return;
      if (wasSkipped(userId)) {
        if (active) setStatus("ready");
        return;
      }
      const settings = await loadUserAiSettings();
      if (!active) return;
      setStatus(isConfigured(settings) ? "ready" : "needed");
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const skip = useCallback(() => {
    if (userId) {
      try {
        localStorage.setItem(skipKey(userId), "1");
      } catch {
        // Not persisting a skip only means being asked again next load —
        // annoying, not broken, and never a reason to block the user here.
      }
    }
    setStatus("ready");
  }, [userId]);

  const complete = useCallback(() => setStatus("ready"), []);

  return { status, skip, complete, refresh };
}
