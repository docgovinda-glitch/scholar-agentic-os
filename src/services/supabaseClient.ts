/**
 * Supabase client singleton — Phase 1 hosting migration
 * (docs/planning/hosting-and-topology.md).
 *
 * Client-side only: uses the anon key, which is safe to expose in the
 * bundle by design — Row Level Security (supabase/schema.sql) is what
 * actually governs access, not secrecy of this key. The service_role key
 * (used by supabase/functions/* and scripts/migrate-users-to-supabase.mjs)
 * must never appear here or anywhere client-side.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Resolves the Supabase URL.
 * In browser production environments, routes traffic through the same-origin
 * `/api/supabase` reverse proxy to prevent institutional firewalls (Sophos,
 * Fortinet, etc.) from intercepting or blocking direct calls to `*.supabase.co`.
 */
export function resolveSupabaseUrl(): string | undefined {
  if (!rawUrl) return undefined;

  if (typeof window !== "undefined") {
    // If configured explicitly with a relative proxy subpath (e.g. "/api/supabase")
    if (rawUrl.startsWith("/")) {
      return `${window.location.origin}${rawUrl}`;
    }
    // In production (non-loopback browser origins), automatically use same-origin proxy
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return `${window.location.origin}/api/supabase`;
    }
  }

  return rawUrl;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(rawUrl && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/**
 * Returns the shared Supabase client. Throws a clear, actionable error if
 * VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY aren't set, rather than failing
 * deep inside an unrelated call with an opaque network error (DEPLOY-4's
 * re-scoped "fail fast on missing config", applied client-side per
 * hosting-and-topology.md §6 since there's no server startup to check at).
 */
export function getSupabaseClient(): SupabaseClient {
  if (typeof window !== "undefined" && (window as any).__mockSupabaseClient) {
    return (window as any).__mockSupabaseClient;
  }
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
        "(see .env.example). Create a free project at https://supabase.com and run " +
        "supabase/schema.sql in its SQL Editor first."
    );
  }
  if (!client) {
    const url = resolveSupabaseUrl() || (rawUrl as string);

    // Check if Realtime is explicitly disabled via env or local preference
    const isRealtimeDisabled =
      import.meta.env.VITE_DISABLE_REALTIME === "true" ||
      (typeof window !== "undefined" && window.localStorage?.getItem("scholar_disable_realtime") === "true");

    const clientOptions: any = {
      realtime: isRealtimeDisabled
        ? false
        : {
            timeout: 10000,
            reconnectAfterMs: (tries: number) => {
              if (tries > 2) return null; // Cease reconnect loop after 2 attempts to prevent console storms
              return 2000;
            },
          },
    };

    // If running in browser, route WebSockets safely through the same-origin proxy
    // to preserve trusted domain SSL certificates and guard against certificate authority errors.
    if (!isRealtimeDisabled && typeof window !== "undefined" && typeof WebSocket !== "undefined") {
      let consecutiveWsErrors = 0;

      class SafeSupabaseWebSocket extends WebSocket {
        constructor(address: string | URL, protocols?: string | string[]) {
          const addressStr = address.toString();
          super(addressStr, protocols);

          this.addEventListener("error", () => {
            consecutiveWsErrors++;
            if (consecutiveWsErrors >= 2) {
              try {
                if (client?.realtime) {
                  client.realtime.disconnect();
                  (client.realtime as any).reconnectAfterMs = () => null;
                }
              } catch {
                // ignore
              }
            }
          });

          this.addEventListener("open", () => {
            consecutiveWsErrors = 0;
          });
        }
      }

      clientOptions.realtime.transport = SafeSupabaseWebSocket;
    }

    client = createClient(url, SUPABASE_ANON_KEY as string, clientOptions);
  }
  return client;
}
