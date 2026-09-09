/**
 * Multi-Account Switching & Session Registry Service
 *
 * Allows researchers to link and rapidly switch between multiple accounts
 * (e.g. personal Gmail, university .edu, institutional lab account)
 * without losing context or requiring full re-authentication.
 */

import { getSupabaseClient } from "../supabaseClient";

export interface StoredAccountProfile {
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  institution?: string;
  sessionToken?: string;
  refreshToken?: string;
  lastActiveAt: string;
}

const ACCOUNTS_STORAGE_KEY = "scholar_multi_accounts_registry_v1";
const ACTIVE_ACCOUNT_KEY = "scholar_active_account_id";

/**
 * Retrieves all registered accounts stored in this browser.
 */
export function getSavedAccounts(): StoredAccountProfile[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const accounts: StoredAccountProfile[] = JSON.parse(raw);
    return Array.isArray(accounts)
      ? accounts.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime())
      : [];
  } catch {
    return [];
  }
}

/**
 * Records or updates an account profile in the local multi-account registry.
 */
export function saveAccountProfile(profile: {
  userId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  institution?: string;
  sessionToken?: string;
  refreshToken?: string;
}): void {
  try {
    const accounts = getSavedAccounts().filter((a) => a.userId !== profile.userId);
    const updated: StoredAccountProfile = {
      userId: profile.userId,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      institution: profile.institution,
      sessionToken: profile.sessionToken,
      refreshToken: profile.refreshToken,
      lastActiveAt: new Date().toISOString(),
    };

    accounts.unshift(updated);
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, profile.userId);
  } catch (e) {
    console.warn("Could not persist multi-account registry:", e);
  }
}

/**
 * Removes a specific account from the multi-account registry.
 */
export function removeSavedAccount(userId: string): void {
  try {
    const accounts = getSavedAccounts().filter((a) => a.userId !== userId);
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    if (localStorage.getItem(ACTIVE_ACCOUNT_KEY) === userId) {
      if (accounts.length > 0) {
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, accounts[0].userId);
      } else {
        localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      }
    }
  } catch {}
}

/**
 * Clears all saved account sessions.
 */
export function clearAllAccounts(): void {
  try {
    localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
  } catch {}
}

/**
 * Automatically syncs the current Supabase session into the multi-account registry.
 */
export async function syncActiveSessionToRegistry(): Promise<StoredAccountProfile | null> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase || !supabase.auth) return null;
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || !user.email) return null;

    const profile: StoredAccountProfile = {
      userId: user.id,
      email: user.email,
      name: (user.user_metadata?.full_name as string) || user.email.split("@")[0],
      avatarUrl: user.user_metadata?.avatar_url as string,
      institution: user.user_metadata?.institution as string,
      sessionToken: data.session?.access_token || "",
      refreshToken: data.session?.refresh_token || "",
      lastActiveAt: new Date().toISOString(),
    };

    saveAccountProfile(profile);
    return profile;
  } catch {
    return null;
  }
}

/**
 * Switches the active Supabase session to a selected account using stored refresh token.
 */
export async function switchActiveAccount(userId: string): Promise<{ success: boolean; error?: string }> {
  const accounts = getSavedAccounts();
  const target = accounts.find((a) => a.userId === userId);
  if (!target) return { success: false, error: "Account not found in registry" };

  try {
    const supabase = getSupabaseClient();
    if (!supabase || !supabase.auth) return { success: false, error: "Authentication service not configured" };

    if (target.refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: target.sessionToken || "",
        refresh_token: target.refreshToken,
      });

      if (!error && data.session) {
        saveAccountProfile({
          ...target,
          sessionToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        });
        window.location.reload();
        return { success: true };
      }
    }

    return {
      success: false,
      error: `Session for ${target.email} has expired. Please sign in again.`,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
