/**
 * Credit Engine — Section 12. Thin wrapper around the atomic
 * deduct_credits/grant_credits Postgres functions (supabase/schema_ai_engine.sql)
 * — see that file's comment for why the atomicity has to live in the
 * database rather than in this TypeScript layer.
 */

import { getSupabaseRestConfig } from "../supabaseRest";

export type DeductResult = "ok" | "daily_limit_exceeded" | "weekly_limit_exceeded" | "monthly_limit_exceeded" | "insufficient_balance";

async function rpc(config: NonNullable<ReturnType<typeof getSupabaseRestConfig>>, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`rpc/${fn} ${res.status}: ${detail.slice(0, 300)}`);
  }
  return res.json();
}

export async function deductCredits(
  userId: string,
  amount: number,
  dailyLimit: number | null,
  monthlyLimit: number | null,
  reason: "usage",
  requestId: string,
  note?: string,
  weeklyLimit?: number | null
): Promise<DeductResult> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const result = await rpc(config, "deduct_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_daily_limit: dailyLimit,
    p_monthly_limit: monthlyLimit,
    p_reason: reason,
    p_request_id: requestId,
    p_note: note ?? null,
    p_weekly_limit: weeklyLimit ?? null,
  });
  return result as DeductResult;
}

export async function grantCredits(
  userId: string,
  amount: number,
  reason: "admin_grant" | "bonus" | "refund" | "plan_allocation",
  note?: string
): Promise<void> {
  const config = getSupabaseRestConfig();
  if (!config) throw new Error("Supabase is not configured.");
  await rpc(config, "grant_credits", { p_user_id: userId, p_amount: amount, p_reason: reason, p_note: note ?? null });
}
