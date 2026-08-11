/**
 * Admin authorization — chained after requireAuth, never standalone.
 *
 * Two layers:
 *
 * 1. `requireAdmin` — is this user an admin AT ALL. Checks public.admin_users
 *    with the service-role client, which bypasses that table's RLS — the
 *    table itself has zero policies, so this is the ONLY path that can ever
 *    answer "is this user an admin" correctly. Nothing about admin status is
 *    ever read from a client-supplied field, a JWT claim, or anything the
 *    requester controls.
 *
 * 2. `requireScope(scope)` — is this admin allowed to do THIS specific
 *    thing. admin_users.scopes (a text[] column) holds a subset of SCOPES
 *    per admin, so the main admin can grant someone "manage_premium" without
 *    also handing them "manage_admins". A route with no requireScope call
 *    (dashboard/usage/audit) is readable by any admin regardless of scopes —
 *    those are low-risk, transparency-oriented views, not mutations.
 *
 * The hardcoded main admin (MAIN_ADMIN_EMAIL) is not a row in admin_users at
 * all — it is resolved from the verified token's own email, server-side,
 * every request. It implicitly has every scope and can never be revoked by
 * anyone (including itself) through the admin_users-editing routes, because
 * there is no row to delete. This exists so the roster can never be edited
 * into a state with zero admins and no way back in short of an env var
 * change and a redeploy.
 */

import type { Request, Response, NextFunction } from "express";
import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";
import type { AuthenticatedUser } from "./auth";

/**
 * The complete, closed set of grantable permission scopes. Adding a new one
 * here is the only step required — admin_users.scopes is a plain text[]
 * with no DB-side check constraint (see schema_ai_engine.sql's "ADMIN
 * ROSTER v2" comment), so a new scope never needs a migration.
 */
export const SCOPES = [
  "manage_providers",
  "manage_premium",
  "manage_budget",
  "manage_opportunities",
  "manage_users",
  "manage_admins",
] as const;

export type Scope = (typeof SCOPES)[number];

export function isValidScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

interface AdminUserRow extends Record<string, unknown> {
  user_id: string;
  scopes: string[] | null;
}

export interface AdminInfo {
  isAdmin: boolean;
  isMainAdmin: boolean;
  /** All scopes for the main admin (every one of SCOPES), whatever admin_users.scopes holds for anyone else, [] for a non-admin. */
  scopes: Scope[];
}

function mainAdminEmail(): string | null {
  const email = process.env.MAIN_ADMIN_EMAIL;
  return email ? email.trim().toLowerCase() : null;
}

/** True if this token's own verified email matches MAIN_ADMIN_EMAIL — never a client-supplied claim. */
export function isMainAdmin(email: string | null): boolean {
  const main = mainAdminEmail();
  if (!main || !email) return false;
  return email.trim().toLowerCase() === main;
}

async function lookupAdminRow(userId: string): Promise<AdminUserRow | undefined> {
  const config = getSupabaseRestConfig();
  if (!config) return undefined;
  const table = new SupabaseTable<AdminUserRow>(config, "admin_users");
  // No explicit `select=` column list: PostgREST errors on a column that
  // doesn't exist yet, and this table's `scopes` column is a migration
  // that may not have been applied to a given database yet (see
  // schema_ai_engine.sql's "ADMIN ROSTER v2"). Selecting "*" returns
  // whatever columns actually exist — pre-migration, `scopes` is simply
  // absent from the row and getAdminInfo's `row.scopes ?? []` already
  // handles that — so admin auth itself never breaks on an unmigrated
  // database, only the scope-specific features do.
  return table.selectOne(`user_id=eq.${encodeURIComponent(userId)}`);
}

export async function getAdminInfo(user: AuthenticatedUser): Promise<AdminInfo> {
  if (isMainAdmin(user.email)) {
    return { isAdmin: true, isMainAdmin: true, scopes: [...SCOPES] };
  }
  const row = await lookupAdminRow(user.id);
  if (!row) return { isAdmin: false, isMainAdmin: false, scopes: [] };
  const scopes = (row.scopes ?? []).filter(isValidScope);
  return { isAdmin: true, isMainAdmin: false, scopes };
}

/** Back-compat, used by callers that only need the boolean (e.g. isEntitlementActive-style checks elsewhere). */
export async function isAdmin(userId: string, email: string | null = null): Promise<boolean> {
  if (isMainAdmin(email)) return true;
  const row = await lookupAdminRow(userId);
  return Boolean(row);
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = (req as Request & { user?: AuthenticatedUser }).user;
  if (!user) {
    // requireAuth must run first. Failing closed here (rather than trusting
    // an absent user to mean "not logged in, deny") is deliberate: a route
    // wired up wrong is a bug to catch, not a hole to leave open.
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const info = await getAdminInfo(user);
    if (!info.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    (req as Request & { adminInfo?: AdminInfo }).adminInfo = info;
    next();
  } catch {
    // Fail closed: an error checking admin status is never treated as
    // "assume admin".
    res.status(503).json({ error: "Could not verify admin status right now. Please retry." });
  }
}

/**
 * For a router that already runs requireAdmin once for the whole subtree
 * (server/routes/admin.ts does — `admin.use(requireAuth, requireAdmin)`),
 * this reads the `req.adminInfo` that call already populated instead of
 * re-querying admin_users per mutating route. Returns false (and has
 * already written the 403) when the scope is missing — callers do
 * `if (!requireScopeInline(req, res, "manage_users")) return;`.
 */
export function requireScopeInline(req: Request, res: Response, scope: Scope): boolean {
  const info = (req as Request & { adminInfo?: AdminInfo }).adminInfo;
  if (!info || !info.scopes.includes(scope)) {
    res.status(403).json({ error: `This action requires the "${scope}" permission, which your admin account doesn't have.` });
    return false;
  }
  return true;
}

/**
 * Stricter than requireAdmin: also requires one specific scope. Does the
 * full admin check itself (an unscoped non-admin gets the same 403 an
 * admin-only route would give) so a route can use requireScope alone,
 * without also chaining requireAdmin first. Use this (rather than
 * requireScopeInline) for a route NOT already sitting under a router-level
 * requireAdmin call.
 */
export function requireScope(scope: Scope) {
  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const info = await getAdminInfo(user);
      if (!info.isAdmin) {
        res.status(403).json({ error: "Admin access required" });
        return;
      }
      if (!info.scopes.includes(scope)) {
        res.status(403).json({ error: `This action requires the "${scope}" permission, which your admin account doesn't have.` });
        return;
      }
      (req as Request & { adminInfo?: AdminInfo }).adminInfo = info;
      next();
    } catch {
      res.status(503).json({ error: "Could not verify admin status right now. Please retry." });
    }
  };
}
