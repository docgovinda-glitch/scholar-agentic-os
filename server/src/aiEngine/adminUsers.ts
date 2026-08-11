/**
 * Admin roster — Section 16 follow-up.
 *
 * `admin_users` (supabase/schema_ai_engine.sql) is the entire authorization
 * source of truth for requireAdmin (see that file's own comment) — RLS with
 * zero policies, only the service-role key can ever touch it. Until this
 * module existed, the only way to see who is an admin, or to grant/revoke
 * one, was a raw SQL statement in the Supabase dashboard: invisible from the
 * app, easy to lose track of. This module makes the roster visible and
 * manageable — but only through the same requireAdmin-gated routes as
 * everything else in server/routes/admin.ts, so granting admin status is
 * itself an admin-only, audited action, never a new hole.
 */

import { getSupabaseRestConfig, SupabaseRestError, SupabaseTable } from "../supabaseRest";
import { writeAuditLog } from "./auditLog";

interface AdminUserRow extends Record<string, unknown> {
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  note: string | null;
}

interface ProfileRow extends Record<string, unknown> {
  id: string;
  username: string;
  full_name: string;
}

export interface AdminUser {
  userId: string;
  grantedBy: string | null;
  grantedAt: string;
  note: string | null;
  /** From public.profiles, best-effort — null if the account has no profile row. */
  username: string | null;
  fullName: string | null;
}

/** Thrown when granting an id that's already in admin_users. */
export class AlreadyAdminError extends Error {
  constructor(userId: string) {
    super(`${userId} is already an admin.`);
    this.name = "AlreadyAdminError";
  }
}

function adminTable() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseTable<AdminUserRow>(config, "admin_users");
}

function profileTable() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseTable<ProfileRow>(config, "profiles");
}

export async function listAdmins(): Promise<AdminUser[]> {
  const rows = await adminTable().select("order=granted_at.asc");
  if (rows.length === 0) return [];

  // Best-effort name resolution: admin_users only stores the id, and a
  // missing/failed profile lookup must never hide who actually has admin
  // access — the roster itself is what matters, the friendly name is a
  // convenience on top of it.
  let profiles: ProfileRow[] = [];
  try {
    const ids = rows.map((r) => r.user_id);
    profiles = await profileTable().select(`id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,username,full_name`);
  } catch {
    profiles = [];
  }
  const byId = new Map(profiles.map((p) => [p.id, p]));

  return rows.map((r) => {
    const p = byId.get(r.user_id);
    return {
      userId: r.user_id,
      grantedBy: r.granted_by,
      grantedAt: r.granted_at,
      note: r.note,
      username: p?.username ?? null,
      fullName: p?.full_name ?? null,
    };
  });
}

export async function grantAdmin(userId: string, grantedBy: string, note?: string): Promise<void> {
  try {
    await adminTable().insert({ user_id: userId, granted_by: grantedBy, granted_at: new Date().toISOString(), note: note ?? null });
  } catch (err) {
    // Postgres unique_violation on the user_id primary key — this user
    // already has a row. A clear, specific error beats a raw 500.
    if (err instanceof SupabaseRestError && err.status === 409) {
      throw new AlreadyAdminError(userId);
    }
    throw err;
  }
  await writeAuditLog(grantedBy, "grant_admin", "user", userId, note ? { note } : {});
}

export async function revokeAdmin(userId: string, revokedBy: string): Promise<void> {
  await adminTable().delete(`user_id=eq.${encodeURIComponent(userId)}`);
  await writeAuditLog(revokedBy, "revoke_admin", "user", userId, {});
}
