/**
 * Keeps this device's AI keys in step with the keys saved to the user's
 * account, so the AI the person set up on one device works on every device
 * they sign in on.
 *
 * The account copy is the reference:
 *   - a key saved in the account is written into this device's encrypted
 *     store (replacing an older value);
 *   - a key only on this device that was never in the account is uploaded
 *     (keys added before account saving existed, or while offline);
 *   - a key this device once had from the account, but which the account no
 *     longer holds, was removed on another device, so it is removed here too.
 *
 * Every AI path keeps reading keys from the device store
 * (userAiSettings.readProviderKey), so nothing else had to change.
 */

import { forgetProviderKey, providersWithStoredKey, readProviderKey, storeProviderKey } from "./userAiSettings";
import { getCloudProvider } from "../config/providerCatalog";
import { parseKeyId } from "../config/keySlots";

const SYNCED_STORAGE = "scholar-provider-keys-synced";

export interface AccountKeyTransport {
  pull(): Promise<Array<{ providerId: string; apiKey: string; updatedAt: string }>>;
  save(providerId: string, apiKey: string): Promise<{ updatedAt: string }>;
}

export interface DeviceKeyStore {
  list(): string[];
  read(providerId: string): Promise<string | null>;
  write(providerId: string, apiKey: string): Promise<void>;
  forget(providerId: string): void;
  /** Provider ids this device has matched with the account, with the account's updatedAt. */
  marks(): Record<string, string>;
  setMarks(marks: Record<string, string>): void;
}

export interface SyncResult {
  pulled: string[];
  pushed: string[];
  removed: string[];
}

function readMarks(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SYNCED_STORAGE) ?? "{}") as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeMarks(marks: Record<string, string>): void {
  try {
    localStorage.setItem(SYNCED_STORAGE, JSON.stringify(marks));
  } catch {
    /* storage unavailable: the next sync simply re-checks */
  }
}

export const deviceKeyStore: DeviceKeyStore = {
  list: providersWithStoredKey,
  read: readProviderKey,
  write: storeProviderKey,
  forget: forgetProviderKey,
  marks: readMarks,
  setMarks: writeMarks,
};

/** Records that a key was saved to the account from this device. */
export function markSaved(providerId: string, updatedAt: string, store: DeviceKeyStore = deviceKeyStore): void {
  store.setMarks({ ...store.marks(), [providerId]: updatedAt });
}

/** Forgets the account match for a key removed on this device. */
export function unmark(providerId: string, store: DeviceKeyStore = deviceKeyStore): void {
  const marks = { ...store.marks() };
  delete marks[providerId];
  store.setMarks(marks);
}

export async function syncAccountKeys(transport: AccountKeyTransport, store: DeviceKeyStore = deviceKeyStore): Promise<SyncResult> {
  const result: SyncResult = { pulled: [], pushed: [], removed: [] };
  const account = await transport.pull();
  const marks = { ...store.marks() };
  const inAccount = new Set(account.map((k) => k.providerId));

  for (const k of account) {
    if (!getCloudProvider(parseKeyId(k.providerId).providerId) || !k.apiKey) continue;
    const local = await store.read(k.providerId);
    if (local !== k.apiKey) {
      await store.write(k.providerId, k.apiKey);
      result.pulled.push(k.providerId);
    }
    marks[k.providerId] = k.updatedAt;
  }

  for (const providerId of store.list()) {
    if (inAccount.has(providerId)) continue;
    if (marks[providerId]) {
      // It came from (or went to) the account before and is gone now:
      // removed on another device.
      store.forget(providerId);
      delete marks[providerId];
      result.removed.push(providerId);
      continue;
    }
    if (!getCloudProvider(parseKeyId(providerId).providerId)) continue;
    const key = await store.read(providerId);
    if (!key) continue;
    try {
      const saved = await transport.save(providerId, key);
      marks[providerId] = saved.updatedAt;
      result.pushed.push(providerId);
    } catch {
      /* stays device-only until the next sync */
    }
  }

  // Marks for keys that are neither here nor in the account are stale.
  const here = new Set(store.list());
  for (const id of Object.keys(marks)) if (!here.has(id) && !inAccount.has(id)) delete marks[id];

  store.setMarks(marks);
  return result;
}

let running: Promise<SyncResult | null> | null = null;
let lastRun = 0;

/**
 * Runs one sync at a time; callers within `minGapMs` of the last finished
 * run share its result. Never throws: a failed sync leaves the device as it was.
 */
export function syncAccountKeysOnce(transport: AccountKeyTransport, minGapMs = 0): Promise<SyncResult | null> {
  if (running) return running;
  if (minGapMs > 0 && Date.now() - lastRun < minGapMs) return Promise.resolve(null);
  running = syncAccountKeys(transport)
    .catch(() => null)
    .finally(() => {
      lastRun = Date.now();
      running = null;
    });
  return running;
}
