/**
 * Premium entitlement — Section 11. An entitlement, not a boolean: plan,
 * status, and expiry are all tracked, so "premium = true" never appears
 * anywhere in this codebase as the actual check.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";
import { writeAuditLog } from "./auditLog";

export type EntitlementStatus = "none" | "active" | "expired" | "revoked";

interface EntitlementRow extends Record<string, unknown> {
  user_id: string;
  plan_id: string | null;
  status: EntitlementStatus;
  start_date: string | null;
  expiry: string | null;
  granted_by: string | null;
  updated_at: string;
}

export interface Entitlement {
  userId: string;
  planId: string | null;
  status: EntitlementStatus;
  startDate: string | null;
  expiry: string | null;
}

function table() {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return new SupabaseTable<EntitlementRow>(config, "user_entitlements");
}

function toEntitlement(row: EntitlementRow): Entitlement {
  return { userId: row.user_id, planId: row.plan_id, status: row.status, startDate: row.start_date, expiry: row.expiry };
}

export async function getEntitlement(userId: string): Promise<Entitlement | null> {
  const row = await table().selectOne(`user_id=eq.${encodeURIComponent(userId)}`);
  return row ? toEntitlement(row) : null;
}

/** Pure — the actual "is this user Premium right now" decision, so it's testable without a database. */
export function isEntitlementActive(entitlement: Entitlement | null, now: Date = new Date()): boolean {
  if (!entitlement || entitlement.status !== "active") return false;
  if (entitlement.expiry && new Date(entitlement.expiry) <= now) return false;
  return true;
}

export async function grantPremium(userId: string, planId: string, expiry: string | null, grantedBy: string): Promise<void> {
  await table().upsert({
    user_id: userId,
    plan_id: planId,
    status: "active",
    start_date: new Date().toISOString(),
    expiry,
    granted_by: grantedBy,
    updated_at: new Date().toISOString(),
  });
  await writeAuditLog(grantedBy, "grant_premium", "user", userId, { planId, expiry });
}

export async function revokePremium(userId: string, revokedBy: string): Promise<void> {
  await table().update(`user_id=eq.${encodeURIComponent(userId)}`, { status: "revoked", updated_at: new Date().toISOString() });
  await writeAuditLog(revokedBy, "revoke_premium", "user", userId, {});
}
