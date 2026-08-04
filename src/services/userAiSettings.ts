/**
 * User-scoped AI configuration for Desk.
 *
 * Replaces the legacy arrangement, where `AISettings` lived on `PaperProject`
 * (src/types.ts) — so every project carried its own copy of the user's
 * provider choice and API keys. Provider configuration is a property of the
 * person, not of a thesis; the legacy shape meant configuring AI once per
 * project and gave Desk's `ProjectRecord`, which has no such field, nowhere to
 * read it from. `refinePassage()` in src/desk/api.ts accepts `provider` and
 * `apiKey` and until now had no source for either.
 *
 * WHAT LIVES WHERE, and why:
 *
 *   API keys      → this device's localStorage, encrypted. Never sent to our
 *                   server. A database compromise exposes no provider
 *                   credentials because none are stored there.
 *   Provider/model → public.user_ai_settings, so the choice follows the user
 *                   to another device even though the key does not.
 *
 * The legacy path encrypted keys and stored them in `api_credentials`. Its own
 * history is the argument against repeating it here: the encryption secret was
 * originally the login passcode hash, kept in the same localStorage blob as
 * the ciphertext, so the encryption protected nothing. vaultPassphrase.ts
 * fixed that by holding a passphrase in memory only — correct, but it means
 * re-entering a passphrase every session to read your own keys. Not sending
 * the secret at all is simpler and strictly stronger; the cost is that keys do
 * not sync, which the UI states rather than hides.
 *
 * See supabase/schema_user_settings.sql.
 */

import type { AISettings } from "../types";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
import { decryptDataAsync, encryptDataAsync } from "../utils/crypto";

const KEYS_STORAGE = "scholar-provider-keys";
const DEVICE_SECRET_STORAGE = "scholar-device-secret";

export interface UserAiSettings {
  provider: string;
  /** Non-secret: chosen model names, custom base URLs. */
  preferences: Record<string, string>;
}

export const DEFAULT_AI_SETTINGS: UserAiSettings = { provider: "gemini", preferences: {} };

/* -------------------------------------------------------------------------
 * Device-local key storage
 * ---------------------------------------------------------------------- */

function randomSecret(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

/**
 * Session-scoped fallback, used only when localStorage is unavailable
 * (Safari private mode). Random per page load, never a fixed string: a
 * constant here would mean every device encrypting with the same secret,
 * which is not encryption at all. Keys then last only for this page, which is
 * the honest consequence of having nowhere to persist them.
 */
const ephemeralSecret = randomSecret();

/**
 * A per-device secret used to encrypt stored keys at rest.
 *
 * Generated with getRandomValues directly. An earlier version called
 * crypto.ts's generateDeviceKey() and tried to exportKey() the result — but
 * that helper returns a deliberately NON-EXTRACTABLE key ("exportKey() on the
 * result throws" is its entire purpose), so the export always threw and the
 * catch always returned a hardcoded constant. Every device would have
 * encrypted with the same string, which is not encryption at all. Caught by
 * the "cannot decrypt with a different device secret" test, which is exactly
 * why that test asserts on a wrong key rather than only on a round trip.
 *
 * This is deliberately NOT presented as protection against someone who already
 * has code execution or devtools on the device — the secret sits in the same
 * localStorage as the ciphertext, which is precisely the arrangement
 * vaultPassphrase.ts calls out as pointless for that threat.
 *
 * What it does buy: keys are not sitting in plaintext in a store that
 * extensions, casual inspection, and backup/sync tooling can read at a glance.
 * The threat it genuinely defends against — server-side disclosure — is
 * handled by not sending the key to the server at all.
 */
function deviceSecret(): string {
  try {
    const existing = localStorage.getItem(DEVICE_SECRET_STORAGE);
    if (existing) return existing;
    const secret = randomSecret();
    localStorage.setItem(DEVICE_SECRET_STORAGE, secret);
    return secret;
  } catch {
    return ephemeralSecret;
  }
}

function readStoredKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORAGE) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Provider ids that have a key stored on THIS device. Values never leave here. */
export function providersWithStoredKey(): string[] {
  return Object.keys(readStoredKeys());
}

export async function storeProviderKey(providerId: string, apiKey: string): Promise<void> {
  const secret = deviceSecret();
  const keys = readStoredKeys();
  keys[providerId] = await encryptDataAsync(apiKey, secret);
  try {
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
  } catch {
    // Nothing actionable; the caller's in-memory settings still work for now.
  }
}

export function forgetProviderKey(providerId: string): void {
  const keys = readStoredKeys();
  delete keys[providerId];
  try {
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
  } catch {
    /* see storeProviderKey */
  }
}

export async function readProviderKey(providerId: string): Promise<string | null> {
  const stored = readStoredKeys()[providerId];
  if (!stored) return null;
  try {
    return await decryptDataAsync(stored, deviceSecret());
  } catch {
    // Ciphertext written under a device secret that has since been cleared —
    // unreadable, and no amount of retrying changes that. Drop it so the UI
    // shows "no key" and prompts for a new one, rather than reporting a
    // configured provider whose key silently fails on every request.
    forgetProviderKey(providerId);
    return null;
  }
}

/* -------------------------------------------------------------------------
 * Synced, non-secret preferences
 * ---------------------------------------------------------------------- */

export async function loadUserAiSettings(): Promise<UserAiSettings> {
  if (!isSupabaseConfigured()) return DEFAULT_AI_SETTINGS;
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return DEFAULT_AI_SETTINGS;

  const { data, error } = await supabase
    .from("user_ai_settings")
    .select("provider, preferences")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  // A missing row is the normal state for someone who has not finished setup;
  // it is not an error and must not be reported as one.
  if (error || !data) return DEFAULT_AI_SETTINGS;
  return {
    provider: data.provider ?? DEFAULT_AI_SETTINGS.provider,
    preferences: (data.preferences as Record<string, string>) ?? {},
  };
}

export async function saveUserAiSettings(settings: UserAiSettings): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) return { success: false, error: "Supabase is not configured." };
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { success: false, error: "Not signed in." };

  const { error } = await supabase.from("user_ai_settings").upsert(
    {
      user_id: userData.user.id,
      provider: settings.provider,
      preferences: settings.preferences,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  return error ? { success: false, error: error.message } : { success: true };
}

/* -------------------------------------------------------------------------
 * Runtime assembly
 * ---------------------------------------------------------------------- */

/**
 * Build the `AISettings` shape the gateway and adapters already understand.
 *
 * `AISettings` stays the runtime contract — only its *storage* moved. That
 * keeps AIGateway, every provider adapter, and the health-check path unchanged,
 * so this relocation does not ripple through code that has nothing to do with
 * where settings are kept.
 *
 * Per-provider key fields are named `<provider>ApiKey` in that interface, which
 * is why the key is written under both the conventional name and the generic
 * one — the adapters read the former, and callers that only know a provider id
 * read the latter.
 */
export async function toAISettings(settings: UserAiSettings): Promise<AISettings> {
  const apiKey = await readProviderKey(settings.provider);
  const assembled: Record<string, unknown> = {
    provider: settings.provider,
    ...settings.preferences,
  };
  if (apiKey) {
    assembled[`${settings.provider}ApiKey`] = apiKey;
    assembled.apiKey = apiKey;
  }
  return assembled as unknown as AISettings;
}

/** Has the user finished enough setup for AI features to work? */
export function isConfigured(settings: UserAiSettings): boolean {
  // "server" routes through this deployment's own key and needs nothing from
  // the user; every other provider needs a key on this device.
  if (settings.provider === "server") return true;
  return providersWithStoredKey().includes(settings.provider);
}
