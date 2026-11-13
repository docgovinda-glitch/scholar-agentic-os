import { syncAccountKeysOnce, markSaved, unmark, type AccountKeyTransport, type SyncResult } from "../../services/accountKeySync";
import { deleteAccountKey, pullAccountKeys, saveAccountKey } from "./aiAccessApi";

/** AI keys saved to the user's account, over /api/ai-access/keys. */
export const accountKeyTransport: AccountKeyTransport = {
  pull: async () => (await pullAccountKeys()).keys,
  save: (providerId, apiKey) => saveAccountKey(providerId, apiKey),
};

/** Brings this device's keys in line with the account. Never throws. */
export async function syncKeysWithAccount(minGapMs = 0): Promise<SyncResult | null> {
  return syncAccountKeysOnce(accountKeyTransport, minGapMs);
}

/** Saves a key just added on this device to the account. Returns false if it stays device-only for now. */
export async function saveKeyToAccount(providerId: string, apiKey: string): Promise<boolean> {
  try {
    const saved = await saveAccountKey(providerId, apiKey);
    markSaved(providerId, saved.updatedAt);
    return true;
  } catch {
    return false;
  }
}

export async function removeKeyFromAccount(providerId: string): Promise<void> {
  unmark(providerId);
  await deleteAccountKey(providerId).catch(() => undefined);
}
