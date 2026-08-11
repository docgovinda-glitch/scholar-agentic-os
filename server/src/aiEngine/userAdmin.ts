/**
 * User management for the admin panel — search, suspend/restore, and hard
 * delete. None of this existed before: `profiles.account_status` (see
 * schema.sql) already had a 'suspended'/'deleted' enum, but nothing ever
 * wrote it from an admin action, and nothing called Supabase's Auth Admin
 * API to actually remove an account.
 *
 * Two different destructive-action postures, deliberately:
 *  - setAccountStatus (suspend/restore): reversible, one click, no data
 *    loss. This is now enforced SERVER-SIDE too (requireAuth checks
 *    account_status on every request, not just the client-side login
 *    screen) — see server/src/middleware/auth.ts.
 *  - hardDeleteUser: irreversible, cascades through every table with an
 *    `on delete cascade` foreign key to auth.users (see
 *    schema_ai_engine.sql / schema.sql). Requires the caller to pass the
 *    account's own current email as confirmation, verified server-side
 *    against Supabase's own record for that id — not just trusted from
 *    whatever the client UI happened to show.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";
import { writeAuditLog } from "./auditLog";

const REQUEST_TIMEOUT_MS = 10_000;

interface GoTrueUser {
  id: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string;
}

async function goTrueAdminFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`GoTrue admin ${path} ${res.status}: ${detail.slice(0, 300)}`);
    }
    const text = await res.text();
    return text.length === 0 ? null : JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

/** GoTrue's admin list-users response has taken slightly different shapes across versions — accept either. */
function extractUsers(body: unknown): GoTrueUser[] {
  if (Array.isArray(body)) return body as GoTrueUser[];
  if (body && typeof body === "object" && Array.isArray((body as { users?: unknown }).users)) {
    return (body as { users: GoTrueUser[] }).users;
  }
  return [];
}

async function getGoTrueUser(userId: string): Promise<GoTrueUser | null> {
  try {
    const body = await goTrueAdminFetch(`/users/${encodeURIComponent(userId)}`);
    return (body as GoTrueUser) ?? null;
  } catch {
    return null;
  }
}

interface ProfileRow extends Record<string, unknown> {
  id: string;
  username: string;
  full_name: string;
  account_status: string;
}

function profileTable() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseTable<ProfileRow>(config, "profiles");
}

export interface UserSearchResult {
  userId: string;
  email: string | null;
  username: string | null;
  fullName: string | null;
  accountStatus: string | null;
}

/**
 * Matches on username/full name (via profiles, a direct ilike query) OR
 * email (via GoTrue's admin user list, paged through and filtered in
 * memory — the Admin API does not expose a reliable server-side email
 * filter across Supabase versions, and this product's user count doesn't
 * yet need anything fancier). Results are merged and de-duplicated by id.
 */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const profiles = await profileTable().select(
    `or=(username.ilike.*${encodeURIComponent(q)}*,full_name.ilike.*${encodeURIComponent(q)}*)&select=id,username,full_name,account_status&limit=25`
  );

  const byId = new Map<string, UserSearchResult>();
  for (const p of profiles) {
    byId.set(p.id, { userId: p.id, email: null, username: p.username, fullName: p.full_name, accountStatus: p.account_status });
  }

  // Email search: page through GoTrue's admin user list (bounded — a few
  // pages of 200 covers any account count this product realistically has
  // today) and match case-insensitively.
  if (q.includes("@")) {
    const needle = q.toLowerCase();
    for (let page = 1; page <= 5; page++) {
      let body: unknown;
      try {
        body = await goTrueAdminFetch(`/users?page=${page}&per_page=200`);
      } catch {
        break;
      }
      const users = extractUsers(body);
      if (users.length === 0) break;
      for (const u of users) {
        if (u.email && u.email.toLowerCase().includes(needle)) {
          const existing = byId.get(u.id);
          if (existing) {
            existing.email = u.email;
          } else {
            byId.set(u.id, { userId: u.id, email: u.email, username: null, fullName: null, accountStatus: null });
          }
        }
      }
      if (users.length < 200) break;
    }
  }

  return [...byId.values()].slice(0, 25);
}

export type AccountStatus = "active" | "suspended";

export async function setAccountStatus(userId: string, status: AccountStatus, setBy: string, reason?: string): Promise<void> {
  await profileTable().update(`id=eq.${encodeURIComponent(userId)}`, { account_status: status, updated_at: new Date().toISOString() } as any);
  await writeAuditLog(setBy, status === "suspended" ? "suspend_user" : "restore_user", "user", userId, reason ? { reason } : {});
}

export class DeleteConfirmationMismatchError extends Error {
  constructor() {
    super("The email you typed doesn't match this account's email. Nothing was deleted.");
    this.name = "DeleteConfirmationMismatchError";
  }
}

/**
 * Hard delete: irreversible. `confirmEmail` must equal the account's actual
 * current email (checked server-side against GoTrue's own record — never
 * trusted from whatever the admin UI cached), so a stale UI or a wrong
 * click can't destroy the wrong account. Cascades through every table with
 * `on delete cascade references auth.users(id)`.
 */
export async function hardDeleteUser(userId: string, confirmEmail: string, deletedBy: string): Promise<void> {
  const user = await getGoTrueUser(userId);
  if (!user || !user.email) {
    throw new Error("Could not look up this account to confirm its email — nothing was deleted.");
  }
  if (user.email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
    throw new DeleteConfirmationMismatchError();
  }
  await goTrueAdminFetch(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  await writeAuditLog(deletedBy, "hard_delete_user", "user", userId, { email: user.email });
}
