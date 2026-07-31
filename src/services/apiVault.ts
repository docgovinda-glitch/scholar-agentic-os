/**
 * Persistent, encrypted API key vault.
 *
 * WHAT THIS REPLACES
 * ------------------
 * Provider keys used to live as individual `AISettings.<provider>ApiKey`
 * ciphertext fields inside the project blob in localStorage, encrypted with a
 * vault passphrase that existed only in memory (src/services/vaultPassphrase.ts).
 * That was secure but unusable in practice: every page reload locked the vault,
 * and until the passphrase was re-entered every adapter's getApiKey() returned
 * "" — which the app then reported as "no key configured" rather than "locked".
 * Users experienced this as their keys silently disappearing.
 *
 * THE TWO UNLOCK MODES
 * --------------------
 * There is a genuine tension between "never ask me again" and "encrypted at
 * rest", and it cannot be resolved by picking a clever storage location — so
 * the choice is made explicit and the tradeoff is stated honestly in the UI.
 *
 *  1. `device` (default) — an AES-GCM-256 key is generated with
 *     `extractable: false` and stored in IndexedDB. The vault opens
 *     automatically on this device with no prompt. Crucially this is NOT the
 *     same as storing keys in plaintext: the raw key material is unreadable to
 *     every script, including injected ones, so a copied localStorage dump or
 *     a stolen backup file is worthless without this specific browser profile.
 *     What it does not protect against is someone using this actual browser.
 *
 *  2. `passphrase` — the key is derived from a passphrase that is never
 *     stored anywhere. Maximum protection; costs one unlock per session.
 *
 * Either way the encrypted vault blob is the only thing written to disk.
 *
 * RECOVERY
 * --------
 * Because a device key cannot be exported, losing the device or clearing site
 * data would destroy every key with no way back. So `exportBackup()` produces
 * a portable file encrypted with a separate recovery passphrase (PBKDF2 →
 * AES-GCM, via the existing encryptDataAsync), which `importBackup()` restores
 * on any device. The UI pushes users to create one at the moment they add
 * their first key — the only moment they reliably care.
 */

import { encryptDataAsync, decryptDataAsync, encryptWithKey, decryptWithKey, generateDeviceKey } from "../utils/crypto";

export type VaultUnlockMode = "device" | "passphrase";

export type KeyValidationStatus = "unvalidated" | "valid" | "invalid" | "rate_limited" | "error";

export interface VaultEntry {
  providerId: string;
  apiKey: string;
  /** User-supplied base URL override (Cloudflare needs one; proxies may want one) */
  baseUrl?: string;
  model?: string;
  addedAt: string;
  lastValidatedAt?: string;
  lastStatus: KeyValidationStatus;
  lastError?: string;
  /** Skipped by failover while true — set when a key is known bad */
  disabled?: boolean;
}

export interface VaultContents {
  version: 1;
  entries: Record<string, VaultEntry>;
  /** Provider ids in the order failover should try them */
  failoverOrder: string[];
  updatedAt: string;
}

interface StoredVault {
  version: 1;
  mode: VaultUnlockMode;
  /** Ciphertext of the JSON VaultContents — "k1:" (device) or "v2:" (passphrase) */
  payload: string;
  /**
   * Ciphertext of a known constant, used to tell "wrong passphrase" apart from
   * "corrupted data". Without it both surface as the same decrypt failure and
   * the UI cannot give a useful message.
   */
  verifier: string;
  updatedAt: string;
}

const VAULT_STORAGE_KEY = "scholar_api_vault_v1";
const IDB_NAME = "scholar-vault";
const IDB_STORE = "keys";
const IDB_KEY_ID = "device-key";
const VERIFIER_PLAINTEXT = "scholar-vault-verifier-v1";
export const BACKUP_FORMAT = "scholar-api-vault-backup";

// ─────────────────────────────────────────────────────────
// IN-MEMORY SESSION STATE
// ─────────────────────────────────────────────────────────
// The unlocked contents and the active key live here only. Nothing in this
// section is ever written to storage.

let activeKey: CryptoKey | null = null;
let activePassphrase: string | null = null;
let unlockedContents: VaultContents | null = null;

type VaultListener = () => void;
const listeners = new Set<VaultListener>();

/** Subscribe to lock/unlock/mutation events so React views can re-render. */
export function subscribeToVault(listener: VaultListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.error("[Vault] listener failed", e);
    }
  });
}

// ─────────────────────────────────────────────────────────
// INDEXEDDB (device key storage)
// ─────────────────────────────────────────────────────────
// A CryptoKey survives structured cloning, so IndexedDB can hold the key
// object itself. localStorage cannot — it only stores strings, which would
// require an extractable key and defeat the whole design.

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(id: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut(id: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(IDB_KEY_ID);
  if (existing) return existing;
  const key = await generateDeviceKey();
  await idbPut(IDB_KEY_ID, key);
  return key;
}

// ─────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────

function readStoredVault(): StoredVault | null {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredVault) : null;
  } catch {
    return null;
  }
}

function writeStoredVault(vault: StoredVault): void {
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
}

function emptyContents(): VaultContents {
  return { version: 1, entries: {}, failoverOrder: [], updatedAt: new Date().toISOString() };
}

async function encryptContents(contents: VaultContents): Promise<string> {
  const json = JSON.stringify(contents);
  if (activeKey) return encryptWithKey(json, activeKey);
  if (activePassphrase) return encryptDataAsync(json, activePassphrase);
  throw new Error("Vault is locked");
}

async function makeVerifier(): Promise<string> {
  if (activeKey) return encryptWithKey(VERIFIER_PLAINTEXT, activeKey);
  if (activePassphrase) return encryptDataAsync(VERIFIER_PLAINTEXT, activePassphrase);
  throw new Error("Vault is locked");
}

async function persist(): Promise<void> {
  if (!unlockedContents) throw new Error("Vault is locked");
  unlockedContents.updatedAt = new Date().toISOString();
  writeStoredVault({
    version: 1,
    mode: activeKey ? "device" : "passphrase",
    payload: await encryptContents(unlockedContents),
    verifier: await makeVerifier(),
    updatedAt: unlockedContents.updatedAt,
  });
  notify();
}

// ─────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────

export function vaultExists(): boolean {
  return readStoredVault() !== null;
}

export function getVaultMode(): VaultUnlockMode | null {
  return readStoredVault()?.mode ?? null;
}

export function isVaultUnlocked(): boolean {
  return unlockedContents !== null;
}

/** True when the vault opens with no prompt — lets the UI skip the unlock screen. */
export function canAutoUnlock(): boolean {
  const stored = readStoredVault();
  return stored !== null && stored.mode === "device";
}

export interface UnlockResult {
  ok: boolean;
  reason?: "wrong-passphrase" | "corrupted" | "no-vault" | "needs-passphrase" | "unsupported";
  message?: string;
}

/**
 * Open an existing vault, or create one on first use.
 *
 * Called with no passphrase this handles the device-mode auto-unlock path; a
 * passphrase-mode vault returns `needs-passphrase` so the caller can prompt.
 */
export async function unlockVault(passphrase?: string): Promise<UnlockResult> {
  const stored = readStoredVault();

  if (!stored) {
    // First run — create a vault in whichever mode the caller implies.
    try {
      if (passphrase) {
        activePassphrase = passphrase;
        activeKey = null;
      } else {
        activeKey = await getOrCreateDeviceKey();
        activePassphrase = null;
      }
      unlockedContents = emptyContents();
      await persist();
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        reason: "unsupported",
        message: e instanceof Error ? e.message : "Could not create the vault in this browser.",
      };
    }
  }

  if (stored.mode === "passphrase" && !passphrase) {
    return { ok: false, reason: "needs-passphrase" };
  }

  try {
    if (stored.mode === "device") {
      activeKey = await getOrCreateDeviceKey();
      activePassphrase = null;
    } else {
      activePassphrase = passphrase!;
      activeKey = null;
    }

    // Check the verifier before the payload so a wrong passphrase produces a
    // precise message instead of a generic decrypt failure.
    const verifierPlain =
      stored.mode === "device"
        ? await decryptWithKey(stored.verifier, activeKey!)
        : await decryptDataAsync(stored.verifier, activePassphrase!);

    if (verifierPlain !== VERIFIER_PLAINTEXT) {
      activeKey = null;
      activePassphrase = null;
      return { ok: false, reason: "wrong-passphrase", message: "That passphrase does not match this vault." };
    }

    const json =
      stored.mode === "device"
        ? await decryptWithKey(stored.payload, activeKey!)
        : await decryptDataAsync(stored.payload, activePassphrase!);

    unlockedContents = JSON.parse(json) as VaultContents;
    notify();
    return { ok: true };
  } catch (e) {
    activeKey = null;
    activePassphrase = null;

    if (stored.mode === "passphrase") {
      return { ok: false, reason: "wrong-passphrase", message: "That passphrase does not match this vault." };
    }
    // Device mode failing means the IndexedDB key is gone (site data cleared,
    // or a different browser profile) while the encrypted blob remains. The
    // data is unrecoverable without a backup file — say so plainly rather
    // than looping the user through an unlock that can never succeed.
    return {
      ok: false,
      reason: "corrupted",
      message:
        "This device's vault key is missing, so the saved keys cannot be decrypted. Restore from a backup file, or start a new vault and re-enter your keys.",
      ...(e instanceof Error ? {} : {}),
    };
  }
}

/** Clears in-memory state. The encrypted blob on disk is untouched. */
export function lockVault(): void {
  activeKey = null;
  activePassphrase = null;
  unlockedContents = null;
  notify();
}

/** Destroys the vault and its device key. Irreversible without a backup. */
export async function destroyVault(): Promise<void> {
  lockVault();
  localStorage.removeItem(VAULT_STORAGE_KEY);
  try {
    await idbDelete(IDB_KEY_ID);
  } catch {
    /* Nothing to clean up. */
  }
  notify();
}

/**
 * Switch between device and passphrase mode, re-encrypting in place.
 * Requires an unlocked vault, so the caller always proves possession first.
 */
export async function changeUnlockMode(mode: VaultUnlockMode, passphrase?: string): Promise<UnlockResult> {
  if (!unlockedContents) return { ok: false, reason: "no-vault", message: "Unlock the vault first." };

  if (mode === "passphrase") {
    if (!passphrase) return { ok: false, reason: "needs-passphrase", message: "A passphrase is required." };
    activePassphrase = passphrase;
    activeKey = null;
  } else {
    activeKey = await getOrCreateDeviceKey();
    activePassphrase = null;
  }
  await persist();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────
// ENTRIES
// ─────────────────────────────────────────────────────────

function requireContents(): VaultContents {
  if (!unlockedContents) throw new Error("Vault is locked");
  return unlockedContents;
}

export function listEntries(): VaultEntry[] {
  if (!unlockedContents) return [];
  return Object.values(unlockedContents.entries);
}

export function getEntry(providerId: string): VaultEntry | undefined {
  return unlockedContents?.entries[providerId];
}

/** The decrypted key for a provider, or "" when absent/locked/disabled. */
export function getApiKey(providerId: string): string {
  const entry = unlockedContents?.entries[providerId];
  if (!entry || entry.disabled) return "";
  return entry.apiKey;
}

export function hasApiKey(providerId: string): boolean {
  return !!getApiKey(providerId);
}

export async function setEntry(
  providerId: string,
  update: { apiKey?: string; baseUrl?: string; model?: string }
): Promise<void> {
  const contents = requireContents();
  const existing = contents.entries[providerId];

  contents.entries[providerId] = {
    providerId,
    apiKey: update.apiKey ?? existing?.apiKey ?? "",
    baseUrl: update.baseUrl ?? existing?.baseUrl,
    model: update.model ?? existing?.model,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    // A changed key invalidates whatever the previous validation concluded.
    lastStatus: update.apiKey && update.apiKey !== existing?.apiKey ? "unvalidated" : existing?.lastStatus ?? "unvalidated",
    lastValidatedAt: update.apiKey && update.apiKey !== existing?.apiKey ? undefined : existing?.lastValidatedAt,
    lastError: undefined,
    disabled: existing?.disabled,
  };

  if (!contents.failoverOrder.includes(providerId)) contents.failoverOrder.push(providerId);
  await persist();
}

export async function removeEntry(providerId: string): Promise<void> {
  const contents = requireContents();
  delete contents.entries[providerId];
  contents.failoverOrder = contents.failoverOrder.filter((id) => id !== providerId);
  await persist();
}

export async function recordValidation(
  providerId: string,
  status: KeyValidationStatus,
  error?: string
): Promise<void> {
  const contents = requireContents();
  const entry = contents.entries[providerId];
  if (!entry) return;
  entry.lastStatus = status;
  entry.lastValidatedAt = new Date().toISOString();
  entry.lastError = error;
  await persist();
}

export async function setEntryDisabled(providerId: string, disabled: boolean): Promise<void> {
  const contents = requireContents();
  const entry = contents.entries[providerId];
  if (!entry) return;
  entry.disabled = disabled;
  await persist();
}

/** Provider ids to try, in order, skipping keyless and disabled entries. */
export function getFailoverChain(): string[] {
  if (!unlockedContents) return [];
  const { entries, failoverOrder } = unlockedContents;
  const ordered = failoverOrder.filter((id) => entries[id] && !entries[id].disabled && entries[id].apiKey);
  // Anything added outside the ordering (e.g. an imported backup) still counts.
  const extras = Object.keys(entries).filter(
    (id) => !failoverOrder.includes(id) && !entries[id].disabled && entries[id].apiKey
  );
  return [...ordered, ...extras];
}

export async function setFailoverOrder(order: string[]): Promise<void> {
  const contents = requireContents();
  contents.failoverOrder = order;
  await persist();
}

// ─────────────────────────────────────────────────────────
// BACKUP & RECOVERY
// ─────────────────────────────────────────────────────────

export interface VaultBackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: string;
  /** Recorded so a future reader knows how to decrypt without guessing */
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: 100000 };
  cipher: "AES-GCM-256";
  providerCount: number;
  /** encryptDataAsync output ("v2:") over the vault JSON */
  payload: string;
}

/**
 * Produce a portable, encrypted backup.
 *
 * Encrypted with its own passphrase rather than the device key on purpose: a
 * device key cannot be exported, so a backup tied to it would be useless on
 * the new device the backup exists for. The passphrase is not stored.
 */
export async function exportBackup(recoveryPassphrase: string): Promise<VaultBackupFile> {
  if (!recoveryPassphrase) throw new Error("A recovery passphrase is required.");
  const contents = requireContents();

  return {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 100000 },
    cipher: "AES-GCM-256",
    providerCount: Object.keys(contents.entries).length,
    payload: await encryptDataAsync(JSON.stringify(contents), recoveryPassphrase),
  };
}

export interface ImportResult {
  ok: boolean;
  imported?: number;
  message?: string;
}

/**
 * Restore from a backup file into the currently unlocked vault.
 *
 * `merge` keeps existing entries and only fills in providers the vault does
 * not already have — the safe default, since replacing outright would discard
 * a key the user added after taking the backup.
 */
export async function importBackup(
  file: unknown,
  recoveryPassphrase: string,
  opts?: { merge?: boolean }
): Promise<ImportResult> {
  const backup = file as VaultBackupFile;
  if (!backup || backup.format !== BACKUP_FORMAT) {
    return { ok: false, message: "That file is not a Scholar vault backup." };
  }
  if (!unlockedContents) return { ok: false, message: "Unlock the vault before restoring." };

  let restored: VaultContents;
  try {
    restored = JSON.parse(await decryptDataAsync(backup.payload, recoveryPassphrase)) as VaultContents;
  } catch {
    return { ok: false, message: "That recovery passphrase does not match this backup file." };
  }

  const merge = opts?.merge ?? true;
  const contents = requireContents();
  let imported = 0;

  for (const [providerId, entry] of Object.entries(restored.entries || {})) {
    if (merge && contents.entries[providerId]?.apiKey) continue;
    contents.entries[providerId] = entry;
    if (!contents.failoverOrder.includes(providerId)) contents.failoverOrder.push(providerId);
    imported++;
  }

  await persist();
  return { ok: true, imported };
}

/**
 * Trigger a browser download of a backup file.
 *
 * Reuses the Blob → object URL → synthetic anchor pattern already established
 * by triggerBlobDownload in src/services/documentExportService.ts rather than
 * introducing a second way of doing the same thing.
 */
export function downloadBackupFile(backup: VaultBackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `scholar-api-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
