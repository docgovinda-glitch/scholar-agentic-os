/**
 * The user's Knowledge Vault — existence, and the secrets that must never
 * leave their device.
 *
 * User-scoped, not project-scoped. The legacy Vault hangs off
 * `PaperProject.knowledgeVault`, the same mistake `AISettings` made: a Vault is
 * explicitly "your long-term academic knowledge repository across future
 * projects" (docs 25 §6.2), so binding it to one project contradicts the thing
 * it is for.
 *
 * WHAT IS AND IS NOT STORED SERVER-SIDE
 *
 * `public.user_vaults` records that a Vault exists and when. That is all.
 * Doc 25 §6.3 fixes the Recovery Kit wording verbatim, and it is a promise the
 * storage design has to keep:
 *
 *   "If you forget your passphrase, this code is the only way to open your
 *    Vault again. We do not have a copy. We cannot reset it."
 *
 * So the passphrase and the recovery code are never sent to the server in any
 * form — not encrypted, and not hashed either. A hash is still a copy for the
 * purpose that sentence makes a promise about, and it is what would later let
 * "reset my Vault" quietly become possible, at which point the wording above
 * would be a lie.
 *
 * The recovery code is shown once, at creation, and is the user's to keep.
 */

import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";

const PASSPHRASE_VERIFIER_PREFIX = "scholar-vault-verifier:";

/**
 * The signed-in user, or null. Every device-local function below scopes its
 * storage key to this — a bare constant key was the original shape, and on a
 * shared device meant creating a second account's Vault silently overwrote
 * the first account's verifier, permanently locking them out of a Vault the
 * server still says exists (the same class of bug useAiSetupStatus's and
 * useVaultSetupStatus's skip-tracking were already keyed by userId to avoid).
 */
export async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabaseClient().auth.getUser();
  return data.user?.id ?? null;
}

export interface VaultRecord {
  label: string;
  createdAt: string;
  storageMode?: "local" | "synced";
}

/* -------------------------------------------------------------------------
 * Recovery code
 * ---------------------------------------------------------------------- */

/**
 * Format is `SCHL-4K9M-2XQP-7WNZ-HB3R` (docs 25 §6.3).
 *
 * Crockford's alphabet, minus the characters people reliably mistranscribe:
 * no I, L, O, U. This code is copied by hand off a printout at the exact
 * moment it matters most, and a 0/O confusion there is unrecoverable by
 * design — there is no copy to fall back on.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    // Rejection-free mapping is not needed for a 32-char alphabet: 256 is an
    // exact multiple of 32, so the modulo is uniform.
    groups.push(Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join(""));
  }
  return `SCHL-${groups.join("-")}`;
}

/* -------------------------------------------------------------------------
 * Device-side passphrase verifier
 * ---------------------------------------------------------------------- */

/**
 * Records that a passphrase was set, without recording the passphrase.
 *
 * A SHA-256 of the passphrase is kept on this device so the UI can tell a
 * wrong entry from a right one. It is deliberately device-local: the promise
 * in the module header is about what OUR SERVERS hold, and this never goes
 * there.
 *
 * Not a password-hashing function (no salt, no work factor) because it is not
 * defending a credential database — it is a local equality check for a secret
 * that never leaves the machine. Anyone who can read it can already read the
 * Vault's own device-side material.
 */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function setVaultPassphraseVerifier(passphrase: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    localStorage.setItem(`${PASSPHRASE_VERIFIER_PREFIX}${userId}`, await sha256(passphrase));
  } catch {
    // Without persistence the passphrase simply cannot be checked next visit;
    // it is not a reason to fail Vault creation.
  }
}

export async function verifyVaultPassphrase(passphrase: string): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  try {
    const stored = localStorage.getItem(`${PASSPHRASE_VERIFIER_PREFIX}${userId}`);
    return stored !== null && stored === (await sha256(passphrase));
  } catch {
    return false;
  }
}

export async function hasVaultPassphraseOnThisDevice(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  try {
    return localStorage.getItem(`${PASSPHRASE_VERIFIER_PREFIX}${userId}`) !== null;
  } catch {
    return false;
  }
}

export async function clearVaultPassphraseVerifier(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    localStorage.removeItem(`${PASSPHRASE_VERIFIER_PREFIX}${userId}`);
  } catch {
    // Ignore localStorage errors
  }
}

/* -------------------------------------------------------------------------
 * Vault existence (server-side, no secrets)
 * ---------------------------------------------------------------------- */

export interface UserVaultRow {
  user_id: string;
  label: string;
  created_at?: string;
  storage_mode?: "local" | "synced" | null;
}

interface SupabaseMaybeSingleQuery<T> {
  maybeSingle?: () => Promise<{ data: T | null; error: Error | null }>;
  single?: () => Promise<{ data: T | null; error: Error | null }>;
}

export async function loadVault(): Promise<VaultRecord | null> {
  const supabase = getSupabaseClient();
  if (!supabase?.auth || typeof supabase.auth.getUser !== "function") return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return null;

  const { data, error } = await supabase
    .from("user_vaults")
    .select("label, created_at, storage_mode")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  // No row is the normal state for someone who declined or has not reached
  // this stage — not an error.
  if (error || !data) return null;
  const vaultRow = data as unknown as UserVaultRow;
  const result: VaultRecord = {
    label: vaultRow.label,
    createdAt: vaultRow.created_at || new Date().toISOString(),
  };
  if (vaultRow.storage_mode) {
    result.storageMode = vaultRow.storage_mode === "local" ? "local" : "synced";
  }
  return result;
}

export async function resetVault(userId?: string): Promise<boolean> {
  const currentId = userId || (await currentUserId());
  if (!currentId) return false;

  // 1. Clear Supabase tables if configured
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("user_vault_items").delete().eq("user_id", currentId);
      await supabase.from("user_vaults").delete().eq("user_id", currentId);
      await supabase.from("user_cloud_integrations").delete().eq("user_id", currentId);
    } catch (e) {
      console.warn("Could not delete server vault records:", e);
    }
  }

  // 2. Call backend reset endpoint if available
  try {
    let token = "";
    if (isSupabaseConfigured()) {
      const { data } = await getSupabaseClient().auth.getSession();
      token = data.session?.access_token || "";
    }
    await fetch("/api/vault/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {}

  // 3. Clear local storage verifiers, skips, and cache
  try {
    localStorage.removeItem(`${PASSPHRASE_VERIFIER_PREFIX}${currentId}`);
    localStorage.removeItem(`scholar-vault-setup-skipped:${currentId}`);
    localStorage.removeItem(`scholar-vault-v2-setup:${currentId}`);
    localStorage.removeItem(`scholar_cloud_drive_${currentId}`);
  } catch {}

  // 4. Clear IndexedDB if available
  try {
    if (typeof indexedDB !== "undefined") {
      indexedDB.deleteDatabase(`scholar-vault-items:${currentId}`);
    }
  } catch {}

  return true;
}

export async function getVaultStorageMode(): Promise<"local" | "synced"> {
  if (!isSupabaseConfigured()) return "local";
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return "synced";

    const query = supabase
      .from("user_vaults")
      .select("storage_mode")
      .eq("user_id", userData.user.id);

    const typedQuery = query as unknown as SupabaseMaybeSingleQuery<UserVaultRow | UserVaultRow[]>;
    const res = typeof typedQuery.maybeSingle === "function"
      ? await typedQuery.maybeSingle()
      : typedQuery.single
      ? await typedQuery.single()
      : await (query as unknown as Promise<{ data: UserVaultRow | UserVaultRow[] | null; error: Error | null }>);

    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    if (res.error || !row || !row.storage_mode) return "synced";
    return row.storage_mode === "local" ? "local" : "synced";
  } catch {
    return "synced";
  }
}

export async function createVault(
  label: string,
  storageMode?: "local" | "synced"
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase is not configured." };
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "Not signed in." };

  const payload: Partial<UserVaultRow> = { user_id: userData.user.id, label };
  if (storageMode) payload.storage_mode = storageMode;

  const { error } = await supabase
    .from("user_vaults")
    .upsert(payload, { onConflict: "user_id" });

  return error ? { success: false, error: error.message } : { success: true };
}

export async function updateVaultStorageMode(
  storageMode: "local" | "synced"
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase is not configured." };
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "Not signed in." };

  const { error } = await supabase
    .from("user_vaults")
    .update({ storage_mode: storageMode })
    .eq("user_id", userData.user.id);

  return error ? { success: false, error: error.message } : { success: true };
}
