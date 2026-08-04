import { useCallback, useEffect, useState } from "react";
import { loadVault } from "../../services/userVault";

/**
 * Whether the signed-in user still needs to be offered a Knowledge Vault.
 *
 * Same contract as useAiSetupStatus, and for the same reason: docs 25 §1.1
 * makes every stage after login skippable, with skips "recorded, re-offered
 * contextually, never nagged". A user who says "not now" must not be asked
 * again on the next load.
 *
 * The skip is per device and per user — it is a statement about this sitting,
 * not a durable preference, and a shared machine must not inherit someone
 * else's answer. The Vault's *existence* is server-side, so a user who created
 * one on another device is never re-offered it here.
 */

export type VaultSetupStatus = "checking" | "offer" | "done";

const SKIP_PREFIX = "scholar-vault-setup-skipped:";

function wasSkipped(userId: string): boolean {
  try {
    return localStorage.getItem(`${SKIP_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

export function useVaultSetupStatus(userId: string | null, enabled: boolean) {
  const [status, setStatus] = useState<VaultSetupStatus>("checking");

  useEffect(() => {
    let active = true;
    void (async () => {
      // `enabled` keeps this stage from querying — or flashing — while an
      // earlier stage is still unresolved.
      if (!userId || !enabled) return;
      if (wasSkipped(userId)) {
        if (active) setStatus("done");
        return;
      }
      const vault = await loadVault();
      if (!active) return;
      setStatus(vault ? "done" : "offer");
    })();
    return () => {
      active = false;
    };
  }, [userId, enabled]);

  const skip = useCallback(() => {
    if (userId) {
      try {
        localStorage.setItem(`${SKIP_PREFIX}${userId}`, "1");
      } catch {
        // Not persisting only means being offered again next load — mildly
        // annoying, never a reason to block the user here.
      }
    }
    setStatus("done");
  }, [userId]);

  const complete = useCallback(() => setStatus("done"), []);

  return { status, skip, complete };
}
