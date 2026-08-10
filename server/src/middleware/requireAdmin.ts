/**
 * Admin authorization — chained after requireAuth, never standalone.
 *
 * Before this file, no admin concept existed anywhere in this codebase
 * (server/routes/admin.ts was an empty placeholder). This is the entire
 * authorization boundary for every Admin AI Infrastructure route: it checks
 * public.admin_users with the service-role client, which bypasses that
 * table's RLS — the table itself has zero policies, so this middleware is
 * the ONLY path that can ever answer "is this user an admin" correctly.
 * Nothing about admin status is ever read from a client-supplied field, a
 * JWT claim, or anything the requester controls.
 */

import type { Request, Response, NextFunction } from "express";
import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";
import type { AuthenticatedUser } from "./auth";

interface AdminUserRow extends Record<string, unknown> {
  user_id: string;
}

export async function isAdmin(userId: string): Promise<boolean> {
  const config = getSupabaseRestConfig();
  if (!config) return false;
  const table = new SupabaseTable<AdminUserRow>(config, "admin_users");
  const row = await table.selectOne(`user_id=eq.${encodeURIComponent(userId)}&select=user_id`);
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
    const admin = await isAdmin(user.id);
    if (!admin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  } catch {
    // Fail closed: an error checking admin status is never treated as
    // "assume admin".
    res.status(503).json({ error: "Could not verify admin status right now. Please retry." });
  }
}
