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

    const clientOptions: any = {
      realtime: {
        timeout: 15000,
        reconnectAfterMs: (tries: number) => Math.min(1000 * 2 ** Math.min(tries, 5), 30000),
      },
    };

    // If running in browser and the REST base was rewritten to /api/supabase proxy,
    // route Realtime WebSockets directly to the native Supabase host so the browser
    // opens a native WSS connection to *.supabase.co rather than attempting to upgrade
    // through the Express HTTP reverse proxy.
    if (typeof window !== "undefined" && typeof WebSocket !== "undefined" && rawUrl && rawUrl.startsWith("http")) {
      const rawWsOrigin = rawUrl.replace(/^http/i, "ws").replace(/\/+$/, "");

      class DirectSupabaseWebSocket extends WebSocket {
        constructor(address: string | URL, protocols?: string | string[]) {
          let addressStr = address.toString();
          if (addressStr.includes("/api/supabase")) {
            const currentOriginWs = `${window.location.origin.replace(/^http/i, "ws")}/api/supabase`;
            addressStr = addressStr.replace(currentOriginWs, rawWsOrigin);
          }
          super(addressStr, protocols);
        }
      }

      clientOptions.realtime.transport = DirectSupabaseWebSocket;
    }

    client = createClient(url, SUPABASE_ANON_KEY as string, clientOptions);
  }
  return client;
}
