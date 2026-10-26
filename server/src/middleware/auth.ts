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

import crypto from "node:crypto";
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

// ─────────────────────────────────────────────────────────
// TIER 1: LOCAL CRYPTOGRAPHIC JWT VERIFICATION (<0.5ms)
// ─────────────────────────────────────────────────────────

function verifyJwtLocally(token: string, secret: string): VerifyResult {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { ok: false, reason: "invalid" };
    }
    const [headerB64, payloadB64, sigB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as { alg?: string; typ?: string };
    if (header.alg !== "HS256") {
      return { ok: false, reason: "invalid" };
    }

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    const sigBuf = Buffer.from(sigB64);
    const expectedSigBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(sigBuf, expectedSigBuf)) {
      return { ok: false, reason: "invalid" };
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      sub?: string;
      email?: string | null;
      role?: string;
      aud?: string | string[];
      exp?: number;
    };

    const nowSec = Math.floor(Date.now() / 1000);

    // Verify expiration
    if (typeof payload.exp === "number" && nowSec >= payload.exp) {
      return { ok: false, reason: "invalid" };
    }

    // Verify subject (user ID)
    if (!payload.sub || typeof payload.sub !== "string") {
      return { ok: false, reason: "invalid" };
    }

    // Verify audience
    if (payload.aud) {
      if (Array.isArray(payload.aud)) {
        if (!payload.aud.includes("authenticated")) {
          return { ok: false, reason: "invalid" };
        }
      } else if (typeof payload.aud === "string") {
        if (payload.aud !== "authenticated") {
          return { ok: false, reason: "invalid" };
        }
      }
    }

    return {
      ok: true,
      user: {
        id: payload.sub,
        email: payload.email ?? null,
      },
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

// ─────────────────────────────────────────────────────────
// TIER 2: BOUNDED TTL IN-MEMORY LRU TOKEN CACHE
// ─────────────────────────────────────────────────────────

export interface CachedAuthEntry {
  userId: string;
  email: string | null;
  role: string;
  expiresAt: number;
}

const MAX_AUTH_LRU_ENTRIES = 1000;
const AUTH_CACHE_TTL_MS = 60 * 1000;

const authTokenCache = new Map<string, CachedAuthEntry>();

/**
 * Clears cached verified auth tokens. Clears all entries if no token provided.
 */
export function clearAuthTokenCache(token?: string): void {
  if (token) {
    const key = crypto.createHash("sha256").update(token).digest("hex");
    authTokenCache.delete(key);
  } else {
    authTokenCache.clear();
  }
}

export function getAuthCacheSize(): number {
  return authTokenCache.size;
}

function getCachedAuth(token: string): AuthenticatedUser | null {
  const key = crypto.createHash("sha256").update(token).digest("hex");
  const entry = authTokenCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    authTokenCache.delete(key);
    return null;
  }

  // Refresh position in LRU Map
  authTokenCache.delete(key);
  authTokenCache.set(key, entry);

  return { id: entry.userId, email: entry.email };
}

function setCachedAuth(token: string, user: AuthenticatedUser, tokenExpSec?: number, role: string = "authenticated"): void {
  const key = crypto.createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  let expiresAt = now + AUTH_CACHE_TTL_MS;

  if (tokenExpSec && typeof tokenExpSec === "number") {
    const tokenExpMs = tokenExpSec * 1000;
    if (tokenExpMs < expiresAt) {
      expiresAt = tokenExpMs;
    }
  }

  if (expiresAt <= now) return;

  if (authTokenCache.size >= MAX_AUTH_LRU_ENTRIES) {
    const oldestKey = authTokenCache.keys().next().value;
    if (oldestKey !== undefined) {
      authTokenCache.delete(oldestKey);
    }
  }

  authTokenCache.set(key, {
    userId: user.id,
    email: user.email,
    role,
    expiresAt,
  });
}

/**
 * Exchange an access token for its user via local JWT validation or GoTrue with LRU caching.
 *
 * Exported for testing: it carries the whole security decision, and that
 * should be assertable without standing up Express.
 */
export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  // Tier 1: Local Cryptographic JWT Verification (if secret is configured)
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    return verifyJwtLocally(token, jwtSecret);
  }

  // Tier 2: Check bounded TTL LRU cache before remote network fetch
  const cachedUser = getCachedAuth(token);
  if (cachedUser) {
    return { ok: true, user: cachedUser };
  }

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

    const body = (await res.json()) as { id?: string; email?: string | null; role?: string; exp?: number };
    if (!body?.id) return { ok: false, reason: "invalid" };

    const user: AuthenticatedUser = { id: body.id, email: body.email ?? null };

    // Bounded by token exp if available
    let tokenExpSec: number | undefined = body.exp;
    if (!tokenExpSec) {
      try {
        const parts = token.split(".");
        if (parts[1]) {
          const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: number };
          tokenExpSec = payload.exp;
        }
      } catch {
        // Ignore unverified parse error
      }
    }

    setCachedAuth(token, user, tokenExpSec, body.role || "authenticated");

    return { ok: true, user };
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
