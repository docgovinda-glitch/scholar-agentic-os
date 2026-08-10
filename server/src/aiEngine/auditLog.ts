/**
 * Admin audit log writer — Section 16/23. Every admin action that changes
 * another user's entitlement, quota, or the platform's provider pool goes
 * through this, so admin_audit_log (immutable, admin-only, see
 * supabase/schema_ai_engine.sql) is a complete record rather than a
 * best-effort one some routes remember to call and others don't.
 */

import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest";

interface AuditLogRow extends Record<string, unknown> {
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
}

export async function writeAuditLog(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  const config = getSupabaseRestConfig();
  if (!config) return; // Best-effort: a missing audit entry must never block the admin action itself.
  const table = new SupabaseTable<AuditLogRow>(config, "admin_audit_log");
  await table.insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details });
}
