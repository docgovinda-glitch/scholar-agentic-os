/**
 * Authentication middleware — verifies a Supabase access token and attaches
 * the user to the request.
 *
 * Used by server/routes/pocket.ts, server/routes/project.ts, and
 * server/routes/studio.ts.
 *
 * This deliberately does NOT use `@supabase/supabase-js`. The previous
 * implementation called `createClient()` inside the handler, which broke
 * production outright and was wasteful even when it worked:
 *
 *   1. `createClient()` constructs a `RealtimeClient`, which demands a native
 *      `WebSocket`. The runtime image was `node:20-alpine`, and Node 20 has no
 *      global WebSocket — so the constructor threw before any token was ever
 *      examined, and every authenticated request answered
 *      500 "Authentication failed". Observed in production:
 *
 *        Error: Node.js detected but native WebSocket not found.
 *          at WebSocketFactory.getWebSocketConstructor
 *          at new RealtimeClient
 *          at createClient
 *          at requireAuth
 *
 *      The Dockerfile is on Node 22 now, which fixes that specific crash — but
 *      pinning authentication to a Node version over a realtime feature it
 *      never uses is a coupling worth deleting, not merely satisfying.
 *
 *   2. It constructed an entire client — auth, postgrest, storage, realtime —
 *      on every request, in order to make one HTTP call.
 *
 * Verifying a token is a single GET against GoTrue, which is what supabase-js
 * does underneath. Doing it directly is smaller, has no WebSocket dependency,
 * and allocates nothing per request.
 */

import type { Request, Response, NextFunction } from "express";
import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";

const getSupabaseUrl = () => process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const getSupabaseServiceRole = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Abandon a hung identity-provider call rather than holding the request open. */
const VERIFY_TIMEOUT_MS = 8000;

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface VerifyResult {
  ok: boolean;
  user?: AuthenticatedUser;
  /** Distinguishes "the token is bad" (401) from "we could not check" (503). */
  reason?: "unconfigured" | "invalid" | "unavailable";
}

/**
 * Exchange an access token for its user via GoTrue.
 *
 * Exported for testing: it carries the whole security decision, and that
 * should be assertable without standing up Express.
 */
export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  const supabaseUrl = getSupabaseUrl();
  const supabaseServiceRole = getSupabaseServiceRole();

  if (!supabaseUrl || !supabaseServiceRole) {
    return { ok: false, reason: "unconfigured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        // `apikey` authenticates this service to GoTrue; the bearer token is
        // the end user's. Both are required — the endpoint rejects either alone.
        apikey: supabaseServiceRole,
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) return { ok: false, reason: "invalid" };

    // Anything else non-2xx is Supabase failing, not the user's token being
    // wrong. Reporting that as 401 would tell a signed-in user to sign in
    // again during an outage they cannot do anything about.
    if (!res.ok) return { ok: false, reason: "unavailable" };

    const body = (await res.json()) as { id?: string; email?: string | null };
    if (!body?.id) return { ok: false, reason: "invalid" };

    return { ok: true, user: { id: body.id, email: body.email ?? null } };
  } catch {
    // Network failure, DNS failure, or the abort above.
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

interface ProfileStatusRow extends Record<string, unknown> {
  account_status: string;
}

/**
 * profiles.account_status ('active' | 'restricted' | 'suspended' |
 * 'deleted', schema.sql) previously blocked nothing beyond the browser's own
 * sign-in screen (src/services/supabaseAuthService.ts) — a suspended
 * account's still-valid Supabase JWT reached every server API route
 * untouched, so "suspend" was cosmetic against a client that skipped that
 * one screen. This makes it real: any non-'active' status is rejected here,
 * the one checkpoint nearly every authenticated route passes through.
 *
 * Deliberately fails OPEN on a lookup error (network hiccup, Supabase
 * blip) — unlike token verification above, which fails closed. Blocking
 * every authenticated user in the product because one extra profiles query
 * timed out would be a worse outage than the narrow window this creates (a
 * suspended account keeps working until the next successful check). A
 * missing profile row (e.g. a signup race before the trigger that creates
 * one has run) is treated the same way — active by default, not blocked.
 */
async function isAccountBlocked(userId: string): Promise<boolean> {
  const config = getSupabaseRestConfig();
  if (!config) return false;
  try {
    const table = new SupabaseTable<ProfileStatusRow>(config, "profiles");
    const row = await table.selectOne(`id=eq.${encodeURIComponent(userId)}&select=account_status`);
    // Only an actual, present, non-'active' string blocks — an
    // unexpectedly-shaped or missing field fails open rather than locking
    // everyone out over a malformed response.
    return typeof row?.account_status === "string" && row.account_status !== "active";
  } catch {
    return false;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const result = await verifyAccessToken(token);

  if (result.ok && result.user) {
    if (await isAccountBlocked(result.user.id)) {
      res.status(403).json({ error: "This account is suspended." });
      return;
    }
    (req as Request & { user?: AuthenticatedUser }).user = result.user;
    next();
    return;
  }

  switch (result.reason) {
    case "unconfigured":
      // Fail closed, and say so precisely — this is an operator error, and
      // "invalid token" would send them hunting in entirely the wrong place.
      console.error(
        "auth: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set; refusing all authenticated requests"
      );
      res.status(500).json({ error: "Auth service not configured" });
      return;
    case "unavailable":
      // 503, not 401: the token may well be valid.
      res.status(503).json({ error: "Could not verify your session right now. Please retry." });
      return;
    default:
      res.status(401).json({ error: "Invalid or expired token" });
  }
}
