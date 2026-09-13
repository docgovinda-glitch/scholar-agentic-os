import { useCallback, useEffect, useState } from "react";
import { isConfigured, loadUserAiSettings } from "../../services/userAiSettings";
import { getAiAccessStatus } from "../aiAccess/aiAccessApi";

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
 *
 * "Configured" itself is checked two ways, in order: a key stored on THIS
 * device (fast, no network — the common case for the device that just set
 * up), then, only if that says no, a server-trusted fallback via
 * `GET /api/ai-access/status` — does the account already have a connected
 * provider (from any device) or an active Premium entitlement? Without this
 * second check, a user who configured BYOK on their laptop would be asked to
 * set up AI again on their desktop even though the account already has a
 * working source — the AI Setup completion signal has to be resumable across
 * devices (docs 25 §1.1 "REQ-ONB-10"), and `user_ai_connections`/
 * `user_entitlements` are already the server-side record of that, built for
 * exactly this by the AI Access work. The server check is best-effort: a
 * failed request (offline, momentary hiccup) falls through to "needed" —
 * the same outcome as before this existed — rather than blocking or crashing.
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

async function hasServerSideAiSource(): Promise<boolean> {
  try {
    const remote = await getAiAccessStatus();
    return remote.connections.length > 0 || remote.entitlement.active;
  } catch {
    return false;
  }
}

async function resolveStatus(userId: string): Promise<Exclude<AiSetupStatus, "checking">> {
  if (wasSkipped(userId)) return "ready";
  const settings = await loadUserAiSettings();
  if (isConfigured(settings)) return "ready";
  if (await hasServerSideAiSource()) return "ready";
  return "needed";
}

export function useAiSetupStatus(userId: string | null) {
  const [status, setStatus] = useState<AiSetupStatus>(userId ? "checking" : "ready");

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus("ready");
      return;
    }
    setStatus(await resolveStatus(userId));
  }, [userId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!userId) {
        if (active) setStatus("ready");
        return;
      }
      const next = await resolveStatus(userId);
      if (active) setStatus(next);
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
